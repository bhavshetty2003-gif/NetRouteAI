import { NetworkCable, NetworkDevice, NetworkInterface } from '../types/network';

export function createRouterInterfaces(count: number = 8): NetworkInterface[] {
  const list: NetworkInterface[] = [];
  for (let i = 0; i < count; i++) {
    list.push({
      id: `Gi0/${i}`,
      name: `GigabitEthernet0/${i}`,
      ipAddress: i === 0 ? '192.168.1.1' : i === 1 ? '10.0.0.1' : 'unassigned',
      subnetMask: '255.255.255.0',
      status: 'up',
      macAddress: `00:1B:D4:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}:0${i}`,
      connectedTo: null,
    });
  }
  return list;
}

export function createSwitchInterfaces(count: number = 8): NetworkInterface[] {
  const list: NetworkInterface[] = [];
  for (let i = 1; i <= count; i++) {
    list.push({
      id: `Fa0/${i}`,
      name: `FastEthernet0/${i}`,
      ipAddress: 'unassigned',
      subnetMask: '255.255.255.0',
      status: 'up',
      macAddress: `00:1E:F7:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}:0${i}`,
      connectedTo: null,
    });
  }
  return list;
}

export function createPCInterfaces(): NetworkInterface[] {
  return [
    {
      id: 'Fa0',
      name: 'FastEthernet0',
      ipAddress: '192.168.1.10',
      subnetMask: '255.255.255.0',
      status: 'up',
      macAddress: `00:50:79:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}:AA`,
      connectedTo: null,
    },
  ];
}

/**
 * Creates default preset with R1, R2, SW1, PC1, PC2 connected
 */
export function getDefaultTopology(): { devices: NetworkDevice[]; cables: NetworkCable[] } {
  const pc1: NetworkDevice = {
    id: 'PC1',
    name: 'PC1',
    type: 'pc',
    x: 120,
    y: 280,
    ipAddress: '192.168.10.10',
    subnetMask: '255.255.255.0',
    gateway: '192.168.10.1',
    macAddress: '00:50:79:66:68:01',
    interfaces: [
      {
        id: 'Fa0',
        name: 'FastEthernet0',
        ipAddress: '192.168.10.10',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:50:79:66:68:01',
        connectedTo: { deviceId: 'SW1', interfaceId: 'Fa0/1', cableId: 'c-pc1-sw1' },
      },
    ],
    model: 'Generic Workstation',
    iosVersion: 'NetOS 11.4 Workstation Edition',
    uptime: '14 days, 6 hours',
    status: 'running',
    cliConfig: {
      hostname: 'PC1',
      history: ['ipconfig', 'ping 192.168.20.10'],
    },
  };

  const sw1: NetworkDevice = {
    id: 'SW1',
    name: 'SW1',
    type: 'switch',
    x: 320,
    y: 280,
    ipAddress: '192.168.10.2',
    subnetMask: '255.255.255.0',
    gateway: '192.168.10.1',
    macAddress: '00:1E:F7:22:11:01',
    interfaces: [
      {
        id: 'Fa0/1',
        name: 'FastEthernet0/1',
        ipAddress: 'unassigned',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:1E:F7:22:11:01',
        connectedTo: { deviceId: 'PC1', interfaceId: 'Fa0', cableId: 'c-pc1-sw1' },
      },
      {
        id: 'Fa0/2',
        name: 'FastEthernet0/2',
        ipAddress: 'unassigned',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:1E:F7:22:11:02',
        connectedTo: { deviceId: 'R1', interfaceId: 'Gi0/0', cableId: 'c-sw1-r1' },
      },
      {
        id: 'Fa0/3',
        name: 'FastEthernet0/3',
        ipAddress: 'unassigned',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:1E:F7:22:11:03',
        connectedTo: null,
      },
      {
        id: 'Fa0/4',
        name: 'FastEthernet0/4',
        ipAddress: 'unassigned',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:1E:F7:22:11:04',
        connectedTo: null,
      },
    ],
    model: 'Cisco Catalyst 2960-24TT',
    iosVersion: 'Cisco IOS 15.0(2)SE4 C2960-LANBASEK9-M',
    uptime: '42 days, 18 hours',
    status: 'running',
    cliConfig: {
      hostname: 'SW1',
      history: ['enable', 'show vlan brief'],
    },
  };

  const r1: NetworkDevice = {
    id: 'R1',
    name: 'R1',
    type: 'router',
    x: 540,
    y: 180,
    ipAddress: '192.168.10.1',
    subnetMask: '255.255.255.0',
    gateway: '0.0.0.0',
    macAddress: '00:1B:D4:44:99:01',
    interfaces: [
      {
        id: 'Gi0/0',
        name: 'GigabitEthernet0/0',
        ipAddress: '192.168.10.1',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:1B:D4:44:99:01',
        connectedTo: { deviceId: 'SW1', interfaceId: 'Fa0/2', cableId: 'c-sw1-r1' },
      },
      {
        id: 'Gi0/1',
        name: 'GigabitEthernet0/1',
        ipAddress: '10.0.0.1',
        subnetMask: '255.255.255.252',
        status: 'up',
        macAddress: '00:1B:D4:44:99:02',
        connectedTo: { deviceId: 'R2', interfaceId: 'Gi0/1', cableId: 'c-r1-r2' },
      },
      ...createRouterInterfaces(6).map((iface, idx) => ({
        ...iface,
        id: `Gi0/${idx + 2}`,
        name: `GigabitEthernet0/${idx + 2}`,
      })),
    ],
    model: 'Cisco 2911 Integrated Services Router',
    iosVersion: 'Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.5(3)M4b',
    uptime: '109 days, 4 hours',
    status: 'running',
    cliConfig: {
      hostname: 'R1',
      history: ['enable', 'configure terminal', 'show ip route'],
    },
  };

  const r2: NetworkDevice = {
    id: 'R2',
    name: 'R2',
    type: 'router',
    x: 780,
    y: 180,
    ipAddress: '10.0.0.2',
    subnetMask: '255.255.255.252',
    gateway: '0.0.0.0',
    macAddress: '00:1B:D4:55:88:01',
    interfaces: [
      {
        id: 'Gi0/0',
        name: 'GigabitEthernet0/0',
        ipAddress: '192.168.20.1',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:1B:D4:55:88:01',
        connectedTo: { deviceId: 'SW2', interfaceId: 'Fa0/2', cableId: 'c-r2-sw2' },
      },
      {
        id: 'Gi0/1',
        name: 'GigabitEthernet0/1',
        ipAddress: '10.0.0.2',
        subnetMask: '255.255.255.252',
        status: 'up',
        macAddress: '00:1B:D4:55:88:02',
        connectedTo: { deviceId: 'R1', interfaceId: 'Gi0/1', cableId: 'c-r1-r2' },
      },
      ...createRouterInterfaces(6).map((iface, idx) => ({
        ...iface,
        id: `Gi0/${idx + 2}`,
        name: `GigabitEthernet0/${idx + 2}`,
      })),
    ],
    model: 'Cisco 2911 Integrated Services Router',
    iosVersion: 'Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.5(3)M4b',
    uptime: '109 days, 4 hours',
    status: 'running',
    cliConfig: {
      hostname: 'R2',
      history: ['enable', 'show ip interface brief'],
    },
  };

  const sw2: NetworkDevice = {
    id: 'SW2',
    name: 'SW2',
    type: 'switch',
    x: 1000,
    y: 280,
    ipAddress: '192.168.20.2',
    subnetMask: '255.255.255.0',
    gateway: '192.168.20.1',
    macAddress: '00:1E:F7:77:44:01',
    interfaces: [
      {
        id: 'Fa0/1',
        name: 'FastEthernet0/1',
        ipAddress: 'unassigned',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:1E:F7:77:44:01',
        connectedTo: { deviceId: 'PC2', interfaceId: 'Fa0', cableId: 'c-sw2-pc2' },
      },
      {
        id: 'Fa0/2',
        name: 'FastEthernet0/2',
        ipAddress: 'unassigned',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:1E:F7:77:44:02',
        connectedTo: { deviceId: 'R2', interfaceId: 'Gi0/0', cableId: 'c-r2-sw2' },
      },
      {
        id: 'Fa0/3',
        name: 'FastEthernet0/3',
        ipAddress: 'unassigned',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:1E:F7:77:44:03',
        connectedTo: null,
      },
      {
        id: 'Fa0/4',
        name: 'FastEthernet0/4',
        ipAddress: 'unassigned',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:1E:F7:77:44:04',
        connectedTo: null,
      },
    ],
    model: 'Cisco Catalyst 2960-24TT',
    iosVersion: 'Cisco IOS 15.0(2)SE4',
    uptime: '38 days, 12 hours',
    status: 'running',
    cliConfig: {
      hostname: 'SW2',
      history: ['enable', 'show interfaces status'],
    },
  };

  const pc2: NetworkDevice = {
    id: 'PC2',
    name: 'PC2',
    type: 'pc',
    x: 1200,
    y: 280,
    ipAddress: '192.168.20.10',
    subnetMask: '255.255.255.0',
    gateway: '192.168.20.1',
    macAddress: '00:50:79:66:99:02',
    interfaces: [
      {
        id: 'Fa0',
        name: 'FastEthernet0',
        ipAddress: '192.168.20.10',
        subnetMask: '255.255.255.0',
        status: 'up',
        macAddress: '00:50:79:66:99:02',
        connectedTo: { deviceId: 'SW2', interfaceId: 'Fa0/1', cableId: 'c-sw2-pc2' },
      },
    ],
    model: 'Generic Workstation',
    iosVersion: 'NetOS 11.4 Workstation Edition',
    uptime: '5 days, 2 hours',
    status: 'running',
    cliConfig: {
      hostname: 'PC2',
      history: ['ipconfig', 'ping 192.168.10.10'],
    },
  };

  const cables: NetworkCable[] = [
    {
      id: 'c-pc1-sw1',
      fromDeviceId: 'PC1',
      fromPort: 'Fa0',
      toDeviceId: 'SW1',
      toPort: 'Fa0/1',
      controlPoint: null,
      status: 'active',
      cableType: 'straight-through',
    },
    {
      id: 'c-sw1-r1',
      fromDeviceId: 'SW1',
      fromPort: 'Fa0/2',
      toDeviceId: 'R1',
      toPort: 'Gi0/0',
      controlPoint: null,
      status: 'active',
      cableType: 'straight-through',
    },
    {
      id: 'c-r1-r2',
      fromDeviceId: 'R1',
      fromPort: 'Gi0/1',
      toDeviceId: 'R2',
      toPort: 'Gi0/1',
      controlPoint: null,
      status: 'active',
      cableType: 'crossover',
    },
    {
      id: 'c-r2-sw2',
      fromDeviceId: 'R2',
      fromPort: 'Gi0/0',
      toDeviceId: 'SW2',
      toPort: 'Fa0/2',
      controlPoint: null,
      status: 'active',
      cableType: 'straight-through',
    },
    {
      id: 'c-sw2-pc2',
      fromDeviceId: 'SW2',
      fromPort: 'Fa0/1',
      toDeviceId: 'PC2',
      toPort: 'Fa0',
      controlPoint: null,
      status: 'active',
      cableType: 'straight-through',
    },
  ];

  return {
    devices: [pc1, sw1, r1, r2, sw2, pc2],
    cables,
  };
}

/**
 * Generate Star Topology
 */
export function getStarTopology(): { devices: NetworkDevice[]; cables: NetworkCable[] } {
  const cx = 550;
  const cy = 340;
  const radius = 220;

  const centerSwitch: NetworkDevice = {
    id: 'SW1',
    name: 'SW1-Core',
    type: 'switch',
    x: cx,
    y: cy,
    ipAddress: '192.168.1.254',
    subnetMask: '255.255.255.0',
    gateway: '192.168.1.1',
    macAddress: '00:1E:F7:11:00:01',
    interfaces: createSwitchInterfaces(8),
    model: 'Cisco Catalyst 2960',
    iosVersion: '15.0(2)SE4',
    uptime: '60 days',
    status: 'running',
    cliConfig: { hostname: 'SW1-Core', history: ['enable'] },
  };

  const devices: NetworkDevice[] = [centerSwitch];
  const cables: NetworkCable[] = [];

  const nodeConfigs = [
    { type: 'router' as const, name: 'R1', ip: '192.168.1.1' },
    { type: 'pc' as const, name: 'PC1', ip: '192.168.1.11' },
    { type: 'pc' as const, name: 'PC2', ip: '192.168.1.12' },
    { type: 'pc' as const, name: 'PC3', ip: '192.168.1.13' },
    { type: 'pc' as const, name: 'PC4', ip: '192.168.1.14' },
    { type: 'pc' as const, name: 'PC5', ip: '192.168.1.15' },
  ];

  nodeConfigs.forEach((cfg, idx) => {
    const angle = (idx * 2 * Math.PI) / nodeConfigs.length - Math.PI / 2;
    const nx = Math.round(cx + radius * Math.cos(angle));
    const ny = Math.round(cy + radius * Math.sin(angle));

    const id = cfg.name;
    const dev: NetworkDevice = {
      id,
      name: cfg.name,
      type: cfg.type,
      x: nx,
      y: ny,
      ipAddress: cfg.ip,
      subnetMask: '255.255.255.0',
      gateway: '192.168.1.1',
      macAddress: `00:50:79:11:22:0${idx + 1}`,
      interfaces: cfg.type === 'router' ? createRouterInterfaces(8) : createPCInterfaces(),
      model: cfg.type === 'router' ? 'Cisco 2901' : 'Workstation Node',
      iosVersion: cfg.type === 'router' ? '15.4(3)M' : 'NetOS 11',
      uptime: '12 days',
    status: 'running',
      cliConfig: { hostname: cfg.name, history: ['enable'] },
    };

    const cableId = `cable-star-${idx}`;
    const swPort = `Fa0/${idx + 1}`;
    const devPort = cfg.type === 'router' ? 'Gi0/0' : 'Fa0';

    // Link interface
    const iface = dev.interfaces[0];
    if (iface) {
      iface.connectedTo = { deviceId: 'SW1', interfaceId: swPort, cableId };
    }
    const swIface = centerSwitch.interfaces[idx];
    if (swIface) {
      swIface.connectedTo = { deviceId: id, interfaceId: devPort, cableId };
    }

    cables.push({
      id: cableId,
      fromDeviceId: id,
      fromPort: devPort,
      toDeviceId: 'SW1',
      toPort: swPort,
      controlPoint: null,
      status: 'active',
      cableType: 'straight-through',
    });

    devices.push(dev);
  });

  return { devices, cables };
}

/**
 * Generate Mesh Topology (4 Routers fully interconnected)
 */
export function getMeshTopology(): { devices: NetworkDevice[]; cables: NetworkCable[] } {
  const routerCoords = [
    { id: 'R1', x: 380, y: 180, ip: '10.0.1.1' },
    { id: 'R2', x: 740, y: 180, ip: '10.0.2.1' },
    { id: 'R3', x: 740, y: 480, ip: '10.0.3.1' },
    { id: 'R4', x: 380, y: 480, ip: '10.0.4.1' },
  ];

  const devices: NetworkDevice[] = routerCoords.map((r, i) => ({
    id: r.id,
    name: r.id,
    type: 'router',
    x: r.x,
    y: r.y,
    ipAddress: r.ip,
    subnetMask: '255.255.255.0',
    gateway: '0.0.0.0',
    macAddress: `00:1B:D4:33:55:0${i + 1}`,
    interfaces: createRouterInterfaces(8),
    model: 'Cisco 2911 ISR',
    iosVersion: '15.5(3)M',
    uptime: '99 days',
    status: 'running',
    cliConfig: { hostname: r.id, history: ['enable', 'show ip route'] },
  }));

  const cables: NetworkCable[] = [];
  let cableCount = 0;

  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      const d1 = devices[i];
      const d2 = devices[j];
      const cableId = `mesh-c-${cableCount++}`;
      const p1 = `Gi0/${j}`;
      const p2 = `Gi0/${i}`;

      const if1 = d1.interfaces.find((p) => p.id === p1);
      const if2 = d2.interfaces.find((p) => p.id === p2);
      if (if1) if1.connectedTo = { deviceId: d2.id, interfaceId: p2, cableId };
      if (if2) if2.connectedTo = { deviceId: d1.id, interfaceId: p1, cableId };

      cables.push({
        id: cableId,
        fromDeviceId: d1.id,
        fromPort: p1,
        toDeviceId: d2.id,
        toPort: p2,
        controlPoint: null,
        status: 'active',
        cableType: 'crossover',
      });
    }
  }

  return { devices, cables };
}

/**
 * Generate Ring Topology (R1 - R2 - R3 - R4 - R5 - R1)
 */
export function getRingTopology(): { devices: NetworkDevice[]; cables: NetworkCable[] } {
  const cx = 560;
  const cy = 340;
  const radius = 200;
  const count = 5;

  const devices: NetworkDevice[] = [];
  const cables: NetworkCable[] = [];

  for (let i = 0; i < count; i++) {
    const angle = (i * 2 * Math.PI) / count - Math.PI / 2;
    const x = Math.round(cx + radius * Math.cos(angle));
    const y = Math.round(cy + radius * Math.sin(angle));
    const id = `R${i + 1}`;

    devices.push({
      id,
      name: id,
      type: 'router',
      x,
      y,
      ipAddress: `172.16.${i + 1}.1`,
      subnetMask: '255.255.255.0',
      gateway: '0.0.0.0',
      macAddress: `00:1B:D4:77:88:0${i + 1}`,
      interfaces: createRouterInterfaces(8),
      model: 'Cisco 2901',
      iosVersion: '15.4(3)M',
      uptime: '30 days',
    status: 'running',
      cliConfig: { hostname: id, history: ['enable'] },
    });
  }

  for (let i = 0; i < count; i++) {
    const nextIdx = (i + 1) % count;
    const d1 = devices[i];
    const d2 = devices[nextIdx];
    const cableId = `ring-c-${i}`;
    const p1 = 'Gi0/1';
    const p2 = 'Gi0/0';

    const if1 = d1.interfaces.find((p) => p.id === p1);
    const if2 = d2.interfaces.find((p) => p.id === p2);
    if (if1) if1.connectedTo = { deviceId: d2.id, interfaceId: p2, cableId };
    if (if2) if2.connectedTo = { deviceId: d1.id, interfaceId: p1, cableId };

    cables.push({
      id: cableId,
      fromDeviceId: d1.id,
      fromPort: p1,
      toDeviceId: d2.id,
      toPort: p2,
      controlPoint: null,
      status: 'active',
      cableType: 'serial',
    });
  }

  return { devices, cables };
}

/**
 * Generate Tree Topology (Hierarchical Core -> Dist -> Access)
 */
export function getTreeTopology(): { devices: NetworkDevice[]; cables: NetworkCable[] } {
  // Core Router
  const core: NetworkDevice = {
    id: 'R-Core',
    name: 'Core-Router',
    type: 'router',
    x: 560,
    y: 120,
    ipAddress: '10.0.0.1',
    subnetMask: '255.255.255.0',
    gateway: '0.0.0.0',
    macAddress: '00:1B:D4:00:00:01',
    interfaces: createRouterInterfaces(8),
    model: 'Cisco 3945 ISR',
    iosVersion: '15.5(3)M',
    uptime: '180 days',
    status: 'running',
    cliConfig: { hostname: 'Core-Router', history: ['enable'] },
  };

  // Distribution Switches
  const sw1: NetworkDevice = {
    id: 'SW-Dist1',
    name: 'Dist-SW1',
    type: 'switch',
    x: 340,
    y: 280,
    ipAddress: '10.0.1.2',
    subnetMask: '255.255.255.0',
    gateway: '10.0.0.1',
    macAddress: '00:1E:F7:01:00:01',
    interfaces: createSwitchInterfaces(8),
    model: 'Catalyst 3650',
    iosVersion: '16.3.3',
    uptime: '45 days',
    status: 'running',
    cliConfig: { hostname: 'Dist-SW1', history: ['enable'] },
  };

  const sw2: NetworkDevice = {
    id: 'SW-Dist2',
    name: 'Dist-SW2',
    type: 'switch',
    x: 780,
    y: 280,
    ipAddress: '10.0.2.2',
    subnetMask: '255.255.255.0',
    gateway: '10.0.0.1',
    macAddress: '00:1E:F7:02:00:01',
    interfaces: createSwitchInterfaces(8),
    model: 'Catalyst 3650',
    iosVersion: '16.3.3',
    uptime: '45 days',
    status: 'running',
    cliConfig: { hostname: 'Dist-SW2', history: ['enable'] },
  };

  // Access PCs
  const pcConfigs = [
    { id: 'PC1', name: 'PC1-Sales', x: 220, y: 460, ip: '10.0.1.10', sw: sw1, swPort: 'Fa0/2' },
    { id: 'PC2', name: 'PC2-Finance', x: 440, y: 460, ip: '10.0.1.11', sw: sw1, swPort: 'Fa0/3' },
    { id: 'PC3', name: 'PC3-Dev', x: 680, y: 460, ip: '10.0.2.10', sw: sw2, swPort: 'Fa0/2' },
    { id: 'PC4', name: 'PC4-Admin', x: 900, y: 460, ip: '10.0.2.11', sw: sw2, swPort: 'Fa0/3' },
  ];

  const devices: NetworkDevice[] = [core, sw1, sw2];
  const cables: NetworkCable[] = [
    {
      id: 'c-core-dist1',
      fromDeviceId: 'R-Core',
      fromPort: 'Gi0/0',
      toDeviceId: 'SW-Dist1',
      toPort: 'Fa0/1',
      controlPoint: null,
      status: 'active',
      cableType: 'straight-through',
    },
    {
      id: 'c-core-dist2',
      fromDeviceId: 'R-Core',
      fromPort: 'Gi0/1',
      toDeviceId: 'SW-Dist2',
      toPort: 'Fa0/1',
      controlPoint: null,
      status: 'active',
      cableType: 'straight-through',
    },
  ];

  // Connect core interfaces
  core.interfaces[0].connectedTo = { deviceId: 'SW-Dist1', interfaceId: 'Fa0/1', cableId: 'c-core-dist1' };
  core.interfaces[1].connectedTo = { deviceId: 'SW-Dist2', interfaceId: 'Fa0/1', cableId: 'c-core-dist2' };
  sw1.interfaces[0].connectedTo = { deviceId: 'R-Core', interfaceId: 'Gi0/0', cableId: 'c-core-dist1' };
  sw2.interfaces[0].connectedTo = { deviceId: 'R-Core', interfaceId: 'Gi0/1', cableId: 'c-core-dist2' };

  pcConfigs.forEach((cfg) => {
    const pc: NetworkDevice = {
      id: cfg.id,
      name: cfg.name,
      type: 'pc',
      x: cfg.x,
      y: cfg.y,
      ipAddress: cfg.ip,
      subnetMask: '255.255.255.0',
      gateway: cfg.sw.gateway,
      macAddress: `00:50:79:00:${cfg.id.slice(-2)}:01`,
      interfaces: [
        {
          id: 'Fa0',
          name: 'FastEthernet0',
          ipAddress: cfg.ip,
          subnetMask: '255.255.255.0',
          status: 'up',
          macAddress: `00:50:79:00:${cfg.id.slice(-2)}:01`,
          connectedTo: { deviceId: cfg.sw.id, interfaceId: cfg.swPort, cableId: `c-${cfg.id}` },
        },
      ],
      model: 'Enterprise PC',
      iosVersion: 'NetOS 11',
      uptime: '8 days',
    status: 'running',
      cliConfig: { hostname: cfg.name, history: ['ipconfig'] },
    };

    const swIface = cfg.sw.interfaces.find((p) => p.id === cfg.swPort);
    if (swIface) {
      swIface.connectedTo = { deviceId: cfg.id, interfaceId: 'Fa0', cableId: `c-${cfg.id}` };
    }

    cables.push({
      id: `c-${cfg.id}`,
      fromDeviceId: cfg.sw.id,
      fromPort: cfg.swPort,
      toDeviceId: cfg.id,
      toPort: 'Fa0',
      controlPoint: null,
      status: 'active',
      cableType: 'straight-through',
    });

    devices.push(pc);
  });

  return { devices, cables };
}

/**
 * Generate Bus Topology (Backbone with PC tap-offs)
 */
export function getBusTopology(): { devices: NetworkDevice[]; cables: NetworkCable[] } {
  const devices: NetworkDevice[] = [];
  const cables: NetworkCable[] = [];

  const count = 5;
  const startX = 200;
  const gap = 180;
  const backboneY = 280;

  // Switches acting as bus taps
  for (let i = 0; i < count; i++) {
    const swId = `SW${i + 1}`;
    const x = startX + i * gap;
    const sw: NetworkDevice = {
      id: swId,
      name: swId,
      type: 'switch',
      x,
      y: backboneY,
      ipAddress: `192.168.100.${i + 2}`,
      subnetMask: '255.255.255.0',
      gateway: '192.168.100.1',
      macAddress: `00:1E:F7:88:00:0${i + 1}`,
      interfaces: createSwitchInterfaces(4),
      model: 'Cisco 2960',
      iosVersion: '15.0',
      uptime: '15 days',
    status: 'running',
      cliConfig: { hostname: swId, history: ['enable'] },
    };

    const pcId = `PC${i + 1}`;
    const pc: NetworkDevice = {
      id: pcId,
      name: pcId,
      type: 'pc',
      x,
      y: backboneY + 160,
      ipAddress: `192.168.100.${10 + i}`,
      subnetMask: '255.255.255.0',
      gateway: '192.168.100.1',
      macAddress: `00:50:79:88:00:0${i + 1}`,
      interfaces: [
        {
          id: 'Fa0',
          name: 'FastEthernet0',
          ipAddress: `192.168.100.${10 + i}`,
          subnetMask: '255.255.255.0',
          status: 'up',
          macAddress: `00:50:79:88:00:0${i + 1}`,
          connectedTo: { deviceId: swId, interfaceId: 'Fa0/1', cableId: `c-pc-tap-${i}` },
        },
      ],
      model: 'Workstation',
      iosVersion: 'NetOS 11',
      uptime: '6 days',
    status: 'running',
      cliConfig: { hostname: pcId, history: ['ipconfig'] },
    };

    sw.interfaces[0].connectedTo = { deviceId: pcId, interfaceId: 'Fa0', cableId: `c-pc-tap-${i}` };

    cables.push({
      id: `c-pc-tap-${i}`,
      fromDeviceId: swId,
      fromPort: 'Fa0/1',
      toDeviceId: pcId,
      toPort: 'Fa0',
      controlPoint: null,
      status: 'active',
      cableType: 'straight-through',
    });

    devices.push(sw, pc);
  }

  // Interconnect backbone switches sequentially
  for (let i = 0; i < count - 1; i++) {
    const sw1 = devices.find((d) => d.id === `SW${i + 1}`)!;
    const sw2 = devices.find((d) => d.id === `SW${i + 2}`)!;
    const cableId = `c-backbone-${i}`;

    const if1 = sw1.interfaces.find((p) => p.id === 'Fa0/2');
    const if2 = sw2.interfaces.find((p) => p.id === 'Fa0/3');
    if (if1) if1.connectedTo = { deviceId: sw2.id, interfaceId: 'Fa0/3', cableId };
    if (if2) if2.connectedTo = { deviceId: sw1.id, interfaceId: 'Fa0/2', cableId };

    cables.push({
      id: cableId,
      fromDeviceId: sw1.id,
      fromPort: 'Fa0/2',
      toDeviceId: sw2.id,
      toPort: 'Fa0/3',
      controlPoint: null,
      status: 'active',
      cableType: 'crossover',
    });
  }

  return { devices, cables };
}

/**
 * 12 routers across four OSPF areas, with an explicit cost, area and address on
 * every link. This is the topology the measurement work was verified against, so
 * it is the one to load when checking that the designer, the lab and the
 * analytics page agree.
 *
 * Areas: 0 backbone (R1, R2, R3, R11, R12), 1 (R4, R5, R6), 2 (R7, R8),
 * 3 (R9, R10). R2, R3 and R11 hold interfaces in more than one area and so are
 * area border routers -- non-backbone areas can only reach each other through
 * area 0, so those three links are what make the topology routable end to end.
 *
 * Two links deliberately use non-Class-C addressing (R2-R3 is Class B, R4-R5 is
 * Class A) so the mask genuinely varies across the topology rather than every
 * link being a /24 by default.
 */
export function getTwelveRouterTopology(): { devices: NetworkDevice[]; cables: NetworkCable[] } {
  const AREA_PLAN: Array<{ id: string; area: number; x: number; y: number }> = [
    { id: 'R1', area: 0, x: 250, y: 120 },
    { id: 'R2', area: 0, x: 250, y: 330 },
    { id: 'R3', area: 0, x: 250, y: 540 },
    { id: 'R4', area: 1, x: 560, y: 300 },
    { id: 'R5', area: 1, x: 850, y: 210 },
    { id: 'R6', area: 1, x: 850, y: 400 },
    { id: 'R7', area: 2, x: 560, y: 620 },
    { id: 'R8', area: 2, x: 850, y: 600 },
    { id: 'R9', area: 3, x: 560, y: 820 },
    { id: 'R10', area: 3, x: 850, y: 800 },
    { id: 'R11', area: 0, x: 60, y: 560 },
    { id: 'R12', area: 0, x: 60, y: 300 },
  ];

  // Explicit plan, kept identical to the one the lab was deployed from. Order
  // matters: it fixes which interface each link lands on, and therefore the
  // areas and costs the routers end up reporting.
  const LINK_PLAN: Array<{
    id: string;
    source: string;
    target: string;
    cost: number;
    area: number;
    addressClass: 'A' | 'B' | 'C';
    subnet: string;
    mask: string;
    sourceIp: string;
    targetIp: string;
  }> = [
    { id: 'l1', source: 'R1', target: 'R2', cost: 10, area: 0, addressClass: 'C', subnet: '192.168.0.0/24', mask: '255.255.255.0', sourceIp: '192.168.0.2', targetIp: '192.168.0.3' },
    { id: 'l2', source: 'R1', target: 'R12', cost: 5, area: 0, addressClass: 'C', subnet: '192.168.1.0/24', mask: '255.255.255.0', sourceIp: '192.168.1.2', targetIp: '192.168.1.3' },
    { id: 'l3', source: 'R2', target: 'R3', cost: 10, area: 0, addressClass: 'B', subnet: '172.16.0.0/16', mask: '255.255.0.0', sourceIp: '172.16.0.2', targetIp: '172.16.0.3' },
    { id: 'l4', source: 'R2', target: 'R11', cost: 15, area: 0, addressClass: 'C', subnet: '192.168.2.0/24', mask: '255.255.255.0', sourceIp: '192.168.2.2', targetIp: '192.168.2.3' },
    { id: 'l5', source: 'R11', target: 'R12', cost: 8, area: 0, addressClass: 'C', subnet: '192.168.3.0/24', mask: '255.255.255.0', sourceIp: '192.168.3.2', targetIp: '192.168.3.3' },
    { id: 'l6', source: 'R2', target: 'R4', cost: 20, area: 1, addressClass: 'C', subnet: '192.168.4.0/24', mask: '255.255.255.0', sourceIp: '192.168.4.2', targetIp: '192.168.4.3' },
    { id: 'l7', source: 'R4', target: 'R5', cost: 10, area: 1, addressClass: 'A', subnet: '10.0.0.0/8', mask: '255.0.0.0', sourceIp: '10.0.0.2', targetIp: '10.0.0.3' },
    { id: 'l8', source: 'R4', target: 'R6', cost: 10, area: 1, addressClass: 'C', subnet: '192.168.5.0/24', mask: '255.255.255.0', sourceIp: '192.168.5.2', targetIp: '192.168.5.3' },
    { id: 'l9', source: 'R3', target: 'R7', cost: 20, area: 2, addressClass: 'C', subnet: '192.168.6.0/24', mask: '255.255.255.0', sourceIp: '192.168.6.2', targetIp: '192.168.6.3' },
    { id: 'l10', source: 'R7', target: 'R8', cost: 10, area: 2, addressClass: 'C', subnet: '192.168.7.0/24', mask: '255.255.255.0', sourceIp: '192.168.7.2', targetIp: '192.168.7.3' },
    { id: 'l11', source: 'R3', target: 'R8', cost: 12, area: 2, addressClass: 'C', subnet: '192.168.8.0/24', mask: '255.255.255.0', sourceIp: '192.168.8.2', targetIp: '192.168.8.3' },
    { id: 'l12', source: 'R3', target: 'R9', cost: 15, area: 3, addressClass: 'C', subnet: '192.168.9.0/24', mask: '255.255.255.0', sourceIp: '192.168.9.2', targetIp: '192.168.9.3' },
    { id: 'l13', source: 'R9', target: 'R10', cost: 10, area: 3, addressClass: 'C', subnet: '192.168.10.0/24', mask: '255.255.255.0', sourceIp: '192.168.10.2', targetIp: '192.168.10.3' },
    { id: 'l14', source: 'R11', target: 'R10', cost: 25, area: 3, addressClass: 'C', subnet: '192.168.11.0/24', mask: '255.255.255.0', sourceIp: '192.168.11.2', targetIp: '192.168.11.3' },
  ];

  // A router's headline address is the lowest one on its links, which is the
  // same rule the backend uses, so the canvas and the plan agree by construction.
  const headline = new Map<string, { ip: string; mask: string }>();
  for (const link of LINK_PLAN) {
    for (const [router, ip] of [
      [link.source, link.sourceIp],
      [link.target, link.targetIp],
    ] as const) {
      const current = headline.get(router);
      if (!current || ip.localeCompare(current.ip, undefined, { numeric: true }) < 0) {
        headline.set(router, { ip, mask: link.mask });
      }
    }
  }

  const devices: NetworkDevice[] = AREA_PLAN.map((spec, index) => {
    const own = headline.get(spec.id)!;
    const degree = LINK_PLAN.filter((l) => l.source === spec.id || l.target === spec.id).length;
    const dev: NetworkDevice = {
      id: spec.id,
      name: spec.id,
      type: 'router',
      x: spec.x,
      y: spec.y,
      ipAddress: own.ip,
      subnetMask: own.mask,
      gateway: '',
      macAddress: `00:1B:D4:6C:00:${(index + 1).toString(16).padStart(2, '0')}`,
      // One interface per link, because each link terminates on a real
      // interface on each of its two routers.
      interfaces: [],
      model: 'Cisco 2901',
      iosVersion: '15.4(3)M',
      uptime: '12 days',
      status: 'running',
      cliConfig: { hostname: spec.id, history: ['enable'] },
      ospfArea: spec.area,
    };
    // Placeholder identities only; the real ones come from the deployed plan.
    for (let port = 0; port < degree; port++) {
      dev.interfaces.push({
        id: `Gi0/${port}`,
        name: `GigabitEthernet0/${port}`,
        ipAddress: 'unassigned',
        subnetMask: own.mask,
        status: 'up',
        macAddress: `00:1B:D4:6C:${(index + 1).toString(16).padStart(2, '0')}:${port.toString(16).padStart(2, '0')}`,
        connectedTo: null,
      });
    }
    return dev;
  });

  const cables: NetworkCable[] = [];
  for (const link of LINK_PLAN) {
    const source = devices.find((d) => d.id === link.source)!;
    const target = devices.find((d) => d.id === link.target)!;
    const sourcePort = source.interfaces.find((i) => !i.connectedTo);
    const targetPort = target.interfaces.find((i) => !i.connectedTo);
    if (!sourcePort || !targetPort) continue;

    // The addresses live on the interfaces too, not only on the link, so
    // anywhere the UI shows an interface it shows the IP the router holds.
    sourcePort.ipAddress = link.sourceIp;
    sourcePort.subnetMask = link.mask;
    targetPort.ipAddress = link.targetIp;
    targetPort.subnetMask = link.mask;
    sourcePort.connectedTo = {
      deviceId: target.id,
      interfaceId: targetPort.id,
      cableId: link.id,
    };
    targetPort.connectedTo = {
      deviceId: source.id,
      interfaceId: sourcePort.id,
      cableId: link.id,
    };

    cables.push({
      id: link.id,
      fromDeviceId: link.source,
      fromPort: sourcePort.id,
      toDeviceId: link.target,
      toPort: targetPort.id,
      controlPoint: null,
      status: 'active',
      cableType: 'crossover',
      addressClass: link.addressClass,
      subnet: link.subnet,
      subnetMask: link.mask,
      sourceIp: link.sourceIp,
      targetIp: link.targetIp,
      ospfArea: link.area,
      cost: link.cost,
    });
  }

  return { devices, cables };
}
