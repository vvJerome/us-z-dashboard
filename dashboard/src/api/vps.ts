import type { VpsInstance } from "../types/vps";

const BASE = "/api/vps";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((body as { detail: string }).detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchVpsList(): Promise<VpsInstance[]> {
  return request<VpsInstance[]>(BASE);
}
