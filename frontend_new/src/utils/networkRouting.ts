import { NetworkCable, NetworkDevice, PacketHop } from '../types/network';

export interface RouteDiscoveryResult {
  success: boolean;
  hops: PacketHop[];
  devicesPath: string[]; // deviceIds in order
  error?: string;
  droppedAtDeviceId?: string;
}

/**
 * Builds an adjacency graph from active cables and finds the shortest path
 * between sourceDeviceId and targetDeviceId using Breadth-First Search (BFS).
 * Works for any number of devices (3, 8, 15, 30+).
 */
export function discoverRoute(
  sourceDeviceId: string,
  targetDeviceId: string,
  devices: NetworkDevice[],
  cables: NetworkCable[]
): RouteDiscoveryResult {
  if (sourceDeviceId === targetDeviceId) {
    return {
      success: false,
      hops: [],
      devicesPath: [sourceDeviceId],
      error: 'Source and destination cannot be the same device',
    };
  }

  const deviceMap = new Map<string, NetworkDevice>();
  devices.forEach((d) => deviceMap.set(d.id, d));

  const sourceDevice = deviceMap.get(sourceDeviceId);
  const targetDevice = deviceMap.get(targetDeviceId);

  if (!sourceDevice || !targetDevice) {
    return {
      success: false,
      hops: [],
      devicesPath: [],
      error: 'Source or target device not found in topology',
    };
  }

  // Build adjacency list
  // Map from deviceId to array of { neighborId, cableId, fromPort, toPort }
  interface Edge {
    neighborId: string;
    cable: NetworkCable;
    fromPort: string;
    toPort: string;
  }

  const adj = new Map<string, Edge[]>();
  devices.forEach((d) => adj.set(d.id, []));

  cables.forEach((cable) => {
    // Check if cable devices exist
    if (!adj.has(cable.fromDeviceId)) adj.set(cable.fromDeviceId, []);
    if (!adj.has(cable.toDeviceId)) adj.set(cable.toDeviceId, []);

    adj.get(cable.fromDeviceId)!.push({
      neighborId: cable.toDeviceId,
      cable,
      fromPort: cable.fromPort,
      toPort: cable.toPort,
    });

    adj.get(cable.toDeviceId)!.push({
      neighborId: cable.fromDeviceId,
      cable,
      fromPort: cable.toPort,
      toPort: cable.fromPort,
    });
  });

  // BFS Queue: [currentDeviceId, pathOfHops, visitedDeviceIds]
  interface QueueItem {
    deviceId: string;
    hops: PacketHop[];
    devicePath: string[];
  }

  const queue: QueueItem[] = [
    {
      deviceId: sourceDeviceId,
      hops: [],
      devicePath: [sourceDeviceId],
    },
  ];

  const visited = new Set<string>();
  visited.add(sourceDeviceId);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.deviceId === targetDeviceId) {
      // Validate interface status along the path to simulate packet drops if interfaces are administratively down
      for (const hop of current.hops) {
        const fromDev = deviceMap.get(hop.fromDeviceId);
        const toDev = deviceMap.get(hop.toDeviceId);

        const fromIf = fromDev?.interfaces.find((i) => i.id === hop.fromPort);
        const toIf = toDev?.interfaces.find((i) => i.id === hop.toPort);

        if (fromIf?.status === 'down') {
          return {
            success: false,
            hops: current.hops,
            devicesPath: current.devicePath,
            error: `Interface ${hop.fromPort} on ${fromDev?.name || hop.fromDeviceId} is administratively DOWN`,
            droppedAtDeviceId: hop.fromDeviceId,
          };
        }

        if (toIf?.status === 'down') {
          return {
            success: false,
            hops: current.hops,
            devicesPath: current.devicePath,
            error: `Interface ${hop.toPort} on ${toDev?.name || hop.toDeviceId} is administratively DOWN`,
            droppedAtDeviceId: hop.toDeviceId,
          };
        }
      }

      return {
        success: true,
        hops: current.hops,
        devicesPath: current.devicePath,
      };
    }

    const neighbors = adj.get(current.deviceId) || [];
    for (const edge of neighbors) {
      if (!visited.has(edge.neighborId)) {
        visited.add(edge.neighborId);

        const newHop: PacketHop = {
          fromDeviceId: current.deviceId,
          toDeviceId: edge.neighborId,
          cableId: edge.cable.id,
          hopIndex: current.hops.length,
          fromPort: edge.fromPort,
          toPort: edge.toPort,
        };

        queue.push({
          deviceId: edge.neighborId,
          hops: [...current.hops, newHop],
          devicePath: [...current.devicePath, edge.neighborId],
        });
      }
    }
  }

  return {
    success: false,
    hops: [],
    devicesPath: [],
    error: `No route found between ${sourceDevice.name} and ${targetDevice.name}. Verify cable connections.`,
  };
}

/**
 * Calculates point on a quadratic bezier curve or straight line at progress t (0 <= t <= 1)
 */
export function getPointOnCable(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  controlPoint: { x: number; y: number } | null,
  t: number
): { x: number; y: number } {
  const clampedT = Math.max(0, Math.min(1, t));

  if (!controlPoint) {
    // Pure straight line
    return {
      x: x1 + (x2 - x1) * clampedT,
      y: y1 + (y2 - y1) * clampedT,
    };
  }

  // Quadratic Bézier curve: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
  const u = 1 - clampedT;
  const tt = clampedT * clampedT;
  const uu = u * u;

  const x = uu * x1 + 2 * u * clampedT * controlPoint.x + tt * x2;
  const y = uu * y1 + 2 * u * clampedT * controlPoint.y + tt * y2;

  return { x, y };
}
