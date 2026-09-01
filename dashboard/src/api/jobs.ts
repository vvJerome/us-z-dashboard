import type {
  Job,
  JobConfig,
  JobDownloadResponse,
  JobListResponse,
  JobLogsResponse,
} from "../types/job";
import { request } from "./client";

const BASE = "/api/jobs";

export async function fetchJobs(): Promise<JobListResponse> {
  return request<JobListResponse>(BASE);
}

export async function fetchJob(id: string): Promise<Job> {
  return request<Job>(`${BASE}/${id}`);
}

export async function fetchJobLogs(id: string): Promise<JobLogsResponse> {
  return request<JobLogsResponse>(`${BASE}/${id}/logs`);
}

export async function fetchJobDownload(
  id: string,
): Promise<JobDownloadResponse> {
  return request<JobDownloadResponse>(`${BASE}/${id}/download`);
}

export async function createJob(
  file: File,
  config: JobConfig,
  vpsId: string | null,
  name?: string,
): Promise<Job> {
  const params = new URLSearchParams({
    enable_proxy: String(config.enable_proxy),
    skip_duplicates: String(config.skip_duplicates),
  });
  if (vpsId) params.set("vps_id", vpsId);
  if (name) params.set("name", name);
  const body = new FormData();
  body.append("file", file);
  return request<Job>(`${BASE}?${params}`, { method: "POST", body });
}

export async function cancelJob(id: string): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: "DELETE" });
}
