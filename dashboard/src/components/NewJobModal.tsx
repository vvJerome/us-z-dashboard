import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCreateJob } from "../hooks/useJobs";
import { useVps } from "../hooks/useVps";
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
  const [vpsId, setVpsId] = useState<string | null>(null);
  const create = useCreateJob();
  const { data: vpsList } = useVps();

  useEffect(() => {
    if (vpsList && vpsList.length > 0 && vpsId === null) {
      const local = vpsList.find((v) => v.is_local) ?? vpsList[0];
      setVpsId(local.id);
    }
  }, [vpsList, vpsId]);

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
    await create.mutateAsync({ file, config, vpsId });
    onClose();
  }

  const submitDisabled = !file || create.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New scraper job</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <Label htmlFor="new-job-file" className="mb-1 block text-muted-foreground">
              Input file
            </Label>
            <input
              id="new-job-file"
              ref={fileRef}
              type="file"
              accept=".jsonl,.csv"
              onChange={handleFileChange}
              className="w-full cursor-pointer rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:text-secondary-foreground"
            />
            {fileError && (
              <p className="mt-1 text-xs text-destructive">{fileError}</p>
            )}
            {file && (
              <p className="mt-1 text-xs text-muted-foreground">
                {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          {vpsList && vpsList.length > 0 && (
            <div>
              <Label htmlFor="new-job-vps" className="mb-1 block text-muted-foreground">
                Run on VPS
              </Label>
              <select
                id="new-job-vps"
                value={vpsId ?? ""}
                onChange={(e) => setVpsId(e.target.value || null)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {vpsList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.is_local ? " (local)" : ` — ${v.ssh_host}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Label className="text-muted-foreground">Options</Label>
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
                  className="mt-0.5 h-4 w-4 rounded border-input bg-transparent accent-primary"
                />
                <span>
                  <span className="text-sm text-foreground">{label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {desc}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {create.isError && (
            <p className="text-xs text-destructive">
              {create.error instanceof Error
                ? create.error.message
                : "Submission failed"}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {create.isPending ? "Submitting…" : "Run scraper"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
