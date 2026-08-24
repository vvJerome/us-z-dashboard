import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SaveInspectionDialog } from "../components/SaveInspectionDialog";
import { useInspections, useSavedInspection } from "../hooks/useInspections";
import { useVps } from "../hooks/useVps";
import { useVpsDbMetrics } from "../hooks/useVpsDbMetrics";
import {
  CostPanel,
  DiscoveryPanel,
  ErrorsPanel,
  PipelineHealthPanel,
  RecentPanel,
  RunHistoryPanel,
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

  const [vpsId, setVpsId] = useState("");
  const [dbPath, setDbPath] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

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

  return (
    <div
      className="min-h-screen p-4 md:p-6"
      style={{
        background: "#0b1020",
        color: "#e6edf3",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">
            us-z-3 pipeline
          </div>
          <h1 className="text-xl font-semibold">
            {saved ? saved.name : "Inspect pipeline.db"}
          </h1>
        </div>
        <button
          onClick={() => navigate("/")}
          className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
        >
          ← Jobs
        </button>
      </header>

      {savedList && savedList.length > 0 && (
        <div className="mb-4 flex flex-col gap-1">
          <label htmlFor="inspect-saved" className="text-xs text-slate-400">
            Saved inspections
          </label>
          <select
            id="inspect-saved"
            value={inspectionId ?? ""}
            onChange={(e) => {
              if (e.target.value) navigate(`/inspect/${e.target.value}`);
              else navigate("/inspect");
            }}
            className="w-full max-w-md rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          >
            <option value="">Select a saved inspection…</option>
            {savedList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setLoaded(true);
        }}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="inspect-vps" className="text-xs text-slate-400">
            VPS
          </label>
          <select
            id="inspect-vps"
            value={vpsId}
            onChange={(e) => {
              setVpsId(e.target.value);
              setLoaded(false);
            }}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          >
            <option value="">Select a VPS…</option>
            {vpsList?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 min-w-[20rem] flex-col gap-1">
          <label htmlFor="inspect-db-path" className="text-xs text-slate-400">
            Absolute path to pipeline.db
          </label>
          <input
            id="inspect-db-path"
            value={dbPath}
            onChange={(e) => {
              setDbPath(e.target.value);
              setLoaded(false);
            }}
            placeholder="/home/devonly/pipeline_runs/universal-scraper-v3-wi/output/wi_full/pipeline.db"
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={!vpsId || !dbPath}
          className="rounded border border-sky-700 bg-sky-900/40 px-4 py-1.5 text-sm text-sky-200 hover:bg-sky-900/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isFetching ? "Loading…" : "Load"}
        </button>

        {data && !saved && (
          <button
            type="button"
            onClick={() => setShowSaveDialog(true)}
            className="rounded border border-emerald-700 bg-emerald-900/40 px-4 py-1.5 text-sm text-emerald-200 hover:bg-emerald-900/70"
          >
            Save…
          </button>
        )}
      </form>

      {loaded && !data && !isError && (
        <div className="py-20 text-center text-slate-400">
          Loading pipeline data…
        </div>
      )}

      {loaded && isError && (
        <div className="py-20 text-center text-slate-500">
          {(error as Error)?.message ?? "Pipeline DB unavailable."}
        </div>
      )}

      {data && (
        <main className="grid grid-cols-12 gap-4">
          <StatePanel data={data} />
          <ThroughputPanel data={data} />
          <CostPanel data={data} />
          <SmtpOutcomePanel data={data} />
          <PipelineHealthPanel data={data} />
          <DiscoveryPanel data={data} />
          <RunHistoryPanel data={data} />
          <RecentPanel data={data} />
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
