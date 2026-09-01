import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useJobs } from "../hooks/useJobs";
import { useCreateVps, useDeleteVps, useVps } from "../hooks/useVps";

const DEFAULT_FORM = {
  name: "",
  ssh_host: "",
  ssh_user: "root",
  ssh_port: "22",
  data_dir: "/data",
  repo_dir: "",
};

// Mirrors backend/utils/paths.py's validate_safe_absolute_path: both fields
// are interpolated into remote shell commands (worker.py, pipeline_ssh.py),
// so this rejects the same traversal and shell-metacharacter risks
// client-side, before the round trip to the server.
const pathSchema = z
  .string()
  .min(1, "is required")
  .refine((v) => !v.includes(".."), 'must not contain ".."')
  .regex(
    /^\/[A-Za-z0-9_./-]*$/,
    "must be an absolute path using only letters, numbers, underscores, dots, slashes, and hyphens",
  );

const vpsFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  ssh_host: z.string().trim(),
  ssh_user: z.string().trim().min(1),
  ssh_port: z.coerce.number().int().min(1).max(65535),
  data_dir: pathSchema,
  repo_dir: pathSchema,
});

function whitespaceToSlash(v: string): string {
  return v.replace(/\s/g, "/");
}

export function VpsPage() {
  const { data: vpsList, isLoading, isError } = useVps();
  const { data: jobData } = useJobs();
  const createVps = useCreateVps();
  const deleteVps = useDeleteVps();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const runningByVps = new Map<string, number>();
  for (const job of jobData?.jobs ?? []) {
    if (job.status === "RUNNING" && job.vps_id) {
      runningByVps.set(job.vps_id, (runningByVps.get(job.vps_id) ?? 0) + 1);
    }
  }

  async function handleCreate() {
    const parsed = vpsFormSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      await createVps.mutateAsync({
        name: parsed.data.name,
        is_local: !parsed.data.ssh_host,
        ssh_host: parsed.data.ssh_host || null,
        ssh_user: parsed.data.ssh_user,
        ssh_port: parsed.data.ssh_port,
        data_dir: parsed.data.data_dir,
        repo_dir: parsed.data.repo_dir,
      });
      toast.success(`${parsed.data.name} added.`);
      setForm(DEFAULT_FORM);
      setShowForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add VPS.");
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      await deleteVps.mutateAsync(id);
      toast.success(`${name} removed.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove VPS.");
    }
  }

  return (
    <div className="flex flex-col gap-6 px-8 pb-8 pt-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Workers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The machines that run your enrichment jobs. Each worker handles one
            job at a time.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>Add VPS</Button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a worker VPS</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="vps-name">Name</Label>
              <Input
                id="vps-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="vps-host">
                SSH host{" "}
                <span className="text-muted-foreground">(blank = local)</span>
              </Label>
              <Input
                id="vps-host"
                value={form.ssh_host}
                onChange={(e) => setForm({ ...form, ssh_host: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vps-user">SSH user</Label>
              <Input
                id="vps-user"
                value={form.ssh_user}
                onChange={(e) => setForm({ ...form, ssh_user: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vps-port">SSH port</Label>
              <Input
                id="vps-port"
                type="number"
                value={form.ssh_port}
                onChange={(e) => setForm({ ...form, ssh_port: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vps-data-dir">Data Directory</Label>
              <Input
                id="vps-data-dir"
                value={form.data_dir}
                onChange={(e) =>
                  setForm({
                    ...form,
                    data_dir: whitespaceToSlash(e.target.value),
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vps-repo-dir">Pipeline directory</Label>
              <Input
                id="vps-repo-dir"
                value={form.repo_dir}
                onChange={(e) =>
                  setForm({
                    ...form,
                    repo_dir: whitespaceToSlash(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createVps.isPending}>
              {createVps.isPending ? "Adding…" : "Add VPS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading && (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }, (_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: 4 }, (_, col) => (
                    <TableCell key={col} className="py-4">
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {!isLoading && isError && (
        <p className="text-sm text-destructive">
          Failed to load workers. Retrying…
        </p>
      )}
      {!isLoading && !isError && vpsList && vpsList.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No workers registered yet.
        </p>
      )}
      {!isLoading && vpsList && vpsList.length > 0 && (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vpsList.map((vps) => (
                <TableRow key={vps.id}>
                  <TableCell className="py-4 font-medium text-foreground">
                    {vps.name}
                  </TableCell>
                  <TableCell className="py-4 text-muted-foreground">
                    {vps.is_local ? "Local" : vps.ssh_host}
                  </TableCell>
                  <TableCell className="py-4 text-muted-foreground">
                    {(runningByVps.get(vps.id) ?? 0) > 0 ? "Busy" : "Idle"}
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(vps.id, vps.name)}
                      disabled={deleteVps.isPending}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Note: how many emails a worker can validate at once is set on the worker
        itself, not here, and is capped by our SMTP provider&apos;s plan.
      </p>
    </div>
  );
}
