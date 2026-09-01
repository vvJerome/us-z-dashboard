import { useRef, useState } from "react";
import { toast } from "sonner";
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
    try {
      await create.mutateAsync({ file, emailCol });
      toast.success("ZeroBounce job queued");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error starting job");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run ZeroBounce</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-muted-foreground">
              Input file
            </Label>
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose input file"
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-input bg-transparent px-3 py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
            >
              <span className="rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                Choose File
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {file ? file.name : "No file chosen"}
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.jsonl,.txt"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="mt-1 text-xs text-muted-foreground">
                {file.name}, {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          <div>
            <Label
              htmlFor="zb-email-col"
              className="mb-1 block text-muted-foreground"
            >
              Email column name
            </Label>
            <Input
              id="zb-email-col"
              type="text"
              value={emailCol}
              onChange={(e) => setEmailCol(e.target.value)}
              placeholder="email"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Name of the column containing email addresses
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!file || create.isPending}>
            {create.isPending ? "Starting…" : "Run ZeroBounce"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
