"use client";

import { BoringStatus } from "@/components/status/BoringStatus";
import { CoolStatus } from "@/components/status/CoolStatus";
import { IntroScreen } from "@/components/intro/IntroScreen";
import { useMode } from "@/lib/use-mode";
import type { StatusSnapshot } from "@/lib/status/types";

export function StatusApp({ initial }: { initial: StatusSnapshot }) {
  const { mode, select } = useMode();

  if (mode === undefined) return <div className="min-h-[60vh]" />;
  if (mode === null) return <IntroScreen onSelect={select} />;

  if (mode === "cool") return <CoolStatus initial={initial} />;

  return <BoringStatus initial={initial} />;
}
