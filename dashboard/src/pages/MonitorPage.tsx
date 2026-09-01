import { RefreshCw } from "lucide-react";
import { Component, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useJob } from "../hooks/useJobs";
import { useJobMetrics } from "../hooks/useJobMetrics";
import type { MetricsResponse } from "../types/metrics";
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
import { MonitorSkeleton } from "./monitor/Skeletons";

// Feeds the same panels a job that never ran (or hasn't started yet) would
// otherwise have no data for, so the breakdown's shape is visible - every
// panel already renders a sensible zero/empty state for these values.
const EMPTY_METRICS: MetricsResponse = {
  run_id: null,
  as_of: "",
  build_ms: 0,
  states: {},
  totals: { all: 0, terminal: 0, pending: 0 },
  rate: { last_15min: 0, per_hour: 0, eta_hours: null, complete: false },
  throughput_60min: [],
  backends: { smtp: { error_pct: 0, total: 0 } },
  heartbeats: { producer: null, dispatcher: null },
  discovery: {
    first_party: 0,
    third_party: 0,
    failed: 0,
    total_input: 0,
    hit_rate_pct: 0,
  },
  cost: { spent_usd: 0, ceiling_usd: null, pct: null },
  cost_breakdown: { services: [] },
  run_history: [],
  recent_validated: [],
  top_recent_errors: [],
  run_events: [],
};

// ponytail: error boundaries have no hook equivalent in React 18/19, this
// stays a class component by necessity, not an oversight.
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
        <div className="min-h-screen bg-background p-8 text-foreground">
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6">
            <div className="mb-2 font-semibold text-destructive">
              Monitor page crashed
            </div>
            <pre className="overflow-auto text-xs text-destructive">
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

// Scaled to the 20s poll interval (was 4s against a 10s interval) so a
// single slow round trip doesn't flip the indicator to "stale" on its own.
const STALE_MS = 8000;

function MonitorPageInner() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data, isError, error, refetch, isFetching } = useJobMetrics(
    jobId ?? "",
  );
  const notRunning =
    isError && (error as Error)?.message?.includes("not RUNNING");
  const { data: job, refetch: refetchJob } = useJob(jobId ?? "");
  const title = job ? job.name || job.input_filename : (jobId ?? "N/A");
  const lastOkRef = useRef(0);
  const [stale, setStale] = useState(false);
  const [verdictFilter, setVerdictFilter] = useState<string | null>(null);

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
      : notRunning
        ? "bg-muted-foreground"
        : "animate-pulse bg-sky-500";

  function handleRefresh() {
    refetch();
    refetchJob();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background p-3 text-foreground md:p-4">
      <header className="mb-1.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full transition-colors ${indicatorCls}`}
            />
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                us-z-3 pipeline
              </div>
              <h1 className="text-xl font-semibold">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-muted-foreground">
              {data?.as_of ?? "N/A"} · {data?.build_ms ?? "N/A"} ms ·{" "}
              {stale
                ? "stale"
                : data
                  ? "live"
                  : notRunning
                    ? "not running"
                    : "connecting"}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
              />
              <span className="ml-1.5">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      {!data && !isError && (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <MonitorSkeleton />
        </main>
      )}

      {!data && isError && !notRunning && (
        <div className="py-20 text-center text-muted-foreground">
          Pipeline DB not available yet, retrying…
        </div>
      )}

      {(data || notRunning) && (
        <main className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {notRunning && (
            <p className="shrink-0 text-sm text-muted-foreground">
              This job isn&apos;t running right now, so there&apos;s no live
              data. Here&apos;s what the breakdown looks like empty.
            </p>
          )}
          <div className="grid grid-cols-12 gap-1.5">
            {/* Row 1 is the "is it working" tier: progress, rate, and
                whether the producer/dispatcher heartbeats are alive - all
                more urgent than spend, which moves to row 2. */}
            <StatePanel data={data ?? EMPTY_METRICS} />
            <ThroughputPanel data={data ?? EMPTY_METRICS} />
            <PipelineHealthPanel data={data ?? EMPTY_METRICS} />
            <SmtpOutcomePanel
              data={data ?? EMPTY_METRICS}
              selectedVerdict={verdictFilter}
              onSelectVerdict={setVerdictFilter}
            />
            <CostPanel data={data ?? EMPTY_METRICS} />
            <DiscoveryPanel data={data ?? EMPTY_METRICS} />
            <RunHistoryPanel data={data ?? EMPTY_METRICS} />
            <RecentPanel
              data={data ?? EMPTY_METRICS}
              filterVerdict={verdictFilter}
              onClearFilter={() => setVerdictFilter(null)}
            />
            <RunEventsPanel data={data ?? EMPTY_METRICS} />
            <ErrorsPanel data={data ?? EMPTY_METRICS} />
          </div>
        </main>
      )}

      <footer className="mt-1 shrink-0 text-xs text-muted-foreground">
        read-only · 20s poll · server cache ~2s
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
