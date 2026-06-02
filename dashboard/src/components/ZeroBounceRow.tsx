import type { ZeroBounceJob } from "../types/zerobounce";

interface ZeroBounceRowProps {
  job: ZeroBounceJob;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    QUEUED: "bg-gray-700 text-gray-300",
    RUNNING: "bg-blue-900 text-blue-300",
    COMPLETED: "bg-green-900 text-green-300",
    FAILED: "bg-red-900 text-red-300",
  };
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-semibold ${cls[status] ?? "bg-gray-700 text-gray-300"}`}
    >
      {status}
    </span>
  );
}

function progress(job: ZeroBounceJob): string {
  if (job.status !== "RUNNING") return "";
  if (!job.email_count) return "";
  const done = job.processed_count ?? 0;
  const pct = Math.round((done / job.email_count) * 100);
  return ` — ${done.toLocaleString()} / ${job.email_count.toLocaleString()} (${pct}%)`;
}

export function ZeroBounceRow({ job }: ZeroBounceRowProps) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            <span className="truncate text-sm font-medium text-gray-200">
              {job.input_filename}
            </span>
          </div>
          <div className="mt-1 flex gap-4 text-xs text-gray-500">
            <span>Created {formatDate(job.created_at)}</span>
            {job.started_at && (
              <span>Started {formatDate(job.started_at)}</span>
            )}
            {job.finished_at && (
              <span>Finished {formatDate(job.finished_at)}</span>
            )}
            {job.email_count != null && (
              <span>
                {job.email_count.toLocaleString()} emails{progress(job)}
              </span>
            )}
          </div>
          {job.error_message && (
            <p className="mt-1 text-xs text-red-400">{job.error_message}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {job.status === "COMPLETED" && job.output_file_key && (
            <a
              href={`/api/zerobounce/${job.id}/download`}
              className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:border-green-700 hover:text-green-400"
            >
              Download
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
