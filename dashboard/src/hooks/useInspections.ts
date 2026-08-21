import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInspection,
  deleteInspection,
  fetchInspection,
  fetchInspections,
} from "../api/inspections";

export const INSPECTIONS_KEY = ["inspections"] as const;

export function useInspections() {
  return useQuery({
    queryKey: INSPECTIONS_KEY,
    queryFn: fetchInspections,
  });
}

export function useSavedInspection(id: string | undefined) {
  return useQuery({
    queryKey: [...INSPECTIONS_KEY, id],
    queryFn: () => fetchInspection(id as string),
    enabled: !!id,
  });
}

export function useCreateInspection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      vpsId,
      dbPath,
    }: {
      name: string;
      vpsId: string;
      dbPath: string;
    }) => createInspection(name, vpsId, dbPath),
    onSuccess: () => client.invalidateQueries({ queryKey: INSPECTIONS_KEY }),
  });
}

export function useDeleteInspection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteInspection(id),
    onSuccess: () => client.invalidateQueries({ queryKey: INSPECTIONS_KEY }),
  });
}
