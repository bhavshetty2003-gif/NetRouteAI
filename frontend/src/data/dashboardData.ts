import {
  Router,
  Laptop,
  Cpu,
  MemoryStick,
  Activity,
  Package,
} from "lucide-react";

export const dashboardMetrics = [
  {
    title: "Routers Online",
    value: "12",
    icon: Router,
  },
  {
    title: "Hosts Online",
    value: "48",
    icon: Laptop,
  },
  {
    title: "CPU Usage",
    value: "63%",
    icon: Cpu,
  },
  {
    title: "Memory Usage",
    value: "71%",
    icon: MemoryStick,
  },
  {
    title: "Latency",
    value: "21 ms",
    icon: Activity,
  },
  {
    title: "Packet Loss",
    value: "0.4%",
    icon: Package,
  },
];
