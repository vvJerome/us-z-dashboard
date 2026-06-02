import type { ZeroBounceJob } from "../types/zerobounce";

export async function fetchZeroBounceJobs(): Promise<ZeroBounceJob[]> {
  const res = await fetch("/api/zerobounce", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchZeroBounceJob(id: string): Promise<ZeroBounceJob> {
  const res = await fetch(`/api/zerobounce/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createZeroBounceJob(
  file: File,
  emailCol: string,
): Promise<ZeroBounceJob> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    `/api/zerobounce?email_col=${encodeURIComponent(emailCol)}`,
    { method: "POST", body: form },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.detail ?? `HTTP ${res.status}`);
  return body;
}
