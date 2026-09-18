const CDN_BASE = process.env.NEXT_PUBLIC_CDN_URL ?? "/cdn";

export function cdnUrl(path: string) {
  return `${CDN_BASE.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
