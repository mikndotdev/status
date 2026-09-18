export function formatUptime(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatPercent(value: number | null, digits = 0): string {
  if (value === null) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatUptimePercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

export function formatPing(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)} ms`;
}

export function formatBytes(value: number | null): string {
  if (value === null || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

const ZONED = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

function parseTimestamp(value: string): Date {
  const trimmed = value.trim();
  if (!ZONED.test(trimmed) && NAIVE_DATETIME.test(trimmed)) {
    return new Date(`${trimmed.replace(" ", "T")}Z`);
  }
  return new Date(trimmed.replace(" ", "T"));
}

export function formatTime(value: string | null): string {
  if (!value) return "—";
  const parsed = parseTimestamp(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatLocalTime(value: string | null): string {
  if (!value) return "—";
  const parsed = parseTimestamp(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
