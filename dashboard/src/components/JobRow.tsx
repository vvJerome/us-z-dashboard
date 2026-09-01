import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useCancelJob } from "../hooks/useJobs";
import { relativeTime } from "../pages/monitor/formatters";
import type { Job } from "../types/job";
import { DownloadButton } from "./DownloadButton";
import { LogViewer } from "./LogViewer";
import { StatusBadge } from "./StatusBadge";

interface JobRowProps {
  job: Job;
  vpsName?: string;
}

export const JOB_ROW_COLUMN_COUNT = 5;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function durationLabel(job: Job): string | null {
  if (!job.started_at) return null;
  const end = job.finished_at ? new Date(job.finished_at) : new Date();
  const totalSeconds = Math.max(
    0,
    Math.round((end.getTime() - new Date(job.started_at).getTime()) / 1000),
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

// The most relevant single timestamp for this job's current status, rather
// than showing every timestamp at once in the collapsed row.
function timelineLabel(job: Job): string {
  if (job.status === "QUEUED")
    return `Created ${relativeTime(job.created_at)} ago`;
  if (job.status === "RUNNING")
    return `Started ${relativeTime(job.started_at)} ago`;
  return `Finished ${relativeTime(job.finished_at)} ago`;
}

const FRIENDLY_ERROR_RULES: [RegExp, string][] = [
  [/no ssh_host configured/i, "This VPS isn't set up for remote jobs yet."],
  [
    /no such file or directory.*\.ssh/i,
    "SSH credentials are missing on the worker.",
  ],
  [/ssh push.*failed|ssh connect/i, "Couldn't reach the worker over SSH."],
  [/pathlike|nonetype/i, "Dispatch failed due to a configuration error."],
];

function friendlyError(message: string): string {
  for (const [pattern, summary] of FRIENDLY_ERROR_RULES) {
    if (pattern.test(message)) return summary;
  }
  return "This job failed to run. See technical details below.";
}

export function JobRow({ job, vpsName }: JobRowProps) {
  const [expanded, setExpanded] = useState(false);
  const cancel = useCancelJob();
  const navigate = useNavigate();

  const canCancel = job.status === "QUEUED" || job.status === "RUNNING";
  const title = job.name || job.input_filename;
  const duration = durationLabel(job);

  return (
    <>
      <TableRow>
        <TableCell>
          <StatusBadge status={job.status} />
        </TableCell>
        <TableCell className="max-w-[320px]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">
              {title}
            </span>
            {job.name && (
              <span className="truncate text-xs text-muted-foreground">
                {job.input_filename}
              </span>
            )}
            {job.error_message && (
              <span className="truncate text-xs text-destructive">
                {friendlyError(job.error_message)}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          {vpsName ? (
            <Badge variant="secondary">{vpsName}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground">
          {timelineLabel(job)}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            {job.status === "COMPLETED" && (
              <DownloadButton jobId={job.id} filename={job.input_filename} />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/jobs/${job.id}/monitor`)}
            >
              {job.status === "RUNNING" ? "Live" : "Metrics"}
            </Button>
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancel.mutate(job.id)}
                disabled={cancel.isPending}
              >
                Cancel
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={
                expanded ? "Collapse job details" : "Expand job details"
              }
              onClick={() => setExpanded((v) => !v)}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <TableRow className="border-b-0 hover:bg-transparent">
        <TableCell colSpan={JOB_ROW_COLUMN_COUNT} className="p-0">
          <Collapsible open={expanded}>
            <CollapsibleContent>
              <div className="flex flex-col gap-3 border-t bg-muted/30 p-4">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="text-foreground">
                      {formatDate(job.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Finished</dt>
                    <dd className="text-foreground">
                      {formatDate(job.finished_at)}
                    </dd>
                  </div>
                  {duration && (
                    <div>
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd className="text-foreground">{duration}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Proxy</dt>
                    <dd className="text-foreground">
                      {job.config.enable_proxy ? "Enabled" : "Disabled"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Deduplication</dt>
                    <dd className="text-foreground">
                      {job.config.skip_duplicates ? "On" : "Off"}
                    </dd>
                  </div>
                  {job.worker_session && (
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">Worker session</dt>
                      <dd
                        className="truncate text-foreground"
                        title={job.worker_session}
                      >
                        {job.worker_session}
                      </dd>
                    </div>
                  )}
                </dl>

                {job.error_message && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Technical details
                    </p>
                    <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md bg-zinc-950 p-3 font-mono text-xs text-red-400">
                      {job.error_message}
                    </pre>
                  </div>
                )}

                <LogViewer jobId={job.id} status={job.status} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </TableCell>
      </TableRow>
    </>
  );
}
