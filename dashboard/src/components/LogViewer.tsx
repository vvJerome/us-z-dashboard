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
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll only this pane's own viewport to its newest line, a bare
    // scrollIntoView() also drags every scrollable ancestor (including the
    // page's own main content area) toward this element, which looked like
    // expanding a job row was "pushing the page down" instead of just
    // opening the log pane in place.
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.lines]);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading logs…</p>;
  }

  const lines = data?.lines ?? [];

  return (
    <ScrollArea
      ref={viewportRef}
      className="mt-2 max-h-64 rounded-md bg-zinc-950 p-3"
    >
      {lines.length === 0 ? (
        <p className="text-xs text-zinc-500">No logs yet.</p>
      ) : (
        <pre className="whitespace-pre-wrap break-all font-mono text-xs text-zinc-300">
          {lines.join("\n")}
        </pre>
      )}
    </ScrollArea>
  );
}
