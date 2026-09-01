import type { SavedInspection } from "../types/inspection";
import { request } from "./client";

const BASE = "/api/inspections";

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
