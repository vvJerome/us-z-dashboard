import { useQuery } from "@tanstack/react-query";
import { fetchJobMetrics } from "../api/metrics";
import type { MetricsResponse } from "../types/metrics";

export function useJobMetrics(jobId: string) {
  return useQuery<MetricsResponse, Error>({
    queryKey: ["jobs", jobId, "metrics"],
    queryFn: () => fetchJobMetrics(jobId),
    refetchInterval: 20000,
    retry: (_failureCount, error) =>
      !(error as Error)?.message?.includes("not RUNNING"),
    retryDelay: 20000,
    staleTime: 19000,
    refetchIntervalInBackground: false,
  });
}
