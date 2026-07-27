import { Button } from "@/components/ui/button";
import { useJobDownload } from "../hooks/useJobDownload";

interface DownloadButtonProps {
  jobId: string;
  filename: string;
}

export function DownloadButton({ jobId, filename }: DownloadButtonProps) {
  const { loading, error, download } = useJobDownload();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        onClick={() => download(jobId, `result_${filename}`)}
        disabled={loading}
        className="bg-emerald-700 text-white hover:bg-emerald-600"
      >
        {loading ? "Downloading…" : "Download"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
