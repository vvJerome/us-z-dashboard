import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ZeroBounceJob } from "../types/zerobounce";
import { StatusBadge } from "./StatusBadge";

interface ZeroBounceRowProps {
  job: ZeroBounceJob;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
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
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            <span className="truncate text-sm font-medium text-foreground">
              {job.input_filename}
            </span>
          </div>
          <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
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
            <p className="mt-1 text-xs text-destructive">{job.error_message}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {job.status === "COMPLETED" && job.output_file_key && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/zerobounce/${job.id}/download`}>Download</a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
