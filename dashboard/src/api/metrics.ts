import type { MetricsResponse } from "../types/metrics";

export async function fetchJobMetrics(jobId: string): Promise<MetricsResponse> {
  const res = await fetch(`/api/jobs/${jobId}/metrics`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<MetricsResponse>;
}

export async function fetchVpsDbMetrics(
  vpsId: string,
  dbPath: string,
): Promise<MetricsResponse> {
  const url = `/api/vps/${vpsId}/db-metrics?db_path=${encodeURIComponent(dbPath)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<MetricsResponse>;
}
