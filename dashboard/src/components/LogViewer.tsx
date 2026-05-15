import { useEffect, useRef } from "react";
import { useJobLogs } from "../hooks/useJobLogs";
import type { JobStatus } from "../types/job";

interface LogViewerProps {
  jobId: string;
  status: JobStatus;
}

export function LogViewer({ jobId, status }: LogViewerProps) {
  const { data, isLoading } = useJobLogs(jobId, status);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.lines]);

  if (isLoading) {
    return <p className="text-xs text-gray-500">Loading logs…</p>;
  }

  const lines = data?.lines ?? [];

  return (
    <div className="mt-2 max-h-64 overflow-y-auto rounded bg-gray-950 p-3">
      {lines.length === 0 ? (
        <p className="text-xs text-gray-600">No logs yet.</p>
      ) : (
        <pre className="whitespace-pre-wrap break-all font-mono text-xs text-gray-300">
          {lines.join("\n")}
        </pre>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
