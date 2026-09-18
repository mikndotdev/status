"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import DecryptedText from "@/components/DecryptedText";
import { AnimatedLogo } from "@/components/mikn/AnimatedLogo";
import type { ViewMode } from "@/lib/mode";
import Logo from "@/assets/img/mikan-vtube.svg";

type Stage = "logo" | "text" | "lift" | "choice";

const TEXT = "status page";
const TEXT_SPEED = 45;
const TEXT_SETTLE = TEXT.length * TEXT_SPEED + 300;
const LIFT_DURATION = 0.5;
const LIFT_SETTLE = LIFT_DURATION * 1000;

export function IntroScreen({ onSelect }: { onSelect: (mode: ViewMode) => void }) {
  const [stage, setStage] = useState<Stage>("logo");

  const handleLogoComplete = useCallback(() => {
    setStage((current) => (current === "logo" ? "text" : current));
  }, []);

  useEffect(() => {
    if (stage !== "text") return;
    const timer = setTimeout(() => setStage("lift"), TEXT_SETTLE);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "lift") return;
    const timer = setTimeout(() => setStage("choice"), LIFT_SETTLE);
    return () => clearTimeout(timer);
  }, [stage]);

  const lifted = stage === "lift" || stage === "choice";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background px-6">
      <motion.div
        layout
        transition={{ duration: LIFT_DURATION, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-2"
      >
        <AnimatedLogo
          src={Logo.src}
          alt="MikanDev"
          className="h-14 md:h-20"
          onComplete={handleLogoComplete}
        />

        <div className="h-7 md:h-8">
          <AnimatePresence>
            {stage !== "logo" && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="text-base font-semibold tracking-[0.18em] text-primary md:text-xl"
              >
                <DecryptedText
                  text={TEXT}
                  animateOn="view"
                  sequential
                  revealDirection="start"
                  speed={TEXT_SPEED}
                  className="text-primary"
                  encryptedClassName="text-primary/40"
                />
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {lifted && (
        <div className="flex h-10 items-center md:h-11">
          <AnimatePresence>
            {stage === "choice" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex flex-row items-center gap-3"
              >
                <motion.button
                  type="button"
                  onClick={() => onSelect("cool")}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05, duration: 0.35 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="group relative overflow-hidden rounded-lg px-4 py-2 text-sm font-bold text-white shadow-md md:px-5 md:py-2.5 md:text-base"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_100%] opacity-90 motion-safe:animate-[shimmer_3s_linear_infinite]" />
                  <span className="absolute inset-0 rounded-lg ring-1 ring-white/30" />
                  <span className="relative">Cool mode</span>
                </motion.button>

                <motion.button
                  type="button"
                  onClick={() => onSelect("boring")}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.12, duration: 0.35 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:border-primary hover:text-foreground md:px-5 md:py-2.5 md:text-base"
                >
                  Boring mode
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
