import "server-only";

import { REVALIDATE, UPSTREAM_TIMEOUT_MS, beszelConfig } from "./config";
import type { ServerNode, ServerStatus, SourceError } from "@/lib/status/types";

const OS_NAMES = ["Linux", "macOS", "Windows", "FreeBSD"] as const;

interface BeszelInfo {
  c?: number;
  t?: number;
  m?: string;
  u?: number;
  cpu?: number;
  mp?: number;
  dp?: number;
  bb?: number;
  g?: number;
  dt?: number;
  la?: number[];
  os?: number;
}

interface BeszelDetail {
  system?: string;
  cpu?: string;
  cores?: number;
  threads?: number;
  arch?: string;
  os_name?: string;
  memory?: number;
}

interface BeszelRecord {
  id?: string;
  name?: string;
  status?: string;
  updated?: string;
  info?: BeszelInfo;
}

export interface BeszelResult {
  servers: ServerNode[];
  error: SourceError | null;
}

let cachedToken: string | null = null;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

function shortenOs(value: string | null): string | null {
  if (!value) return null;
  const short = value
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/(\d+\.\d+)(?:\.\d+)+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return short.length > 0 ? short : null;
}

function toStatus(value: unknown): ServerStatus {
  switch (value) {
    case "up":
    case "down":
    case "paused":
    case "pending":
      return value;
    default:
      return "unknown";
  }
}

function toLoadAverage(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [a, b, c] = value;
  if (typeof a !== "number" || typeof b !== "number" || typeof c !== "number") return null;
  return [a, b, c];
}

function mapRecord(record: BeszelRecord, detail: BeszelDetail | undefined): ServerNode | null {
  const id = str(record.id);
  const name = str(record.name);
  if (!id || !name) return null;

  const info = record.info ?? {};

  return {
    id,
    name,
    group: null,
    location: null,
    role: null,
    status: toStatus(record.status),
    updatedAt: str(record.updated),
    metrics: {
      cpuPercent: num(info.cpu),
      memPercent: num(info.mp),
      diskPercent: num(info.dp),
      gpuPercent: num(info.g),
      uptimeSeconds: num(info.u),
      loadAverage: toLoadAverage(info.la),
      cores: num(detail?.cores) ?? num(info.c),
      threads: num(detail?.threads) ?? num(info.t),
      cpuModel: str(detail?.cpu) ?? str(info.m),
      osName:
        shortenOs(str(detail?.os_name)) ??
        (typeof info.os === "number" ? (OS_NAMES[info.os] ?? null) : null),
      arch: str(detail?.arch),
      memoryBytes: num(detail?.memory),
      bandwidthBytes: num(info.bb),
      tempC: num(info.dt),
    },
  };
}

async function authenticate(url: string, username: string, password: string) {
  const response = await fetch(`${url}/api/collections/users/auth-with-password`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: username, password }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { token?: unknown };
  return typeof data.token === "string" ? data.token : null;
}

const DETAIL_FIELDS = "system,cpu,cores,threads,arch,os_name,memory";

async function listDetails(url: string, token: string): Promise<Map<string, BeszelDetail>> {
  const map = new Map<string, BeszelDetail>();
  try {
    const response = await fetch(
      `${url}/api/collections/system_details/records?perPage=200&fields=${DETAIL_FIELDS}`,
      {
        cache: "force-cache",
        next: { revalidate: REVALIDATE.beszelDetails, tags: ["status", "beszel"] },
        headers: { Authorization: token },
      },
    );
    if (!response.ok) return map;

    const data = (await response.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) return map;

    for (const item of data.items) {
      const detail = item as BeszelDetail;
      const key = str(detail.system);
      if (key) map.set(key, detail);
    }
  } catch {}
  return map;
}

async function listSystems(url: string, token: string) {
  return fetch(`${url}/api/collections/systems/records?perPage=200&sort=name`, {
    cache: "force-cache",
    next: { revalidate: REVALIDATE.beszel, tags: ["status", "beszel"] },
    headers: { Authorization: token },
  });
}

export async function getBeszelServers(): Promise<BeszelResult> {
  const config = beszelConfig();
  if (!config) return { servers: [], error: "unconfigured" };

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), UPSTREAM_TIMEOUT_MS),
  );

  const work = (async (): Promise<BeszelResult> => {
    if (!cachedToken) {
      cachedToken = await authenticate(config.url, config.username, config.password);
      if (!cachedToken) return { servers: [], error: "unauthorized" };
    }

    let response = await listSystems(config.url, cachedToken);

    if (response.status === 401 || response.status === 403) {
      cachedToken = await authenticate(config.url, config.username, config.password);
      if (!cachedToken) return { servers: [], error: "unauthorized" };
      response = await listSystems(config.url, cachedToken);
    }

    if (!response.ok) return { servers: [], error: "invalid-response" };

    const data = (await response.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) return { servers: [], error: "invalid-response" };

    const details = await listDetails(config.url, cachedToken);

    const servers = data.items
      .map((item) => {
        const record = item as BeszelRecord;
        return mapRecord(record, record.id ? details.get(record.id) : undefined);
      })
      .filter((item): item is ServerNode => item !== null);

    return { servers, error: null };
  })();

  try {
    return await Promise.race([work, timeout]);
  } catch {
    return { servers: [], error: "unreachable" };
  }
}
