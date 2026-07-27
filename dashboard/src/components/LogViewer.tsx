import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    return <p className="text-xs text-muted-foreground">Loading logs…</p>;
  }

  const lines = data?.lines ?? [];

  return (
    <ScrollArea className="mt-2 max-h-64 rounded-md bg-background/60 p-3">
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">No logs yet.</p>
      ) : (
        <pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground/80">
          {lines.join("\n")}
        </pre>
      )}
      <div ref={bottomRef} />
    </ScrollArea>
  );
}
