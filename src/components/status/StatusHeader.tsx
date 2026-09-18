"use client";

import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";

import { AnimatedLogo } from "@/components/mikn/AnimatedLogo";
import { useIsDesktop } from "@/lib/use-desktop";
import { useMode } from "@/lib/use-mode";
import type { ViewMode } from "@/lib/mode";
import Logo from "@/assets/img/mikan-vtube.svg";

const HEADER_HEIGHT = 88;

const MODE_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "cool", label: "Cool" },
  { value: "boring", label: "Boring" },
];

const headerAnimationVariants = {
  show: {
    top: 0,
    transition: { type: "spring" as const, stiffness: 100 },
  },
  hide: {
    top: -HEADER_HEIGHT,
  },
};

function headerClassName(isScrolled: boolean) {
  const base =
    "fixed inset-x-0 top-0 z-40 py-2 text-white transition-[padding-top,padding-bottom,box-shadow] ease-in-out md:py-0";
  const scrolled = isScrolled
    ? "border-b border-primary bg-primary/80 shadow-sm backdrop-blur-sm"
    : "bg-transparent md:py-4";
  return `${base} ${scrolled}`;
}

function ModeSelector({ mode, onSelect }: { mode: ViewMode; onSelect: (mode: ViewMode) => void }) {
  return (
    <div className="hidden items-center gap-1 rounded-full border border-white/20 bg-black/20 p-1 md:flex">
      {MODE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          onClick={() => onSelect(option.value)}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
            mode === option.value ? "bg-white text-primary" : "text-white/70 hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StatusHeader() {
  const { mode, select } = useMode();
  const isDesktop = useIsDesktop();

  const [isScrolled, setIsScrolled] = useState(false);
  const [lastYPosition, setLastYPosition] = useState(0);
  const [isHeaderShown, setIsHeaderShown] = useState(true);

  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 10);
    setIsHeaderShown(latest < HEADER_HEIGHT || latest < lastYPosition);
    setLastYPosition(latest);
  });

  if (mode == null) return null;

  return (
    <motion.header
      variants={headerAnimationVariants}
      initial="show"
      animate={isDesktop || isHeaderShown ? "show" : "hide"}
      className={headerClassName(isScrolled)}
    >
      <nav className="mx-auto flex h-12 max-w-6xl items-center px-6 md:h-16 md:px-8">
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 md:static md:translate-x-0">
          <AnimatedLogo src={Logo.src} alt="MikanDev" className="h-8 md:h-10" />
          <span className="text-xl font-semibold text-foreground md:text-2xl">Status</span>
        </div>

        <div className="ml-auto">
          <ModeSelector mode={mode} onSelect={select} />
        </div>
      </nav>
    </motion.header>
  );
}
