/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, X, XCircle } from 'lucide-react';
import {
  ActiveNavTab,
  DeviceType,
  NetworkCable,
  NetworkDevice,
  NetworkInterface,
  Packet,
  PacketGeneratorConfig,
  PacketHop,
  PacketSimulationState,
} from './types/network';
import {
  getDefaultTopology,
  getStarTopology,
  getMeshTopology,
  getRingTopology,
  getTreeTopology,
  getBusTopology,
  createRouterInterfaces,
  createSwitchInterfaces,
  createPCInterfaces,
} from './utils/presetTopologies';
import { discoverRoute } from './utils/networkRouting';
import { uploadTopology, getAiRouteRecommendation, AiRouteRecommendation } from './utils/api';
import { createPacket, advancePacket, computeMetrics } from './utils/simulationEngine';
import { SimulationMetricsPanel } from './components/SimulationMetricsPanel';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { DevicePalette } from './components/DevicePalette';
import { NetworkCanvas } from './components/NetworkCanvas';
import { DevicePropertiesPanel } from './components/DevicePropertiesPanel';
import { CablePropertiesPanel } from './components/CablePropertiesPanel';
import { InterfaceModal } from './components/InterfaceModal';
import { CiscoCLIModal } from './components/CiscoCLIModal';
import { PacketSimulatorModal } from './components/PacketSimulatorModal';
import { DrawingPalette } from './components/DrawingPalette';
import {
  AnnotationItem,
  DrawingPaletteSettings,
  DrawingTool,
  DEFAULT_DRAWING_SETTINGS,
} from './types/annotations';
import { HomeView } from './components/views/HomeView';
import { AnalyticsView } from './components/views/AnalyticsView';
import { MonitoringView } from './components/views/MonitoringView';
import { SettingsModal } from './components/views/SettingsModal';

const LOCAL_STORAGE_KEY = 'netrouteai_topology_v1';

export default function App() {
  // Navigation - defaults to comprehensive Home landing page
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('home');

  // Topology State (Devices & Cables)
  const [devices, setDevices] = useState<NetworkDevice[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.devices?.length) return parsed.devices;
      }
    } catch (e) {
      console.error('Error loading saved topology:', e);
    }
    return getDefaultTopology().devices;
  });

  const [cables, setCables] = useState<NetworkCable[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.cables?.length) return parsed.cables;
      }
    } catch (e) {
      console.error('Error loading saved topology:', e);
    }
    return getDefaultTopology().cables;
  });

  // Selection
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>('R1');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);

  // Annotations State (Cisco Packet Tracer style drawing palette objects)
  const initialDefaultAnnotations: AnnotationItem[] = [
    {
      id: 'annot-lan-zone',
      type: 'rounded-rect',
      x: 180,
      y: 80,
      width: 640,
      height: 380,
      fillColor: '#0E7490',
      borderColor: '#06B6D4',
      borderWidth: 2,
      opacity: 0.12,
      isLocked: false,
      layerOrder: 1,
    },
    {
      id: 'annot-lan-label',
      type: 'text',
      x: 200,
      y: 95,
      width: 220,
      height: 32,
      text: 'Corporate Core LAN (VLAN 10)',
      fillColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 1,
      opacity: 1,
      isLocked: false,
      layerOrder: 2,
      fontSize: 13,
      fontFamily: 'sans',
      fontWeight: 'bold',
      textColor: '#38BDF8',
      backgroundColor: '#0F172A',
      textAlign: 'left',
    },
  ];

  const [annotations, setAnnotations] = useState<AnnotationItem[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.annotations && Array.isArray(parsed.annotations)) {
          return parsed.annotations;
        }
      }
    } catch (e) {
      console.error('Error loading saved annotations:', e);
    }
    return initialDefaultAnnotations;
  });

  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);

  // Drawing Palette & Marquee selection states
  const [isDrawingPaletteOpen, setIsDrawingPaletteOpen] = useState<boolean>(false);
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool>('select');
  const [drawingSettings, setDrawingSettings] = useState<DrawingPaletteSettings>(DEFAULT_DRAWING_SETTINGS);
  const [recentColors, setRecentColors] = useState<string[]>([
    '#06B6D4',
    '#0284C7',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
  ]);
  const [isMarqueeMode, setIsMarqueeMode] = useState<boolean>(false);

  // Connect Mode State
  const [isConnectMode, setIsConnectMode] = useState<boolean>(false);
  const [connectSourceDevice, setConnectSourceDevice] = useState<NetworkDevice | null>(null);
  const [connectSourceInterface, setConnectSourceInterface] = useState<NetworkInterface | null>(null);

  // Interface Selection Modal State
  const [interfaceModalOpen, setInterfaceModalOpen] = useState<boolean>(false);
  const [interfaceModalTargetDevice, setInterfaceModalTargetDevice] = useState<NetworkDevice | null>(null);
  const [interfaceModalStep, setInterfaceModalStep] = useState<'source' | 'target'>('source');

  // Cisco CLI Modal State
  const [cliModalOpen, setCliModalOpen] = useState<boolean>(false);
  const [cliTargetDevice, setCliTargetDevice] = useState<NetworkDevice | null>(null);

  // Packet Simulator Modal State
  const [packetSimModalOpen, setPacketSimModalOpen] = useState<boolean>(false);

  // AI Route Recommendation state
  const [aiRouteResult, setAiRouteResult] = useState<AiRouteRecommendation | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);

  // Packet Simulation State (legacy single-packet, kept for compatibility)
  const [simulationState, setSimulationState] = useState<PacketSimulationState>({
    active: false,
    sourceId: null,
    targetId: null,
    hops: [],
    currentHopIndex: 0,
    hopProgress: 0,
    status: 'idle',
    message: '',
    logs: [],
  });

  // Multi-packet simulation state
  const [packets, setPackets] = useState<Packet[]>([]);
  const [packetGeneratorConfig, setPacketGeneratorConfig] = useState<PacketGeneratorConfig>({
    packetCount: 100,
    intervalMs: 100,
    sourceId: '',
    destinationId: '',
    running: false,
  });
  const packetGenIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const packetTickRef = useRef<NodeJS.Timeout | null>(null);

  // Reference to abort animation if re-triggered
  const animFrameRef = useRef<number | null>(null);
  const animTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Multi-packet tick loop — advances all active packets
  useEffect(() => {
    const tick = () => {
      setPackets((prev) => {
        if (prev.length === 0) return prev;
        const cableUpdates = new Map<string, number>();
        const updated = prev.map((packet) => {
          if (packet.status !== 'routing' && packet.status !== 'transmitting') return packet;
          const { packet: advanced, cableUpdates: updates } = advancePacket(packet, cables, devices);
          updates.forEach((delta, cableId) => {
            cableUpdates.set(cableId, (cableUpdates.get(cableId) || 0) + delta);
          });
          return advanced;
        });
        // Apply congestion updates to cables
        if (cableUpdates.size > 0) {
          setCables((prevCables) =>
            prevCables.map((c) => {
              const delta = cableUpdates.get(c.id);
              if (!delta) return c;
              const newCount = Math.max(0, (c.currentPackets ?? 0) + delta);
              return { ...c, currentPackets: newCount };
            })
          );
        }
        return updated;
      });
      packetTickRef.current = setTimeout(tick, 16);
    };
    packetTickRef.current = setTimeout(tick, 16);
    return () => {
      if (packetTickRef.current) clearTimeout(packetTickRef.current);
    };
  }, [cables, devices]);

  // Packet generator handlers
  const handleStartPacketGenerator = (config: PacketGeneratorConfig) => {
    setPacketGeneratorConfig(config);
    let sent = 0;
    const sendPacket = () => {
      if (sent >= config.packetCount) {
        setPacketGeneratorConfig((prev) => ({ ...prev, running: false }));
        return;
      }
      const packet = createPacket(config.sourceId, config.destinationId, devices, cables);
      if (packet) {
        setPackets((prev) => [...prev, packet]);
      }
      sent++;
      packetGenIntervalRef.current = setTimeout(sendPacket, config.intervalMs);
    };
    sendPacket();
  };

  const handleStopPacketGenerator = () => {
    if (packetGenIntervalRef.current) clearTimeout(packetGenIntervalRef.current);
    setPacketGeneratorConfig((prev) => ({ ...prev, running: false }));
  };

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    };
  }, []);

  // Save topology to localStorage
  const handleSaveTopology = () => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ devices, cables, annotations }));
      alert('Network topology & annotations saved successfully to localStorage!');
    } catch (e) {
      console.error('Failed to save topology:', e);
    }
  };

  // Load topology from localStorage
  const handleLoadTopology = () => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.devices && parsed.cables) {
          setDevices(parsed.devices);
          setCables(parsed.cables);
          if (parsed.annotations) {
            setAnnotations(parsed.annotations);
          }
          setSelectedDeviceId(parsed.devices[0]?.id || null);
          setSelectedDeviceIds([]);
          setSelectedAnnotationId(null);
          setSelectedAnnotationIds([]);
          alert('Topology & annotations restored from localStorage!');
          return;
        }
      }
      alert('No saved topology found in localStorage. Loading default.');
    } catch (e) {
      console.error('Failed to load topology:', e);
    }
  };

  // Send Topology to AI Backend for Route Recommendation
  const handleSendTopology = async () => {
    if (devices.length < 2) {
      alert('Add at least 2 devices to analyze.');
      return;
    }

    setIsAiAnalyzing(true);
    setAiError(null);
    setAiRouteResult(null);

    try {
      // Convert frontend topology to backend format
      const backendTopology = {
        devices: devices.map((d) => ({
          id: d.id,
          type: d.type,
          name: d.name,
          x: d.x,
          y: d.y,
          ip_address: d.ipAddress || undefined,
          gateway: d.gateway || undefined,
        })),
        links: cables.map((c) => ({
          source: c.fromDeviceId,
          target: c.toDeviceId,
          cost: c.cost,
          bandwidth: c.bandwidth,
          latency: c.latency,
          loss_probability: c.lossProbability,
        })),
        auto_ip: true,
      };

      // Upload topology to backend
      const { topology_id } = await uploadTopology(backendTopology);

      // Auto-pick source and destination: prefer routers as endpoints
      const routers = devices.filter((d) => d.type === 'router');
      const endpoints = routers.length >= 2 ? routers : devices;
      const source = endpoints[0].id;
      const destination = endpoints[endpoints.length - 1].id;

      // Get AI route recommendation
      const result = await getAiRouteRecommendation(topology_id, source, destination);
      setAiRouteResult(result);
    } catch (e: any) {
      setAiError(e.message || 'AI analysis failed');
      console.error('Send Topology error:', e);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  // Compute which cable IDs are on the AI-recommended path (for green highlighting)
  const aiPathCableIds = new Set<string>();
  if (aiRouteResult?.best_route) {
    const route = aiRouteResult.best_route;
    for (let i = 0; i < route.length - 1; i++) {
      const cable = cables.find(
        (c) =>
          (c.fromDeviceId === route[i] && c.toDeviceId === route[i + 1]) ||
          (c.fromDeviceId === route[i + 1] && c.toDeviceId === route[i])
      );
      if (cable) aiPathCableIds.add(cable.id);
    }
  }

  // Preset Selection
  const handleSelectPreset = (preset: 'default' | 'star' | 'mesh' | 'tree' | 'bus' | 'ring') => {
    let newTop: { devices: NetworkDevice[]; cables: NetworkCable[] };
    switch (preset) {
      case 'star':
        newTop = getStarTopology();
        break;
      case 'mesh':
        newTop = getMeshTopology();
        break;
      case 'tree':
        newTop = getTreeTopology();
        break;
      case 'bus':
        newTop = getBusTopology();
        break;
      case 'ring':
        newTop = getRingTopology();
        break;
      case 'default':
      default:
        newTop = getDefaultTopology();
        break;
    }
    setDevices(newTop.devices);
    setCables(newTop.cables);
    setSelectedDeviceId(newTop.devices[0]?.id || null);
    setSelectedCableId(null);
    setIsConnectMode(false);
    setConnectSourceDevice(null);
    setConnectSourceInterface(null);
  };

  // Clear Canvas
  const handleResetCanvas = () => {
    if (confirm('Clear all devices and cables from the workspace?')) {
      setDevices([]);
      setCables([]);
      setSelectedDeviceId(null);
      setSelectedCableId(null);
    }
  };

  // Add Device from Palette or click
  const handleAddDevice = (type: DeviceType, atX?: number, atY?: number) => {
    const existingTypeCount = devices.filter((d) => d.type === type).length + 1;
    let prefix = 'PC';
    let defaultModel = 'Generic Workstation';
    let defaultIos = 'NetOS 11.4 Workstation Edition';
    let defaultInterfaces: NetworkInterface[] = [];
    let defaultIp = `192.168.1.${10 + existingTypeCount}`;
    let defaultGateway = '192.168.1.1';

    if (type === 'router') {
      prefix = 'R';
      defaultModel = 'Cisco 2911 Integrated Services Router';
      defaultIos = 'Cisco IOS 15.5(3)M4b UNIVERSALK9';
      defaultInterfaces = createRouterInterfaces(8);
      defaultIp = `192.168.${existingTypeCount}.1`;
      defaultGateway = '0.0.0.0';
    } else if (type === 'switch') {
      prefix = 'SW';
      defaultModel = 'Cisco Catalyst 2960-24TT';
      defaultIos = 'Cisco IOS 15.0(2)SE4 LANBASEK9';
      defaultInterfaces = createSwitchInterfaces(4);
      defaultIp = `192.168.1.${existingTypeCount + 1}`;
      defaultGateway = '192.168.1.1';
    } else {
      defaultInterfaces = createPCInterfaces();
    }

    const id = `${prefix}${existingTypeCount}`;
    const x = atX !== undefined ? atX : 250 + (devices.length % 5) * 140;
    const y = atY !== undefined ? atY : 200 + Math.floor(devices.length / 5) * 100;

    const newDevice: NetworkDevice = {
      id,
      name: id,
      type,
      x,
      y,
      status: 'running',
      ipAddress: defaultIp,
      subnetMask: '255.255.255.0',
      gateway: defaultGateway,
      macAddress: `00:1B:D4:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(
        Math.random() * 89 + 10
      )}:${Math.floor(Math.random() * 89 + 10)}`,
      interfaces: defaultInterfaces,
      model: defaultModel,
      iosVersion: defaultIos,
      uptime: '1 day, 0 hours',
      cliConfig: {
        hostname: id,
        history: ['enable'],
      },
    };

    setDevices((prev) => [...prev, newDevice]);
    setSelectedDeviceId(id);
    setSelectedCableId(null);
  };

  // Add Port / Interface to Router or Switch
  const handleAddInterface = (device: NetworkDevice) => {
    let newIface: NetworkInterface;
    if (device.type === 'router') {
      const idx = device.interfaces.length;
      newIface = {
        id: `Gi0/${idx}`,
        name: `GigabitEthernet0/${idx}`,
        ipAddress: 'unassigned',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: `00:1B:D4:AA:BB:0${idx}`,
        connectedTo: null,
      };
    } else if (device.type === 'switch') {
      const idx = device.interfaces.length + 1;
      newIface = {
        id: `Fa0/${idx}`,
        name: `FastEthernet0/${idx}`,
        ipAddress: 'unassigned',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: `00:1E:F7:AA:BB:0${idx}`,
        connectedTo: null,
      };
    } else {
      return;
    }

    const updated: NetworkDevice = {
      ...device,
      interfaces: [...device.interfaces, newIface],
    };

    setDevices((prev) => prev.map((d) => (d.id === device.id ? updated : d)));
  };

  // Move Device on Canvas
  const handleMoveDevice = (deviceId: string, x: number, y: number) => {
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, x, y } : d)));
  };

  // Move Multiple Devices Simultaneously
  const handleMoveMultipleDevices = (moves: { id: string; x: number; y: number }[]) => {
    const moveMap = new Map<string, { x: number; y: number }>();
    moves.forEach((m) => moveMap.set(m.id, { x: m.x, y: m.y }));
    setDevices((prev) =>
      prev.map((d) => {
        const target = moveMap.get(d.id);
        return target ? { ...d, x: target.x, y: target.y } : d;
      })
    );
  };

  // Select Multiple Devices (from Marquee drag or Shift+click)
  const handleSelectMultipleDevices = (deviceIds: string[]) => {
    setSelectedDeviceIds(deviceIds);
    setSelectedDeviceId(deviceIds.length > 0 ? deviceIds[0] : null);
    setSelectedCableId(null);
    setSelectedAnnotationId(null);
    setSelectedAnnotationIds([]);
  };

  // Select All Devices on Canvas
  const handleSelectAllDevices = () => {
    const allIds = devices.map((d) => d.id);
    setSelectedDeviceIds(allIds);
    setSelectedDeviceId(allIds[0] || null);
    setSelectedCableId(null);
    setSelectedAnnotationId(null);
    setSelectedAnnotationIds([]);
  };

  // Update Cable Control Point (curve handle)
  const handleUpdateCableControlPoint = (cableId: string, controlPoint: { x: number; y: number } | null) => {
    setCables((prev) => prev.map((c) => (c.id === cableId ? { ...c, controlPoint } : c)));
  };

  // Update Cable Properties (cost, bandwidth, latency, loss)
  const handleUpdateCable = (updatedCable: NetworkCable) => {
    setCables((prev) =>
      prev.map((c) => (c.id === updatedCable.id ? updatedCable : c))
    );
  };

  // Update Device Properties
  const handleUpdateDevice = (updated: NetworkDevice) => {
    setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  // Delete Device
  const handleDeleteDevice = (deviceId: string) => {
    // Remove attached cables
    setCables((prev) =>
      prev.filter((c) => c.fromDeviceId !== deviceId && c.toDeviceId !== deviceId)
    );
    // Unlink any peer interfaces
    setDevices((prev) =>
      prev
        .filter((d) => d.id !== deviceId)
        .map((d) => ({
          ...d,
          interfaces: d.interfaces.map((i) =>
            i.connectedTo?.deviceId === deviceId ? { ...i, connectedTo: null } : i
          ),
        }))
    );
    if (selectedDeviceId === deviceId) {
      setSelectedDeviceId(null);
    }
    setSelectedDeviceIds((prev) => prev.filter((id) => id !== deviceId));
  };

  // Delete Multiple Devices at once ("Drag all and delete")
  const handleDeleteMultipleDevices = (deviceIds: string[]) => {
    // 1. Remove all attached cables
    setCables((prev) =>
      prev.filter((c) => !deviceIds.includes(c.fromDeviceId) && !deviceIds.includes(c.toDeviceId))
    );
    // 2. Remove devices and unlink any peer interfaces
    setDevices((prev) =>
      prev
        .filter((d) => !deviceIds.includes(d.id))
        .map((d) => ({
          ...d,
          interfaces: d.interfaces.map((i) =>
            i.connectedTo && deviceIds.includes(i.connectedTo.deviceId)
              ? { ...i, connectedTo: null }
              : i
          ),
        }))
    );
    setSelectedDeviceId(null);
    setSelectedDeviceIds([]);
  };

  // Delete Cable
  const handleDeleteCable = (cableId: string) => {
    const cable = cables.find((c) => c.id === cableId);
    if (cable) {
      // Unlink interfaces
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id === cable.fromDeviceId || d.id === cable.toDeviceId) {
            return {
              ...d,
              interfaces: d.interfaces.map((i) =>
                i.connectedTo?.cableId === cableId ? { ...i, connectedTo: null } : i
              ),
            };
          }
          return d;
        })
      );
    }
    setCables((prev) => prev.filter((c) => c.id !== cableId));
    if (selectedCableId === cableId) {
      setSelectedCableId(null);
    }
  };

  // Annotation CRUD Operations
  const handleAddAnnotation = (item: AnnotationItem) => {
    setAnnotations((prev) => [...prev, item]);
  };

  const handleUpdateAnnotation = (id: string, updates: Partial<AnnotationItem>) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const handleDeleteAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
    setSelectedAnnotationIds((prev) => prev.filter((i) => i !== id));
  };

  const handleDuplicateAnnotation = (id: string) => {
    const original = annotations.find((a) => a.id === id);
    if (!original) return;
    const duplicate: AnnotationItem = {
      ...original,
      id: `annot-${original.type}-${Date.now()}`,
      x: original.x + 25,
      y: original.y + 25,
      endX: original.endX !== undefined ? original.endX + 25 : undefined,
      endY: original.endY !== undefined ? original.endY + 25 : undefined,
      layerOrder: Date.now(),
    };
    setAnnotations((prev) => [...prev, duplicate]);
    setSelectedAnnotationId(duplicate.id);
  };

  const handleBringForwardAnnotation = (id: string) => {
    setAnnotations((prev) => {
      const sorted = [...prev].sort((a, b) => a.layerOrder - b.layerOrder);
      const index = sorted.findIndex((a) => a.id === id);
      if (index === -1 || index === sorted.length - 1) return prev;
      const current = sorted[index];
      const next = sorted[index + 1];
      const tempOrder = current.layerOrder;
      current.layerOrder = next.layerOrder + 1;
      return [...sorted];
    });
  };

  const handleSendBackwardAnnotation = (id: string) => {
    setAnnotations((prev) => {
      const sorted = [...prev].sort((a, b) => a.layerOrder - b.layerOrder);
      const index = sorted.findIndex((a) => a.id === id);
      if (index <= 0) return prev;
      const current = sorted[index];
      const prevItem = sorted[index - 1];
      current.layerOrder = Math.max(0, prevItem.layerOrder - 1);
      return [...sorted];
    });
  };

  const handleToggleLockAnnotation = (id: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isLocked: !a.isLocked } : a))
    );
  };

  const handleToggleGroupAnnotations = () => {
    if (selectedAnnotationIds.length < 2) return;
    const newGroupId = `group-${Date.now()}`;
    setAnnotations((prev) =>
      prev.map((a) => (selectedAnnotationIds.includes(a.id) ? { ...a, groupId: newGroupId } : a))
    );
  };

  // Delete Current Selection (Multi-Devices, Single Device, Cable, or Annotations)
  const handleDeleteSelected = () => {
    if (selectedDeviceIds.length > 1) {
      handleDeleteMultipleDevices(selectedDeviceIds);
    } else if (selectedDeviceId) {
      handleDeleteDevice(selectedDeviceId);
    } else if (selectedCableId) {
      handleDeleteCable(selectedCableId);
    } else if (selectedAnnotationIds.length > 0) {
      setAnnotations((prev) => prev.filter((a) => !selectedAnnotationIds.includes(a.id)));
      setSelectedAnnotationIds([]);
      setSelectedAnnotationId(null);
    } else if (selectedAnnotationId) {
      handleDeleteAnnotation(selectedAnnotationId);
    }
  };

  // Connect Mode Workflow
  const handleToggleConnectMode = () => {
    setIsConnectMode(!isConnectMode);
    setConnectSourceDevice(null);
    setConnectSourceInterface(null);
  };

  const handleDeviceClickInConnectMode = (device: NetworkDevice) => {
    if (!connectSourceDevice) {
      // Step 1: User clicked Source Device -> Open Interface Selection Modal for Source
      setInterfaceModalTargetDevice(device);
      setInterfaceModalStep('source');
      setInterfaceModalOpen(true);
    } else {
      // Step 2: User clicked Target Device
      if (device.id === connectSourceDevice.id) {
        alert('Cannot connect a device to itself.');
        return;
      }
      // Open Interface Selection Modal for Target
      setInterfaceModalTargetDevice(device);
      setInterfaceModalStep('target');
      setInterfaceModalOpen(true);
    }
  };

  // User selected an interface in the modal
  const handleInterfaceModalSelect = (iface: NetworkInterface) => {
    if (!interfaceModalTargetDevice) return;

    if (interfaceModalStep === 'source') {
      // Source interface chosen
      setConnectSourceDevice(interfaceModalTargetDevice);
      setConnectSourceInterface(iface);
      setInterfaceModalOpen(false);
    } else {
      // Target interface chosen! Complete Cable creation
      if (!connectSourceDevice || !connectSourceInterface) return;

      const sourceDev = connectSourceDevice;
      const targetDev = interfaceModalTargetDevice;
      const targetIface = iface;

      const cableId = `cable-${Date.now()}`;
      const isCrossover =
        (sourceDev.type === 'router' && targetDev.type === 'router') ||
        (sourceDev.type === 'pc' && targetDev.type === 'pc');

      // Create new cable
      const newCable: NetworkCable = {
        id: cableId,
        fromDeviceId: sourceDev.id,
        fromPort: connectSourceInterface.id,
        toDeviceId: targetDev.id,
        toPort: targetIface.id,
        controlPoint: null,
        status: 'active',
        cableType: isCrossover ? 'crossover' : 'straight-through',
      };

      // Link interfaces on both devices
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id === sourceDev.id) {
            return {
              ...d,
              interfaces: d.interfaces.map((i) =>
                i.id === connectSourceInterface.id
                  ? { ...i, connectedTo: { deviceId: targetDev.id, interfaceId: targetIface.id, cableId } }
                  : i
              ),
            };
          }
          if (d.id === targetDev.id) {
            return {
              ...d,
              interfaces: d.interfaces.map((i) =>
                i.id === targetIface.id
                  ? { ...i, connectedTo: { deviceId: sourceDev.id, interfaceId: connectSourceInterface.id, cableId } }
                  : i
              ),
            };
          }
          return d;
        })
      );

      setCables((prev) => [...prev, newCable]);
      setInterfaceModalOpen(false);
      setIsConnectMode(false);
      setConnectSourceDevice(null);
      setConnectSourceInterface(null);
    }
  };

  // Packet Simulator Engine: Hop-by-hop traversal
  const handleStartSimulation = (sourceId: string, targetId: string, speedMs: number = 400) => {
    // Discover route using BFS graph traversal
    const route = discoverRoute(sourceId, targetId, devices, cables);

    if (!route.success && route.hops.length === 0) {
      setSimulationState({
        active: true,
        sourceId,
        targetId,
        hops: [],
        currentHopIndex: 0,
        hopProgress: 0,
        status: 'failed',
        message: route.error || 'Routing failed: No valid path found.',
        logs: [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            message: `Route discovery failed: ${route.error}`,
            type: 'error',
          },
        ],
      });
      return;
    }

    // Set initial routing state
    setSimulationState({
      active: true,
      sourceId,
      targetId,
      hops: route.hops,
      currentHopIndex: 0,
      hopProgress: 0,
      status: 'routing',
      message: `Routing path discovered: ${route.devicesPath.join(' → ')} (${route.hops.length} hops)`,
      logs: [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          message: `Frame transmission initiated: ${sourceId} to ${targetId}`,
          type: 'info',
        },
        {
          id: `log-${Date.now() + 1}`,
          timestamp: new Date().toLocaleTimeString(),
          message: `Shortest graph route resolved: ${route.devicesPath.join(' → ')}`,
          type: 'info',
        },
      ],
    });

    // Start hop traversal loop
    let currentHop = 0;
    const totalHops = route.hops.length;

    const animateHop = () => {
      const hop = route.hops[currentHop];
      const hopDuration = 600; // ms to travel cable
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / hopDuration);

        setSimulationState((prev) => ({
          ...prev,
          currentHopIndex: currentHop,
          hopProgress: progress,
          status: 'transmitting',
          message: `Hop ${currentHop + 1}/${totalHops}: ${hop.fromDeviceId} (${hop.fromPort}) → ${
            hop.toDeviceId
          } (${hop.toPort})`,
        }));

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          // Hop completed!
          // Log hop
          setSimulationState((prev) => ({
            ...prev,
            logs: [
              ...prev.logs,
              {
                id: `log-hop-${currentHop}-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString(),
                message: `Hop ${currentHop + 1} delivered to ${hop.toDeviceId} via ${hop.toPort} [RTT 0.4ms]`,
                type: 'info',
                hop: currentHop,
              },
            ],
          }));

          // Check if packet was dropped at this hop
          if (!route.success && route.droppedAtDeviceId === hop.toDeviceId) {
            setSimulationState((prev) => ({
              ...prev,
              status: 'failed',
              droppedAtHop: currentHop,
              message: `Packet Dropped: ${route.error}`,
              logs: [
                ...prev.logs,
                {
                  id: `log-drop-${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  message: `Packet dropped at ${hop.toDeviceId}: Interface administratively down`,
                  type: 'error',
                },
              ],
            }));
            return;
          }

          // Move to next hop if available
          if (currentHop + 1 < totalHops) {
            currentHop++;
            // Pause 300-500ms between each hop as required!
            setSimulationState((prev) => ({
              ...prev,
              status: 'waiting',
              message: `Queuing at ${hop.toDeviceId}... (${speedMs}ms pause)`,
            }));

            animTimeoutRef.current = setTimeout(() => {
              animateHop();
            }, speedMs);
          } else {
            // All hops finished successfully!
            setSimulationState((prev) => ({
              ...prev,
              status: 'success',
              hopProgress: 1,
              message: `Packet Delivered Successfully to ${targetId}! (Flash Green)`,
              logs: [
                ...prev.logs,
                {
                  id: `log-delivered-${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  message: `ICMP Echo Reply verified: 100% success rate (5/5), round-trip avg 3ms`,
                  type: 'success',
                },
              ],
            }));

            // Auto-clear active simulation banner after 4 seconds
            animTimeoutRef.current = setTimeout(() => {
              setSimulationState((prev) => ({ ...prev, active: false }));
            }, 4000);
          }
        }
      };

      animFrameRef.current = requestAnimationFrame(step);
    };

    // Begin first hop after brief pause
    animTimeoutRef.current = setTimeout(() => {
      animateHop();
    }, 200);
  };

  // Selected device object
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || null;

  // Dedicated SaaS Landing Page View vs Main Workspace Layout
  if (activeTab === 'home') {
    return (
      <div id="netrouteai-root" className="min-h-screen bg-[#050816] text-ink font-sans">
        <HomeView
          onLaunchDesigner={() => setActiveTab('designer')}
          deviceCount={devices.length}
          cableCount={cables.length}
        />
      </div>
    );
  }

  return (
    <div
      id="netrouteai-root"
      className="h-screen overflow-hidden bg-[#050816] text-ink flex flex-col font-sans"
    >
      {/* 1. Full-Width Top Navbar */}
      <Navbar
        deviceCount={devices.length}
        cableCount={cables.length}
        activeTab={activeTab}
        onNavigate={(tab) => setActiveTab(tab)}
      />

      {/* 2. Main Dashboard Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab === 'settings') {
              setSettingsModalOpen(true);
            } else {
              setActiveTab(tab);
            }
          }}
          onLogout={() => {
            setActiveTab('home');
          }}
        />

        {/* Dynamic Center Area based on activeTab */}
        {activeTab === 'designer' ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Top Toolbar */}
            <Toolbar
              isConnectMode={isConnectMode}
              onToggleConnectMode={handleToggleConnectMode}
              onOpenPacketSimulator={() => setPacketSimModalOpen(true)}
              onDeleteSelected={handleDeleteSelected}
              hasSelection={
                selectedDeviceIds.length > 0 ||
                !!selectedDeviceId ||
                !!selectedCableId ||
                selectedAnnotationIds.length > 0 ||
                !!selectedAnnotationId
              }
              selectedCount={
                selectedDeviceIds.length > 0
                  ? selectedDeviceIds.length
                  : selectedDeviceId
                  ? 1
                  : selectedCableId
                  ? 1
                  : selectedAnnotationIds.length > 0
                  ? selectedAnnotationIds.length
                  : selectedAnnotationId
                  ? 1
                  : 0
              }
              onSaveTopology={handleSaveTopology}
              onLoadTopology={handleLoadTopology}
              onSelectPreset={handleSelectPreset}
              onResetCanvas={handleResetCanvas}
              isSimulating={simulationState.active}
              onSendTopology={handleSendTopology}
              isAiAnalyzing={isAiAnalyzing}
              isDrawingPaletteOpen={isDrawingPaletteOpen}
              onToggleDrawingPalette={() => setIsDrawingPaletteOpen(!isDrawingPaletteOpen)}
              onSelectAllDevices={handleSelectAllDevices}
              isMarqueeMode={isMarqueeMode}
              onToggleMarqueeMode={() => setIsMarqueeMode(!isMarqueeMode)}
            />

            {/* Core Designer 3-Column Split: Device Palette | Canvas | Properties Panel */}
            <div className="relative flex-1 flex h-full overflow-hidden">
              {/* Device Palette */}
              <DevicePalette onAddDevice={(type) => handleAddDevice(type)} />

              {/* Topology SVG Canvas */}
              <NetworkCanvas
                devices={devices}
                cables={cables}
                selectedDeviceId={selectedDeviceId}
                selectedDeviceIds={selectedDeviceIds}
                selectedCableId={selectedCableId}
                isConnectMode={isConnectMode}
                connectSourceDevice={connectSourceDevice}
                simulationState={simulationState}
                onSelectDevice={(id, isMulti) => {
                  if (isMulti && id) {
                    setSelectedDeviceIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    );
                    setSelectedDeviceId(id);
                  } else {
                    setSelectedDeviceId(id);
                    setSelectedDeviceIds(id ? [id] : []);
                  }
                  if (id) {
                    setSelectedCableId(null);
                    setSelectedAnnotationId(null);
                    setSelectedAnnotationIds([]);
                  }
                }}
                onSelectMultipleDevices={handleSelectMultipleDevices}
                onSelectCable={(id) => {
                  setSelectedCableId(id);
                  if (id) {
                    setSelectedDeviceId(null);
                    setSelectedDeviceIds([]);
                    setSelectedAnnotationId(null);
                    setSelectedAnnotationIds([]);
                  }
                }}
                onMoveDevice={handleMoveDevice}
                onMoveMultipleDevices={handleMoveMultipleDevices}
                onUpdateCableControlPoint={handleUpdateCableControlPoint}
                onDeviceClickInConnectMode={handleDeviceClickInConnectMode}
                onDropDevice={handleAddDevice}
                // Annotations
                annotations={annotations}
                selectedAnnotationId={selectedAnnotationId}
                selectedAnnotationIds={selectedAnnotationIds}
                onSelectAnnotation={(id, isMulti) => {
                  if (isMulti && id) {
                    setSelectedAnnotationIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    );
                    setSelectedAnnotationId(id);
                  } else {
                    setSelectedAnnotationId(id);
                    setSelectedAnnotationIds(id ? [id] : []);
                  }
                  if (id) {
                    setSelectedDeviceId(null);
                    setSelectedDeviceIds([]);
                    setSelectedCableId(null);
                  }
                }}
                onAddAnnotation={handleAddAnnotation}
                onUpdateAnnotation={handleUpdateAnnotation}
                onDeleteAnnotation={handleDeleteAnnotation}
                onDuplicateAnnotation={handleDuplicateAnnotation}
                onBringForwardAnnotation={handleBringForwardAnnotation}
                onSendBackwardAnnotation={handleSendBackwardAnnotation}
                onToggleLockAnnotation={handleToggleLockAnnotation}
                onToggleGroupAnnotations={handleToggleGroupAnnotations}
                activeDrawingTool={activeDrawingTool}
                onSelectDrawingTool={setActiveDrawingTool}
                currentFillColor={drawingSettings.fillColor}
                currentBorderColor={drawingSettings.borderColor}
                currentBorderWidth={drawingSettings.borderWidth}
                currentOpacity={drawingSettings.opacity}
                // Marquee box selection
                isMarqueeMode={isMarqueeMode}
                onSelectAllDevices={handleSelectAllDevices}
                onDeleteSelected={handleDeleteSelected}
                aiPathCableIds={aiPathCableIds}
                packets={packets}
              />

              {/* Floating Cisco Packet Tracer Drawing Palette */}
              <DrawingPalette
                isOpen={isDrawingPaletteOpen}
                onClose={() => setIsDrawingPaletteOpen(false)}
                activeTool={activeDrawingTool}
                onSelectTool={(tool) => setActiveDrawingTool(tool)}
                selectedAnnotation={
                  annotations.find((a) => a.id === selectedAnnotationId) || null
                }
                selectedAnnotationsCount={
                  selectedAnnotationIds.length || (selectedAnnotationId ? 1 : 0)
                }
                onUpdateSelectedAnnotation={(updates) => {
                  if (selectedAnnotationId) handleUpdateAnnotation(selectedAnnotationId, updates);
                }}
                onDeleteSelected={handleDeleteSelected}
                onDuplicateSelected={() => {
                  if (selectedAnnotationId) handleDuplicateAnnotation(selectedAnnotationId);
                }}
                onToggleLock={() => {
                  if (selectedAnnotationId) handleToggleLockAnnotation(selectedAnnotationId);
                }}
                onToggleGroup={handleToggleGroupAnnotations}
                canGroup={selectedAnnotationIds.length > 1}
                isGrouped={!!annotations.find((a) => a.id === selectedAnnotationId)?.groupId}
                currentFillColor={drawingSettings.fillColor}
                onChangeFillColor={(color) =>
                  setDrawingSettings((prev) => ({ ...prev, fillColor: color }))
                }
                currentBorderColor={drawingSettings.borderColor}
                onChangeBorderColor={(color) =>
                  setDrawingSettings((prev) => ({ ...prev, borderColor: color }))
                }
                currentBorderWidth={drawingSettings.borderWidth}
                onChangeBorderWidth={(w) =>
                  setDrawingSettings((prev) => ({ ...prev, borderWidth: w }))
                }
                currentOpacity={drawingSettings.opacity}
                onChangeOpacity={(op) =>
                  setDrawingSettings((prev) => ({ ...prev, opacity: op }))
                }
                recentColors={recentColors}
                onAddRecentColor={(color) =>
                  setRecentColors((prev) => Array.from(new Set([color, ...prev])).slice(0, 8))
                }
              />

              {/* AI Route Recommendation Result Banner */}
              {aiRouteResult && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-base/95 border border-ok/50 rounded-xl shadow-2xl shadow-black/30 px-5 py-3 max-w-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-ok/20 border border-ok/40">
                      <Brain className="w-4 h-4 text-ok" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ok">AI Recommended Route</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ok/20 text-ok border border-ok/30 font-mono">
                          {aiRouteResult.confidence}% confidence
                        </span>
                      </div>
                      <div className="text-xs text-ink-soft mt-0.5 font-mono">
                        {aiRouteResult.best_route.join(' → ')}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-ink-muted font-mono">
                        <span>Latency: {aiRouteResult.latency}ms</span>
                        <span>Hops: {aiRouteResult.hop_count}</span>
                        <span>Cost: {aiRouteResult.total_cost}</span>
                        <span>Bandwidth: {aiRouteResult.metrics?.bandwidth} Mbps</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setAiRouteResult(null)}
                      className="p-1 rounded-lg text-ink-faint hover:text-ink-soft hover:bg-panel transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* AI Error Banner */}
              {aiError && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-base/95 border border-bad/50 rounded-xl shadow-2xl px-5 py-3 max-w-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bad/20 border border-bad/40">
                      <XCircle className="w-4 h-4 text-bad" />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-bold text-bad">AI Analysis Failed</span>
                      <div className="text-xs text-ink-soft mt-0.5">{aiError}</div>
                    </div>
                    <button
                      onClick={() => setAiError(null)}
                      className="p-1 rounded-lg text-ink-faint hover:text-ink-soft hover:bg-panel transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Right Panel: Cable Properties when cable selected, Device Properties otherwise */}
              {selectedCableId ? (
                <CablePropertiesPanel
                  cable={cables.find((c) => c.id === selectedCableId) || null}
                  onUpdateCable={handleUpdateCable}
                />
              ) : selectedDeviceId ? (
                <DevicePropertiesPanel
                  device={selectedDevice}
                  onUpdateDevice={handleUpdateDevice}
                  onDeleteDevice={handleDeleteDevice}
                  onOpenCLI={(dev) => {
                    setCliTargetDevice(dev);
                    setCliModalOpen(true);
                  }}
                  onAddInterface={handleAddInterface}
                />
              ) : (
                <SimulationMetricsPanel packets={packets} cables={cables} />
              )}
            </div>
          </div>
        ) : activeTab === 'analytics' ? (
          <AnalyticsView devices={devices} />
        ) : (
          <MonitoringView
            devices={devices}
            cables={cables}
            onToggleInterface={(devId, ifaceId) => {
              setDevices((prev) =>
                prev.map((d) => {
                  if (d.id === devId) {
                    return {
                      ...d,
                      interfaces: d.interfaces.map((i) =>
                        i.id === ifaceId
                          ? { ...i, status: i.status === 'up' ? ('down' as const) : ('up' as const) }
                          : i
                      ),
                    };
                  }
                  return d;
                })
              );
            }}
          />
        )}
      </div>

      {/* 3. Modal Dialogs */}
      {/* Interface Selection Popup for Connect Mode */}
      {interfaceModalTargetDevice && (
        <InterfaceModal
          isOpen={interfaceModalOpen}
          device={interfaceModalTargetDevice}
          onClose={() => {
            setInterfaceModalOpen(false);
            setIsConnectMode(false);
            setConnectSourceDevice(null);
            setConnectSourceInterface(null);
          }}
          onSelectInterface={handleInterfaceModalSelect}
          onAddInterface={handleAddInterface}
          step={interfaceModalStep}
          sourceDeviceName={connectSourceDevice?.name}
          sourceInterfaceId={connectSourceInterface?.id}
        />
      )}

      {/* Cisco CLI Interactive Terminal Window */}
      <CiscoCLIModal
        device={cliTargetDevice}
        isOpen={cliModalOpen}
        onClose={() => {
          setCliModalOpen(false);
          setCliTargetDevice(null);
        }}
        onUpdateDevice={handleUpdateDevice}
      />

      {/* Packet Transmission Simulator Setup Dialog */}
      <PacketSimulatorModal
        isOpen={packetSimModalOpen}
        onClose={() => setPacketSimModalOpen(false)}
        devices={devices}
        cables={cables}
        simulationState={simulationState}
        onStartSimulation={(src, dst, spd) => {
          setPacketSimModalOpen(false);
          setActiveTab('designer');
          handleStartSimulation(src, dst, spd);
        }}
        onStartPacketGenerator={handleStartPacketGenerator}
        onStopPacketGenerator={handleStopPacketGenerator}
        packetGeneratorConfig={packetGeneratorConfig}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onClearLocalStorage={() => {
          localStorage.removeItem(LOCAL_STORAGE_KEY);
          handleSelectPreset('default');
        }}
      />
    </div>
  );
}
