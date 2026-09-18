import "server-only";

import rawConfig from "../../../status.config.json";
import type {
  ServerConfigEntry,
  ServiceConfigEntry,
  StatusConfig,
} from "@/lib/status/config-schema";
import type { ServerNode, ServiceMonitor } from "@/lib/status/types";

const config = rawConfig as StatusConfig;

const UNRANKED = Number.MAX_SAFE_INTEGER;

const serverEntries = new Map<string, { entry: ServerConfigEntry; order: number }>();
config.servers?.forEach((entry, order) => serverEntries.set(entry.id, { entry, order }));

const serviceEntries = new Map<number, { entry: ServiceConfigEntry; order: number }>();
config.services?.forEach((entry, order) => serviceEntries.set(entry.id, { entry, order }));

const groupRank = new Map<string, number>();
config.groupOrder?.forEach((name, index) => groupRank.set(name, index));

const visibleServerIds = new Set<string>();
config.servers?.forEach((entry) => {
  if (entry.visible) visibleServerIds.add(entry.id);
});

const FAVICONE = "https://favicone.com";
const ABSOLUTE_URL = /^https?:\/\//i;

function resolveIcon(icon: string | null | undefined): string | null {
  const value = icon?.trim();
  if (!value) return null;
  if (ABSOLUTE_URL.test(value)) return value;
  return `${FAVICONE}/${encodeURIComponent(value)}?s=64`;
}

function rankOf(group: string | null | undefined): number {
  if (group == null || group === "") return UNRANKED;
  return groupRank.get(group) ?? UNRANKED;
}

function byGroupThenOrder(a: { rank: number; order: number }, b: { rank: number; order: number }) {
  return a.rank - b.rank || a.order - b.order;
}

if (
  process.env.NODE_ENV !== "production" &&
  serverEntries.size === 0 &&
  serviceEntries.size === 0
) {
  console.warn(
    '[status] status.config.json is empty — nothing will be shown. Run `bun run config:generate`, then set "visible": true on the entries you want published.',
  );
}

export function applyServerConfig(servers: ServerNode[]): ServerNode[] {
  const ordered: { rank: number; order: number; node: ServerNode }[] = [];

  for (const server of servers) {
    const match = serverEntries.get(server.id);
    if (!match || !match.entry.visible) continue;
    const group = match.entry.group ?? null;
    ordered.push({
      rank: rankOf(group),
      order: match.order,
      node: {
        ...server,
        name: match.entry.label ?? server.name,
        group,
        location: match.entry.location ?? null,
        role: match.entry.role ?? null,
      },
    });
  }

  return ordered.sort(byGroupThenOrder).map((item) => item.node);
}

export function applyServiceConfig(services: ServiceMonitor[]): ServiceMonitor[] {
  const ordered: { rank: number; order: number; node: ServiceMonitor }[] = [];

  for (const service of services) {
    const match = serviceEntries.get(service.id);
    if (!match || !match.entry.visible) continue;
    const group = match.entry.group ?? service.group;
    const serverId = match.entry.server ?? null;
    ordered.push({
      rank: rankOf(group),
      order: match.order,
      node: {
        ...service,
        name: match.entry.label ?? service.name,
        group,
        serverId: serverId && visibleServerIds.has(serverId) ? serverId : null,
        iconUrl: resolveIcon(match.entry.icon),
      },
    });
  }

  return ordered.sort(byGroupThenOrder).map((item) => item.node);
}
