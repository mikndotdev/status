import "server-only";

import { REVALIDATE, UPSTREAM_TIMEOUT_MS, kumaConfig } from "./config";
import type {
  Beat,
  Incident,
  MonitorStatus,
  ServiceMonitor,
  SourceError,
} from "@/lib/status/types";

interface KumaMonitor {
  id?: number;
  name?: string;
}

interface KumaGroup {
  name?: string;
  monitorList?: KumaMonitor[];
}

interface KumaIncident {
  title?: string;
  content?: string;
  style?: string;
  createdDate?: string;
  lastUpdatedDate?: string;
}

interface KumaStatusPage {
  incidents?: KumaIncident[];
  publicGroupList?: KumaGroup[];
}

interface KumaBeat {
  status?: number;
  time?: string;
  ping?: number;
}

interface KumaHeartbeat {
  heartbeatList?: Record<string, KumaBeat[]>;
  uptimeList?: Record<string, number>;
}

export interface KumaResult {
  services: ServiceMonitor[];
  incidents: Incident[];
  error: SourceError | null;
}

const BEAT_STATUS: Record<number, MonitorStatus> = {
  0: "down",
  1: "up",
  2: "pending",
  3: "maintenance",
};

const toMonitorStatus = (value: unknown): MonitorStatus =>
  typeof value === "number" ? (BEAT_STATUS[value] ?? "unknown") : "unknown";

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function mapBeats(raw: KumaBeat[] | undefined): Beat[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((beat) => ({
    status: toMonitorStatus(beat.status),
    time: str(beat.time) ?? "",
    ping: num(beat.ping),
  }));
}

async function get<T>(url: string, revalidate: number, tag: string): Promise<T | null> {
  const response = await fetch(url, {
    cache: "force-cache",
    next: { revalidate, tags: ["status", tag] },
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

export async function getKumaServices(): Promise<KumaResult> {
  const config = kumaConfig();
  if (!config) return { services: [], incidents: [], error: "unconfigured" };

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), UPSTREAM_TIMEOUT_MS),
  );

  const work = (async (): Promise<KumaResult> => {
    const [page, heartbeat] = await Promise.all([
      get<KumaStatusPage>(
        `${config.url}/api/status-page/${config.slug}`,
        REVALIDATE.kumaStatus,
        "kuma-page",
      ),
      get<KumaHeartbeat>(
        `${config.url}/api/status-page/heartbeat/${config.slug}`,
        REVALIDATE.kumaHeartbeat,
        "kuma-heartbeat",
      ),
    ]);

    if (!page) return { services: [], incidents: [], error: "invalid-response" };

    const heartbeatList = heartbeat?.heartbeatList ?? {};
    const uptimeList = heartbeat?.uptimeList ?? {};

    const services: ServiceMonitor[] = [];

    for (const group of page.publicGroupList ?? []) {
      const groupName = str(group.name) ?? "Services";
      for (const monitor of group.monitorList ?? []) {
        const id = num(monitor.id);
        const name = str(monitor.name);
        if (id === null || !name) continue;

        const beats = mapBeats(heartbeatList[String(id)]);
        const last = beats.at(-1) ?? null;

        services.push({
          id,
          name,
          group: groupName,
          serverId: null,
          iconUrl: null,
          status: last?.status ?? "unknown",
          uptime24h: num(uptimeList[`${id}_24`]),
          lastPingMs: last?.ping ?? null,
          lastCheckedAt: last?.time || null,
          beats,
        });
      }
    }

    const incidents: Incident[] = (page.incidents ?? []).map((incident) => ({
      title: str(incident.title) ?? "Incident",
      content: str(incident.content) ?? "",
      style: str(incident.style) ?? "info",
      createdAt: str(incident.createdDate),
      updatedAt: str(incident.lastUpdatedDate),
    }));

    return { services, incidents, error: null };
  })();

  try {
    return await Promise.race([work, timeout]);
  } catch {
    return { services: [], incidents: [], error: "unreachable" };
  }
}
