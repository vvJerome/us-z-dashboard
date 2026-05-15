import { useQuery } from "@tanstack/react-query";
import { fetchJobLogs } from "../api/jobs";
import type { JobStatus } from "../types/job";

const ACTIVE_STATUSES: JobStatus[] = ["QUEUED", "RUNNING"];

export function useJobLogs(jobId: string, status: JobStatus) {
  const isActive = ACTIVE_STATUSES.includes(status);
  return useQuery({
    queryKey: ["jobs", jobId, "logs"],
    queryFn: () => fetchJobLogs(jobId),
    refetchInterval: isActive ? 10_000 : false,
    enabled: !!jobId,
  });
}
