import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createZeroBounceJob, fetchZeroBounceJobs } from "../api/zerobounce";

export function useZeroBounceJobs() {
  return useQuery({
    queryKey: ["zerobounce"],
    queryFn: fetchZeroBounceJobs,
    refetchInterval: 10_000,
  });
}

export function useCreateZeroBounceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, emailCol }: { file: File; emailCol: string }) =>
      createZeroBounceJob(file, emailCol),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zerobounce"] }),
  });
}
