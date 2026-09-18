"use client";

import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";

import DecryptedText from "@/components/DecryptedText";
import { AnimatedLogo } from "@/components/mikn/AnimatedLogo";
import { useIsDesktop } from "@/lib/use-desktop";
import { useMode } from "@/lib/use-mode";
import type { ViewMode } from "@/lib/mode";
import Logo from "@/assets/img/mikan-vtube.svg";

const HEADER_HEIGHT = 88;

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

const pillClass = (active: boolean) =>
  `rounded-full text-sm font-semibold transition-colors ${
    active ? "bg-white text-primary" : "text-white/70 hover:text-white"
  }`;

function ModeSelector({ mode, onSelect }: { mode: ViewMode; onSelect: (mode: ViewMode) => void }) {
  return (
    <div className="hidden items-center gap-1 rounded-full border border-white/20 bg-black/20 p-1 md:flex">
      <button
        type="button"
        aria-pressed={mode === "cool"}
        onClick={() => onSelect("cool")}
        className={`${pillClass(mode === "cool")} font-pixel`}
      >
        <span className="grid px-3 py-1.5">
          <span aria-hidden="true" className="invisible col-start-1 row-start-1">
            Cool
          </span>
          <DecryptedText
            text="Cool"
            animateOn="hover"
            sequential
            revealDirection="start"
            speed={35}
            maxIterations={14}
            characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+?!"
            parentClassName="col-start-1 row-start-1 w-0 min-w-full text-center"
            encryptedClassName="opacity-60"
          />
        </span>
      </button>

      <button
        type="button"
        aria-pressed={mode === "boring"}
        onClick={() => onSelect("boring")}
        className={`${pillClass(mode === "boring")} px-3 py-1.5`}
      >
        Boring
      </button>
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
          <span
            className={`text-xl font-semibold text-foreground md:text-2xl ${
              mode === "cool" ? "font-pixel" : ""
            }`}
          >
            Status
          </span>
        </div>

        <div className="ml-auto">
          <ModeSelector mode={mode} onSelect={select} />
        </div>
      </nav>
    </motion.header>
  );
}
