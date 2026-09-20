export type DeviceType = 'router' | 'switch' | 'pc';

export type InterfaceStatus = 'up' | 'down';

export interface NetworkInterface {
  id: string; // e.g. "Gi0/0", "Fa0/1"
  name: string;
  ipAddress: string;
  subnetMask: string;
  status: InterfaceStatus;
  macAddress: string;
  connectedTo: {
    deviceId: string;
    interfaceId: string;
    cableId: string;
  } | null;
}

export interface DeviceCLIConfig {
  hostname: string;
  banner?: string;
  enableSecret?: string;
  history: string[];
}

export interface NetworkDevice {
  id: string; // e.g. "R1", "SW1", "PC1"
  name: string;
  type: DeviceType;
  x: number;
  y: number;
  ipAddress: string;
  subnetMask: string;
  gateway: string;
  macAddress: string;
  interfaces: NetworkInterface[];
  model: string;
  iosVersion: string;
  uptime: string;
  cliConfig: DeviceCLIConfig;
}

export interface NetworkCable {
  id: string;
  fromDeviceId: string;
  fromPort: string;
  toDeviceId: string;
  toPort: string;
  controlPoint: { x: number; y: number } | null;
  status: 'active' | 'down';
  cableType: 'straight-through' | 'crossover' | 'fiber' | 'serial';
}

export interface PacketHop {
  fromDeviceId: string;
  toDeviceId: string;
  cableId: string;
  hopIndex: number;
  fromPort: string;
  toPort: string;
}

export interface PacketLogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
  hop?: number;
}

export interface PacketSimulationState {
  active: boolean;
  sourceId: string | null;
  targetId: string | null;
  hops: PacketHop[];
  currentHopIndex: number;
  hopProgress: number; // 0 to 1
  status: 'idle' | 'routing' | 'transmitting' | 'waiting' | 'success' | 'failed';
  droppedAtHop?: number;
  message: string;
  logs: PacketLogEntry[];
}

export type ActiveNavTab =
  | 'home'
  | 'designer'
  | 'analytics'
  | 'monitoring'
  | 'settings';
