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
        variant="outline"
        size="sm"
        onClick={() => download(jobId, `result_${filename}`)}
        disabled={loading}
      >
        {loading ? "Downloading…" : "Download"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
