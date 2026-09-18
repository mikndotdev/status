import React from "react";

import { LucideIcon } from "lucide-react";
import type { IconType } from "@icons-pack/react-simple-icons";

export interface FooterProps {
  social: {
    name: string;
    href: string;
    icon: LucideIcon | IconType;
  }[];
  links: {
    name: string;
    children: {
      name: string;
      href: string;
    }[];
  }[];
  copyright?: string;
  className?: string;
  children?: React.ReactNode;
}

export const Footer: React.FC<FooterProps> = ({
  social,
  links,
  children,
  className,
  copyright,
}) => {
  const maxWidth = links.length < 4 ? "max-w-4xl" : "max-w-5xl";

  return (
    <footer className={className}>
      <div className={`mx-auto flex w-full ${maxWidth} flex-col justify-between`}>
        <div
          style={{
            gridTemplateColumns: `repeat(${links.length + 1}, minmax(0, 1fr))`,
          }}
          className="flex flex-col gap-4 px-4 pb-4 pt-7 md:grid md:gap-0 md:px-0 md:pb-7 md:pt-9"
        >
          {links.map((item) => (
            <div key={item.name}>
              <h3 className="text-sm font-semibold tracking-wider text-footer-text">{item.name}</h3>
              <ul className="mt-2 space-y-1">
                {item.children.map((child) => (
                  <li key={child.name}>
                    <a
                      href={child.href}
                      className="text-sm tracking-wide text-steel transition-colors hover:text-footer-text"
                    >
                      {child.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {children}
        </div>
        <div>
          <div className="mx-4 border-t border-footer-border py-2 md:mx-0">
            <div className="mb-4 mt-1 flex w-full flex-col-reverse items-start justify-between gap-1 md:m-0 md:flex-row md:items-center md:gap-0">
              <p className="text-xs tracking-wider text-white">&copy; {copyright}</p>
              <div className="flex flex-row justify-start gap-1 md:items-center">
                {social.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className="rounded-full p-2 text-steel transition-colors hover:text-footer-text"
                  >
                    <item.icon className="h-5 w-5" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
Footer.displayName = "Footer";
