import type { MetricsResponse } from "../types/metrics";
import { request } from "./client";

export async function fetchJobMetrics(jobId: string): Promise<MetricsResponse> {
  return request<MetricsResponse>(`/api/jobs/${jobId}/metrics`, {
    cache: "no-store",
  });
}

export async function fetchVpsDbMetrics(
  vpsId: string,
  dbPath: string,
): Promise<MetricsResponse> {
  return request<MetricsResponse>(
    `/api/vps/${vpsId}/db-metrics?db_path=${encodeURIComponent(dbPath)}`,
    { cache: "no-store" },
  );
}
