import type { GeoLocation, ServerRole } from "@/lib/status/config-schema";

export type ServerStatus = "up" | "down" | "paused" | "pending" | "unknown";
export type MonitorStatus = "up" | "down" | "pending" | "maintenance" | "unknown";
export type SourceError = "unconfigured" | "unauthorized" | "unreachable" | "invalid-response";
export type OverallStatus = "operational" | "degraded" | "outage" | "unknown";

export interface ServerMetrics {
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  gpuPercent: number | null;
  uptimeSeconds: number | null;
  loadAverage: [number, number, number] | null;
  cores: number | null;
  threads: number | null;
  cpuModel: string | null;
  osName: string | null;
  arch: string | null;
  memoryBytes: number | null;
  bandwidthBytes: number | null;
  tempC: number | null;
}

export interface ServerNode {
  id: string;
  name: string;
  group: string | null;
  role: ServerRole | null;
  location: GeoLocation | null;
  status: ServerStatus;
  updatedAt: string | null;
  metrics: ServerMetrics;
}

export interface Beat {
  status: MonitorStatus;
  time: string;
  ping: number | null;
}

export interface ServiceMonitor {
  id: number;
  name: string;
  group: string;
  serverId: string | null;
  iconUrl: string | null;
  status: MonitorStatus;
  uptime24h: number | null;
  lastPingMs: number | null;
  lastCheckedAt: string | null;
  beats: Beat[];
}

export interface Incident {
  title: string;
  content: string;
  style: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SourceHealth {
  ok: boolean;
  error: SourceError | null;
}

export interface StatusSummary {
  servicesTotal: number;
  servicesUp: number;
  servicesDown: number;
  serversTotal: number;
  serversUp: number;
  serversDown: number;
  worstUptime24h: number | null;
}

export interface StatusSnapshot {
  generatedAt: string;
  overall: OverallStatus;
  summary: StatusSummary;
  services: ServiceMonitor[];
  servers: ServerNode[];
  incidents: Incident[];
  sources: {
    kuma: SourceHealth;
    beszel: SourceHealth;
  };
}
