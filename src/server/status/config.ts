import "server-only";

export interface KumaConfig {
  url: string;
  slug: string;
}

export interface BeszelConfig {
  url: string;
  username: string;
  password: string;
}

const trim = (value: string | undefined) => value?.trim().replace(/\/+$/, "") ?? "";

export function kumaConfig(): KumaConfig | null {
  const url = trim(process.env.UPTIME_KUMA_URL);
  const slug = process.env.UPTIME_KUMA_STATUS_SLUG?.trim() ?? "";
  if (!url || !slug) return null;
  return { url, slug };
}

export function beszelConfig(): BeszelConfig | null {
  const url = trim(process.env.BESZEL_URL);
  const username = process.env.BESZEL_USERNAME?.trim() ?? "";
  const password = process.env.BESZEL_PASSWORD ?? "";
  if (!url || !username || !password) return null;
  return { url, username, password };
}

export const REVALIDATE = {
  beszel: 30,
  beszelDetails: 600,
  kumaStatus: 300,
  kumaHeartbeat: 60,
} as const;

export const UPSTREAM_TIMEOUT_MS = 6000;
