import type {
  Job,
  JobConfig,
  JobDownloadResponse,
  JobListResponse,
  JobLogsResponse,
} from "../types/job";

const BASE = "/api/jobs";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((body as { detail: string }).detail ?? res.statusText);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

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

export async function createJob(file: File, config: JobConfig): Promise<Job> {
  const params = new URLSearchParams({
    enable_proxy: String(config.enable_proxy),
    skip_duplicates: String(config.skip_duplicates),
  });
  const body = new FormData();
  body.append("file", file);
  return request<Job>(`${BASE}?${params}`, { method: "POST", body });
}

export async function cancelJob(id: string): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: "DELETE" });
}
