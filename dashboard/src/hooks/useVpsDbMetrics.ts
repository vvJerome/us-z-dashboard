import { useQuery } from "@tanstack/react-query";
import { fetchVpsDbMetrics } from "../api/metrics";
import type { MetricsResponse } from "../types/metrics";

export function useVpsDbMetrics(
  vpsId: string,
  dbPath: string,
  enabled: boolean,
) {
  return useQuery<MetricsResponse, Error>({
    queryKey: ["vps", vpsId, "db-metrics", dbPath],
    queryFn: () => fetchVpsDbMetrics(vpsId, dbPath),
    enabled: enabled && !!vpsId && !!dbPath,
    refetchInterval: 5000,
    retry: false,
    staleTime: 2000,
  });
}
