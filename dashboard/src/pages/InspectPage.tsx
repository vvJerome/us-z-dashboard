import { Database, MoreVertical } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveInspectionDialog } from "../components/SaveInspectionDialog";
import {
  useDeleteInspection,
  useInspections,
  useSavedInspection,
} from "../hooks/useInspections";
import { useVps } from "../hooks/useVps";
import { useVpsDbMetrics } from "../hooks/useVpsDbMetrics";
import {
  ErrorsPanel,
  RecentPanel,
  RunEventsPanel,
  RunHistoryPanel,
} from "./monitor/DrillDownPanels";
import {
  CostPanel,
  DiscoveryPanel,
  PipelineHealthPanel,
  SmtpOutcomePanel,
  StatePanel,
  ThroughputPanel,
} from "./monitor/Panels";

export function InspectPage() {
  const navigate = useNavigate();
  const { inspectionId } = useParams<{ inspectionId?: string }>();
  const { data: vpsList } = useVps();
  const { data: savedList } = useInspections();
  const { data: saved } = useSavedInspection(inspectionId);
  const deleteInspection = useDeleteInspection();

  const [vpsId, setVpsId] = useState("");
  const [dbPath, setDbPath] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [verdictFilter, setVerdictFilter] = useState<string | null>(null);

  useEffect(() => {
    if (saved) {
      setVpsId(saved.vps_id);
      setDbPath(saved.db_path);
      setLoaded(true);
    }
  }, [saved]);

  const { data, isFetching, isError, error } = useVpsDbMetrics(
    vpsId,
    dbPath,
    loaded,
  );

  function handleDelete(id: string, name: string) {
    deleteInspection.mutate(id, {
      onSuccess: () => {
        toast.success(`Deleted "${name}"`);
        if (inspectionId === id) navigate("/inspect");
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Delete failed"),
    });
  }

  return (
    <div className="bg-background p-4 text-foreground md:p-6">
      <header className="mb-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          us-z-3 pipeline
        </div>
        <h1 className="text-xl font-semibold">
          {saved ? saved.name : "Inspect"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Load a job&apos;s data source (its{" "}
          <code className="text-foreground">pipeline.db</code>) directly from
          its VPS to see live discovery, validation, and cost metrics for that
          run. Useful for jobs triggered outside the dashboard, or for digging
          deeper than the job list's own log view.
        </p>
      </header>

      {savedList && savedList.length > 0 && (
        <div className="mb-4 flex flex-col gap-1">
          <Label htmlFor="inspect-saved" className="text-muted-foreground">
            Saved inspections
          </Label>
          <div className="flex max-w-md items-center gap-2">
            <select
              id="inspect-saved"
              value={inspectionId ?? ""}
              onChange={(e) => {
                if (e.target.value) navigate(`/inspect/${e.target.value}`);
                else navigate("/inspect");
              }}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select a saved inspection…</option>
              {savedList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!inspectionId}
                  aria-label="Inspection actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={!saved}
                  onSelect={() => saved && handleDelete(saved.id, saved.name)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setLoaded(true);
        }}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border bg-muted/50 p-4"
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="inspect-vps" className="text-muted-foreground">
            VPS
          </Label>
          <select
            id="inspect-vps"
            value={vpsId}
            onChange={(e) => {
              setVpsId(e.target.value);
              setLoaded(false);
            }}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Select a VPS…</option>
            {vpsList?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-[20rem] flex-1 flex-col gap-1">
          <Label htmlFor="inspect-db-path" className="text-muted-foreground">
            Data source path{" "}
            <span className="text-muted-foreground/70">(pipeline.db)</span>
          </Label>
          <Input
            id="inspect-db-path"
            value={dbPath}
            onChange={(e) => {
              setDbPath(e.target.value);
              setLoaded(false);
            }}
            placeholder="/home/devonly/pipeline_runs/universal-scraper-v3-wi/output/wi_full/pipeline.db"
          />
        </div>

        <Button type="submit" disabled={!vpsId || !dbPath}>
          {isFetching ? "Loading…" : "Load"}
        </Button>

        {data && !saved && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowSaveDialog(true)}
          >
            Save…
          </Button>
        )}
      </form>

      {!loaded && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-20 text-center text-muted-foreground">
          <Database className="h-8 w-8" />
          <p className="max-w-sm text-sm">
            Pick the VPS a job ran on and its data source path, then Load to see
            its metrics here.
          </p>
        </div>
      )}

      {loaded && !data && !isError && (
        <div className="py-20 text-center text-muted-foreground">
          Loading data source…
        </div>
      )}

      {loaded && isError && (
        <div className="py-20 text-center text-destructive">
          {(error as Error)?.message ?? "Data source unavailable."}
        </div>
      )}

      {data && (
        <main className="grid grid-cols-12 gap-4">
          <StatePanel data={data} />
          <ThroughputPanel data={data} />
          <CostPanel data={data} />
          <SmtpOutcomePanel
            data={data}
            selectedVerdict={verdictFilter}
            onSelectVerdict={setVerdictFilter}
          />
          <PipelineHealthPanel data={data} />
          <DiscoveryPanel data={data} />
          <RunHistoryPanel data={data} />
          <RecentPanel
            data={data}
            filterVerdict={verdictFilter}
            onClearFilter={() => setVerdictFilter(null)}
          />
          <RunEventsPanel data={data} />
          <ErrorsPanel data={data} />
        </main>
      )}

      {showSaveDialog && (
        <SaveInspectionDialog
          vpsId={vpsId}
          dbPath={dbPath}
          onClose={() => setShowSaveDialog(false)}
          onSaved={(id) => {
            setShowSaveDialog(false);
            navigate(`/inspect/${id}`);
          }}
        />
      )}
    </div>
  );
}
