export const fmt = (n: number | null | undefined) =>
  n == null ? "N/A" : n.toLocaleString();

export const fmtPct = (n: number | null | undefined) =>
  n == null ? "N/A" : `${n.toFixed(1)}%`;

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  const t = Date.parse(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
