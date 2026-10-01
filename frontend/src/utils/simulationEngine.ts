import { NetworkCable, NetworkDevice, Packet, PacketHop, PacketLogEntry } from '../types/network';
import { discoverRoute, getPointOnCable } from './networkRouting';

const PACKET_COLORS = [
  '#22D3EE', '#A78BFA', '#34D399', '#FBBF24', '#F472B6',
  '#60A5FA', '#F97316', '#14B8A6', '#E879F9', '#84CC16',
];

let packetCounter = 0;

export function createPacket(
  sourceId: string,
  targetId: string,
  devices: NetworkDevice[],
  cables: NetworkCable[]
): Packet | null {
  const route = discoverRoute(sourceId, targetId, devices, cables);
  if (!route.success) return null;

  packetCounter++;
  const color = PACKET_COLORS[packetCounter % PACKET_COLORS.length];

  return {
    id: `pkt-${Date.now()}-${packetCounter}`,
    source: sourceId,
    destination: targetId,
    route: route.devicesPath,
    currentHop: 0,
    progress: 0,
    color,
    status: 'routing',
    logs: [
      {
        id: `log-${Date.now()}-0`,
        timestamp: new Date().toLocaleTimeString(),
        message: `Packet created: ${sourceId} → ${targetId}`,
        type: 'info',
      },
    ],
    createdAt: Date.now(),
  };
}

export function advancePacket(
  packet: Packet,
  cables: NetworkCable[],
  devices: NetworkDevice[]
): { packet: Packet; cableUpdates: Map<string, number> } {
  const cableUpdates = new Map<string, number>();

  if (packet.status !== 'routing' && packet.status !== 'transmitting') {
    return { packet, cableUpdates };
  }

  const currentCableId = getCableIdForHop(packet.route, packet.currentHop, cables);
  if (!currentCableId) {
    // Reached destination
    const completedPacket: Packet = {
      ...packet,
      status: 'success',
      progress: 1,
      logs: [
        ...packet.logs,
        {
          id: `log-${Date.now()}-done`,
          timestamp: new Date().toLocaleTimeString(),
          message: `Delivered to ${packet.destination}`,
          type: 'success',
        },
      ],
    };
    return { packet: completedPacket, cableUpdates };
  }

  const cable = cables.find((c) => c.id === currentCableId);
  if (!cable) {
    return { packet, cableUpdates };
  }

  // A link set to down really breaks the drawn path. That is a fact about the
  // canvas and can be acted on.
  if (cable.status === 'down') {
    const droppedPacket: Packet = {
      ...packet,
      status: 'dropped',
      droppedAtHop: packet.currentHop,
      dropReason: `Link ${cable.fromDeviceId}–${cable.toDeviceId} is set down`,
      logs: [
        ...packet.logs,
        {
          id: `log-${Date.now()}-drop`,
          timestamp: new Date().toLocaleTimeString(),
          message: `STOPPED at hop ${packet.currentHop + 1} — link ${cable.fromDeviceId}–${cable.toDeviceId} is set down`,
          type: 'error',
          hop: packet.currentHop,
        },
      ],
    };
    return { packet: droppedPacket, cableUpdates };
  }

  // Calculate hop duration based on cable delay
  const baseDelay = cable.delay ?? 10;
  const currentPackets = cable.currentPackets ?? 0;
  const congestionDelay = currentPackets * 5;
  const actualDelay = baseDelay + congestionDelay;
  const hopDuration = actualDelay * 10; // animation duration in ms

  // Advance progress
  const progressIncrement = 16 / hopDuration; // ~60fps
  const newProgress = packet.progress + progressIncrement;

  if (newProgress >= 1) {
    // Move to next hop
    const nextHop = packet.currentHop + 1;
    const isComplete = nextHop >= packet.route.length - 1;

    if (isComplete) {
      const completedPacket: Packet = {
        ...packet,
        status: 'success',
        currentHop: nextHop,
        progress: 1,
        logs: [
          ...packet.logs,
          {
            id: `log-${Date.now()}-done`,
            timestamp: new Date().toLocaleTimeString(),
            message: `Delivered to ${packet.destination}`,
            type: 'success',
          },
        ],
      };
      return { packet: completedPacket, cableUpdates };
    }

    // Decrement current cable count
    cableUpdates.set(currentCableId, -1);

    const advancedPacket: Packet = {
      ...packet,
      currentHop: nextHop,
      progress: 0,
      status: 'transmitting',
      logs: [
        ...packet.logs,
        {
          id: `log-${Date.now()}-hop`,
          timestamp: new Date().toLocaleTimeString(),
          message: `Hop ${packet.currentHop + 1} OK — forwarded to ${packet.route[nextHop]}`,
          type: 'info',
          hop: packet.currentHop,
        },
      ],
    };
    return { packet: advancedPacket, cableUpdates };
  }

  // Still on same hop — increment cable congestion
  cableUpdates.set(currentCableId, 1);

  const updatedPacket: Packet = {
    ...packet,
    progress: newProgress,
    status: 'transmitting',
  };
  return { packet: updatedPacket, cableUpdates };
}

function getCableIdForHop(
  route: string[],
  hopIndex: number,
  cables: NetworkCable[]
): string | null {
  if (hopIndex >= route.length - 1) return null;
  const from = route[hopIndex];
  const to = route[hopIndex + 1];
  const cable = cables.find(
    (c) =>
      (c.fromDeviceId === from && c.toDeviceId === to) ||
      (c.fromDeviceId === to && c.toDeviceId === from)
  );
  return cable?.id ?? null;
}

export function getCableForHop(
  route: string[],
  hopIndex: number,
  cables: NetworkCable[]
): NetworkCable | null {
  if (hopIndex >= route.length - 1) return null;
  const from = route[hopIndex];
  const to = route[hopIndex + 1];
  return (
    cables.find(
      (c) =>
        (c.fromDeviceId === from && c.toDeviceId === to) ||
        (c.fromDeviceId === to && c.toDeviceId === from)
    ) ?? null
  );
}

export function getPointOnCableForPacket(
  packet: Packet,
  devices: NetworkDevice[],
  cables: NetworkCable[]
): { x: number; y: number } | null {
  if (packet.currentHop >= packet.route.length - 1) {
    const destDevice = devices.find((d) => d.id === packet.destination);
    return destDevice ? { x: destDevice.x + 32, y: destDevice.y + 32 } : null;
  }

  const cable = getCableForHop(packet.route, packet.currentHop, cables);
  if (!cable) return null;

  const fromDev = devices.find((d) => d.id === cable.fromDeviceId);
  const toDev = devices.find((d) => d.id === cable.toDeviceId);
  if (!fromDev || !toDev) return null;

  const x1 = fromDev.x + 32;
  const y1 = fromDev.y + 32;
  const x2 = toDev.x + 32;
  const y2 = toDev.y + 32;

  return getPointOnCable(x1, y1, x2, y2, cable.controlPoint, packet.progress);
}
