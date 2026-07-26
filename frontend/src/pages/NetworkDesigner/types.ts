export type Device = {
  id: number;
  type: string;
  name: string;
  ip: string;
  x: number;
  y: number;
};

export type Connection = {
  from: number;
  to: number;
  cableType: "Straight" | "Cross" | "Fiber";
};