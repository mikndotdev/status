import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CONFIG_PATH = fileURLToPath(new URL("../status.config.json", import.meta.url));

const SERVER_KEYS = new Set(["id", "name", "visible", "label", "group", "location"]);
const SERVICE_KEYS = new Set(["id", "name", "visible", "label", "group"]);

const errors: string[] = [];
const warnings: string[] = [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function describe(where: string, entry: Record<string, unknown>): string {
  const name = typeof entry.name === "string" ? ` "${entry.name}"` : "";
  return `${where}${name}`;
}

function checkOptionalString(where: string, entry: Record<string, unknown>, key: string) {
  const value = entry[key];
  if (value === undefined || value === null) return;
  if (typeof value !== "string") {
    errors.push(`${where}: ${key} must be a string or null, got ${typeof value}`);
  }
}

function checkUnknownKeys(where: string, entry: Record<string, unknown>, allowed: Set<string>) {
  for (const key of Object.keys(entry)) {
    if (!allowed.has(key)) {
      errors.push(
        `${where}: unknown field "${key}" — check for a typo (allowed: ${[...allowed].join(", ")})`,
      );
    }
  }
}

function checkCommon(where: string, entry: Record<string, unknown>) {
  if (typeof entry.name !== "string" || entry.name.length === 0) {
    errors.push(`${where}: name must be a non-empty string`);
  }
  if (typeof entry.visible !== "boolean") {
    errors.push(`${where}: visible must be a boolean (true/false, not "${String(entry.visible)}")`);
  }
  checkOptionalString(where, entry, "label");
  checkOptionalString(where, entry, "group");
}

function checkLocation(where: string, entry: Record<string, unknown>) {
  const location = entry.location;
  if (location === undefined || location === null) return;

  if (!isRecord(location)) {
    errors.push(`${where}: location must be null or { "lat": number, "lng": number }`);
    return;
  }

  const { lat, lng } = location;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    errors.push(`${where}: location.lat must be a number between -90 and 90`);
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    errors.push(`${where}: location.lng must be a number between -180 and 180`);
  }
  for (const key of Object.keys(location)) {
    if (key !== "lat" && key !== "lng") {
      errors.push(`${where}: location has unknown field "${key}"`);
    }
  }
}

function checkDuplicates(label: string, ids: unknown[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    const key = String(id);
    if (seen.has(key)) errors.push(`${label}: duplicate id ${key}`);
    seen.add(key);
  }
}

function main() {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf8");
  } catch {
    console.error(
      `status.config.json not found at ${CONFIG_PATH}\nRun \`bun run config:generate\` to create it.`,
    );
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(
      `status.config.json is not valid JSON:\n  ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }

  if (!isRecord(parsed)) {
    console.error("status.config.json must contain a JSON object");
    process.exit(1);
  }

  const servers = parsed.servers;
  const services = parsed.services;

  if (!Array.isArray(servers)) errors.push('top level: "servers" must be an array');
  if (!Array.isArray(services)) errors.push('top level: "services" must be an array');

  if (Array.isArray(servers)) {
    servers.forEach((entry, index) => {
      const where = isRecord(entry) ? describe(`servers[${index}]`, entry) : `servers[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${where}: must be an object`);
        return;
      }
      if (typeof entry.id !== "string" || entry.id.length === 0) {
        errors.push(`${where}: id must be a non-empty string (Beszel record id)`);
      }
      checkCommon(where, entry);
      checkLocation(where, entry);
      checkUnknownKeys(where, entry, SERVER_KEYS);
    });
    checkDuplicates(
      "servers",
      servers.filter(isRecord).map((entry) => entry.id),
    );
  }

  if (Array.isArray(services)) {
    services.forEach((entry, index) => {
      const where = isRecord(entry) ? describe(`services[${index}]`, entry) : `services[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${where}: must be an object`);
        return;
      }
      if (typeof entry.id !== "number" || !Number.isInteger(entry.id)) {
        errors.push(`${where}: id must be an integer (Uptime Kuma monitor id)`);
      }
      checkCommon(where, entry);
      checkUnknownKeys(where, entry, SERVICE_KEYS);
    });
    checkDuplicates(
      "services",
      services.filter(isRecord).map((entry) => entry.id),
    );
  }

  const groupOrder = parsed.groupOrder;
  const orderedGroups = new Set<string>();

  if (groupOrder !== undefined && groupOrder !== null) {
    if (!Array.isArray(groupOrder)) {
      errors.push('top level: "groupOrder" must be an array of group names');
    } else {
      groupOrder.forEach((name, index) => {
        if (typeof name !== "string" || name.length === 0) {
          errors.push(`groupOrder[${index}]: must be a non-empty string`);
          return;
        }
        if (orderedGroups.has(name)) {
          errors.push(`groupOrder: duplicate group "${name}"`);
        }
        orderedGroups.add(name);
      });
    }
  }

  if (errors.length === 0) {
    const used = new Set<string>();
    for (const entry of [
      ...(Array.isArray(servers) ? servers : []),
      ...(Array.isArray(services) ? services : []),
    ]) {
      if (!isRecord(entry) || entry.visible !== true) continue;
      if (typeof entry.group === "string" && entry.group.length > 0) used.add(entry.group);
    }
    const unordered = [...used].filter((name) => !orderedGroups.has(name));
    if (unordered.length > 0) {
      warnings.push(
        `these groups are not in groupOrder and will render last: ${unordered.join(", ")}`,
      );
    }
  }

  const visibleServers = Array.isArray(servers)
    ? servers.filter((entry) => isRecord(entry) && entry.visible === true).length
    : 0;
  const visibleServices = Array.isArray(services)
    ? services.filter((entry) => isRecord(entry) && entry.visible === true).length
    : 0;

  if (errors.length === 0 && visibleServers === 0 && visibleServices === 0) {
    warnings.push(
      'nothing is visible — the status page will render empty. Set "visible": true on the entries you want published.',
    );
  }

  if (errors.length > 0) {
    console.error(
      `status.config.json is invalid (${errors.length} problem${errors.length === 1 ? "" : "s"}):`,
    );
    for (const message of errors) console.error(`  ✗ ${message}`);
    process.exit(1);
  }

  for (const message of warnings) console.warn(`  ! ${message}`);

  const serverCount = Array.isArray(servers) ? servers.length : 0;
  const serviceCount = Array.isArray(services) ? services.length : 0;
  console.log(
    `status.config.json ok — ${visibleServers}/${serverCount} servers, ${visibleServices}/${serviceCount} services visible`,
  );
}

main();
