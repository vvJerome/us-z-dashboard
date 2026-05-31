import type { MetricsResponse } from "../types/metrics";

export async function fetchJobMetrics(jobId: string): Promise<MetricsResponse> {
  const res = await fetch(`/api/jobs/${jobId}/metrics`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<MetricsResponse>;
}
