const API_BASE = "http://127.0.0.1:8000";

export interface Topology {
  devices: Array<{
    id: string;
    type: string;
    name?: string;
    x?: number;
    y?: number;
    ip_address?: string;
    gateway?: string;
  }>;
  links: Array<{
    source: string;
    target: string;
    source_ip?: string;
    source_subnet?: string;
    target_ip?: string;
    target_subnet?: string;
    cost?: number;
    bandwidth?: number;
    latency?: number;
    loss_probability?: number;
  }>;
  auto_ip?: boolean;
}

export interface RoutingResult {
  algorithm: string;
  path: string[];
  hop_count: number;
  total_cost: number;
  routing_table: Record<string, unknown>;
  frr_config: string;
  metrics: {
    bandwidth: number;
    latency: number;
    throughput: number;
    convergence_time: number;
    packet_loss: number;
  };
  path_probability?: number;
  ml_features?: {
    predicted_congestion: number;
    link_reliability: number;
    predicted_delay_variance: number;
  };
}

export interface SimulationResult {
  simulation_id: string;
  packets_sent: number;
  packets_received: number;
  packet_loss_count: number;
  simulation_trace: Array<{
    packet_id: number;
    timestamp: number;
    path: string[];
    hop_times: number[];
    total_latency: number;
    status: string;
  }>;
}

export interface AnalyticsResult {
  comparison: {
    dijkstra: {
      path: string[];
      hop_count: number;
      total_cost: number;
      metrics: Record<string, number>;
    };
    random_forest: {
      path: string[];
      hop_count: number;
      total_cost: number;
      metrics: Record<string, number>;
      path_probability?: number;
    };
    winner: string;
    recommendation: string;
    differences: Record<string, number | string>;
    trade_offs: Record<string, string>;
  };
}

export async function createTopology(topology: Topology): Promise<{ topology_id: string; status: string }> {
  const response = await fetch(`${API_BASE}/api/topology/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topology }),
  });
  if (!response.ok) throw new Error(`Failed to create topology: ${response.statusText}`);
  return response.json();
}

export async function runDijkstra(
  topologyId: string,
  source: string,
  destination: string
): Promise<RoutingResult> {
  const response = await fetch(`${API_BASE}/api/routing/dijkstra`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topology_id: topologyId, source, destination }),
  });
  if (!response.ok) throw new Error(`Dijkstra failed: ${response.statusText}`);
  return response.json();
}

export async function runRandomForest(
  topologyId: string,
  source: string,
  destination: string
): Promise<RoutingResult> {
  const response = await fetch(`${API_BASE}/api/routing/random-forest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topology_id: topologyId, source, destination }),
  });
  if (!response.ok) throw new Error(`Random Forest failed: ${response.statusText}`);
  return response.json();
}

export async function simulatePackets(
  topologyId: string,
  source: string,
  destination: string,
  packetCount: number = 100,
  packetSize: number = 1024,
  algorithm: string = "dijkstra"
): Promise<SimulationResult> {
  const response = await fetch(`${API_BASE}/api/simulation/send-packets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topology_id: topologyId,
      source,
      destination,
      packet_count: packetCount,
      packet_size: packetSize,
      algorithm,
    }),
  });
  if (!response.ok) throw new Error(`Simulation failed: ${response.statusText}`);
  return response.json();
}

export async function compareAlgorithms(
  topologyId: string,
  source: string,
  destination: string
): Promise<AnalyticsResult> {
  const response = await fetch(`${API_BASE}/api/analytics/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topology_id: topologyId, source, destination }),
  });
  if (!response.ok) throw new Error(`Comparison failed: ${response.statusText}`);
  return response.json();
}

export interface AiRouteRecommendation {
  algorithm: string;
  best_route: string[];
  latency: number;
  confidence: number;
  hop_count: number;
  total_cost: number;
  metrics: {
    bandwidth: number;
    latency: number;
    throughput: number;
    convergence_time: number;
    packet_loss: number;
  };
  model?: string;
  quality_score?: number;
  path_ranking?: Array<{
    path: string[];
    quality: number;
    latency_ms: number;
    bandwidth_mbps: number;
    packet_loss_percent: number;
    total_cost: number;
    hop_count: number;
  }>;
}

export async function uploadTopology(
  topology: Topology
): Promise<{ topology_id: string; status: string; validation: any }> {
  const response = await fetch(`${API_BASE}/upload-topology`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topology }),
  });
  if (!response.ok) throw new Error(`Failed to upload topology: ${response.statusText}`);
  return response.json();
}

export async function getAiRouteRecommendation(
  topologyId: string,
  source: string,
  destination: string
): Promise<AiRouteRecommendation> {
  const response = await fetch(`${API_BASE}/api/routing/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topology_id: topologyId, source, destination }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "AI recommendation"));
  return response.json();
}

/* ------------------------------------------------------------------ *
 * Live lab
 *
 * Everything below reports values measured from the running Docker/FRR
 * lab. The analytics page renders these instead of modelled placeholders.
 * ------------------------------------------------------------------ */

export interface LabDevice {
  id: string;
  name: string;
  type: "router" | "switch" | "pc" | string;
  status: string;
  container: string;
  addresses: Record<string, string>;
  neighbors: string[];
}

export interface LabLink {
  id: string;
  source: string;
  target: string;
  network: string;
  subnet: string;
  kind: "transit" | "lan";
  members: string[];
}

export interface LabStatus {
  online: boolean;
  device_count: number;
  link_count: number;
  transit_links: number;
  lan_links: number;
  devices: LabDevice[];
  links: LabLink[];
}

export interface MeasuredSegment {
  from: string;
  to: string;
  latency_ms: number | null;
  jitter_ms: number | null;
  packet_loss_percent: number | null;
  reachable: boolean;
  command: string;
}

export interface PathLink {
  container: string;
  interface: string;
  from: string;
  to: string;
  local_ip: string;
  subnet: string;
  kind: string;
  state: string;
  rx_packets: number;
  tx_packets: number;
  rx_bytes: number;
  tx_bytes: number;
  errors: number;
  dropped: number;
  queue_length: number;
  backlog_packets: number;
  qdisc_drops: number;
}

export interface RouteReport {
  path: string[];
  hop_count: number;
  basis: string;
  latency_ms: number | null;
  reachable: boolean;
  measured_segments: number;
  segments: MeasuredSegment[];
  hops: Array<{ hop: number; address: string | null; device: string | null; rtt_ms: number | null }>;
  links: PathLink[];
  computed: {
    /** Kernel-reported speed of the bottleneck transit interface, or null when
     *  the kernel has no figure for it. Never a default. */
    bandwidth: number | null;
    bandwidth_basis: string;
    latency: number | null;
    latency_basis: string;
    /** Worst measured segment, not a mean, so one dead hop cannot read small. */
    packet_loss: number | null;
    total_cost: number;
    modelled_hops: number;
    path_hops: number;
  };
}

export interface ComparisonRow {
  parameter: string;
  ospf: string;
  ai: string;
  winner: "ospf" | "ai" | "tie" | "n/a";
  detail: string;
}

export interface SteerPlan {
  method: RoutingMethod;
  applicable: boolean;
  reason: string;
  already_in_effect?: boolean;
  device?: string;
  container?: string;
  interface?: string;
  subnet?: string;
  next_hop_device?: string;
  next_hop?: string;
  prefix?: string;
  command?: string;
  commands?: string[];
  hops?: Array<{
    device: string;
    container: string;
    interface: string;
    next_hop_device: string;
    next_hop: string;
    prefix: string;
    command: string;
  }>;
  path?: string[];
}

export interface LiveAnalytics {
  available: boolean;
  measured_at: number;
  source: string;
  destination: string;
  methods: RoutingMethod[];
  active_method: RoutingMethod;
  ospf: RouteReport;
  ai: RouteReport;
  /** Which method the routers are really forwarding right now, from the traceroute. */
  forwarding_method: RoutingMethod | null;
  /** Device chain the packet really walked, recovered from traceroute hop IPs.
   *  Empty when the trace had a gap: a hop nobody answered for means the chain
   *  is unknown, not short. */
  path_taken: string[];
  /** False when a hop in the traceroute went unanswered, so `path_taken` cannot
   *  be trusted and `path_taken_matches` is all false for that reason alone. */
  path_taken_complete: boolean;
  path_taken_gaps: string[];
  /** Which methods the walked path agrees with. */
  path_taken_matches: Record<RoutingMethod, boolean>;
  active: {
    method: RoutingMethod;
    label: string;
    path: string[];
    /** True when the routers are genuinely forwarding this method's path. */
    in_effect: boolean;
    note: string;
    steer: SteerPlan;
  };
  end_to_end: {
    latency_ms: number | null;
    rtt_min_ms: number | null;
    rtt_max_ms: number | null;
    jitter_ms: number | null;
    packet_loss_percent: number | null;
    hop_count: number | null;
    reachable: boolean;
    target_ip: string;
    packets_sent: number;
    packets_received: number;
    /** Smallest loss percentage this packet count can actually express: 1/N.
     *  With 12 packets one drop reads as 8.3%, so "0.0%" means "none of the 12
     *  were lost", not "loss below 1%". */
    loss_resolution_percent?: number;
    addresses_tried: Array<{ ip: string; reachable: boolean }>;
    /** Real traceroute hops with the answering address and owning device. */
    hops: Array<{
      hop: number;
      address: string | null;
      device: string | null;
      rtt_ms: number | null;
    }>;
    command: string;
    traceroute_command: string | null;
    /** How many traceroute runs it took to get a trace with no unanswered hop. */
    traceroute_attempts?: number;
    traceroute_complete?: boolean;
    diagnosis: string | null;
  };
  ai_ranking: Array<{
    path: string[];
    quality: number;
    latency_ms: number;
    bandwidth_mbps: number;
    total_cost: number;
    hop_count: number;
  }>;
  model: string;
  confidence: number;
  comparison: { rows: ComparisonRow[] };
  convergence?: {
    convergence_ms: number | null;
    detected: boolean;
    link: { container: string; interface: string };
    post_recovery_latency_ms: number | null;
    post_recovery_loss_percent: number | null;
    error?: string;
  };
}

export interface DatasetStats {
  total: number;
  measured: number;
  synthetic: number;
  measured_ratio: number;
  labels: Record<string, number>;
  training_samples: number;
  ready_for_training: boolean;
}

/** Read a FastAPI error body so the UI can show the real reason, not "failed". */
async function describeFailure(response: Response, action: string): Promise<string> {
  let detail = response.statusText;
  try {
    const body = await response.json();
    if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {
    /* keep statusText */
  }
  return `${action} failed (${response.status}): ${detail}`;
}

export async function getLabStatus(): Promise<LabStatus> {
  const response = await fetch(`${API_BASE}/api/lab/status`);
  if (!response.ok) throw new Error(await describeFailure(response, "Lab status"));
  return response.json();
}

/* ------------------------------------------------------------------ */
/* Deploying the drawn topology as the lab that gets measured          */
/* ------------------------------------------------------------------ */

/** Address class of a link. The mask follows from it, so there is nothing
 *  to type: A -> 255.0.0.0, B -> 255.255.0.0, C -> 255.255.255.0. */
export type AddressClass = "A" | "B" | "C";

export const ADDRESS_CLASSES: AddressClass[] = ["A", "B", "C"];

export const MASK_FOR_CLASS: Record<AddressClass, string> = {
  A: "255.0.0.0",
  B: "255.255.0.0",
  C: "255.255.255.0",
};

export const PREFIX_FOR_CLASS: Record<AddressClass, number> = { A: 8, B: 16, C: 24 };

/** What the designer sends. Addresses already on a link are sent verbatim so
 *  the lab uses the IP the canvas shows; blanks are filled in by the backend. */
export interface DeployTopologyPayload {
  routers: Array<{ id: string; name: string; type: string; area: number; router_id?: string }>;
  links: Array<{
    id: string;
    source: string;
    target: string;
    cost: number;
    area: number;
    address_class: AddressClass;
    source_ip?: string;
    target_ip?: string;
    subnet?: string;
  }>;
}

export interface DeployLink {
  id: string;
  source: string;
  target: string;
  subnet: string;
  mask: string;
  address_class: string;
  source_ip: string;
  target_ip: string;
  cost: number;
  area: number;
  network: string;
}

export interface DeployRouter {
  id: string;
  container: string;
  area: number;
  router_id?: string;
  ip?: string;
  name?: string;
}

export interface DeployResult {
  ok: boolean;
  lab_dir: string;
  replaced_containers: string[];
  routers: DeployRouter[];
  links: DeployLink[];
  areas: number[];
  interfaces: Record<string, Record<string, string>>;
}

export interface DeployState {
  source: "designer" | "enterprise-ospf-lab" | null;
  running: boolean;
  plan: { routers: DeployRouter[]; links: DeployLink[]; areas: number[] } | null;
  interfaces: Record<string, Record<string, string>> | null;
}

/** Build the running lab from the topology drawn in the designer.
 *
 *  The canvas is the source of truth: addresses, OSPF costs and areas already
 *  on the canvas are used as given, and anything blank is allocated by the
 *  backend and returned in the result for the canvas to adopt. That returned
 *  plan is what the routers are actually configured with, verified against
 *  `show ip ospf interface` before the call returns. */
export async function deployLab(
  topology: DeployTopologyPayload,
  waitSeconds = 90
): Promise<DeployResult> {
  const response = await fetch(`${API_BASE}/api/lab/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topology, wait_seconds: waitSeconds }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Deploy"));
  return response.json();
}

/** Which lab is currently measurable, and the address plan it was built from. */
export async function getDeployState(): Promise<DeployState> {
  const response = await fetch(`${API_BASE}/api/lab/deploy`);
  if (!response.ok) throw new Error(await describeFailure(response, "Lab state"));
  return response.json();
}

export async function teardownDeployedLab(): Promise<{ removed: boolean; detail: string }> {
  const response = await fetch(`${API_BASE}/api/lab/deploy/teardown`, { method: "POST" });
  if (!response.ok) throw new Error(await describeFailure(response, "Teardown"));
  return response.json();
}

/** Bring the fixed enterprise-ospf-lab back up as the measurement target. */
export async function deployEnterpriseLab(): Promise<{ ok: boolean; lab: string }> {
  const response = await fetch(`${API_BASE}/api/lab/deploy/enterprise`, { method: "POST" });
  if (!response.ok) throw new Error(await describeFailure(response, "Deploy fixed lab"));
  return response.json();
}

/** Plan addresses without touching Docker, so the canvas can show an IP the
 *  moment a link is drawn rather than after a two-minute deploy. */
export async function previewAddresses(
  topology: DeployTopologyPayload
): Promise<DeployResult> {
  const response = await fetch(`${API_BASE}/api/lab/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topology }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Address plan"));
  return response.json();
}

export type RoutingMethod = "ospf" | "ai";

export async function getLiveAnalytics(
  source: string,
  destination: string,
  includeConvergence = false,
  method: RoutingMethod = "ospf",
  packetCount = 12
): Promise<LiveAnalytics> {
  const response = await fetch(`${API_BASE}/api/analytics/live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      destination,
      include_convergence: includeConvergence,
      method,
      packet_count: packetCount,
    }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Live measurement"));
  return response.json();
}

/** Put a chosen routing method's path into effect, or hand the pair back to OSPF.
 *
 *  `apply: true` installs one static route per hop on the routers along the
 *  chosen path; static routes beat OSPF so FRR really forwards it. `apply: false`
 *  removes them and OSPF resumes. Returns the command that ran. */
export async function setRoutingMethod(
  source: string,
  destination: string,
  method: RoutingMethod,
  apply: boolean
): Promise<{
  ok: boolean;
  applied: boolean;
  device: string;
  routers: string[];
  message: string;
  commands?: string[];
  removed?: string[];
}> {
  const response = await fetch(`${API_BASE}/api/lab/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, destination, method, apply }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Routing method"));
  return response.json();
}

export async function measureLabPath(
  source: string,
  destination: string,
  count = 5
): Promise<{
  latency_ms: number | null;
  jitter_ms: number | null;
  packet_loss_percent: number | null;
  hop_count: number | null;
  reachable: boolean;
  target_ip: string;
  command: string;
  raw: { ping: { command: string; samples: number[] } };
}> {
  const response = await fetch(`${API_BASE}/api/lab/measure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, destination, count }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Measurement"));
  return response.json();
}

export async function getDatasetStats(): Promise<DatasetStats> {
  const response = await fetch(`${API_BASE}/api/dataset`);
  if (!response.ok) throw new Error(await describeFailure(response, "Dataset stats"));
  return response.json();
}

export interface LabSweep {
  timestamp: number;
  lab: { online: boolean; device_count: number; link_count: number };
  devices: Record<string, LabDevice>;
  interfaces: Record<
    string,
    {
      container: string;
      interfaces: Array<{
        name: string;
        state: string;
        rx_bytes: number;
        rx_packets: number;
        rx_errors: number;
        rx_dropped: number;
        tx_bytes: number;
        tx_packets: number;
        tx_errors: number;
        tx_dropped: number;
      }>;
      queues: Record<
        string,
        {
          kind: string;
          queue_length: number;
          dropped: number;
          overlimits: number;
          backlog_packets: number;
        }
      >;
    }
  >;
  resources: Record<
    string,
    {
      container: string;
      cpu: { usage_percent: number };
      memory: { usage_percent: number; total_kb: number; available_kb: number };
    }
  >;
  ospf: Record<
    string,
    {
      container: string;
      neighbors: Array<{ neighbor_id: string; state: string; address: string; interface: string; full: boolean }>;
      routes: Array<{ prefix: string; distance: number; cost: number; ospf: boolean }>;
      spf: Record<string, unknown>;
    }
  >;
}

export async function getLabSweep(includeOspf = true): Promise<LabSweep> {
  const response = await fetch(`${API_BASE}/api/lab/metrics?include_ospf=${includeOspf}`);
  if (!response.ok) throw new Error(await describeFailure(response, "Lab sweep"));
  return response.json();
}

export async function collectDataset(
  maxPairs = 66
): Promise<{ status: string; pairs_requested: number; message: string }> {
  const response = await fetch(`${API_BASE}/api/dataset/collect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_pairs: maxPairs }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Dataset collection"));
  return response.json();
}

export async function applyImpairment(params: {
  device: string;
  interface?: string;
  delay?: number;
  loss?: number;
  jitter?: number;
  bandwidth?: number;
  clear?: boolean;
}): Promise<{ applied?: boolean; cleared?: boolean; errors: string[] }> {
  const response = await fetch(`${API_BASE}/api/lab/impair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interface: "eth0", ...params }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Impairment"));
  return response.json();
}

export async function setLinkState(
  device: string,
  iface: string,
  up: boolean
): Promise<{ ok: boolean; state: string; output: string }> {
  const response = await fetch(`${API_BASE}/api/lab/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device, interface: iface, up }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Link state"));
  return response.json();
}

export interface BandwidthResult {
  container: string;
  sample_seconds: number;
  rx_bytes: number;
  tx_bytes: number;
  throughput_mbps: number;
  utilization_percent: number;
}

/** Achieved throughput, derived from real /proc/net/dev counter deltas while
 *  the container generates traffic. Not a configured link speed.
 *
 *  `destination` must be a directly adjacent lab device: the backend pings
 *  source -> destination and samples the counters around it, so a remote pair
 *  would measure nothing useful. */
export async function measureBandwidth(
  source: string,
  destination: string,
  duration = 2
): Promise<BandwidthResult> {
  const response = await fetch(`${API_BASE}/api/lab/bandwidth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, destination, duration }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Throughput"));
  return response.json();
}

export interface OspfAreaInterface {
  interface: string;
  state: string;
  /** Integer form. Area 0 is the backbone. */
  area: number;
  area_dotted: string;
  address: string | null;
  network_type: string | null;
  cost: number | null;
  router_id: string | null;
}

export interface OspfAreaRouter {
  device: string;
  container: string;
  router_id: string | null;
  interfaces: OspfAreaInterface[];
  areas: number[];
  areas_dotted: string[];
  /** "ABR" when the router holds interfaces in more than one area. */
  role: string;
  backbone: boolean;
  operational: boolean;
}

export interface OspfAreaInventory {
  backbone_area: number;
  backbone_dotted: string;
  routers: OspfAreaRouter[];
  areas: number[];
  areas_dotted: string[];
  abrs: string[];
  errors: { device: string; error: string }[];
}

/** Every OSPF interface's area in the live lab, read from `show ip ospf interface`. */
export async function getOspfAreas(): Promise<OspfAreaInventory> {
  const response = await fetch(`${API_BASE}/api/lab/ospf/areas`);
  if (!response.ok) throw new Error(await describeFailure(response, "OSPF areas"));
  return response.json();
}

export interface OspfAreaPreview {
  preview: true;
  device: string;
  interface: string;
  from_area: number;
  from_area_dotted: string;
  to_area: number;
  to_area_dotted: string;
  address: string | null;
  would_become_abr: boolean;
  was_abr: boolean;
  at_risk_pairs: { source: string; destination: string; peer: string }[];
  at_risk_count: number;
  warning: string;
}

export interface OspfAreaApplied {
  preview: false;
  device: string;
  interface: string;
  from_area_dotted: string;
  to_area_dotted: string;
  role: string;
  areas_dotted: string[];
  adjacent_now: string[];
  message: string;
}

/** Preview or apply an interface area change.
 *
 *  A preview must be requested before the apply for the same device, interface
 *  and area; the backend refuses an un-previewed apply so the blast radius
 *  cannot be skipped. Area 0 is the backbone and is rejected as a target. */
export async function setOspfArea(
  device: string,
  iface: string,
  area: string,
  preview: boolean
): Promise<OspfAreaPreview | OspfAreaApplied> {
  const response = await fetch(`${API_BASE}/api/lab/ospf/area`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device, interface: iface, area, preview }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "OSPF area"));
  return response.json();
}

export interface TrafficGenerator {
  device: string;
  container: string;
  targets: string[];
  interval_seconds: number;
  started_at: number;
  running_seconds: number;
  pids: number[];
  running: boolean;
}

/** Start or stop continuous background traffic in a lab device.
 *
 *  The interface counters on this page only advance while something is sending
 *  packets. This puts a real ping loop on the wire so they do, and the UI
 *  reports the condition rather than presenting a static counter as live. */
export async function setTraffic(
  device: string,
  running: boolean,
  interval = 0.2
): Promise<{
  ok: boolean;
  already_running?: boolean;
  was_running?: boolean;
  killed?: string[];
  generator?: TrafficGenerator;
  message: string;
}> {
  const response = await fetch(`${API_BASE}/api/lab/traffic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device, running, interval }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Traffic generator"));
  return response.json();
}

/** Which devices are currently generating traffic. */
export async function getTraffic(): Promise<{ generators: TrafficGenerator[] }> {
  const response = await fetch(`${API_BASE}/api/lab/traffic`);
  if (!response.ok) throw new Error(await describeFailure(response, "Traffic generator"));
  return response.json();
}

export interface ConvergenceResult {
  convergence_ms: number | null;
  detected: boolean;
  link: { container: string; interface: string };
  post_recovery_latency_ms: number | null;
  post_recovery_loss_percent: number | null;
  /** True when the interface was up beforehand and this call put it back. */
  link_restored?: boolean;
  /** True when the interface was already down, so it is still down. */
  link_was_down_before?: boolean;
  /** False when the failed link is a cut edge, so there is nothing to fail over
   *  to and a missing convergence time is a property of the topology. */
  alternate_path_exists?: boolean;
  /** True when the pair being measured recovered without ever using the failed
   *  link, so the time says nothing about failover. */
  destination_avoided_failed_link?: boolean;
  note?: string | null;
  baseline_reachable?: boolean;
  recovered_reachable?: boolean;
  poll_attempts?: number;
  error?: string;
}

export async function measureConvergence(
  source: string,
  destination: string,
  link: { container: string; interface: string },
  timeout = 60
): Promise<ConvergenceResult> {
  const response = await fetch(`${API_BASE}/api/lab/convergence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, destination, ...link, timeout }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Convergence"));
  return response.json();
}

export interface LabReachability {
  probed: number;
  reachable_pairs: number;
  pairs: Array<{
    source: string;
    destination: string;
    reachable: boolean;
    latency_ms: number | null;
    error?: string;
  }>;
  examples: string[];
}

export async function getLabReachability(maxProbes = 400): Promise<LabReachability> {
  const response = await fetch(`${API_BASE}/api/lab/reachability?max_probes=${maxProbes}`);
  if (!response.ok) throw new Error(await describeFailure(response, "Reachability"));
  return response.json();
}
