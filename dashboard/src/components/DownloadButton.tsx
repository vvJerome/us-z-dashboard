import { useJobDownload } from "../hooks/useJobDownload";

interface DownloadButtonProps {
  jobId: string;
  filename: string;
}

export function DownloadButton({ jobId, filename }: DownloadButtonProps) {
  const { loading, error, download } = useJobDownload();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={() => download(jobId, `result_${filename}`)}
        disabled={loading}
        className="rounded bg-green-700 px-3 py-1 text-sm font-medium text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Downloading…" : "Download"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
