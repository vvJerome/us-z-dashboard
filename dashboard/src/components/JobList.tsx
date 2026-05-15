import { useState } from "react";
import { useJobs } from "../hooks/useJobs";
import { JobRow } from "./JobRow";
import { NewJobModal } from "./NewJobModal";

const MAX_CONCURRENT = 5;

export function JobList() {
  const { data, isLoading, isError } = useJobs();
  const [showModal, setShowModal] = useState(false);

  const jobs = data?.jobs ?? [];
  const runningCount = jobs.filter((j) => j.status === "RUNNING").length;
  const slotsExhausted = runningCount >= MAX_CONCURRENT;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">Scraper jobs</h1>
        <div className="flex items-center gap-3">
          {slotsExhausted && (
            <span className="text-sm text-yellow-400">
              {runningCount}/{MAX_CONCURRENT} slots in use
            </span>
          )}
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

      {!isLoading && jobs.length === 0 && (
        <p className="text-sm text-gray-600">
          No jobs yet. Run your first scraper above.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </div>

      {showModal && <NewJobModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
