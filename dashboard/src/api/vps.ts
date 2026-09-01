import type { VpsCreate, VpsInstance } from "../types/vps";
import { request } from "./client";

const BASE = "/api/vps";

export async function fetchVpsList(): Promise<VpsInstance[]> {
  return request<VpsInstance[]>(BASE);
}

export async function createVps(body: VpsCreate): Promise<VpsInstance> {
  return request<VpsInstance>(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteVps(id: string): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: "DELETE" });
}
