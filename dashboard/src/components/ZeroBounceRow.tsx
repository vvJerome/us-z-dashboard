import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ZeroBounceJob } from "../types/zerobounce";
import { StatusBadge } from "./StatusBadge";

interface ZeroBounceRowProps {
  job: ZeroBounceJob;
}

export const ZEROBOUNCE_ROW_COLUMN_COUNT = 4;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function progressLabel(job: ZeroBounceJob): string | null {
  if (job.email_count == null) return null;
  if (job.status !== "RUNNING") return job.email_count.toLocaleString();
  const done = job.processed_count ?? 0;
  const pct = job.email_count ? Math.round((done / job.email_count) * 100) : 0;
  return `${done.toLocaleString()} / ${job.email_count.toLocaleString()} (${pct}%)`;
}

export function ZeroBounceRow({ job }: ZeroBounceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const progress = progressLabel(job);
  const canDownload = job.status === "COMPLETED" && job.output_file_key;

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell>
          <StatusBadge status={job.status} />
        </TableCell>
        <TableCell className="max-w-[320px]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">
              {job.input_filename}
            </span>
            {job.error_message && (
              <span className="truncate text-xs text-destructive">
                {job.error_message}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground">
          {progress ? `${progress} emails` : "—"}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            {canDownload && (
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/zerobounce/${job.id}/download`}>Download</a>
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
        <TableCell colSpan={ZEROBOUNCE_ROW_COLUMN_COUNT} className="p-0">
          <Collapsible open={expanded}>
            <CollapsibleContent>
              <div className="border-t bg-muted/30 p-4">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="text-foreground">
                      {formatDate(job.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Started</dt>
                    <dd className="text-foreground">
                      {formatDate(job.started_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Finished</dt>
                    <dd className="text-foreground">
                      {formatDate(job.finished_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Filter mode</dt>
                    <dd className="text-foreground">{job.filter_mode}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Email column</dt>
                    <dd className="text-foreground">{job.email_col}</dd>
                  </div>
                </dl>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </TableCell>
      </TableRow>
    </>
  );
}
