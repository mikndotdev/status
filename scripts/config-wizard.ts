import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Separator, checkbox, confirm, input, number, select } from "@inquirer/prompts";

import type {
  ServerConfigEntry,
  ServerRole,
  ServiceConfigEntry,
  StatusConfig,
} from "../src/lib/status/config-schema";

const CONFIG_PATH = fileURLToPath(new URL("../status.config.json", import.meta.url));
const VALIDATOR_PATH = fileURLToPath(new URL("./validate-status-config.ts", import.meta.url));

interface DiscoveredServer {
  id: string;
  name: string;
}

interface DiscoveredService {
  id: number;
  name: string;
  group: string;
}

const NONE = "__none__";
const NEW_GROUP = "__new_group__";
const BACK = "__back__";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const trimUrl = (value: string) => value.replace(/\/+$/, "");

const orNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

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
      services.push({ id: monitor.id, name: monitor.name, group: group.name ?? "Services" });
    }
  }
  return services;
}

function readExisting(): StatusConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as StatusConfig;
  } catch {
    return { groupOrder: [], servers: [], services: [] };
  }
}

function mergeServers(existing: ServerConfigEntry[], found: DiscoveredServer[]) {
  const known = new Map(existing.map((entry) => [entry.id, entry]));
  const entries: ServerConfigEntry[] = [];
  const added: DiscoveredServer[] = [];

  for (const entry of existing) {
    const match = found.find((item) => item.id === entry.id);
    if (match) entries.push({ ...entry, name: match.name });
  }
  for (const item of found) {
    if (known.has(item.id)) continue;
    added.push(item);
    entries.push({
      id: item.id,
      name: item.name,
      visible: false,
      label: null,
      group: null,
      location: null,
      role: null,
    });
  }

  const foundIds = new Set(found.map((item) => item.id));
  const removed = existing.filter((entry) => !foundIds.has(entry.id));
  return { entries, added, removed };
}

function mergeServices(existing: ServiceConfigEntry[], found: DiscoveredService[]) {
  const known = new Map(existing.map((entry) => [entry.id, entry]));
  const entries: ServiceConfigEntry[] = [];
  const added: DiscoveredService[] = [];

  for (const entry of existing) {
    const match = found.find((item) => item.id === entry.id);
    if (match) entries.push({ ...entry, name: match.name });
  }
  for (const item of found) {
    if (known.has(item.id)) continue;
    added.push(item);
    entries.push({
      id: item.id,
      name: item.name,
      visible: false,
      label: null,
      group: null,
      server: null,
      icon: null,
    });
  }

  const foundIds = new Set(found.map((item) => item.id));
  const removed = existing.filter((entry) => !foundIds.has(entry.id));
  return { entries, added, removed };
}

function serverSummary(entry: ServerConfigEntry): string {
  const bits = [entry.visible ? "shown" : "hidden"];
  if (entry.group) bits.push(entry.group);
  if (entry.label) bits.push(`"${entry.label}"`);
  if (entry.location) bits.push(`${entry.location.lat}, ${entry.location.lng}`);
  if (entry.role) bits.push(entry.role);
  return `${entry.name}  (${bits.join(" · ")})`;
}

function serviceSummary(entry: ServiceConfigEntry, servers: ServerConfigEntry[]): string {
  const bits = [entry.visible ? "shown" : "hidden"];
  const host = servers.find((server) => server.id === entry.server);
  if (host) bits.push(`on ${host.name}`);
  if (entry.label) bits.push(`"${entry.label}"`);
  if (entry.icon) bits.push("icon");
  return `${entry.name}  (${bits.join(" · ")})`;
}

async function editVisibility<T extends { id: string | number; name: string; visible: boolean }>(
  entries: T[],
  message: string,
) {
  const picked = await checkbox({
    message,
    pageSize: 15,
    choices: entries.map((entry) => ({
      name: entry.name,
      value: entry.id,
      checked: entry.visible,
    })),
  });
  const chosen = new Set<string | number>(picked);
  for (const entry of entries) entry.visible = chosen.has(entry.id);
}

async function pickGroup(current: string | null, known: string[]): Promise<string | null> {
  const choice = await select({
    message: "Group",
    default: current ?? NONE,
    choices: [
      { name: "No group", value: NONE },
      ...known.map((name) => ({ name, value: name })),
      { name: "New group…", value: NEW_GROUP },
    ],
  });
  if (choice === NONE) return null;
  if (choice === NEW_GROUP) return orNull(await input({ message: "Group name" }));
  return choice;
}

async function editServerDetails(servers: ServerConfigEntry[], knownGroups: string[]) {
  for (;;) {
    const id = await select({
      message: "Configure which server?",
      pageSize: 15,
      choices: [
        ...servers.map((entry) => ({ name: serverSummary(entry), value: entry.id })),
        new Separator(),
        { name: "Back", value: BACK },
      ],
    });
    if (id === BACK) return;

    const entry = servers.find((server) => server.id === id);
    if (!entry) continue;

    entry.label = orNull(
      await input({ message: `Display name for ${entry.name}`, default: entry.label ?? "" }),
    );
    entry.group = await pickGroup(entry.group ?? null, knownGroups);

    const setLocation = await confirm({
      message: "Set map coordinates?",
      default: entry.location != null,
    });
    if (!setLocation) {
      entry.location = null;
      continue;
    }

    const lat = await number({
      message: "Latitude",
      default: entry.location?.lat,
      min: -90,
      max: 90,
    });
    const lng = await number({
      message: "Longitude",
      default: entry.location?.lng,
      min: -180,
      max: 180,
    });
    entry.location = lat != null && lng != null ? { lat, lng } : null;

    const role = await select({
      message: "Role",
      default: entry.role ?? NONE,
      choices: [
        { name: "Regular server", value: NONE },
        {
          name: "Hub — signal arcs route through this one",
          value: "hub",
        },
      ],
    });
    entry.role = role === NONE ? null : (role as ServerRole);

    if (entry.role === "hub") {
      for (const other of servers) {
        if (other !== entry && other.role === "hub") other.role = null;
      }
    }
  }
}

async function editServiceDetails(
  services: ServiceConfigEntry[],
  servers: ServerConfigEntry[],
  knownGroups: string[],
) {
  const visibleServers = servers.filter((server) => server.visible);

  for (;;) {
    const id = await select({
      message: "Configure which service?",
      pageSize: 15,
      choices: [
        ...services.map((entry) => ({
          name: serviceSummary(entry, servers),
          value: String(entry.id),
        })),
        new Separator(),
        { name: "Back", value: BACK },
      ],
    });
    if (id === BACK) return;

    const entry = services.find((service) => String(service.id) === id);
    if (!entry) continue;

    entry.label = orNull(
      await input({ message: `Display name for ${entry.name}`, default: entry.label ?? "" }),
    );

    const host = await select({
      message: "Runs on which server?",
      default: entry.server ?? NONE,
      pageSize: 15,
      choices: [
        { name: "Not attached — show in the Services list", value: NONE },
        ...visibleServers.map((server) => ({
          name: server.label ?? server.name,
          value: server.id,
        })),
      ],
    });
    entry.server = host === NONE ? null : host;

    entry.icon = orNull(
      await input({
        message: "Icon — full image URL, or a domain for favicone (blank for none)",
        default: entry.icon ?? "",
      }),
    );

    entry.group = await pickGroup(entry.group ?? null, knownGroups);
  }
}

async function editGroupOrder(order: string[], used: string[]): Promise<string[]> {
  if (used.length === 0) {
    console.log("  No groups are in use yet.");
    return order;
  }

  const rank = (name: string) => {
    const index = order.indexOf(name);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  const ranked: string[] = [];
  const remaining = [...used].sort((a, b) => rank(a) - rank(b));

  while (remaining.length > 1) {
    const next = await select({
      message: `Group #${ranked.length + 1} from the top`,
      choices: remaining.map((name) => ({ name, value: name })),
    });
    ranked.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  ranked.push(...remaining);
  return ranked;
}

function summarise(config: StatusConfig) {
  const servers = config.servers.filter((entry) => entry.visible);
  const services = config.services.filter((entry) => entry.visible);
  const attached = services.filter((entry) => entry.server);
  const orphaned = attached.filter((entry) => !servers.some((s) => s.id === entry.server));

  console.log();
  console.log(`  Servers   ${servers.length}/${config.servers.length} shown`);
  console.log(`  Services  ${services.length}/${config.services.length} shown`);
  console.log(`  Attached  ${attached.length} service(s) to a server`);
  console.log(`  Groups    ${(config.groupOrder ?? []).join(" → ") || "none ordered"}`);
  const hub = servers.find((entry) => entry.role === "hub");
  console.log(`  Hub       ${hub ? hub.name : "none set — signal arcs will not play"}`);

  if (orphaned.length > 0) {
    console.log();
    console.log(
      `  ! ${orphaned.length} service(s) point at a hidden server and will fall back to the Services list:`,
    );
    for (const entry of orphaned) console.log(`      ${entry.name}`);
  }
  console.log();
}

function write(config: StatusConfig) {
  const output: StatusConfig = {
    generatedAt: new Date().toISOString(),
    groupOrder: config.groupOrder ?? [],
    servers: config.servers.map((entry) => ({
      id: entry.id,
      name: entry.name,
      visible: entry.visible,
      label: entry.label ?? null,
      group: entry.group ?? null,
      location: entry.location ?? null,
      role: entry.role ?? null,
    })),
    services: config.services.map((entry) => ({
      id: entry.id,
      name: entry.name,
      visible: entry.visible,
      label: entry.label ?? null,
      group: entry.group ?? null,
      server: entry.server ?? null,
      icon: entry.icon ?? null,
    })),
  };
  writeFileSync(CONFIG_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error("config:generate is an interactive wizard and needs a TTY. Run it in a terminal.");
    process.exit(1);
  }

  const existing = readExisting();

  console.log("Fetching servers from Beszel and services from Uptime Kuma…");
  const [foundServers, foundServices] = await Promise.all([discoverServers(), discoverServices()]);

  const mergedServers = mergeServers(existing.servers ?? [], foundServers);
  const mergedServices = mergeServices(existing.services ?? [], foundServices);

  const config: StatusConfig = {
    groupOrder: existing.groupOrder ?? [],
    servers: mergedServers.entries,
    services: mergedServices.entries,
  };

  console.log(`Found ${foundServers.length} server(s) and ${foundServices.length} service(s).`);
  for (const [label, merged] of [
    ["server", mergedServers],
    ["service", mergedServices],
  ] as const) {
    if (merged.added.length > 0) {
      const names = merged.added.map((item) => item.name).join(", ");
      console.log(`  + ${merged.added.length} new ${label}(s), hidden by default: ${names}`);
    }
    if (merged.removed.length > 0) {
      const names = merged.removed.map((item) => item.name).join(", ");
      console.log(`  - ${merged.removed.length} ${label}(s) gone upstream, dropped: ${names}`);
    }
  }

  const groupOfService = (entry: ServiceConfigEntry) =>
    entry.group ?? foundServices.find((item) => item.id === entry.id)?.group ?? null;

  const collectGroups = (visibleOnly: boolean) => [
    ...new Set(
      [
        ...config.servers.filter((e) => !visibleOnly || e.visible).map((e) => e.group ?? null),
        ...config.services.filter((e) => !visibleOnly || e.visible).map(groupOfService),
      ].filter((name): name is string => !!name),
    ),
  ];

  for (;;) {
    const knownGroups = collectGroups(false);
    const shownServers = config.servers.filter((e) => e.visible).length;
    const shownServices = config.services.filter((e) => e.visible).length;

    const action = await select({
      message: "What would you like to configure?",
      pageSize: 12,
      choices: [
        {
          name: `Servers — which are shown  (${shownServers}/${config.servers.length})`,
          value: "server-visibility",
        },
        { name: "Servers — name, group, coordinates", value: "server-details" },
        new Separator(),
        {
          name: `Services — which are shown  (${shownServices}/${config.services.length})`,
          value: "service-visibility",
        },
        { name: "Services — name, icon, which server it runs on", value: "service-details" },
        new Separator(),
        { name: `Group order  (${knownGroups.length} group(s) in use)`, value: "group-order" },
        new Separator(),
        { name: "Review and save", value: "save" },
        { name: "Quit without saving", value: "quit" },
      ],
    });

    if (action === "server-visibility") {
      await editVisibility(config.servers, "Which servers should be shown?");
    } else if (action === "server-details") {
      await editServerDetails(config.servers, knownGroups);
    } else if (action === "service-visibility") {
      await editVisibility(config.services, "Which services should be shown?");
    } else if (action === "service-details") {
      await editServiceDetails(config.services, config.servers, knownGroups);
    } else if (action === "group-order") {
      config.groupOrder = await editGroupOrder(config.groupOrder ?? [], collectGroups(true));
    } else if (action === "save") {
      summarise(config);
      const ok = await confirm({ message: `Write ${CONFIG_PATH}?`, default: true });
      if (!ok) continue;
      write(config);
      console.log("Saved.");
      const check = spawnSync("bun", [VALIDATOR_PATH], { stdio: "inherit" });
      process.exit(check.status ?? 0);
    } else if (action === "quit") {
      const discard = await confirm({ message: "Discard all changes?", default: false });
      if (discard) {
        console.log("Nothing written.");
        return;
      }
    }
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.name === "ExitPromptError") {
    console.log("\nCancelled — nothing written.");
    process.exit(0);
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
