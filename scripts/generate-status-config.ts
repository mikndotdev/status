import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type {
  ServerConfigEntry,
  ServiceConfigEntry,
  StatusConfig,
} from "../src/lib/status/config-schema";

const CONFIG_PATH = fileURLToPath(new URL("../status.config.json", import.meta.url));

interface DiscoveredServer {
  id: string;
  name: string;
}

interface DiscoveredService {
  id: number;
  name: string;
  group: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const trimUrl = (value: string) => value.replace(/\/+$/, "");

async function discoverServers(): Promise<DiscoveredServer[]> {
  const url = trimUrl(required("BESZEL_URL"));
  const username = required("BESZEL_USERNAME");
  const password = required("BESZEL_PASSWORD");

  const auth = await fetch(`${url}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: username, password }),
  });
  if (!auth.ok) throw new Error(`Beszel auth failed (${auth.status})`);

  const { token } = (await auth.json()) as { token?: string };
  if (!token) throw new Error("Beszel auth returned no token");

  const response = await fetch(
    `${url}/api/collections/systems/records?perPage=200&sort=name&fields=id,name`,
    { headers: { Authorization: token } },
  );
  if (!response.ok) throw new Error(`Beszel systems request failed (${response.status})`);

  const { items } = (await response.json()) as { items?: DiscoveredServer[] };
  return (items ?? []).filter((item) => item.id && item.name);
}

async function discoverServices(): Promise<DiscoveredService[]> {
  const url = trimUrl(required("UPTIME_KUMA_URL"));
  const slug = required("UPTIME_KUMA_STATUS_SLUG");

  const response = await fetch(`${url}/api/status-page/${slug}`);
  if (!response.ok) throw new Error(`Uptime Kuma request failed (${response.status})`);

  const page = (await response.json()) as {
    publicGroupList?: { name?: string; monitorList?: { id?: number; name?: string }[] }[];
  };

  const services: DiscoveredService[] = [];
  for (const group of page.publicGroupList ?? []) {
    for (const monitor of group.monitorList ?? []) {
      if (typeof monitor.id !== "number" || !monitor.name) continue;
      services.push({
        id: monitor.id,
        name: monitor.name,
        group: group.name ?? "Services",
      });
    }
  }
  return services;
}

function readExisting(): StatusConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as StatusConfig;
  } catch {
    return { servers: [], services: [] };
  }
}

function mergeServers(existing: ServerConfigEntry[], found: DiscoveredServer[]) {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const foundIds = new Set(found.map((item) => item.id));

  const kept: ServerConfigEntry[] = [];
  for (const entry of existing) {
    const match = found.find((item) => item.id === entry.id);
    if (match) kept.push({ ...entry, name: match.name });
  }

  const added = found.filter((item) => !byId.has(item.id));
  for (const item of added) {
    kept.push({
      id: item.id,
      name: item.name,
      visible: false,
      label: null,
      group: null,
      location: null,
    });
  }

  const removed = existing.filter((entry) => !foundIds.has(entry.id));
  return { entries: kept, added, removed };
}

function mergeServices(existing: ServiceConfigEntry[], found: DiscoveredService[]) {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const foundIds = new Set(found.map((item) => item.id));

  const kept: ServiceConfigEntry[] = [];
  for (const entry of existing) {
    const match = found.find((item) => item.id === entry.id);
    if (match) kept.push({ ...entry, name: match.name });
  }

  const added = found.filter((item) => !byId.has(item.id));
  for (const item of added) {
    kept.push({
      id: item.id,
      name: item.name,
      visible: false,
      label: null,
      group: null,
    });
  }

  const removed = existing.filter((entry) => !foundIds.has(entry.id));
  return { entries: kept, added, removed };
}

async function main() {
  const existing = readExisting();

  const [servers, services] = await Promise.all([discoverServers(), discoverServices()]);

  const mergedServers = mergeServers(existing.servers ?? [], servers);
  const mergedServices = mergeServices(existing.services ?? [], services);

  const config: StatusConfig = {
    generatedAt: new Date().toISOString(),
    groupOrder: existing.groupOrder ?? [],
    servers: mergedServers.entries,
    services: mergedServices.entries,
  };

  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const report = (
    label: string,
    merged: {
      entries: { visible: boolean }[];
      added: { name: string }[];
      removed: { name: string }[];
    },
  ) => {
    const visible = merged.entries.filter((entry) => entry.visible).length;
    console.log(`${label}: ${visible}/${merged.entries.length} visible`);
    if (merged.added.length > 0) {
      console.log(
        `  + ${merged.added.length} new (hidden): ${merged.added.map((i) => i.name).join(", ")}`,
      );
    }
    if (merged.removed.length > 0) {
      console.log(
        `  - ${merged.removed.length} removed: ${merged.removed.map((i) => i.name).join(", ")}`,
      );
    }
  };

  console.log(`Wrote ${CONFIG_PATH}`);
  report("Servers", mergedServers);
  report("Services", mergedServices);

  if (mergedServers.added.length > 0 || mergedServices.added.length > 0) {
    console.log('\nNew entries are hidden by default — set "visible": true to publish them.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
