import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelJob, createJob, fetchJobs } from "../api/jobs";
import type { JobConfig } from "../types/job";

export const JOBS_KEY = ["jobs"] as const;

export function useJobs() {
  return useQuery({
    queryKey: JOBS_KEY,
    queryFn: fetchJobs,
    refetchInterval: 10_000,
  });
}

export function useCreateJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      config,
      vpsId,
    }: {
      file: File;
      config: JobConfig;
      vpsId: string | null;
    }) => createJob(file, config, vpsId),
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
