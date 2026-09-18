"use client";

import useSWR from "swr";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { jsonFetcher } from "@/lib/fetcher";
import type { MonitorStatus, ServerNode, ServiceMonitor, StatusSnapshot } from "@/lib/status/types";
import {
  formatBytes,
  formatPercent,
  formatPing,
  formatLocalTime,
  formatTime,
  formatUptime,
  formatUptimePercent,
} from "@/lib/status/format";

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const group = key(item);
    const list = map.get(group) ?? [];
    list.push(item);
    map.set(group, list);
  }
  return [...map.entries()];
}

const OVERALL: Record<
  StatusSnapshot["overall"],
  { label: string; dot: string; ring: string; text: string }
> = {
  operational: {
    label: "All systems operational",
    dot: "bg-emerald-400",
    ring: "ring-emerald-400/30 bg-emerald-400/10",
    text: "text-emerald-300",
  },
  degraded: {
    label: "Degraded performance",
    dot: "bg-amber-400",
    ring: "ring-amber-400/30 bg-amber-400/10",
    text: "text-amber-300",
  },
  outage: {
    label: "Major outage",
    dot: "bg-red-400",
    ring: "ring-red-400/30 bg-red-400/10",
    text: "text-red-300",
  },
  unknown: {
    label: "Status unavailable",
    dot: "bg-zinc-400",
    ring: "ring-zinc-400/30 bg-zinc-400/10",
    text: "text-zinc-300",
  },
};

const MONITOR_DOT: Record<MonitorStatus, string> = {
  up: "bg-emerald-400",
  down: "bg-red-400",
  pending: "bg-amber-400",
  maintenance: "bg-sky-400",
  unknown: "bg-zinc-500",
};

const MONITOR_LABEL: Record<MonitorStatus, string> = {
  up: "Operational",
  down: "Down",
  pending: "Pending",
  maintenance: "Maintenance",
  unknown: "Unknown",
};

const BEAT_COLOR: Record<MonitorStatus, string> = {
  up: "bg-emerald-400",
  down: "bg-red-400",
  pending: "bg-amber-400",
  maintenance: "bg-sky-400",
  unknown: "bg-zinc-600",
};

function MetricBar({ label, value }: { label: string; value: number | null }) {
  const pct = value === null ? 0 : Math.min(Math.max(value, 0), 100);
  const tone = pct >= 90 ? "bg-red-400" : pct >= 75 ? "bg-amber-400" : "bg-primary";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-foreground/60">{label}</span>
        <span className="font-medium tabular-nums text-foreground/90">
          {formatPercent(value, 1)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Heartbeats({ beats }: { beats: ServiceMonitor["beats"] }) {
  const recent = beats.slice(-40);
  if (recent.length === 0) return null;

  return (
    <div
      className="flex min-w-0 flex-1 items-end gap-[2px] md:flex-none md:gap-[3px]"
      aria-hidden="true"
    >
      {recent.map((beat, index) => (
        <span
          key={index}
          title={`${MONITOR_LABEL[beat.status]} · ${formatTime(beat.time)}`}
          className={`h-5 min-w-0 flex-1 rounded-sm md:h-6 md:w-[5px] md:flex-none ${
            BEAT_COLOR[beat.status]
          } ${beat.status === "up" ? "opacity-80" : ""}`}
        />
      ))}
    </div>
  );
}

function ServiceIcon({ service }: { service: ServiceMonitor }) {
  if (!service.iconUrl) return null;
  return (
    <img
      src={service.iconUrl}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className="size-4 shrink-0 rounded-sm"
    />
  );
}

function ServerServiceRow({ service }: { service: ServiceMonitor }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/5 py-2 last:border-b-0">
      <span className={`size-2 shrink-0 rounded-full ${MONITOR_DOT[service.status]}`} />
      <ServiceIcon service={service} />
      <p className="min-w-0 flex-1 truncate text-xs text-foreground/90">{service.name}</p>
      <p className="shrink-0 text-xs tabular-nums text-foreground/50">
        {formatUptimePercent(service.uptime24h)}
      </p>
    </div>
  );
}

function ServerServices({ services }: { services: ServiceMonitor[] }) {
  if (services.length === 0) return null;

  return (
    <Accordion className="mt-3 border-t border-white/5">
      <AccordionItem value="services" className="border-b-0">
        <AccordionTrigger className="py-2 text-xs font-medium text-foreground/60 hover:no-underline hover:text-foreground/80">
          Services on this server · {services.length}
        </AccordionTrigger>
        <AccordionContent className="pb-0">
          {services.map((service) => (
            <ServerServiceRow key={service.id} service={service} />
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function CompactServiceRow({
  service,
  onHover,
}: {
  service: ServiceMonitor;
  onHover?: (service: ServiceMonitor | null) => void;
}) {
  return (
    <div
      onMouseEnter={() => onHover?.(service)}
      onMouseLeave={() => onHover?.(null)}
      className="status-card flex flex-col gap-2 border-b border-white/5 px-4 py-3 last:rounded-b-xl last:border-b-0 hover:bg-[rgba(217,115,26,0.05)] md:px-5"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`size-2.5 shrink-0 rounded-full ${MONITOR_DOT[service.status]}`} />
        <ServiceIcon service={service} />
        <p className="truncate text-sm font-medium text-foreground">{service.name}</p>
      </div>

      <div className="flex items-center gap-4">
        <Heartbeats beats={service.beats} />
        <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {formatUptimePercent(service.uptime24h)}
        </p>
      </div>
    </div>
  );
}

function ServiceRow({ service }: { service: ServiceMonitor }) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/5 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:justify-between md:px-5 md:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`size-2.5 shrink-0 rounded-full ${MONITOR_DOT[service.status]}`} />
        <ServiceIcon service={service} />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{service.name}</p>
          <p className="text-xs text-foreground/50">
            {MONITOR_LABEL[service.status]} · {formatPing(service.lastPingMs)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 md:justify-start md:gap-5">
        <Heartbeats beats={service.beats} />
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {formatUptimePercent(service.uptime24h)}
          </p>
          <p className="text-xs text-foreground/50">24h uptime</p>
        </div>
      </div>
    </div>
  );
}

function serverSubtitle(metrics: ServerNode["metrics"]): string {
  if (metrics.cpuModel) return metrics.cpuModel;
  const parts: string[] = [];
  if (metrics.threads) parts.push(`${metrics.threads} threads`);
  if (metrics.osName) parts.push(metrics.osName);
  return parts.length > 0 ? parts.join(" · ") : "No system details";
}

function ServerCard({
  server,
  services,
  compact = false,
  onHover,
}: {
  server: ServerNode;
  services: ServiceMonitor[];
  compact?: boolean;
  onHover?: (server: ServerNode | null) => void;
}) {
  const { metrics } = server;
  const dot =
    server.status === "up"
      ? "bg-emerald-400"
      : server.status === "down"
        ? "bg-red-400"
        : "bg-zinc-500";

  return (
    <div
      onMouseEnter={() => onHover?.(server)}
      onMouseLeave={() => onHover?.(null)}
      className={`rounded-xl border border-white/10 bg-white/[0.03] p-4 md:p-5 ${
        compact ? "status-card" : ""
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{server.name}</p>
          <p className="truncate text-xs text-foreground/50">{serverSubtitle(metrics)}</p>
        </div>
        <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot}`} />
      </div>

      <div className="space-y-3">
        <MetricBar label="CPU" value={metrics.cpuPercent} />
        <MetricBar label="Memory" value={metrics.memPercent} />
        <MetricBar label="Disk" value={metrics.diskPercent} />
        {metrics.gpuPercent !== null && metrics.gpuPercent > 0 && (
          <MetricBar label="GPU" value={metrics.gpuPercent} />
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/5 pt-4 text-xs">
        <div className="flex justify-between">
          <dt className="text-foreground/50">Uptime</dt>
          <dd className="tabular-nums text-foreground/90">{formatUptime(metrics.uptimeSeconds)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/50">Cores</dt>
          <dd className="tabular-nums text-foreground/90">
            {metrics.cores ?? "—"}
            {metrics.threads && metrics.threads !== metrics.cores ? ` / ${metrics.threads}t` : ""}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/50">RAM</dt>
          <dd className="tabular-nums text-foreground/90">{formatBytes(metrics.memoryBytes)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/50">Load</dt>
          <dd className="tabular-nums text-foreground/90">
            {metrics.loadAverage ? metrics.loadAverage.map((n) => n.toFixed(2)).join(" ") : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/50">Net</dt>
          <dd className="tabular-nums text-foreground/90">{formatBytes(metrics.bandwidthBytes)}</dd>
        </div>
        {metrics.tempC !== null && metrics.tempC > 0 && (
          <div className="flex justify-between">
            <dt className="text-foreground/50">Temp</dt>
            <dd className="tabular-nums text-foreground/90">{metrics.tempC.toFixed(0)}°C</dd>
          </div>
        )}
      </dl>

      {(metrics.osName || metrics.arch) && (
        <p className="mt-3 truncate border-t border-white/5 pt-3 text-xs text-foreground/40">
          {[metrics.osName, metrics.arch].filter(Boolean).join(" · ")}
        </p>
      )}

      <ServerServices services={services} />
    </div>
  );
}

function SourceNotice({ label, error }: { label: string; error: string }) {
  const message =
    error === "unconfigured"
      ? "not configured"
      : error === "unauthorized"
        ? "credentials rejected"
        : error === "unreachable"
          ? "unreachable"
          : "returned an unexpected response";

  return (
    <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-sm text-amber-200/80">
      {label} is {message} — some data may be missing.
    </p>
  );
}

export function BoringStatus({
  initial,
  compact = false,
  onServiceHover,
  onServerHover,
}: {
  initial: StatusSnapshot;
  compact?: boolean;
  onServiceHover?: (service: ServiceMonitor | null) => void;
  onServerHover?: (server: ServerNode | null) => void;
}) {
  const { data, error } = useSWR<StatusSnapshot>("/api/status", jsonFetcher, {
    refreshInterval: 60_000,
    fallbackData: initial,
    revalidateOnMount: true,
    keepPreviousData: true,
  });

  const snapshot = data ?? initial;
  const stale = error != null;

  const servicesByServer = new Map<string, ServiceMonitor[]>();
  for (const service of snapshot.services) {
    if (!service.serverId) continue;
    const list = servicesByServer.get(service.serverId) ?? [];
    list.push(service);
    servicesByServer.set(service.serverId, list);
  }

  const groups = groupBy(snapshot.services, (service) => service.group);
  const serverGroups = groupBy(snapshot.servers, (server) => server.group ?? "");

  const overall = OVERALL[snapshot.overall];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div
        className={`flex flex-col gap-2 rounded-xl px-4 py-4 ring-1 md:flex-row md:items-center md:gap-3 md:px-5 ${overall.ring}`}
      >
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 size-3 shrink-0 rounded-full ${overall.dot}`} />
          <div className="min-w-0">
            <p className={`text-base font-semibold md:text-lg ${overall.text}`}>{overall.label}</p>
            <p className="text-xs text-foreground/50">
              Updated {formatTime(snapshot.generatedAt)}
              {stale && " · reconnecting…"}
            </p>
          </div>
        </div>
        <p className="pl-6 text-sm text-foreground/50 md:ml-auto md:pl-0">
          {snapshot.summary.servicesUp}/{snapshot.summary.servicesTotal} services
          {snapshot.summary.serversTotal > 0 &&
            ` · ${snapshot.summary.serversUp}/${snapshot.summary.serversTotal} servers`}
        </p>
      </div>

      {!snapshot.sources.kuma.ok && snapshot.sources.kuma.error && (
        <SourceNotice label="Uptime Kuma" error={snapshot.sources.kuma.error} />
      )}
      {!snapshot.sources.beszel.ok && snapshot.sources.beszel.error && (
        <SourceNotice label="Beszel" error={snapshot.sources.beszel.error} />
      )}

      {snapshot.incidents.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Active incidents</h2>
          {snapshot.incidents.map((incident, index) => (
            <article
              key={index}
              className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 md:p-5"
            >
              <h3 className="font-semibold text-red-200">{incident.title}</h3>
              <p className="mt-1 text-sm whitespace-pre-line text-foreground/70">
                {incident.content}
              </p>
              <p className="mt-2 text-xs text-foreground/40">
                {formatLocalTime(incident.createdAt)}
              </p>
            </article>
          ))}
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Services</h2>
        {groups.length === 0 ? (
          <p className="rounded-xl border border-white/10 px-5 py-8 text-center text-sm text-foreground/50">
            No services reporting.
          </p>
        ) : (
          groups.map(([group, services]) => (
            <div
              key={group}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
            >
              <h3 className="border-b border-white/5 px-4 py-3 text-sm font-semibold tracking-wide text-foreground/70 uppercase md:px-5">
                {group}
              </h3>
              {services.map((service) =>
                compact ? (
                  <CompactServiceRow key={service.id} service={service} onHover={onServiceHover} />
                ) : (
                  <ServiceRow key={service.id} service={service} />
                ),
              )}
            </div>
          ))
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Servers</h2>
        {snapshot.servers.length === 0 ? (
          <p className="rounded-xl border border-white/10 px-5 py-8 text-center text-sm text-foreground/50">
            No servers reporting.
          </p>
        ) : (
          serverGroups.map(([group, servers]) => (
            <div key={group} className="space-y-3">
              {group !== "" && (
                <h3 className="text-sm font-semibold tracking-wide text-foreground/70 uppercase">
                  {group}
                </h3>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                {servers.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    services={servicesByServer.get(server.id) ?? []}
                    compact={compact}
                    onHover={onServerHover}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
