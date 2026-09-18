"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import useSWR from "swr";

import { BoringStatus } from "@/components/status/BoringStatus";
import {
  VRMGlobe,
  type GlobeFocus,
  type GlobeSignal,
  type VRMGlobeMood,
} from "@/components/VRMGlobe";
import { jsonFetcher } from "@/lib/fetcher";
import { formatPing } from "@/lib/status/format";
import type {
  OverallStatus,
  ServerNode,
  ServiceMonitor,
  StatusSnapshot,
} from "@/lib/status/types";

type Phase = "intro" | "shift" | "cards";

const SHIFT_DURATION = 0.9;
const MARKER_SIZE = 0.028;

const WORLD_SPOKES: [number, number][] = [
  [22.3193, 114.1694],
  [1.3521, 103.8198],
  [28.6139, 77.209],
  [61.2181, -149.9003],
  [21.3069, -157.8583],
  [-33.8688, 151.2093],
];

type MarkerState = "up" | "down" | "unknown";

const MARKER_COLOR: Record<MarkerState, [number, number, number]> = {
  up: [1, 0.72, 0.16],
  down: [0.973, 0.443, 0.443],
  unknown: [0.443, 0.443, 0.478],
};

function markerState(servers: ServerNode[]): MarkerState {
  if (servers.some((server) => server.status === "down")) return "down";
  if (servers.every((server) => server.status === "up")) return "up";
  return "unknown";
}
const SHIFT_EASE = [0.22, 1, 0.36, 1] as const;

const MOOD_FOR: Record<OverallStatus, VRMGlobeMood> = {
  operational: "happy",
  degraded: "concerned",
  outage: "critical",
  unknown: "neutral",
};

export function CoolStatus({ initial }: { initial: StatusSnapshot }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [hovered, setHovered] = useState<ServiceMonitor | null>(null);
  const [hoveredHost, setHoveredHost] = useState<ServerNode | null>(null);
  const reduced = useReducedMotion() ?? false;

  const { data } = useSWR<StatusSnapshot>("/api/status", jsonFetcher, {
    fallbackData: initial,
  });
  const snapshot = data ?? initial;

  const sites = new Map<string, { location: [number, number]; servers: ServerNode[] }>();
  for (const server of snapshot.servers) {
    if (!server.location) continue;
    const key = `${server.location.lat},${server.location.lng}`;
    const site = sites.get(key) ?? {
      location: [server.location.lat, server.location.lng] as [number, number],
      servers: [],
    };
    site.servers.push(server);
    sites.set(key, site);
  }

  const hoveredServer = hovered?.serverId
    ? snapshot.servers.find((server) => server.id === hovered.serverId)
    : undefined;

  const hostIcons = hoveredHost
    ? snapshot.services
        .filter((service) => service.serverId === hoveredHost.id && service.iconUrl)
        .map((service) => service.iconUrl as string)
    : [];

  let focus: GlobeFocus | null = null;
  let signalFrom: [number, number] | null = null;
  if (hoveredHost?.location) {
    focus = {
      lat: hoveredHost.location.lat,
      lng: hoveredHost.location.lng,
      label: hostIcons.length > 0 ? null : hoveredHost.name,
      icons: hostIcons,
    };
  } else if (hoveredServer?.location) {
    focus = {
      lat: hoveredServer.location.lat,
      lng: hoveredServer.location.lng,
      label: formatPing(hovered?.lastPingMs ?? null),
    };
    signalFrom = [hoveredServer.location.lat, hoveredServer.location.lng];
  }

  const hub = snapshot.servers.find((server) => server.role === "hub" && server.location);

  const signal: GlobeSignal | null =
    signalFrom && hub?.location
      ? {
          from: signalFrom,
          hub: [hub.location.lat, hub.location.lng],
          spokes: WORLD_SPOKES,
        }
      : null;

  const markers = [...sites.values()].map((site) => ({
    location: site.location,
    size: MARKER_SIZE,
    color: MARKER_COLOR[markerState(site.servers)],
  }));

  const handleIntroComplete = useCallback(() => {
    setPhase((current) => (current === "intro" ? "shift" : current));
  }, []);

  useEffect(() => {
    if (phase !== "shift") return;
    const timer = setTimeout(() => setPhase("cards"), reduced ? 0 : SHIFT_DURATION * 1000);
    return () => clearTimeout(timer);
  }, [phase, reduced]);

  return (
    <div className="grid grid-cols-2 font-pixel">
      <motion.div
        initial={false}
        animate={{ x: phase === "intro" ? "50%" : "0%" }}
        transition={reduced ? { duration: 0 } : { duration: SHIFT_DURATION, ease: SHIFT_EASE }}
        className="sticky top-28 h-[calc(100vh-11rem)] self-start"
      >
        <VRMGlobe
          className="h-full"
          mood={MOOD_FOR[snapshot.overall]}
          markers={markers}
          focus={focus}
          signal={signal}
          onIntroComplete={handleIntroComplete}
        />
      </motion.div>

      {phase === "cards" && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.55, ease: "easeOut" }}
          className="pl-8"
        >
          <BoringStatus
            initial={initial}
            compact
            onServiceHover={setHovered}
            onServerHover={setHoveredHost}
          />
        </motion.div>
      )}
    </div>
  );
}
