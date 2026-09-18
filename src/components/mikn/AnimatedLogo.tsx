"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { logoPaths, logoViewBox } from "@/constants/logoPaths";

const TRACE_DURATION = 1.2;
const TRACE_FADE = 0.4;
const LOGO_FADE = 0.6;
const STROKE_COLOR = "#ff9900";
const STROKE_WIDTH = 20;

interface AnimatedLogoProps {
  src: string;
  alt: string;
  className?: string;
  onComplete?: () => void;
}

export function AnimatedLogo({ src, alt, className, onComplete }: AnimatedLogoProps) {
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    if (!reduced) return;
    onComplete?.();
  }, [reduced, onComplete]);

  if (reduced) {
    return (
      <span className={cn("relative inline-block", className)}>
        <img src={src} alt={alt} draggable={false} className="block h-full w-auto" />
      </span>
    );
  }

  return (
    <span className={cn("relative inline-block", className)}>
      <motion.img
        src={src}
        alt={alt}
        draggable={false}
        className="block h-full w-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: TRACE_DURATION, duration: LOGO_FADE }}
        onAnimationComplete={() => onComplete?.()}
      />

      <motion.svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={logoViewBox}
        fill="none"
        aria-hidden="true"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: TRACE_DURATION + 0.05, duration: TRACE_FADE }}
      >
        {logoPaths.map((d, i) => (
          <motion.path
            key={i}
            d={d}
            stroke={STROKE_COLOR}
            strokeWidth={STROKE_WIDTH}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: TRACE_DURATION, ease: "easeInOut" }}
          />
        ))}
      </motion.svg>
    </span>
  );
}
