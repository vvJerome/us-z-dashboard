import { useState } from "react";
import { fetchJobDownload } from "../api/jobs";

interface DownloadState {
  loading: boolean;
  error: string | null;
}

export function useJobDownload() {
  const [state, setState] = useState<DownloadState>({
    loading: false,
    error: null,
  });

  async function download(jobId: string, filename: string): Promise<void> {
    setState({ loading: true, error: null });
    try {
      const { url } = await fetchJobDownload(jobId);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Download failed",
      });
      return;
    }
    setState({ loading: false, error: null });
  }

  return { ...state, download };
}
