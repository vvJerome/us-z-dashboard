import type { SavedInspection } from "../types/inspection";

const BASE = "/api/inspections";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((body as { detail: string }).detail ?? res.statusText);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export async function fetchInspections(): Promise<SavedInspection[]> {
  return request<SavedInspection[]>(BASE);
}

export async function fetchInspection(id: string): Promise<SavedInspection> {
  return request<SavedInspection>(`${BASE}/${id}`);
}

export async function createInspection(
  name: string,
  vpsId: string,
  dbPath: string,
): Promise<SavedInspection> {
  return request<SavedInspection>(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, vps_id: vpsId, db_path: dbPath }),
  });
}

export async function deleteInspection(id: string): Promise<void> {
  await request<void>(`${BASE}/${id}`, { method: "DELETE" });
}
