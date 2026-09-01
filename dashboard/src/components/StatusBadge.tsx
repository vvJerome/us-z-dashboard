import { Loader2 } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
}

const VARIANTS: Record<string, BadgeProps["variant"]> = {
  QUEUED: "secondary",
  RUNNING: "default",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "warning",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant={VARIANTS[status] ?? "secondary"} className="gap-1">
      {status === "RUNNING" && (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      )}
      {status}
    </Badge>
  );
}
