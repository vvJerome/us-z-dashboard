import { useRef, useState } from "react";
import { useCreateZeroBounceJob } from "../hooks/useZeroBounce";

interface ZeroBounceModalProps {
  onClose: () => void;
}

export function ZeroBounceModal({ onClose }: ZeroBounceModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [emailCol, setEmailCol] = useState("email");
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateZeroBounceJob();

  async function handleSubmit() {
    if (!file) return;
    await create.mutateAsync({ file, emailCol });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">
            Run ZeroBounce
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">
              Input file
            </label>
            <div
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
              onClick={() => fileRef.current?.click()}
            >
              <span className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300">
                Choose File
              </span>
              <span className="truncate text-sm text-gray-400">
                {file ? file.name : "No file chosen"}
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="mt-1 text-xs text-gray-500">
                {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-400">
              Email column name
            </label>
            <input
              type="text"
              value={emailCol}
              onChange={(e) => setEmailCol(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="email"
            />
            <p className="mt-1 text-xs text-gray-500">
              Name of the column containing email addresses
            </p>
          </div>

          {create.isError && (
            <p className="text-sm text-red-400">
              {(create.error as Error)?.message ?? "Error starting job"}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || create.isPending}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {create.isPending ? "Starting…" : "Run ZeroBounce"}
          </button>
        </div>
      </div>
    </div>
  );
}
