import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NetworkCable, NetworkDevice, Packet, PacketHop, PacketSimulationState } from '../types/network';
import { DeviceIcon } from './DeviceIcons';
import { getPointOnCable } from '../utils/networkRouting';import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Lock,
  Move,
  Trash2,
} from 'lucide-react';
import {
  AnnotationItem,
  DrawingTool,
  ShapeType,
} from '../types/annotations';
import { CanvasContextMenu, ContextMenuPosition } from './CanvasContextMenu';

interface NetworkCanvasProps {
  devices: NetworkDevice[];
  cables: NetworkCable[];
  selectedDeviceId: string | null;
  selectedDeviceIds: string[];
  selectedCableId: string | null;
  isConnectMode: boolean;
  connectSourceDevice: NetworkDevice | null;
  simulationState: PacketSimulationState;
  onSelectDevice: (deviceId: string | null, isMulti?: boolean) => void;
  onSelectMultipleDevices: (deviceIds: string[]) => void;
  onSelectCable: (cableId: string | null) => void;
  onMoveDevice: (deviceId: string, x: number, y: number) => void;
  onMoveMultipleDevices: (moves: { id: string; x: number; y: number }[]) => void;
  onUpdateCableControlPoint: (cableId: string, controlPoint: { x: number; y: number } | null) => void;
  onDeviceClickInConnectMode: (device: NetworkDevice) => void;
  onDropDevice: (type: 'router' | 'switch' | 'pc', x: number, y: number) => void;
  // Annotations
  annotations: AnnotationItem[];
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  onSelectAnnotation: (id: string | null, isMulti?: boolean) => void;
  onAddAnnotation: (item: AnnotationItem) => void;
  onUpdateAnnotation: (id: string, updates: Partial<AnnotationItem>) => void;
  onDeleteAnnotation: (id: string) => void;
  onDuplicateAnnotation: (id: string) => void;
  onBringForwardAnnotation: (id: string) => void;
  onSendBackwardAnnotation: (id: string) => void;
  onToggleLockAnnotation: (id: string) => void;
  onToggleGroupAnnotations: () => void;
  activeDrawingTool: DrawingTool;
  onSelectDrawingTool: (tool: DrawingTool) => void;
  currentFillColor: string;
  currentBorderColor: string;
  currentBorderWidth: number;
  currentOpacity: number;
  // Marquee box selection
  isMarqueeMode: boolean;
  onSelectAllDevices: () => void;
  onDeleteSelected: () => void;
  // AI route path highlighting
  aiPathCableIds: Set<string>;
  // Multi-packet simulation
  packets: Packet[];
}

export const NetworkCanvas: React.FC<NetworkCanvasProps> = ({
  devices,
  cables,
  selectedDeviceId,
  selectedDeviceIds,
  selectedCableId,
  isConnectMode,
  connectSourceDevice,
  simulationState,
  onSelectDevice,
  onSelectMultipleDevices,
  onSelectCable,
  onMoveDevice,
  onMoveMultipleDevices,
  onUpdateCableControlPoint,
  onDeviceClickInConnectMode,
  onDropDevice,
  annotations,
  selectedAnnotationId,
  selectedAnnotationIds,
  onSelectAnnotation,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onDuplicateAnnotation,
  onBringForwardAnnotation,
  onSendBackwardAnnotation,
  onToggleLockAnnotation,
  onToggleGroupAnnotations,
  activeDrawingTool,
  onSelectDrawingTool,
  currentFillColor,
  currentBorderColor,
  currentBorderWidth,
  currentOpacity,
  isMarqueeMode,
  onSelectAllDevices,
  onDeleteSelected,
  aiPathCableIds,
  packets,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(1.0); // 0.5 to 2.5
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dragging state for single or multiple devices
  const [draggingDeviceId, setDraggingDeviceId] = useState<string | null>(null);
  const [dragInitialPositions, setDragInitialPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [dragStartWorld, setDragStartWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dragging state for cable control points
  const [draggingControlPointCableId, setDraggingControlPointCableId] = useState<string | null>(null);

  // Hover state for cable
  const [hoveredCableId, setHoveredCableId] = useState<string | null>(null);

  // Marquee Selection state
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number; y: number } | null>(null);

  // Drawing Shape in progress
  const [drawingShapeStart, setDrawingShapeStart] = useState<{ x: number; y: number } | null>(null);
  const [drawingShapeCurrent, setDrawingShapeCurrent] = useState<{ x: number; y: number } | null>(null);

  // Annotation dragging
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null);
  const [annotationDragStartWorld, setAnnotationDragStartWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [annotationInitialPositions, setAnnotationInitialPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  // Annotation resizing
  const [resizingHandle, setResizingHandle] = useState<{
    annotationId: string;
    handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end';
    initX: number;
    initY: number;
    initW: number;
    initH: number;
    initEndX?: number;
    initEndY?: number;
  } | null>(null);

  // Editing text annotation inline
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Context Menu state
  const [contextMenuPos, setContextMenuPos] = useState<ContextMenuPosition | null>(null);

  // Mouse Wheel Zoom (50% to 250%)
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => Math.min(2.5, Math.max(0.5, +(prev * zoomFactor).toFixed(2))));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Convert screen client coordinates to canvas world coordinates
  const clientToCanvasCoord = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const x = (clientX - rect.left - pan.x) / zoom;
      const y = (clientY - rect.top - pan.y) / zoom;
      return { x, y };
    },
    [pan.x, pan.y, zoom]
  );

  // Keyboard Shortcuts (Delete key deletes selected, Escape deselects)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        onDeleteSelected();
      } else if (e.key === 'Escape') {
        onSelectDevice(null);
        onSelectCable(null);
        onSelectAnnotation(null);
        setEditingTextId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDeleteSelected, onSelectDevice, onSelectCable, onSelectAnnotation]);

  // Device Drag Handlers
  const handleDeviceMouseDown = (e: React.MouseEvent, device: NetworkDevice) => {
    e.stopPropagation();
    if (isConnectMode) {
      onDeviceClickInConnectMode(device);
      return;
    }

    const isShift = e.shiftKey;
    const isAlreadySelected = selectedDeviceIds.includes(device.id) || selectedDeviceId === device.id;

    if (!isAlreadySelected && !isShift) {
      onSelectDevice(device.id, false);
    } else if (isShift) {
      onSelectDevice(device.id, true);
    }

    onSelectCable(null);
    onSelectAnnotation(null);
    setDraggingDeviceId(device.id);

    const world = clientToCanvasCoord(e.clientX, e.clientY);
    setDragStartWorld(world);

    // Track starting positions for all currently selected devices
    const initMap = new Map<string, { x: number; y: number }>();
    const devsToMove = isAlreadySelected && selectedDeviceIds.length > 1 ? selectedDeviceIds : [device.id];
    devices.forEach((d) => {
      if (devsToMove.includes(d.id)) {
        initMap.set(d.id, { x: d.x, y: d.y });
      }
    });
    setDragInitialPositions(initMap);
  };

  // Cable Control Point Mouse Down
  const handleControlPointMouseDown = (e: React.MouseEvent, cableId: string) => {
    e.stopPropagation();
    setDraggingControlPointCableId(cableId);
    onSelectCable(cableId);
    onSelectDevice(null);
    onSelectAnnotation(null);
  };

  // Annotation Mouse Down (for selection & move)
  const handleAnnotationMouseDown = (e: React.MouseEvent, item: AnnotationItem) => {
    e.stopPropagation();
    if (item.isLocked) return;

    const isShift = e.shiftKey;
    onSelectAnnotation(item.id, isShift);
    onSelectDevice(null);
    onSelectCable(null);

    const world = clientToCanvasCoord(e.clientX, e.clientY);
    setDraggingAnnotationId(item.id);
    setAnnotationDragStartWorld(world);

    // If item is grouped, move all items in group
    const initMap = new Map<string, { x: number; y: number }>();
    const targetGroup = item.groupId;
    annotations.forEach((a) => {
      if (a.id === item.id || (targetGroup && a.groupId === targetGroup)) {
        initMap.set(a.id, { x: a.x, y: a.y });
      }
    });
    setAnnotationInitialPositions(initMap);
  };

  // Start Resizing Handle
  const handleResizeHandleMouseDown = (
    e: React.MouseEvent,
    item: AnnotationItem,
    handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end'
  ) => {
    e.stopPropagation();
    if (item.isLocked) return;

    setResizingHandle({
      annotationId: item.id,
      handle,
      initX: item.x,
      initY: item.y,
      initW: item.width,
      initH: item.height,
      initEndX: item.endX,
      initEndY: item.endY,
    });
  };

  // Canvas Mouse Down
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only left click initiates interaction
    if (e.button !== 0) return;

    // Dismiss any inline text editing
    if (editingTextId) {
      setEditingTextId(null);
    }

    const world = clientToCanvasCoord(e.clientX, e.clientY);

    // 1. Text Tool click -> immediately place text label with blinking cursor
    if (activeDrawingTool === 'text') {
      const newText: AnnotationItem = {
        id: `annot-text-${Date.now()}`,
        type: 'text',
        x: Math.round(world.x),
        y: Math.round(world.y),
        width: 160,
        height: 40,
        text: 'New Label',
        fillColor: 'transparent',
        borderColor: 'transparent',
        borderWidth: 1,
        opacity: 1,
        isLocked: false,
        layerOrder: Date.now(),
        fontSize: 14,
        fontFamily: 'sans',
        fontWeight: 'bold',
        textColor: '#22D3EE',
        backgroundColor: '#0F172A',
        textAlign: 'center',
      };
      onAddAnnotation(newText);
      onSelectAnnotation(newText.id);
      setEditingTextId(newText.id);
      onSelectDrawingTool('select');
      return;
    }

    // 2. Shape Creation Tool click -> start drawing shape
    if (activeDrawingTool !== 'select') {
      setDrawingShapeStart(world);
      setDrawingShapeCurrent(world);
      return;
    }

    // 3. Marquee Box Select mode or Shift + click on canvas
    if (isMarqueeMode || e.shiftKey) {
      setMarqueeStart(world);
      setMarqueeCurrent(world);
      return;
    }

    // 4. Default: Deselect all and start Canvas Pan
    onSelectDevice(null);
    onSelectCable(null);
    onSelectAnnotation(null);
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  // Canvas Mouse Move
  const handleMouseMove = (e: React.MouseEvent) => {
    const world = clientToCanvasCoord(e.clientX, e.clientY);

    // 1. Moving Devices
    if (draggingDeviceId && dragInitialPositions.size > 0) {
      const dx = world.x - dragStartWorld.x;
      const dy = world.y - dragStartWorld.y;

      const moves: { id: string; x: number; y: number }[] = [];
      dragInitialPositions.forEach((initPos, id) => {
        moves.push({
          id,
          x: Math.max(20, Math.round(initPos.x + dx)),
          y: Math.max(20, Math.round(initPos.y + dy)),
        });
      });

      if (moves.length === 1) {
        onMoveDevice(moves[0].id, moves[0].x, moves[0].y);
      } else {
        onMoveMultipleDevices(moves);
      }
      return;
    }

    // 2. Moving Cable Control Point
    if (draggingControlPointCableId) {
      onUpdateCableControlPoint(draggingControlPointCableId, {
        x: Math.round(world.x),
        y: Math.round(world.y),
      });
      return;
    }

    // 3. Moving Annotations
    if (draggingAnnotationId && annotationInitialPositions.size > 0) {
      const dx = world.x - annotationDragStartWorld.x;
      const dy = world.y - annotationDragStartWorld.y;

      annotationInitialPositions.forEach((initPos, id) => {
        onUpdateAnnotation(id, {
          x: Math.round(initPos.x + dx),
          y: Math.round(initPos.y + dy),
        });
      });
      return;
    }

    // 4. Resizing Annotation Handle
    if (resizingHandle) {
      const { annotationId, handle, initX, initY, initW, initH, initEndX = 0, initEndY = 0 } = resizingHandle;
      const dx = world.x - (initX + (handle.includes('e') ? initW : 0));
      const dy = world.y - (initY + (handle.includes('s') ? initH : 0));

      if (handle === 'start') {
        onUpdateAnnotation(annotationId, { x: Math.round(world.x), y: Math.round(world.y) });
      } else if (handle === 'end') {
        onUpdateAnnotation(annotationId, { endX: Math.round(world.x), endY: Math.round(world.y) });
      } else {
        let newX = initX;
        let newY = initY;
        let newW = initW;
        let newH = initH;

        if (handle.includes('e')) newW = Math.max(20, Math.round(world.x - initX));
        if (handle.includes('s')) newH = Math.max(20, Math.round(world.y - initY));
        if (handle.includes('w')) {
          const rawW = initX + initW - world.x;
          newW = Math.max(20, Math.round(rawW));
          newX = Math.round(initX + initW - newW);
        }
        if (handle.includes('n')) {
          const rawH = initY + initH - world.y;
          newH = Math.max(20, Math.round(rawH));
          newY = Math.round(initY + initH - newH);
        }

        onUpdateAnnotation(annotationId, { x: newX, y: newY, width: newW, height: newH });
      }
      return;
    }

    // 5. Drawing Shape in Progress
    if (drawingShapeStart) {
      setDrawingShapeCurrent(world);
      return;
    }

    // 6. Marquee Box Selecting
    if (marqueeStart) {
      setMarqueeCurrent(world);
      return;
    }

    // 7. Panning
    if (isPanning) {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
    }
  };

  // Canvas Mouse Up
  const handleMouseUp = () => {
    // 1. Finish Device Drag
    setDraggingDeviceId(null);
    setDragInitialPositions(new Map());

    // 2. Finish Cable Control Drag
    setDraggingControlPointCableId(null);

    // 3. Finish Annotation Drag or Resize
    setDraggingAnnotationId(null);
    setAnnotationInitialPositions(new Map());
    setResizingHandle(null);

    // 4. Finish Drawing Shape
    if (drawingShapeStart && drawingShapeCurrent) {
      const minX = Math.min(drawingShapeStart.x, drawingShapeCurrent.x);
      const minY = Math.min(drawingShapeStart.y, drawingShapeCurrent.y);
      const w = Math.max(30, Math.abs(drawingShapeCurrent.x - drawingShapeStart.x));
      const h = Math.max(30, Math.abs(drawingShapeCurrent.y - drawingShapeStart.y));

      const newShape: AnnotationItem = {
        id: `annot-${activeDrawingTool}-${Date.now()}`,
        type: activeDrawingTool as ShapeType,
        x: Math.round(minX),
        y: Math.round(minY),
        width: Math.round(w),
        height: Math.round(h),
        endX: Math.round(drawingShapeCurrent.x),
        endY: Math.round(drawingShapeCurrent.y),
        fillColor: currentFillColor,
        borderColor: currentBorderColor,
        borderWidth: currentBorderWidth,
        opacity: currentOpacity,
        isLocked: false,
        layerOrder: Date.now(),
      };

      onAddAnnotation(newShape);
      onSelectAnnotation(newShape.id);
      onSelectDrawingTool('select');
      setDrawingShapeStart(null);
      setDrawingShapeCurrent(null);
    }

    // 5. Finish Marquee Selection
    if (marqueeStart && marqueeCurrent) {
      const minX = Math.min(marqueeStart.x, marqueeCurrent.x);
      const maxX = Math.max(marqueeStart.x, marqueeCurrent.x);
      const minY = Math.min(marqueeStart.y, marqueeCurrent.y);
      const maxY = Math.max(marqueeStart.y, marqueeCurrent.y);

      // Only perform selection if drag was intentional (> 5px)
      if (maxX - minX > 5 || maxY - minY > 5) {
        const enclosedDeviceIds: string[] = [];
        devices.forEach((dev) => {
          // Device center is ~ +32, +32
          const devCenterX = dev.x + 32;
          const devCenterY = dev.y + 32;
          if (
            devCenterX >= minX &&
            devCenterX <= maxX &&
            devCenterY >= minY &&
            devCenterY <= maxY
          ) {
            enclosedDeviceIds.push(dev.id);
          }
        });

        if (enclosedDeviceIds.length > 0) {
          onSelectMultipleDevices(enclosedDeviceIds);
        }
      }
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }

    // 6. Finish Pan
    setIsPanning(false);
  };

  // Right Click Context Menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const world = clientToCanvasCoord(e.clientX, e.clientY);
    setContextMenuPos({
      x: e.clientX,
      y: e.clientY,
      canvasX: Math.round(world.x),
      canvasY: Math.round(world.y),
    });
  };

  // Context Menu Actions
  const handleContextAddShape = (type: ShapeType, atX: number, atY: number) => {
    const isLineOrArrow = type === 'line' || type === 'arrow';
    const newShape: AnnotationItem = {
      id: `annot-${type}-${Date.now()}`,
      type,
      x: atX,
      y: atY,
      width: isLineOrArrow ? 120 : 160,
      height: isLineOrArrow ? 60 : 100,
      endX: isLineOrArrow ? atX + 120 : undefined,
      endY: isLineOrArrow ? atY + 60 : undefined,
      fillColor: currentFillColor,
      borderColor: currentBorderColor,
      borderWidth: currentBorderWidth,
      opacity: currentOpacity,
      isLocked: false,
      layerOrder: Date.now(),
    };
    onAddAnnotation(newShape);
    onSelectAnnotation(newShape.id);
  };

  const handleContextAddText = (atX: number, atY: number) => {
    const newText: AnnotationItem = {
      id: `annot-text-${Date.now()}`,
      type: 'text',
      x: atX,
      y: atY,
      width: 150,
      height: 38,
      text: 'New Label',
      fillColor: 'transparent',
      borderColor: 'transparent',
      borderWidth: 1,
      opacity: 1,
      isLocked: false,
      layerOrder: Date.now(),
      fontSize: 14,
      fontFamily: 'sans',
      fontWeight: 'bold',
      textColor: '#22D3EE',
      backgroundColor: '#0F172A',
      textAlign: 'center',
    };
    onAddAnnotation(newText);
    onSelectAnnotation(newText.id);
    setEditingTextId(newText.id);
  };

  // HTML5 Drag and Drop from Palette
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain') as 'router' | 'switch' | 'pc';
    if (type === 'router' || type === 'switch' || type === 'pc') {
      const world = clientToCanvasCoord(e.clientX, e.clientY);
      onDropDevice(type, Math.round(world.x), Math.round(world.y));
    }
  };

  // Build device lookup map
  const deviceMap = new Map<string, NetworkDevice>();
  devices.forEach((d) => deviceMap.set(d.id, d));

  // Determine current active hop for packet animation
  const activeHop: PacketHop | undefined = simulationState.active
    ? simulationState.hops[simulationState.currentHopIndex]
    : undefined;

  let packetCoord: { x: number; y: number } | null = null;
  if (activeHop) {
    const fromDev = deviceMap.get(activeHop.fromDeviceId);
    const toDev = deviceMap.get(activeHop.toDeviceId);
    const cable = cables.find((c) => c.id === activeHop.cableId);

    if (fromDev && toDev) {
      const x1 = fromDev.x + 32;
      const y1 = fromDev.y + 32;
      const x2 = toDev.x + 32;
      const y2 = toDev.y + 32;
      packetCoord = getPointOnCable(x1, y1, x2, y2, cable?.controlPoint || null, simulationState.hopProgress);
    }
  }

  const destinationDev = simulationState.targetId ? deviceMap.get(simulationState.targetId) : null;
  const droppedDev =
    simulationState.droppedAtHop !== undefined && simulationState.hops[simulationState.droppedAtHop]
      ? deviceMap.get(simulationState.hops[simulationState.droppedAtHop].toDeviceId) ||
        deviceMap.get(simulationState.hops[simulationState.droppedAtHop].fromDeviceId)
      : null;

  // Helper: get pixel position of a multi-packet on its current cable
  const getPacketPosition = (
    packet: Packet,
    devMap: Map<string, NetworkDevice>,
    cableList: NetworkCable[]
  ): { x: number; y: number } | null => {
    if (packet.currentHop >= packet.route.length - 1) {
      const dest = devMap.get(packet.destination);
      return dest ? { x: dest.x + 32, y: dest.y + 32 } : null;
    }
    const from = packet.route[packet.currentHop];
    const to = packet.route[packet.currentHop + 1];
    const cable = cableList.find(
      (c) =>
        (c.fromDeviceId === from && c.toDeviceId === to) ||
        (c.fromDeviceId === to && c.toDeviceId === from)
    );
    if (!cable) return null;
    const fromDev = devMap.get(cable.fromDeviceId);
    const toDev = devMap.get(cable.toDeviceId);
    if (!fromDev || !toDev) return null;
    const x1 = fromDev.x + 32;
    const y1 = fromDev.y + 32;
    const x2 = toDev.x + 32;
    const y2 = toDev.y + 32;
    return getPointOnCable(x1, y1, x2, y2, cable.controlPoint, packet.progress);
  };

  // Render Background Shapes (ordered by layerOrder)
  const backgroundShapes = annotations
    .filter((a) => a.type !== 'text')
    .sort((a, b) => a.layerOrder - b.layerOrder);

  // Render Text Annotations (Rendered above devices so always legible)
  const textAnnotations = annotations
    .filter((a) => a.type === 'text')
    .sort((a, b) => a.layerOrder - b.layerOrder);

  // Active selected annotation object
  const activeSelectedAnnot = annotations.find((a) => a.id === selectedAnnotationId) || null;

  return (
    <div
      ref={containerRef}
      id="topology-canvas-container"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative flex-1 h-full w-full bg-base overflow-hidden select-none cursor-default ${
        isConnectMode
          ? 'cursor-crosshair'
          : activeDrawingTool !== 'select'
          ? 'cursor-crosshair'
          : isMarqueeMode
          ? 'cursor-crosshair'
          : isPanning
          ? 'cursor-grabbing'
          : 'cursor-grab'
      }`}
    >
      {/* Grid Blueprint Pattern Layer */}
      <svg
        id="topology-grid-pattern-svg"
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="net-small-grid"
            width={24 * zoom}
            height={24 * zoom}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${pan.x}, ${pan.y})`}
          >
            <circle cx="1" cy="1" r={1 * Math.min(zoom, 1.2)} fill="#1E293B" opacity="0.6" />
          </pattern>
          <pattern
            id="net-big-grid"
            width={120 * zoom}
            height={120 * zoom}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${pan.x}, ${pan.y})`}
          >
            <rect width={120 * zoom} height={120 * zoom} fill="none" stroke="#0F172A" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#net-small-grid)" />
        <rect width="100%" height="100%" fill="url(#net-big-grid)" opacity="0.4" />
      </svg>

      {/* Main SVG World: Layer 1 Background Shapes, Layer 2 Cables & Packets
          NOTE: Set overflow="visible" and style={{ overflow: 'visible' }} so cables on edges are never cut off! */}
      <svg
        id="topology-world-svg"
        className="absolute inset-0 w-full h-full overflow-visible"
        style={{
          overflow: 'visible',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <defs>
          {/* Glowing packet filters */}
          <filter id="packetGlowGreen" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feFlood floodColor="#10B981" result="color" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="packetGlowCyan" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feFlood floodColor="#06B6D4" result="color" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="packetGlowRed" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="#EF4444" result="color" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Arrow markers for straight line & flow arrows */}
          <marker
            id="arrowhead-cyan"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L6,3 z" fill="#06B6D4" />
          </marker>
          <marker
            id="arrowhead-current"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L6,3 z" fill="currentColor" />
          </marker>
        </defs>

        {/* LAYER 1: BACKGROUND ANNOTATION SHAPES (RECTANGLES, CIRCLES, ELLIPSES, LINES, ARROWS) */}
        <g id="layer-background-annotations">
          {backgroundShapes.map((item) => {
            const isSelected = selectedAnnotationId === item.id || selectedAnnotationIds.includes(item.id);
            const fill = item.fillColor === 'transparent' ? 'none' : item.fillColor;
            const stroke = item.borderColor === 'transparent' ? 'none' : item.borderColor;

            return (
              <g
                key={item.id}
                id={`shape-group-${item.id}`}
                className={item.isLocked ? 'cursor-default' : 'cursor-move'}
                onMouseDown={(e) => handleAnnotationMouseDown(e, item)}
              >
                {/* 1. Rectangle */}
                {item.type === 'rect' && (
                  <rect
                    x={item.x}
                    y={item.y}
                    width={item.width}
                    height={item.height}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={item.borderWidth}
                    opacity={item.opacity}
                    className="transition-opacity"
                  />
                )}

                {/* 2. Rounded Rectangle */}
                {item.type === 'rounded-rect' && (
                  <rect
                    x={item.x}
                    y={item.y}
                    width={item.width}
                    height={item.height}
                    rx={12}
                    ry={12}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={item.borderWidth}
                    opacity={item.opacity}
                    className="transition-opacity"
                  />
                )}

                {/* 3. Circle */}
                {item.type === 'circle' && (
                  <circle
                    cx={item.x + item.width / 2}
                    cy={item.y + item.height / 2}
                    r={Math.min(item.width, item.height) / 2}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={item.borderWidth}
                    opacity={item.opacity}
                    className="transition-opacity"
                  />
                )}

                {/* 4. Ellipse */}
                {item.type === 'ellipse' && (
                  <ellipse
                    cx={item.x + item.width / 2}
                    cy={item.y + item.height / 2}
                    rx={item.width / 2}
                    ry={item.height / 2}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={item.borderWidth}
                    opacity={item.opacity}
                    className="transition-opacity"
                  />
                )}

                {/* 5. Straight Line */}
                {item.type === 'line' && (
                  <line
                    x1={item.x}
                    y1={item.y}
                    x2={item.endX ?? item.x + item.width}
                    y2={item.endY ?? item.y + item.height}
                    stroke={stroke !== 'none' ? stroke : '#38BDF8'}
                    strokeWidth={item.borderWidth}
                    opacity={item.opacity}
                    strokeLinecap="round"
                  />
                )}

                {/* 6. Arrow */}
                {item.type === 'arrow' && (
                  <line
                    x1={item.x}
                    y1={item.y}
                    x2={item.endX ?? item.x + item.width}
                    y2={item.endY ?? item.y + item.height}
                    stroke={stroke !== 'none' ? stroke : '#06B6D4'}
                    strokeWidth={item.borderWidth}
                    opacity={item.opacity}
                    strokeLinecap="round"
                    markerEnd="url(#arrowhead-cyan)"
                  />
                )}

                {/* Selection Highlight & Resize Handles (if selected and not locked) */}
                {isSelected && (
                  <g className="pointer-events-auto">
                    {/* Bounding Box Outline */}
                    {item.type !== 'line' && item.type !== 'arrow' ? (
                      <rect
                        x={item.x - 2}
                        y={item.y - 2}
                        width={item.width + 4}
                        height={item.height + 4}
                        fill="none"
                        stroke="#06B6D4"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                        rx="4"
                      />
                    ) : (
                      <line
                        x1={item.x}
                        y1={item.y}
                        x2={item.endX ?? item.x + item.width}
                        y2={item.endY ?? item.y + item.height}
                        stroke="#06B6D4"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                      />
                    )}

                    {/* Resize Handles (8 handles for bounding box, 2 for lines/arrows) */}
                    {!item.isLocked && (
                      <>
                        {item.type !== 'line' && item.type !== 'arrow' ? (
                          <>
                            {/* NW Handle */}
                            <rect
                              x={item.x - 5}
                              y={item.y - 5}
                              width="10"
                              height="10"
                              fill="#06B6D4"
                              stroke="#FFFFFF"
                              strokeWidth="1.5"
                              className="cursor-nw-resize"
                              onMouseDown={(e) => handleResizeHandleMouseDown(e, item, 'nw')}
                            />
                            {/* NE Handle */}
                            <rect
                              x={item.x + item.width - 5}
                              y={item.y - 5}
                              width="10"
                              height="10"
                              fill="#06B6D4"
                              stroke="#FFFFFF"
                              strokeWidth="1.5"
                              className="cursor-ne-resize"
                              onMouseDown={(e) => handleResizeHandleMouseDown(e, item, 'ne')}
                            />
                            {/* SE Handle */}
                            <rect
                              x={item.x + item.width - 5}
                              y={item.y + item.height - 5}
                              width="10"
                              height="10"
                              fill="#06B6D4"
                              stroke="#FFFFFF"
                              strokeWidth="1.5"
                              className="cursor-se-resize"
                              onMouseDown={(e) => handleResizeHandleMouseDown(e, item, 'se')}
                            />
                            {/* SW Handle */}
                            <rect
                              x={item.x - 5}
                              y={item.y + item.height - 5}
                              width="10"
                              height="10"
                              fill="#06B6D4"
                              stroke="#FFFFFF"
                              strokeWidth="1.5"
                              className="cursor-sw-resize"
                              onMouseDown={(e) => handleResizeHandleMouseDown(e, item, 'sw')}
                            />
                          </>
                        ) : (
                          <>
                            {/* Line Start Handle */}
                            <circle
                              cx={item.x}
                              cy={item.y}
                              r="5"
                              fill="#06B6D4"
                              stroke="#FFFFFF"
                              strokeWidth="1.5"
                              className="cursor-crosshair"
                              onMouseDown={(e) => handleResizeHandleMouseDown(e, item, 'start')}
                            />
                            {/* Line End Handle */}
                            <circle
                              cx={item.endX ?? item.x + item.width}
                              cy={item.endY ?? item.y + item.height}
                              r="5"
                              fill="#06B6D4"
                              stroke="#FFFFFF"
                              strokeWidth="1.5"
                              className="cursor-crosshair"
                              onMouseDown={(e) => handleResizeHandleMouseDown(e, item, 'end')}
                            />
                          </>
                        )}
                      </>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* Temporary Shape Preview while Drawing */}
        {drawingShapeStart && drawingShapeCurrent && (
          <g id="temp-drawing-shape-preview">
            {activeDrawingTool === 'rect' && (
              <rect
                x={Math.min(drawingShapeStart.x, drawingShapeCurrent.x)}
                y={Math.min(drawingShapeStart.y, drawingShapeCurrent.y)}
                width={Math.abs(drawingShapeCurrent.x - drawingShapeStart.x)}
                height={Math.abs(drawingShapeCurrent.y - drawingShapeStart.y)}
                fill={currentFillColor === 'transparent' ? 'none' : currentFillColor}
                stroke={currentBorderColor === 'transparent' ? '#06B6D4' : currentBorderColor}
                strokeWidth={currentBorderWidth}
                strokeDasharray="4,4"
                opacity={currentOpacity}
              />
            )}
            {activeDrawingTool === 'rounded-rect' && (
              <rect
                x={Math.min(drawingShapeStart.x, drawingShapeCurrent.x)}
                y={Math.min(drawingShapeStart.y, drawingShapeCurrent.y)}
                width={Math.abs(drawingShapeCurrent.x - drawingShapeStart.x)}
                height={Math.abs(drawingShapeCurrent.y - drawingShapeStart.y)}
                rx={12}
                ry={12}
                fill={currentFillColor === 'transparent' ? 'none' : currentFillColor}
                stroke={currentBorderColor === 'transparent' ? '#06B6D4' : currentBorderColor}
                strokeWidth={currentBorderWidth}
                strokeDasharray="4,4"
                opacity={currentOpacity}
              />
            )}
            {activeDrawingTool === 'circle' && (
              <circle
                cx={(drawingShapeStart.x + drawingShapeCurrent.x) / 2}
                cy={(drawingShapeStart.y + drawingShapeCurrent.y) / 2}
                r={
                  Math.min(
                    Math.abs(drawingShapeCurrent.x - drawingShapeStart.x),
                    Math.abs(drawingShapeCurrent.y - drawingShapeStart.y)
                  ) / 2
                }
                fill={currentFillColor === 'transparent' ? 'none' : currentFillColor}
                stroke={currentBorderColor === 'transparent' ? '#06B6D4' : currentBorderColor}
                strokeWidth={currentBorderWidth}
                strokeDasharray="4,4"
                opacity={currentOpacity}
              />
            )}
            {activeDrawingTool === 'ellipse' && (
              <ellipse
                cx={(drawingShapeStart.x + drawingShapeCurrent.x) / 2}
                cy={(drawingShapeStart.y + drawingShapeCurrent.y) / 2}
                rx={Math.abs(drawingShapeCurrent.x - drawingShapeStart.x) / 2}
                ry={Math.abs(drawingShapeCurrent.y - drawingShapeStart.y) / 2}
                fill={currentFillColor === 'transparent' ? 'none' : currentFillColor}
                stroke={currentBorderColor === 'transparent' ? '#06B6D4' : currentBorderColor}
                strokeWidth={currentBorderWidth}
                strokeDasharray="4,4"
                opacity={currentOpacity}
              />
            )}
            {(activeDrawingTool === 'line' || activeDrawingTool === 'arrow') && (
              <line
                x1={drawingShapeStart.x}
                y1={drawingShapeStart.y}
                x2={drawingShapeCurrent.x}
                y2={drawingShapeCurrent.y}
                stroke={currentBorderColor === 'transparent' ? '#06B6D4' : currentBorderColor}
                strokeWidth={currentBorderWidth}
                strokeDasharray="4,4"
                markerEnd={activeDrawingTool === 'arrow' ? 'url(#arrowhead-cyan)' : undefined}
              />
            )}
          </g>
        )}

        {/* LAYER 2: CONNECTION CABLES & PORTS */}
        <g id="layer-cables">
          {cables.map((cable) => {
            const fromDev = deviceMap.get(cable.fromDeviceId);
            const toDev = deviceMap.get(cable.toDeviceId);
            if (!fromDev || !toDev) return null;

            const x1 = fromDev.x + 32;
            const y1 = fromDev.y + 32;
            const x2 = toDev.x + 32;
            const y2 = toDev.y + 32;

            const isSelected = selectedCableId === cable.id;
            const isHovered = hoveredCableId === cable.id;
            const isOnAiPath = aiPathCableIds.has(cable.id);

            // Congestion-based color: green → yellow → orange → red
            const currentPackets = cable.currentPackets ?? 0;
            const bandwidth = cable.bandwidth ?? 100;
            const utilization = Math.min(1, currentPackets / Math.max(1, bandwidth));
            const congestionColor =
              utilization > 0.9 ? '#EF4444' :
              utilization > 0.7 ? '#F97316' :
              utilization > 0.3 ? '#FBBF24' :
              '#22C55E';

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const ctrlX = cable.controlPoint ? cable.controlPoint.x : midX;
            const ctrlY = cable.controlPoint ? cable.controlPoint.y : midY;
            const hasCustomCurve = cable.controlPoint !== null;

            const pathD = hasCustomCurve
              ? `M ${x1} ${y1} Q ${ctrlX} ${ctrlY} ${x2} ${y2}`
              : `M ${x1} ${y1} L ${x2} ${y2}`;

            const p1X = x1 + (ctrlX - x1) * 0.22;
            const p1Y = y1 + (ctrlY - y1) * 0.22;
            const p2X = x2 + (ctrlX - x2) * 0.22;
            const p2Y = y2 + (ctrlY - y2) * 0.22;

            return (
              <g key={cable.id} id={`cable-group-${cable.id}`}>
                {/* Invisible wider hit area for easy clicking & hovering */}
                <path
                  d={pathD}
                  stroke="transparent"
                  strokeWidth="18"
                  fill="none"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredCableId(cable.id)}
                  onMouseLeave={() => setHoveredCableId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCable(cable.id);
                    onSelectDevice(null);
                    onSelectAnnotation(null);
                  }}
                />

                {/* Cable Glow when selected or on AI path */}
                {(isSelected || isOnAiPath) && (
                  <path
                    d={pathD}
                    stroke={isOnAiPath ? '#22C55E' : '#22D3EE'}
                    strokeWidth="6"
                    strokeOpacity="0.4"
                    fill="none"
                    strokeLinecap="round"
                  />
                )}

                {/* Cable Outer Stroke */}
                <path
                  d={pathD}
                  stroke={
                    cable.status === 'down'
                      ? '#EF4444'
                      : isOnAiPath
                      ? '#22C55E'
                      : isSelected
                      ? '#22D3EE'
                      : isHovered
                      ? '#38BDF8'
                      : congestionColor
                  }
                  strokeWidth={isSelected || isOnAiPath ? 3.5 : 2.2}
                  strokeDasharray={
                    cable.cableType === 'crossover' ? '6,3' : cable.cableType === 'serial' ? '8,4' : undefined
                  }
                  fill="none"
                  strokeLinecap="round"
                  className="transition-colors duration-150"
                />

                {/* Editable Control Point Handle (●) */}
                {(isSelected || isHovered || hasCustomCurve) && (
                  <g className="cursor-grab active:cursor-grabbing">
                    {hasCustomCurve && (
                      <line
                        x1={midX}
                        y1={midY}
                        x2={ctrlX}
                        y2={ctrlY}
                        stroke="#0284C7"
                        strokeWidth="1"
                        strokeDasharray="2,2"
                        opacity="0.6"
                      />
                    )}
                    <circle
                      cx={ctrlX}
                      cy={ctrlY}
                      r={isSelected ? 6.5 : 5}
                      fill="#0284C7"
                      stroke="#E0F2FE"
                      strokeWidth="2"
                      className="hover:scale-125 transition-transform"
                      onMouseDown={(e) => handleControlPointMouseDown(e, cable.id)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onUpdateCableControlPoint(cable.id, null);
                      }}
                    />
                    <title>Drag to bend cable • Double click to straighten</title>
                  </g>
                )}

                {/* Small Port Name Labels */}
                <g className="pointer-events-none select-none text-[9px] font-mono fill-ink-soft">
                  <rect
                    x={p1X - 16}
                    y={p1Y - 7}
                    width="32"
                    height="14"
                    rx="3"
                    fill="#0B132B"
                    stroke="#1E293B"
                    strokeWidth="0.8"
                    opacity="0.85"
                  />
                  <text x={p1X} y={p1Y + 3.5} textAnchor="middle" fill="#38BDF8" fontSize="9" fontWeight="bold">
                    {cable.fromPort}
                  </text>

                  <rect
                    x={p2X - 16}
                    y={p2Y - 7}
                    width="32"
                    height="14"
                    rx="3"
                    fill="#0B132B"
                    stroke="#1E293B"
                    strokeWidth="0.8"
                    opacity="0.85"
                  />
                  <text x={p2X} y={p2Y + 3.5} textAnchor="middle" fill="#38BDF8" fontSize="9" fontWeight="bold">
                    {cable.toPort}
                  </text>
                </g>
              </g>
            );
          })}
        </g>

        {/* LAYER 3: PACKET TRANSMISSION ANIMATION FRAME */}
        {simulationState.active && packetCoord && (
          <g
            id="simulated-packet-frame"
            transform={`translate(${packetCoord.x}, ${packetCoord.y})`}
            filter={
              simulationState.status === 'failed'
                ? 'url(#packetGlowRed)'
                : simulationState.status === 'routing'
                ? 'url(#packetGlowCyan)'
                : 'url(#packetGlowGreen)'
            }
          >
            <g transform="translate(-16, -7)">
              <rect
                x="0"
                y="0"
                width="32"
                height="14"
                rx="3"
                fill="#FFFFFF"
                stroke="#10B981"
                strokeWidth="1.2"
                opacity="0.95"
              />
              <rect x="2.5" y="2.5" width="5.5" height="9" rx="1" fill="#047857" />
              <rect x="9.5" y="2.5" width="5.5" height="9" rx="1" fill="#10B981" />
              <rect x="16.5" y="2.5" width="5.5" height="9" rx="1" fill="#34D399" />
              <rect x="23.5" y="2.5" width="5.5" height="9" rx="1" fill="#6EE7B7" />
            </g>

            <circle
              cx="0"
              cy="0"
              r="14"
              fill="none"
              stroke={simulationState.status === 'failed' ? '#EF4444' : '#10B981'}
              strokeWidth="1.5"
              opacity="0.75"
              className="animate-ping"
              style={{ animationDuration: '0.8s' }}
            />
          </g>
        )}

        {simulationState.status === 'success' && destinationDev && (
          <g transform={`translate(${destinationDev.x + 32}, ${destinationDev.y + 32})`}>
            <circle cx="0" cy="0" r="42" fill="#10B981" fillOpacity="0.25" className="animate-ping" />
            <circle cx="0" cy="0" r="34" stroke="#10B981" strokeWidth="2.5" fill="none" />
          </g>
        )}

        {simulationState.status === 'failed' && (droppedDev || destinationDev) && (
          <g
            transform={`translate(${
              (droppedDev || destinationDev)!.x + 58
            }, ${(droppedDev || destinationDev)!.y - 4})`}
            filter="url(#packetGlowRed)"
          >
            <circle cx="0" cy="0" r="13" fill="#991B1B" stroke="#FCA5A5" strokeWidth="1.5" />
            <line x1="-5" y1="-5" x2="5" y2="5" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="5" y1="-5" x2="-5" y2="5" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {/* LAYER 3b: MULTI-PACKET SIMULATION — all active packets */}
        <g id="layer-multi-packets">
          {packets
            .filter((p) => p.status === 'routing' || p.status === 'transmitting')
            .map((packet) => {
              const pos = getPacketPosition(packet, deviceMap, cables);
              if (!pos) return null;

              return (
                <g
                  key={packet.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  filter="url(#packetGlowCyan)"
                >
                  {/* Packet dot */}
                  <circle cx="0" cy="0" r="6" fill={packet.color} stroke="#FFFFFF" strokeWidth="1.5" />
                  {/* Ping ring */}
                  <circle
                    cx="0"
                    cy="0"
                    r="10"
                    fill="none"
                    stroke={packet.color}
                    strokeWidth="1"
                    opacity="0.6"
                    className="animate-ping"
                    style={{ animationDuration: '1s' }}
                  />
                </g>
              );
            })}
        </g>

        {/* Dropped packet indicators */}
        <g id="layer-dropped-packets">
          {packets
            .filter((p) => p.status === 'dropped' || p.status === 'failed')
            .map((packet) => {
              const pos = getPacketPosition(packet, deviceMap, cables);
              if (!pos) return null;

              return (
                <g key={packet.id} transform={`translate(${pos.x}, ${pos.y})`}>
                  <circle cx="0" cy="0" r="8" fill="#991B1B" stroke="#FCA5A5" strokeWidth="1.5" />
                  <line x1="-4" y1="-4" x2="4" y2="4" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                  <line x1="4" y1="-4" x2="-4" y2="4" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                </g>
              );
            })}
        </g>

        {/* Marquee Selection Visual Box */}
        {marqueeStart && marqueeCurrent && (
          <rect
            id="marquee-selection-rect"
            x={Math.min(marqueeStart.x, marqueeCurrent.x)}
            y={Math.min(marqueeStart.y, marqueeCurrent.y)}
            width={Math.abs(marqueeCurrent.x - marqueeStart.x)}
            height={Math.abs(marqueeCurrent.y - marqueeStart.y)}
            fill="rgba(6, 182, 212, 0.12)"
            stroke="#06B6D4"
            strokeWidth="1.5"
            strokeDasharray="4,4"
            rx="3"
          />
        )}
      </svg>

      {/* LAYER 4: DEVICES (ROUTERS, SWITCHES, PCS) */}
      <div
        id="topology-devices-layer"
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {devices.map((device) => {
          const isSelected = selectedDeviceId === device.id || selectedDeviceIds.includes(device.id);
          const isConnectSource = connectSourceDevice?.id === device.id;
          const isConnectHoverCandidate = isConnectMode && connectSourceDevice && !isConnectSource;
          const isCurrentHop =
            simulationState.active &&
            activeHop &&
            (activeHop.fromDeviceId === device.id || activeHop.toDeviceId === device.id);

          return (
            <div
              key={device.id}
              id={`device-node-${device.id}`}
              onMouseDown={(e) => handleDeviceMouseDown(e, device)}
              style={{
                left: `${device.x}px`,
                top: `${device.y}px`,
                width: '64px',
                height: '64px',
              }}
              className={`absolute pointer-events-auto flex flex-col items-center justify-center cursor-move transition-shadow duration-150 ${
                isSelected
                  ? 'z-20'
                  : isConnectSource
                  ? 'z-30'
                  : 'z-10'
              }`}
            >
              {/* Selection Ring / Connect Mode Highlight */}
              <div
                className={`relative p-1 rounded-2xl transition-all ${
                  isConnectSource
                    ? 'ring-4 ring-accent ring-offset-2 ring-offset-[#050816] shadow-xl shadow-lift-strong bg-accent-soft/40'
                    : isSelected
                    ? 'ring-2 ring-accent ring-offset-1 ring-offset-[#050816] shadow-lg shadow-lift-strong bg-panel/60'
                    : isConnectHoverCandidate
                    ? 'hover:ring-2 hover:ring-ok hover:bg-ok-soft/40'
                    : isCurrentHop
                    ? 'ring-2 ring-ok shadow-lg shadow-lift-strong'
                    : 'hover:bg-panel/40'
                }`}
              >
                <DeviceIcon type={device.type} size={58} isSelected={isSelected || isConnectSource} />
              </div>

              {/* Device Label: Name & Primary IP */}
              <div className="absolute top-[66px] flex flex-col items-center pointer-events-none whitespace-nowrap">
                <span
                  className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded shadow-sm border transition-colors ${
                    isSelected
                      ? 'bg-accent-soft text-accent border-accent/60'
                      : 'bg-panel/90 text-ink border-line/80'
                  }`}
                >
                  {device.name}
                </span>
                <span className="text-[10px] text-ink-muted font-mono mt-0.5 bg-base/90 px-1 rounded">
                  {device.ipAddress}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* LAYER 5: TEXT LABELS & ANNOTATIONS (Rendered above devices so always legible) */}
      <div
        id="topology-text-annotations-layer"
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {textAnnotations.map((item) => {
          const isSelected = selectedAnnotationId === item.id || selectedAnnotationIds.includes(item.id);
          const isEditing = editingTextId === item.id;

          const fontFamilyClass =
            item.fontFamily === 'mono'
              ? 'font-mono'
              : item.fontFamily === 'serif'
              ? 'font-serif'
              : 'font-sans';

          return (
            <div
              key={item.id}
              id={`text-label-${item.id}`}
              onMouseDown={(e) => handleAnnotationMouseDown(e, item)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!item.isLocked) {
                  setEditingTextId(item.id);
                }
              }}
              style={{
                left: `${item.x}px`,
                top: `${item.y}px`,
                width: `${item.width}px`,
                minHeight: `${item.height}px`,
                opacity: item.opacity,
              }}
              className={`absolute pointer-events-auto select-none transition-shadow ${
                isSelected ? 'z-30' : 'z-20'
              } ${item.isLocked ? 'cursor-default' : 'cursor-move'}`}
            >
              {isEditing ? (
                <input
                  autoFocus
                  type="text"
                  value={item.text || ''}
                  onChange={(e) => onUpdateAnnotation(item.id, { text: e.target.value })}
                  onBlur={() => setEditingTextId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setEditingTextId(null);
                  }}
                  style={{
                    fontSize: `${item.fontSize || 14}px`,
                    fontWeight: item.fontWeight === 'bold' ? 'bold' : 'normal',
                    fontStyle: item.fontStyle === 'italic' ? 'italic' : 'normal',
                    textAlign: item.textAlign || 'center',
                    color: item.textColor || '#FFFFFF',
                    backgroundColor:
                      item.backgroundColor && item.backgroundColor !== 'transparent'
                        ? item.backgroundColor
                        : '#0F172A',
                  }}
                  className={`w-full px-2 py-1 rounded-lg border-2 border-accent outline-none shadow-xl ${fontFamilyClass}`}
                />
              ) : (
                <div
                  style={{
                    fontSize: `${item.fontSize || 14}px`,
                    fontWeight: item.fontWeight === 'bold' ? 'bold' : 'normal',
                    fontStyle: item.fontStyle === 'italic' ? 'italic' : 'normal',
                    textDecoration: item.textDecoration === 'underline' ? 'underline' : 'none',
                    textAlign: item.textAlign || 'center',
                    color: item.textColor || '#FFFFFF',
                    backgroundColor:
                      item.backgroundColor && item.backgroundColor !== 'transparent'
                        ? item.backgroundColor
                        : 'transparent',
                    borderWidth: item.borderWidth ? `${item.borderWidth}px` : undefined,
                    borderColor:
                      item.borderColor && item.borderColor !== 'transparent'
                        ? item.borderColor
                        : 'transparent',
                  }}
                  className={`w-full px-2.5 py-1 rounded-lg ${
                    isSelected ? 'ring-2 ring-accent shadow-lg' : ''
                  } ${fontFamilyClass} ${
                    item.backgroundColor && item.backgroundColor !== 'transparent'
                      ? 'shadow-md backdrop-blur-sm'
                      : ''
                  }`}
                >
                  <span>{item.text || 'Double-click to type'}</span>
                  {item.isLocked && <Lock className="inline-block w-3 h-3 ml-1 text-warn" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Multi-Selection Counter & Quick Action Bar */}
      {selectedDeviceIds.length > 1 && (
        <div
          id="multi-selection-actions-bar"
          className="absolute top-4 left-1/2 -translate-x-1/2 bg-panel/95 backdrop-blur-md border border-accent/60 rounded-xl px-4 py-2 text-xs text-ink flex items-center space-x-3 shadow-2xl z-30 animate-in fade-in"
        >
          <span className="font-bold text-accent font-mono">
            {selectedDeviceIds.length} Devices Selected
          </span>
          <div className="h-4 w-px bg-raised" />
          <button
            onClick={onDeleteSelected}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-bad-soft hover:bg-bad-soft text-bad border border-bad transition-colors cursor-pointer"
            title="Delete all selected devices"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete All Selected</span>
          </button>
        </div>
      )}

      {/* Bottom Right Floating Zoom Indicator & Controls */}
      <div
        id="topology-zoom-controls"
        className="absolute bottom-4 right-4 flex items-center space-x-2 bg-panel/90 backdrop-blur-md border border-line rounded-xl p-1.5 shadow-xl z-30 select-none text-xs text-ink-soft font-mono"
      >
        <button
          id="zoom-out-btn"
          onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
          className="p-1 text-ink-muted hover:text-ink hover:bg-raised rounded transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <span className="px-2 font-semibold text-accent">
          Zoom {Math.round(zoom * 100)}%
        </span>

        <button
          id="zoom-in-btn"
          onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))}
          className="p-1 text-ink-muted hover:text-ink hover:bg-raised rounded transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-panel mx-1" />

        <button
          id="zoom-reset-btn"
          onClick={() => {
            setZoom(1.0);
            setPan({ x: 0, y: 0 });
          }}
          className="p-1 text-ink-muted hover:text-ink hover:bg-raised rounded transition-colors"
          title="Reset Zoom & Pan (100%)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top Floating Status Indicator when in Connect Mode or Simulating */}
      {isConnectMode && (
        <div
          id="connect-mode-banner"
          className="absolute top-4 left-1/2 -translate-x-1/2 bg-accent-soft/90 backdrop-blur-md border border-accent/60 rounded-full px-4 py-1.5 text-xs text-accent font-medium flex items-center space-x-2 shadow-xl shadow-lift-strong z-30 animate-pulse"
        >
          <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
          <span>
            {connectSourceDevice
              ? `Connecting from ${connectSourceDevice.name}. Click destination device.`
              : 'Click any source device to start connecting.'}
          </span>
        </div>
      )}

      {/* Live Simulation Progress Banner */}
      {simulationState.active && (
        <div
          id="simulation-progress-banner"
          className={`absolute top-4 left-1/2 -translate-x-1/2 backdrop-blur-md border rounded-full px-4 py-1.5 text-xs font-medium flex items-center space-x-2 shadow-xl z-30 ${
            simulationState.status === 'failed'
              ? 'bg-bad-soft/90 border-bad/60 text-bad'
              : simulationState.status === 'success'
              ? 'bg-ok-soft/90 border-ok/60 text-ok'
              : 'bg-panel/90 border-accent/60 text-accent'
          }`}
        >
          {simulationState.status === 'failed' ? (
            <XCircle className="w-3.5 h-3.5 text-bad" />
          ) : simulationState.status === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-ok" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-ok animate-ping" />
          )}
          <span>{simulationState.message}</span>
        </div>
      )}

      {/* Right-Click Context Menu */}
      <CanvasContextMenu
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
        onAddShape={handleContextAddShape}
        onAddText={handleContextAddText}
        onDuplicate={() => {
          if (selectedAnnotationId) onDuplicateAnnotation(selectedAnnotationId);
        }}
        onDelete={onDeleteSelected}
        onBringForward={() => {
          if (selectedAnnotationId) onBringForwardAnnotation(selectedAnnotationId);
        }}
        onSendBackward={() => {
          if (selectedAnnotationId) onSendBackwardAnnotation(selectedAnnotationId);
        }}
        onToggleLock={() => {
          if (selectedAnnotationId) onToggleLockAnnotation(selectedAnnotationId);
        }}
        onToggleGroup={onToggleGroupAnnotations}
        onSelectAllDevices={onSelectAllDevices}
        hasSelection={
          !!selectedDeviceId ||
          selectedDeviceIds.length > 0 ||
          !!selectedCableId ||
          !!selectedAnnotationId
        }
        isLocked={activeSelectedAnnot?.isLocked}
        isGrouped={!!activeSelectedAnnot?.groupId}
        canGroup={selectedAnnotationIds.length > 1}
      />
    </div>
  );
};
