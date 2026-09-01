import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelJob, createJob, fetchJob, fetchJobs } from "../api/jobs";
import type { JobConfig } from "../types/job";

export const JOBS_KEY = ["jobs"] as const;

export function useJobs() {
  return useQuery({
    queryKey: JOBS_KEY,
    queryFn: fetchJobs,
    refetchInterval: 10_000,
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: [...JOBS_KEY, id],
    queryFn: () => fetchJob(id),
    enabled: Boolean(id),
  });
}

export function useCreateJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      config,
      vpsId,
      name,
    }: {
      file: File;
      config: JobConfig;
      vpsId: string | null;
      name?: string;
    }) => createJob(file, config, vpsId, name),
    onSuccess: () => client.invalidateQueries({ queryKey: JOBS_KEY }),
  });
}

export function useCancelJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelJob(id),
    onSuccess: () => client.invalidateQueries({ queryKey: JOBS_KEY }),
  });
}
