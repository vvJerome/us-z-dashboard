import { Component, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useJobMetrics } from "../hooks/useJobMetrics";
import {
  BackendsPanel,
  CostPanel,
  DiscoveryPanel,
  ErrorsPanel,
  RecentPanel,
  RunHistoryPanel,
  StatePanel,
  ThroughputPanel,
} from "./monitor/Panels";

class MonitorErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("MonitorPage crash:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div
          className="min-h-screen p-8"
          style={{ background: "#0b1020", color: "#e6edf3" }}
        >
          <div className="rounded-xl border border-rose-800 bg-rose-950 p-6">
            <div className="mb-2 font-semibold text-rose-300">
              Monitor page crashed
            </div>
            <pre className="overflow-auto text-xs text-rose-200">
              {this.state.error.message}
              {"\n"}
              {this.state.error.stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const STALE_MS = 4000;

function MonitorPageInner() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { data, isError, error } = useJobMetrics(jobId ?? "");
  const lastOkRef = useRef(0);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (data) {
      lastOkRef.current = Date.now();
      setStale(false);
    }
  }, [data]);

  useEffect(() => {
    const id = setInterval(() => {
      if (lastOkRef.current && Date.now() - lastOkRef.current > STALE_MS) {
        setStale(true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const indicatorCls = stale
    ? "animate-pulse bg-rose-500"
    : data
      ? "bg-emerald-500"
      : "animate-pulse bg-sky-500";

  return (
    <div
      className="min-h-screen p-4 md:p-6"
      style={{
        background: "#0b1020",
        color: "#e6edf3",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <header className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${indicatorCls}`}
            />
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400">
                us-z-3 pipeline
              </div>
              <h1 className="text-xl font-semibold">
                {data?.run_id ?? jobId ?? "—"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-xs text-slate-400">
              {data?.as_of ?? "—"} · {data?.build_ms ?? "—"} ms ·{" "}
              {stale ? "stale" : data ? "live" : "connecting"}
            </div>
            <button
              onClick={() => navigate("/")}
              className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
            >
              ← Jobs
            </button>
          </div>
        </div>
      </header>

      {!data && !isError && (
        <div className="py-20 text-center text-slate-400">
          Loading pipeline data…
        </div>
      )}

      {!data && isError && (
        <div className="py-20 text-center text-slate-500">
          {(error as Error)?.message?.includes("not RUNNING")
            ? "Job is not currently running."
            : "Pipeline DB not available yet — retrying…"}
        </div>
      )}

      {data && (
        <main className="grid grid-cols-12 gap-4">
          <StatePanel data={data} />
          <ThroughputPanel data={data} />
          <CostPanel data={data} />
          <BackendsPanel data={data} />
          <DiscoveryPanel data={data} />
          <RunHistoryPanel data={data} />
          <RecentPanel data={data} />
          <ErrorsPanel data={data} />
        </main>
      )}

      <footer className="mt-6 text-xs text-slate-500">
        read-only · 2s poll · server cache ~2s
      </footer>
    </div>
  );
}

export function MonitorPage() {
  return (
    <MonitorErrorBoundary>
      <MonitorPageInner />
    </MonitorErrorBoundary>
  );
}
