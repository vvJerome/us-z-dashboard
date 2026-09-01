import type { ZeroBounceJob } from "../types/zerobounce";
import { request } from "./client";

const BASE = "/api/zerobounce";

export async function fetchZeroBounceJobs(): Promise<ZeroBounceJob[]> {
  return request<ZeroBounceJob[]>(BASE, { cache: "no-store" });
}

export async function fetchZeroBounceJob(id: string): Promise<ZeroBounceJob> {
  return request<ZeroBounceJob>(`${BASE}/${id}`, { cache: "no-store" });
}

export async function createZeroBounceJob(
  file: File,
  emailCol: string,
): Promise<ZeroBounceJob> {
  const form = new FormData();
  form.append("file", file);
  return request<ZeroBounceJob>(
    `${BASE}?email_col=${encodeURIComponent(emailCol)}`,
    { method: "POST", body: form },
  );
}
