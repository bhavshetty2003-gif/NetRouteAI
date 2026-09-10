export type PortType =
  | "GigabitEthernet"
  | "FastEthernet"
  | "Console"
  | "Serial";

export type Port = {
  id: string;
  name: string;
  type: PortType;
  connected: boolean;
};

export type Device = {
  id: number;

  type: "Router" | "Switch" | "PC";

  name: string;

  ip: string;
  subnet: string;
  gateway: string;

  mac: string;

  x: number;
  y: number;

  ports: Port[];
};

export type CableType =
  | "Auto"
  | "Copper Straight Through"
  | "Copper Cross Over"
  | "Fiber"
  | "Console"
  | "Serial DCE"
  | "Serial DTE"
  | "Coaxial"
  | "Phone";

export type Connection = {
  id: number;

  fromDevice: number;
  fromPort: string;

  toDevice: number;
  toPort: string;

  cableType: CableType;
};