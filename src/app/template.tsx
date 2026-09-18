import type { ReactNode } from "react";
import Image from "next/image";

import { SiGithub } from "@icons-pack/react-simple-icons";

import { Footer } from "@/components/mikn/Footer";
import { StatusHeader } from "@/components/status/StatusHeader";
import MikanCat from "@/assets/img/mikan-cat.png";

const social = [
  {
    name: "GitHub",
    href: "https://github.com/mikndotdev",
    icon: SiGithub,
  },
];

const links = [
  {
    name: "Resources",
    children: [
      {
        name: "MikanDev",
        href: "https://mikn.dev/",
      },
      {
        name: "Account Center",
        href: "https://account.mikandev.com/",
      },
      {
        name: "Solutions",
        href: "https://mikn.dev/solutions",
      },
    ],
  },
  {
    name: "Support",
    children: [
      {
        name: "Contact",
        href: "https://mikn.dev/contact",
      },
      {
        name: "Documentation",
        href: "https://docs.mikn.dev/",
      },
    ],
  },
  {
    name: "Legal",
    children: [
      {
        name: "Terms of Service",
        href: "https://docs.mikn.dev/legal/terms",
      },
      {
        name: "Privacy Policy",
        href: "https://docs.mikn.dev/legal/privacy",
      },
      {
        name: "Refund Policy",
        href: "https://docs.mikn.dev/legal/refunds",
      },
      {
        name: "Payments in Japan",
        href: "https://docs.mikn.dev/legal/jp-payments",
      },
    ],
  },
];

export default function PagesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StatusHeader />
      <div className="flex-1 px-4 pt-24 pb-12 md:px-[min(7.5rem,8vw)] md:pt-32 md:pb-24">
        {children}
      </div>
      <Footer
        social={social}
        links={links}
        copyright={`2020-${new Date().getFullYear()} MikanDev`}
        className="bg-secondary font-bold text-white"
      >
        <div className="flex items-center self-end">
          <Image src={MikanCat} width={200} height={100} alt=":3" className="mb-0 ml-2" />
        </div>
      </Footer>
    </>
  );
}
