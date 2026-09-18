import "server-only";

import { getBeszelServers } from "./beszel";
import { getKumaServices } from "./kuma";
import { applyServerConfig, applyServiceConfig } from "./visibility";
import type { OverallStatus, StatusSnapshot } from "@/lib/status/types";

export async function getStatusSnapshot(): Promise<StatusSnapshot> {
  const [kuma, beszel] = await Promise.all([getKumaServices(), getBeszelServers()]);

  const services = applyServiceConfig(kuma.services);
  const servers = applyServerConfig(beszel.servers);

  const servicesUp = services.filter((service) => service.status === "up").length;
  const servicesDown = services.filter((service) => service.status === "down").length;
  const serversUp = servers.filter((server) => server.status === "up").length;
  const serversDown = servers.filter((server) => server.status === "down").length;

  const uptimes = services
    .map((service) => service.uptime24h)
    .filter((value): value is number => value !== null);

  const known = services.length + servers.length;
  const down = servicesDown + serversDown;
  const hasDangerIncident = kuma.incidents.some((incident) => incident.style === "danger");

  let overall: OverallStatus;
  if (kuma.error && beszel.error) {
    overall = "unknown";
  } else if (hasDangerIncident || (known > 0 && down / known >= 1 / 3)) {
    overall = "outage";
  } else if (down > 0 || kuma.incidents.length > 0) {
    overall = "degraded";
  } else if (known === 0) {
    overall = "unknown";
  } else {
    overall = "operational";
  }

  return {
    generatedAt: new Date().toISOString(),
    overall,
    summary: {
      servicesTotal: services.length,
      servicesUp,
      servicesDown,
      serversTotal: servers.length,
      serversUp,
      serversDown,
      worstUptime24h: uptimes.length > 0 ? Math.min(...uptimes) : null,
    },
    services,
    servers,
    incidents: kuma.incidents,
    sources: {
      kuma: { ok: kuma.error === null, error: kuma.error },
      beszel: { ok: beszel.error === null, error: beszel.error },
    },
  };
}
