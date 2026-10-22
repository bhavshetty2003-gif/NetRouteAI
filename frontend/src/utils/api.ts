import { API_BASE } from "./config";

/**
 * `fetch` that explains a *network* failure instead of saying "Failed to fetch".
 *
 * A rejected fetch is not an HTTP error: the request never got an answer, so
 * there is no status code and no `detail` to show. The browser's own message
 * for it is "Failed to fetch", which tells the reader nothing they can act
 * on -- it does not say which address was unreachable, and it does not say
 * that the backend is probably not running. `describeFailure` covers the other
 * case (an answer that arrived with an error status); this covers the one it
 * cannot.
 *
 * The port hint is only true in the dev layout, where the browser does talk
 * to :8000 directly. In a deployed build `API_BASE` is "" -- same origin,
 * through nginx -- so there is no port 8000 for the visitor to check, and
 * naming one sends them looking at their own machine's port 8000.
 */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    const where = input || "this origin";
    const hint = API_BASE
      ? " Is the backend running on port 8000?"
      : " The server did not answer.";
    throw new Error(
      `Could not reach the API at ${where}.${hint} ` +
        `(${err instanceof Error ? err.message : String(err)})`
    );
  }
}

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

/** What `/api/routing/recommend` answers with.
 *
 *  The figures here are measured on the running lab when the lab really is
 *  the uploaded canvas, and modelled from the canvas when it is not --
 *  `measurement_basis` says which, so nothing has to be guessed from the
 *  numbers themselves. */
export interface AiRouteRecommendation {
  algorithm: string;
  best_route: string[];
  /** End-to-end latency in ms, measured by real ICMP echo requests. Null when
   *  there was no lab to measure against -- never a modelled sum presented as
   *  an observation. */
  latency: number | null;
  confidence: number;
  hop_count: number;
  total_cost: number;
  /** The path's graph-derived figures. Every one of them is optional: a path
   *  with an unmeasured hop has no end-to-end latency, and the backend sends
   *  null rather than a number for it. */
  metrics: Record<string, number | null>;
  path?: string[];
  model: string;
  quality_score: number;
  path_ranking: Array<Record<string, unknown>>;
  /** "live lab" when every figure came from a command run in a container,
   *  "canvas topology" when only the drawn graph was available. */
  measurement_basis: string;
  measurement_note: string;
  /** Which rows the Random Forest was fitted on. */
  training_basis: string;
  /** How far ahead of the runner-up the recommended path is. */
  margin: number;
  measured?: Record<string, unknown> | null;
}

export async function uploadTopology(
  topology: Topology
): Promise<{ topology_id: string; status: string; validation: any }> {
  const response = await apiFetch(`${API_BASE}/upload-topology`, {
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
  const response = await apiFetch(`${API_BASE}/api/routing/recommend`, {
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
  /** Candidate paths the model ranked.
   *
   *  These are *estimates*: they come from the graph's edge attributes, not
   *  from a wire. Only the selected path is measured, and its measurements are
   *  in `end_to_end` and in the per-method route reports. The names say
   *  "estimated" so an estimate cannot be read as a reading. */
  ai_ranking: Array<{
    path: string[];
    quality: number;
    estimated_latency_ms: number;
    estimated_bandwidth_mbps: number;
    estimated_packet_loss_percent: number;
    total_cost: number;
    hop_count: number;
    measured: false;
  }>;
  /** What the candidate estimates above are derived from. */
  ai_ranking_basis: string;
  model: string;
  /** What actually scored the paths. "heuristic" means no trained model was
   *  available, so the page must not call the result a Random Forest. */
  training_basis: string;
  confidence: number;
  comparison: { rows: ComparisonRow[] };
  /** The link a convergence measurement would break. The measurement itself is
   *  its own endpoint, because it takes the link down. */
  convergence_link?: { container: string; interface: string } | null;
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
  const response = await apiFetch(`${API_BASE}/api/lab/status`);
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

/** What the deploy did about OSPF convergence.
 *
 *  A deploy returns once the routers have finished learning the topology, so
 *  "deployed" means "ready to measure" rather than "the containers are up".
 *  `converged: false` means the lab is running but its routing tables were
 *  still settling when the wait ran out, and the numbers it gives are what
 *  was true at that moment. */
export interface DeployConvergence {
  converged: boolean;
  waited_seconds: number;
  settled_seconds?: number;
  /** Routes each router held when the wait ended. */
  routes?: Record<string, number>;
  /** OSPF neighbours each router had reached the Full state. */
  neighbours?: Record<string, number>;
  /** How many neighbours each router should have, from the plan. */
  expected_neighbours?: Record<string, number>;
  detail?: string;
}

export interface DeployResult {
  ok: boolean;
  lab_dir: string;
  replaced_containers: string[];
  routers: DeployRouter[];
  links: DeployLink[];
  areas: number[];
  interfaces: Record<string, Record<string, string>>;
  /** Anything the backend had to change, said out loud.
   *
   *  A link that was given an address this machine is already using is moved
   *  off it -- Docker gives every network it creates a route on the host, and
   *  a route for the network the laptop is on takes the laptop's own traffic
   *  away from its router. The move is reported rather than done quietly. */
  notes?: string[];
  convergence?: DeployConvergence;
}

export interface DeployState {
  source: "designer" | null;
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
  const response = await apiFetch(`${API_BASE}/api/lab/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topology, wait_seconds: waitSeconds }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Deploy"));
  return response.json();
}

/** Which lab is currently measurable, and the address plan it was built from. */
export async function getDeployState(): Promise<DeployState> {
  const response = await apiFetch(`${API_BASE}/api/lab/deploy`);
  if (!response.ok) throw new Error(await describeFailure(response, "Lab state"));
  return response.json();
}

export async function teardownDeployedLab(): Promise<{ removed: boolean; detail: string }> {
  const response = await apiFetch(`${API_BASE}/api/lab/deploy/teardown`, { method: "POST" });
  if (!response.ok) throw new Error(await describeFailure(response, "Teardown"));
  return response.json();
}

/** Plan addresses without touching Docker, so the canvas can show an IP the
 *  moment a link is drawn rather than after a two-minute deploy. */
export async function previewAddresses(
  topology: DeployTopologyPayload
): Promise<DeployResult> {
  const response = await apiFetch(`${API_BASE}/api/lab/plan`, {
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
  method: RoutingMethod = "ospf",
  packetCount = 12
): Promise<LiveAnalytics> {
  const response = await apiFetch(`${API_BASE}/api/analytics/live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      destination,
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
  const response = await apiFetch(`${API_BASE}/api/lab/route`, {
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
  const response = await apiFetch(`${API_BASE}/api/lab/measure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, destination, count }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Measurement"));
  return response.json();
}

export async function collectDataset(
  maxPairs = 66
): Promise<{ status: string; pairs_requested: number; message: string }> {
  const response = await apiFetch(`${API_BASE}/api/dataset/collect`, {
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
  const response = await apiFetch(`${API_BASE}/api/lab/impair`, {
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
  const response = await apiFetch(`${API_BASE}/api/lab/link`, {
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
  /** The interface the headline figure came from. A probe is one flow, so it
   *  crosses exactly one egress interface; anything else moving during the
   *  sample is unrelated traffic and is reported separately rather than added in. */
  measured_interface?: string | null;
  per_interface?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  source?: string;
  destination?: string;
  peers_pinged?: string[];
  /** False when nothing answered and the counters never moved. */
  reachable?: boolean;
  note?: string;
}

export interface LabPingResult {
  device: string;
  target: string;
  source: string;
  command: string;
  reachable: boolean;
  sent: number;
  received: number;
  loss_percent: number;
  rtt_min_ms: number | null;
  rtt_avg_ms: number | null;
  rtt_max_ms: number | null;
  jitter_ms: number | null;
  /** The per-packet reply lines, in order. */
  replies: string[];
  /** The command's unedited stdout. */
  output: string;
  exit_code: number;
}

/** Ping a literal address from a lab router's own container.
 *
 *  The designer's CLI asks about whatever address the user types, which is not
 *  necessarily one the discovery index knows, so it cannot go through the
 *  source/destination measurement path. */
export async function pingLabDevice(
  device: string,
  target: string,
  count = 5
): Promise<LabPingResult> {
  const response = await apiFetch(`${API_BASE}/api/lab/ping`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device, target, count }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "ping"));
  return response.json();
}

/** Achieved throughput, derived from real /proc/net/dev counter deltas while
 *  the container generates traffic. Not a configured link speed.
 *
 *  `destination` is the peer actually pinged. It does not have to be adjacent:
 *  the counters being sampled are the source container's own, and they move for
 *  a destination several hops away just as they do for a neighbour. */
export async function measureBandwidth(
  source: string,
  destination: string,
  duration = 2
): Promise<BandwidthResult> {
  const response = await apiFetch(`${API_BASE}/api/lab/bandwidth`, {
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
  const response = await apiFetch(`${API_BASE}/api/lab/ospf/areas`);
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
  const response = await apiFetch(`${API_BASE}/api/lab/ospf/area`, {
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
  const response = await apiFetch(`${API_BASE}/api/lab/traffic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device, running, interval }),
  });
  if (!response.ok) throw new Error(await describeFailure(response, "Traffic generator"));
  return response.json();
}

/** Which devices are currently generating traffic. */
export async function getTraffic(): Promise<{ generators: TrafficGenerator[] }> {
  const response = await apiFetch(`${API_BASE}/api/lab/traffic`);
  if (!response.ok) throw new Error(await describeFailure(response, "Traffic generator"));
  return response.json();
}

export interface ConvergenceResult {
  convergence_ms: number | null;
  detected: boolean;
  /** The link that was broken. Absent when the measurement failed before a
   *  link was chosen, so it must never be dereferenced unguarded. */
  link?: { container: string; interface: string };
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

/** Time how long the network takes to recover from a link failure.
 *
 *  `link` is optional: left out, the backend picks the first transit interface
 *  on the path between the two routers, which is the link whose failure the
 *  figure is actually about. Breaking some other link would measure a failure
 *  the pair never experienced. */
export async function measureConvergence(
  source: string,
  destination: string,
  link?: { container: string; interface: string },
  timeout = 60
): Promise<ConvergenceResult> {
  const response = await apiFetch(`${API_BASE}/api/lab/convergence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, destination, ...(link ?? {}), timeout }),
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
  const response = await apiFetch(`${API_BASE}/api/lab/reachability?max_probes=${maxProbes}`);
  if (!response.ok) throw new Error(await describeFailure(response, "Reachability"));
  return response.json();
}
