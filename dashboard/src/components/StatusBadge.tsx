import type { JobStatus } from "../types/job";

interface StatusBadgeProps {
  status: JobStatus;
}

const STYLES: Record<JobStatus, string> = {
  QUEUED: "bg-gray-700 text-gray-300",
  RUNNING: "bg-blue-900 text-blue-300 animate-pulse",
  COMPLETED: "bg-green-900 text-green-300",
  FAILED: "bg-red-900 text-red-300",
  CANCELLED: "bg-yellow-900 text-yellow-300",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
