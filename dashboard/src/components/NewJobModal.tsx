import { useRef, useState } from "react";
import { useCreateJob } from "../hooks/useJobs";
import type { JobConfig } from "../types/job";

interface NewJobModalProps {
  onClose: () => void;
}

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXT = new Set([".jsonl", ".csv"]);

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function NewJobModal({ onClose }: NewJobModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [config, setConfig] = useState<JobConfig>({
    enable_proxy: false,
    skip_duplicates: true,
  });
  const create = useCreateJob();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!picked) {
      setFile(null);
      return;
    }

    if (!ALLOWED_EXT.has(getExtension(picked.name))) {
      setFileError("Only .jsonl and .csv files are accepted.");
      setFile(null);
      return;
    }
    if (picked.size > MAX_BYTES) {
      setFileError("File exceeds 100 MB limit.");
      setFile(null);
      return;
    }
    setFile(picked);
  }

  function handleToggle(key: keyof JobConfig) {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    await create.mutateAsync({ file, config });
    onClose();
  }

  const submitDisabled = !file || create.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">
            New scraper job
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="mb-1 block text-sm text-gray-400">
              Input file
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".jsonl,.csv"
              onChange={handleFileChange}
              className="w-full cursor-pointer rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 file:mr-3 file:rounded file:border-0 file:bg-gray-700 file:px-3 file:py-1 file:text-sm file:text-gray-200"
            />
            {fileError && (
              <p className="mt-1 text-xs text-red-400">{fileError}</p>
            )}
            {file && (
              <p className="mt-1 text-xs text-gray-500">
                {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm text-gray-400">Options</label>
            {(
              [
                {
                  key: "enable_proxy",
                  label: "Enable proxy",
                  desc: "Route SMTP through the Racknerd tunnel",
                },
                {
                  key: "skip_duplicates",
                  label: "Skip duplicates",
                  desc: "Deduplicate output records",
                },
              ] as { key: keyof JobConfig; label: string; desc: string }[]
            ).map(({ key, label, desc }) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3"
              >
                <input
                  type="checkbox"
                  checked={config[key]}
                  onChange={() => handleToggle(key)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 accent-blue-500"
                />
                <span>
                  <span className="text-sm text-gray-200">{label}</span>
                  <span className="ml-2 text-xs text-gray-500">{desc}</span>
                </span>
              </label>
            ))}
          </div>

          {create.isError && (
            <p className="text-xs text-red-400">
              {create.error instanceof Error
                ? create.error.message
                : "Submission failed"}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {create.isPending ? "Submitting…" : "Run scraper"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
