import { useMemo, useState } from "react";
import { useJobs } from "../hooks/useJobs";
import { useVps } from "../hooks/useVps";
import { useZeroBounceJobs } from "../hooks/useZeroBounce";
import { JobRow } from "./JobRow";
import { NewJobModal } from "./NewJobModal";
import { ZeroBounceModal } from "./ZeroBounceModal";
import { ZeroBounceRow } from "./ZeroBounceRow";

const MAX_CONCURRENT = 1;

export function JobList() {
  const { data, isLoading, isError } = useJobs();
  const { data: vpsList } = useVps();
  const [showModal, setShowModal] = useState(false);
  const [showZbModal, setShowZbModal] = useState(false);
  const { data: zbJobs } = useZeroBounceJobs();

  const jobs = data?.jobs ?? [];
  const vpsMap = useMemo(
    () => new Map((vpsList ?? []).map((v) => [v.id, v.name])),
    [vpsList],
  );
  const runningCount = jobs.filter((j) => j.status === "RUNNING").length;
  const slotsExhausted = runningCount >= MAX_CONCURRENT;

  const combined = useMemo(() => {
    const scraperItems = jobs.map((j) => ({
      type: "scraper" as const,
      id: j.id,
      created_at: j.created_at,
      item: j,
    }));
    const zbItems = (zbJobs ?? []).map((j) => ({
      type: "zerobounce" as const,
      id: j.id,
      created_at: j.created_at,
      item: j,
    }));
    return [...scraperItems, ...zbItems].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [jobs, zbJobs]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">Jobs</h1>
        <div className="flex items-center gap-3">
          {slotsExhausted && (
            <span className="text-sm text-yellow-400">
              {runningCount}/{MAX_CONCURRENT} slots in use
            </span>
          )}
          <button
            onClick={() => setShowZbModal(true)}
            className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
          >
            Run ZeroBounce
          </button>
          <button
            onClick={() => setShowModal(true)}
            disabled={slotsExhausted}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run scraper
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading jobs…</p>}
      {isError && (
        <p className="text-sm text-red-400">Failed to load jobs. Retrying…</p>
      )}
      {!isLoading && combined.length === 0 && (
        <p className="text-sm text-gray-600">
          No jobs yet. Run your first scraper above.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {combined.map(({ type, id, item }) =>
          type === "scraper" ? (
            <JobRow
              key={id}
              job={item}
              vpsName={item.vps_id ? vpsMap.get(item.vps_id) : undefined}
            />
          ) : (
            <ZeroBounceRow key={id} job={item} />
          ),
        )}
      </div>

      {showModal && <NewJobModal onClose={() => setShowModal(false)} />}
      {showZbModal && <ZeroBounceModal onClose={() => setShowZbModal(false)} />}
    </div>
  );
}
