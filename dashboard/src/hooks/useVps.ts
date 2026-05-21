import { useQuery } from "@tanstack/react-query";
import { fetchVpsList } from "../api/vps";

export const VPS_KEY = ["vps"] as const;

export function useVps() {
  return useQuery({
    queryKey: VPS_KEY,
    queryFn: fetchVpsList,
  });
}
