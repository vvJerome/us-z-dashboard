import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createVps, deleteVps, fetchVpsList } from "../api/vps";
import type { VpsCreate } from "../types/vps";

export const VPS_KEY = ["vps"] as const;

export function useVps() {
  return useQuery({
    queryKey: VPS_KEY,
    queryFn: fetchVpsList,
  });
}

export function useCreateVps() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: VpsCreate) => createVps(body),
    onSuccess: () => client.invalidateQueries({ queryKey: VPS_KEY }),
  });
}

export function useDeleteVps() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVps(id),
    onSuccess: () => client.invalidateQueries({ queryKey: VPS_KEY }),
  });
}
