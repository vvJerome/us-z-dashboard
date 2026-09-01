import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJobs } from "../hooks/useJobs";
import { useVps } from "../hooks/useVps";
import { useZeroBounceJobs } from "../hooks/useZeroBounce";
import { JobRow } from "./JobRow";
import { NewJobModal } from "./NewJobModal";
import { ZeroBounceModal } from "./ZeroBounceModal";
import { ZeroBounceRow } from "./ZeroBounceRow";

function TableRowsSkeleton({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, row) => (
        <TableRow key={row}>
          {Array.from({ length: columns }, (_, col) => (
            <TableCell key={col}>
              <Skeleton className="h-4 w-full max-w-40" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function JobList() {
  const { data, isLoading, isError } = useJobs();
  const { data: vpsList } = useVps();
  const [showModal, setShowModal] = useState(false);
  const [showZbModal, setShowZbModal] = useState(false);
  const { data: zbJobs } = useZeroBounceJobs();

  const jobs = data?.jobs ?? [];
  const zeroBounceJobs = zbJobs ?? [];
  const vpsMap = useMemo(
    () => new Map((vpsList ?? []).map((v) => [v.id, v.name])),
    [vpsList],
  );
  const runningCount = jobs.filter((j) => j.status === "RUNNING").length;
  // One RUNNING job per active VPS (ADR-008), not a fixed slot count - each
  // VPS runs its own independent worker. Falls back to 1 while the VPS list
  // is still loading so the button doesn't briefly allow unlimited launches.
  const maxConcurrent = vpsList && vpsList.length > 0 ? vpsList.length : 1;
  const slotsExhausted = runningCount >= maxConcurrent;

  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue="scraper">
        <div className="flex flex-col gap-4 pb-4 pt-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Jobs</h1>
              <p className="text-sm text-muted-foreground">
                Upload a JSONL or CSV file to run against the enrichment
                pipeline, or a batch through ZeroBounce, then track status,
                logs, and downloads here.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Each active worker runs one job at a time.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {slotsExhausted && (
                <span className="text-sm text-amber-400">
                  {runningCount}/{maxConcurrent} slots in use
                </span>
              )}
              <Button variant="secondary" onClick={() => setShowZbModal(true)}>
                Run ZeroBounce
              </Button>
              <Button
                onClick={() => setShowModal(true)}
                disabled={slotsExhausted}
              >
                Run enrichment
              </Button>
            </div>
          </div>

          {isError && (
            <p className="text-sm text-destructive">
              Failed to load jobs. Retrying…
            </p>
          )}

          <TabsList className="w-fit">
            <TabsTrigger value="scraper">
              Enrichment jobs {jobs.length > 0 && `(${jobs.length})`}
            </TabsTrigger>
            <TabsTrigger value="zerobounce">
              ZeroBounce{" "}
              {zeroBounceJobs.length > 0 && `(${zeroBounceJobs.length})`}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="scraper" className="pb-8">
          {isLoading && (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>VPS</TableHead>
                    <TableHead>Timeline</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRowsSkeleton columns={5} />
                </TableBody>
              </Table>
            </div>
          )}
          {!isLoading && !isError && jobs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No jobs yet. Run your first enrichment above.
            </p>
          )}
          {!isLoading && jobs.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>VPS</TableHead>
                    <TableHead>Timeline</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      vpsName={job.vps_id ? vpsMap.get(job.vps_id) : undefined}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="zerobounce" className="pb-8">
          {!isLoading && zeroBounceJobs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No ZeroBounce jobs yet.
            </p>
          )}
          {zeroBounceJobs.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Filename</TableHead>
                    <TableHead>Emails</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zeroBounceJobs.map((job) => (
                    <ZeroBounceRow key={job.id} job={job} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showModal && <NewJobModal onClose={() => setShowModal(false)} />}
      {showZbModal && <ZeroBounceModal onClose={() => setShowZbModal(false)} />}
    </div>
  );
}
