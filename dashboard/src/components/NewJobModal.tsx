import { UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCreateJob, useJobs } from "../hooks/useJobs";
import { useVps } from "../hooks/useVps";

interface NewJobModalProps {
  onClose: () => void;
}

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
const ALLOWED_EXT = new Set([".jsonl", ".csv"]);

// enable_proxy is ignored by the pipeline unconditionally (Racknerd was
// removed, Proxy25 is now the only SMTP backend - see us-z-3 ADR-0016), and
// skip_duplicates is read but never actually passed to the merge step, which
// always dedupes regardless. Neither is a real user choice, so there's no
// toggle for them in this form - these are just the values the backend
// still expects on the wire.
const DEFAULT_CONFIG = { enable_proxy: false, skip_duplicates: true };

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function NewJobModal({ onClose }: NewJobModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [name, setName] = useState("");
  const [vpsId, setVpsId] = useState<string | null>(null);
  const create = useCreateJob();
  const { data: vpsList } = useVps();
  const { data: jobData } = useJobs();

  const busyVpsIds = new Set(
    (jobData?.jobs ?? [])
      .filter((j) => j.status === "RUNNING" && j.vps_id)
      .map((j) => j.vps_id),
  );

  useEffect(() => {
    if (vpsList && vpsList.length > 0 && vpsId === null) {
      const local = vpsList.find((v) => v.is_local) ?? vpsList[0];
      setVpsId(local.id);
    }
  }, [vpsList, vpsId]);

  function validateAndSetFile(picked: File) {
    setFileError(null);
    if (!ALLOWED_EXT.has(getExtension(picked.name))) {
      setFileError("Only .jsonl and .csv files are accepted.");
      setFile(null);
      return;
    }
    if (picked.size > MAX_BYTES) {
      setFileError("File exceeds 1 GB limit.");
      setFile(null);
      return;
    }
    setFile(picked);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    validateAndSetFile(picked);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    try {
      await create.mutateAsync({
        file,
        config: DEFAULT_CONFIG,
        vpsId,
        name: name.trim() || undefined,
      });
      toast.success("Enrichment job queued");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    }
  }

  const submitDisabled = !file || create.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New enrichment job</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <Label
              htmlFor="new-job-name"
              className="mb-1 block text-muted-foreground"
            >
              Job name{" "}
              <span className="text-muted-foreground/70">(optional)</span>
            </Label>
            <Input
              id="new-job-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to the input filename"
            />
          </div>

          <div>
            <Label className="mb-1 block text-muted-foreground">
              Input file
            </Label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-input hover:bg-muted/30",
              )}
            >
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag a .jsonl or .csv file here, or{" "}
                <span className="text-foreground underline underline-offset-2">
                  browse
                </span>
              </p>
              {file && (
                <p className="text-xs text-foreground">
                  {file.name}, {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
              <input
                id="new-job-file"
                ref={fileRef}
                type="file"
                accept=".jsonl,.csv"
                onChange={handleFileChange}
                onClick={(e) => e.stopPropagation()}
                className="hidden"
              />
            </div>
            {fileError && (
              <p className="mt-1 text-xs text-destructive">{fileError}</p>
            )}
          </div>

          {vpsList && vpsList.length > 0 && (
            <div>
              <Label className="mb-1 block text-muted-foreground">
                Run on VPS
              </Label>
              <div role="radiogroup" className="flex flex-col gap-2">
                {vpsList.map((v) => {
                  const busy = busyVpsIds.has(v.id);
                  const selected = vpsId === v.id;
                  return (
                    <label
                      key={v.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm transition-colors",
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-input hover:bg-muted/30",
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="new-job-vps"
                          value={v.id}
                          checked={selected}
                          onChange={() => setVpsId(v.id)}
                          className="h-4 w-4"
                        />
                        <span className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {v.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {v.is_local ? "Local" : v.ssh_host}
                          </span>
                        </span>
                      </span>
                      <Badge variant={busy ? "warning" : "secondary"}>
                        {busy ? "Busy" : "Idle"}
                      </Badge>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                A busy worker queues this job instead of starting it right away.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {create.isPending ? "Submitting…" : "Run enrichment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
