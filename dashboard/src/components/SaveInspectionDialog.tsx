import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCreateInspection } from "../hooks/useInspections";

interface SaveInspectionDialogProps {
  vpsId: string;
  dbPath: string;
  onClose: () => void;
  onSaved: (inspectionId: string) => void;
}

export function SaveInspectionDialog({
  vpsId,
  dbPath,
  onClose,
  onSaved,
}: SaveInspectionDialogProps) {
  const [name, setName] = useState("");
  const create = useCreateInspection();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const saved = await create.mutateAsync({
        name: name.trim(),
        vpsId,
        dbPath,
      });
      onSaved(saved.id);
    } catch {
      // create.isError / create.error already drive the error message below.
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save this inspection</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label
              htmlFor="save-inspection-name"
              className="mb-1 block text-muted-foreground"
            >
              Name
            </Label>
            <input
              id="save-inspection-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wisconsin full run"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {create.isError && (
            <p className="text-xs text-destructive">
              {(create.error as Error)?.message ?? "Failed to save."}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
