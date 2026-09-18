"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import useSWR from "swr";

import { BoringStatus } from "@/components/status/BoringStatus";
import { VRMGlobe, type VRMGlobeMood } from "@/components/VRMGlobe";
import { jsonFetcher } from "@/lib/fetcher";
import type { OverallStatus, StatusSnapshot } from "@/lib/status/types";

type Phase = "intro" | "shift" | "cards";

const SHIFT_DURATION = 0.9;
const SHIFT_EASE = [0.22, 1, 0.36, 1] as const;

const MOOD_FOR: Record<OverallStatus, VRMGlobeMood> = {
  operational: "happy",
  degraded: "concerned",
  outage: "critical",
  unknown: "neutral",
};

export function CoolStatus({ initial }: { initial: StatusSnapshot }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const reduced = useReducedMotion() ?? false;

  const { data } = useSWR<StatusSnapshot>("/api/status", jsonFetcher, {
    fallbackData: initial,
  });
  const snapshot = data ?? initial;

  const handleIntroComplete = useCallback(() => {
    setPhase((current) => (current === "intro" ? "shift" : current));
  }, []);

  useEffect(() => {
    if (phase !== "shift") return;
    const timer = setTimeout(() => setPhase("cards"), reduced ? 0 : SHIFT_DURATION * 1000);
    return () => clearTimeout(timer);
  }, [phase, reduced]);

  return (
    <div className="grid grid-cols-2">
      <motion.div
        initial={false}
        animate={{ x: phase === "intro" ? "50%" : "0%" }}
        transition={reduced ? { duration: 0 } : { duration: SHIFT_DURATION, ease: SHIFT_EASE }}
        className="sticky top-28 h-[calc(100vh-11rem)] self-start"
      >
        <VRMGlobe
          className="h-full"
          mood={MOOD_FOR[snapshot.overall]}
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
          <BoringStatus initial={initial} />
        </motion.div>
      )}
    </div>
  );
}
