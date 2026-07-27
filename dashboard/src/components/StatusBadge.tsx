import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
    <Badge
      variant={VARIANTS[status] ?? "secondary"}
      className={cn(status === "RUNNING" && "animate-pulse")}
    >
      {status}
    </Badge>
  );
}
