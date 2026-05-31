import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div
        className="flex cursor-pointer items-start justify-between gap-4"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            <span className="truncate text-sm font-medium text-gray-200">
              {job.input_filename}
            </span>
            {vpsName && (
              <span className="shrink-0 rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
                {vpsName}
              </span>
            )}
          </div>
          <div className="mt-1 flex gap-4 text-xs text-gray-500">
            <span>Created {formatDate(job.created_at)}</span>
            {job.started_at && (
              <span>Started {formatDate(job.started_at)}</span>
            )}
            {job.finished_at && (
              <span>Finished {formatDate(job.finished_at)}</span>
            )}
          </div>
          {job.error_message && (
            <p className="mt-1 text-xs text-red-400">{job.error_message}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {job.status === "COMPLETED" && (
            <DownloadButton jobId={job.id} filename={job.input_filename} />
          )}
          {(job.status === "RUNNING" || job.status === "COMPLETED") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/jobs/${job.id}/monitor`);
              }}
              className={`rounded border px-2 py-1 text-xs ${
                job.status === "RUNNING"
                  ? "border-sky-700 text-sky-400 hover:bg-sky-900"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              {job.status === "RUNNING" ? "Live" : "Metrics"}
            </button>
          )}
          {canCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                cancel.mutate(job.id);
              }}
              disabled={cancel.isPending}
              className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:border-red-700 hover:text-red-400 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <span className="text-gray-600">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && <LogViewer jobId={job.id} status={job.status} />}
    </div>
  );
}
