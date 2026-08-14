import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCancelJob } from "../hooks/useJobs";
import type { Job } from "../types/job";
import { DownloadButton } from "./DownloadButton";
import { LogViewer } from "./LogViewer";
import { StatusBadge } from "./StatusBadge";

interface JobRowProps {
  job: Job;
  vpsName?: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function JobRow({ job, vpsName }: JobRowProps) {
  const [expanded, setExpanded] = useState(false);
  const cancel = useCancelJob();
  const navigate = useNavigate();

  const canCancel = job.status === "QUEUED" || job.status === "RUNNING";

  return (
    <Card>
      <CardContent
        className="flex cursor-pointer items-start justify-between gap-4 p-4"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            <span className="truncate text-sm font-medium text-foreground">
              {job.input_filename}
            </span>
            {vpsName && <Badge variant="secondary">{vpsName}</Badge>}
          </div>
          <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
            <span>Created {formatDate(job.created_at)}</span>
            {job.started_at && (
              <span>Started {formatDate(job.started_at)}</span>
            )}
            {job.finished_at && (
              <span>Finished {formatDate(job.finished_at)}</span>
            )}
          </div>
          {job.error_message && (
            <p className="mt-1 text-xs text-destructive">{job.error_message}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {job.status === "COMPLETED" && (
            <DownloadButton jobId={job.id} filename={job.input_filename} />
          )}
          {(job.status === "RUNNING" || job.status === "COMPLETED") && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/jobs/${job.id}/monitor`);
              }}
              className={
                job.status === "RUNNING"
                  ? "border-sky-700 text-sky-400 hover:bg-sky-900 hover:text-sky-300"
                  : undefined
              }
            >
              {job.status === "RUNNING" ? "Live" : "Metrics"}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                cancel.mutate(job.id);
              }}
              disabled={cancel.isPending}
              className="hover:border-destructive hover:text-destructive"
            >
              Cancel
            </Button>
          )}
          <span className="text-muted-foreground">{expanded ? "▲" : "▼"}</span>
        </div>
      </CardContent>

      {expanded && (
        <div className="px-4 pb-4">
          <LogViewer jobId={job.id} status={job.status} />
        </div>
      )}
    </Card>
  );
}
