import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  RunHistoryChart,
  ThroughputChart,
} from "../../components/MetricsCharts";
import type { MetricsResponse } from "../../types/metrics";
import { fmt, fmtPct, relativeTime } from "./formatters";

const STATE_ORDER: [string, string][] = [
  ["VALIDATED", "text-emerald-300"],
  ["VALIDATING", "text-sky-300"],
  ["NEEDS_ZUHAL", "text-amber-300"],
  ["ZUHAL_VALIDATING", "text-amber-300"],
  ["DISCOVERED", "text-slate-200"],
  ["VALIDATION_FAILED", "text-rose-300"],
  ["DISCOVERY_FAILED", "text-rose-300"],
  ["COST_SKIPPED", "text-rose-300"],
];

const PILL_COLORS: Record<string, string> = {
  valid: "bg-emerald-900 text-emerald-300",
  dual_valid: "bg-emerald-900 text-emerald-300",
  ms_valid: "bg-emerald-900 text-emerald-300",
  catch_all: "bg-amber-900 text-amber-300",
  dual_catch_all: "bg-amber-900 text-amber-300",
  invalid: "bg-rose-950 text-rose-300",
  blocked: "bg-red-950 text-red-400",
  error: "bg-slate-800 text-slate-300",
  unknown: "bg-slate-800 text-slate-300",
  not_run: "bg-slate-800 text-slate-300",
};

function Pill({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="text-slate-500">—</span>;
  const cls = PILL_COLORS[v] ?? "bg-slate-800 text-slate-300";
  return (
    <span
      className={`inline-block rounded-full px-2 py-px text-[11px] font-semibold ${cls}`}
    >
      {v}
    </span>
  );
}

function card(children: React.ReactNode, extraCls = "") {
  return (
    <Card className={extraCls}>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function sectionTitle(t: string) {
  return <CardTitle className="mb-3 text-slate-300">{t}</CardTitle>;
}

export function StatePanel({ data }: { data: MetricsResponse }) {
  return card(
    <>
      {sectionTitle("State machine")}
      <div className="grid grid-cols-2 gap-y-2 font-mono">
        {STATE_ORDER.map(([s, cls]) => (
          <>
            <div key={`l-${s}`} className="text-sm text-slate-400">
              {s}
            </div>
            <div key={`v-${s}`} className={`text-right font-semibold ${cls}`}>
              {fmt(data.states[s] ?? 0)}
            </div>
          </>
        ))}
      </div>
      <div className="mt-3 flex justify-between border-t border-slate-700 pt-3 text-xs text-slate-400">
        <span>
          Total: <b className="text-slate-200">{fmt(data.totals.all)}</b>
        </span>
        <span>
          Pending: <b className="text-slate-200">{fmt(data.totals.pending)}</b>
        </span>
      </div>
    </>,
    "col-span-12 md:col-span-4",
  );
}

export function ThroughputPanel({ data }: { data: MetricsResponse }) {
  const s = data.throughput_60min;
  const counts = s.map((p) => p.count);
  const peak = counts.length ? Math.max(...counts) : 0;
  const avg = counts.length
    ? counts.reduce((a, b) => a + b, 0) / counts.length
    : 0;
  const last15 = counts.slice(-15).reduce((a, b) => a + b, 0);
  const prior30 = counts.slice(-45, -15);
  const recent15 = counts.slice(-15);
  const priorAvg = prior30.length
    ? prior30.reduce((a, b) => a + b, 0) / prior30.length
    : 0;
  const recentAvg = recent15.length
    ? recent15.reduce((a, b) => a + b, 0) / recent15.length
    : 0;
  let trendEl = <span className="text-slate-300">—</span>;
  if (priorAvg > 0) {
    const delta = ((recentAvg - priorAvg) / priorAvg) * 100;
    const arrow = delta > 2 ? "↑" : delta < -2 ? "↓" : "→";
    const cls =
      delta > 2
        ? "text-emerald-300"
        : delta < -2
          ? "text-rose-300"
          : "text-slate-300";
    trendEl = (
      <span className={cls}>
        {arrow} {Math.abs(delta).toFixed(0)}%
      </span>
    );
  }
  const eta = data.rate.eta_hours;
  const etaStr = data.rate.complete
    ? "done"
    : eta == null
      ? "—"
      : eta >= 48
        ? `${(eta / 24).toFixed(1)} d`
        : `${eta.toFixed(1)} h`;

  return card(
    <div className="flex flex-col">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        {sectionTitle("Throughput (last 60 min)")}
        <div className="text-xs text-slate-400">
          <b className="text-slate-100">{fmt(data.rate.per_hour)}</b>/hr · ETA{" "}
          <b className="text-slate-100">{etaStr}</b>
        </div>
      </div>
      <div style={{ position: "relative", height: 160 }}>
        <ThroughputChart series={s} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-3 border-t border-slate-700 pt-3 text-center text-xs">
        <div>
          <div className="text-slate-400">Peak / min</div>
          <div className="text-base font-semibold">{fmt(peak)}</div>
        </div>
        <div>
          <div className="text-slate-400">Avg / min</div>
          <div className="text-base font-semibold">{avg.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-slate-400">Last 15 m</div>
          <div className="text-base font-semibold">{fmt(last15)}</div>
        </div>
        <div>
          <div className="text-slate-400">Trend</div>
          <div className="text-base font-semibold">{trendEl}</div>
        </div>
      </div>
    </div>,
    "col-span-12 md:col-span-5",
  );
}

export function CostPanel({ data }: { data: MetricsResponse }) {
  const { cost, cost_breakdown, totals } = data;
  const pct = cost.pct ?? 0;
  const processed = totals.all - totals.pending;
  let projected = "—";
  if (processed > 0 && totals.all > 0 && cost.spent_usd > 0) {
    projected = `$${((cost.spent_usd * totals.all) / processed).toFixed(2)}`;
  }
  return card(
    <div className="flex flex-col">
      {sectionTitle("Cost")}
      <div className="text-3xl font-bold">
        $
        {cost.spent_usd < 0.01
          ? cost.spent_usd.toFixed(4)
          : cost.spent_usd.toFixed(2)}
      </div>
      <div className="mt-1 text-xs text-slate-400">
        of {cost.ceiling_usd ? `$${cost.ceiling_usd.toFixed(2)}` : "—"}
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded"
        style={{ background: "#1f2a48" }}
      >
        <div
          className="h-2"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: "linear-gradient(90deg,#3b82f6,#22d3ee)",
          }}
        />
      </div>
      <div className="mt-1 text-xs text-slate-400">{pct.toFixed(2)}%</div>
      <div className="mt-3 space-y-1 border-t border-slate-700 pt-3 text-xs">
        {cost_breakdown.services.map((s) => (
          <div key={s.name} className="flex justify-between">
            <span className="capitalize text-slate-400">{s.name}</span>
            <span>
              <span className="text-slate-200">
                $
                {s.cost_usd < 0.01
                  ? s.cost_usd.toFixed(4)
                  : s.cost_usd.toFixed(2)}
              </span>
              <span className="text-slate-500"> ({fmt(s.calls)})</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-2 text-xs text-slate-400">
        Est. full run: <b className="text-slate-200">{projected}</b>
      </div>
    </div>,
    "col-span-12 md:col-span-3",
  );
}

export function BackendsPanel({ data }: { data: MetricsResponse }) {
  const VERDICT_ORDER = [
    "valid",
    "catch_all",
    "dual_valid",
    "dual_catch_all",
    "invalid",
    "blocked",
    "error",
    "unknown",
    "not_run",
    "ms_valid",
  ];
  const entries: [string, string][] = [
    ["racknerd", "Cherry"],
    ["zuhal", "Zuhal"],
  ];
  return card(
    <>
      {sectionTitle("Backend verdicts (cumulative)")}
      <div className="space-y-3">
        {entries.map(([k, label]) => {
          const b = data.backends[k as keyof typeof data.backends] ?? {
            error_pct: 0,
            total: 0,
          };
          const errCls =
            b.error_pct > 70
              ? "text-rose-300"
              : b.error_pct > 40
                ? "text-amber-300"
                : "text-emerald-300";
          const pills = VERDICT_ORDER.filter(
            (v) => (b as Record<string, number>)[v],
          ).map((v) => <Pill key={v} v={v} />);
          return (
            <div key={k}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-slate-400">
                  {fmt(b.total)} probes · err{" "}
                  <span className={errCls}>{fmtPct(b.error_pct)}</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1 text-xs">
                {pills.length ? (
                  pills
                ) : (
                  <span className="text-slate-500">no data in window</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>,
    "col-span-12 lg:col-span-7",
  );
}

export function DiscoveryPanel({ data }: { data: MetricsResponse }) {
  const d = data.discovery;
  const p = (n: number) => (d.total_input ? (n / d.total_input) * 100 : 0);
  return card(
    <div className="flex flex-col">
      {sectionTitle("Discovery (cumulative)")}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-slate-400">DNS hit</div>
          <div className="text-2xl font-bold text-emerald-300">
            {fmt(d.dns)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Serper hit</div>
          <div className="text-2xl font-bold text-amber-300">
            {fmt(d.serper)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Failed</div>
          <div className="text-2xl font-bold text-rose-300">
            {fmt(d.failed)}
          </div>
        </div>
      </div>
      <div className="mt-auto pt-4">
        <div
          className="flex h-2 overflow-hidden rounded"
          style={{ background: "#1e293b" }}
        >
          <div className="bg-emerald-500" style={{ width: `${p(d.dns)}%` }} />
          <div className="bg-amber-400" style={{ width: `${p(d.serper)}%` }} />
          <div className="bg-rose-500" style={{ width: `${p(d.failed)}%` }} />
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1 text-center text-[11px] text-slate-400">
          <span>DNS {p(d.dns).toFixed(1)}%</span>
          <span>Serper {p(d.serper).toFixed(1)}%</span>
          <span>Failed {p(d.failed).toFixed(1)}%</span>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Hit rate <b className="text-slate-200">{d.hit_rate_pct.toFixed(1)}</b>
          % of <span className="text-slate-200">{fmt(d.total_input)}</span>{" "}
          input
        </div>
      </div>
    </div>,
    "col-span-12 lg:col-span-5",
  );
}

export function RunHistoryPanel({ data }: { data: MetricsResponse }) {
  const rows = data.run_history;
  const started = rows[0]?.hour.replace("T", " ") ?? "—";
  return card(
    <>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        {sectionTitle("Run timeline (per hour)")}
        <div className="text-xs text-slate-400">
          started <span className="text-slate-200">{started}</span>· elapsed{" "}
          <span className="text-slate-200">{rows.length}h</span>·{" "}
          <span className="text-slate-200">{rows.length}</span> h
        </div>
      </div>
      <div style={{ position: "relative", height: 220 }}>
        <RunHistoryChart rows={rows} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        {[
          ["#10b981", "valid"],
          ["#f59e0b", "catch_all"],
          ["#f43f5e", "invalid"],
          ["#64748b", "error/unknown"],
          ["#7f1d1d", "discovery"],
        ].map(([color, label]) => (
          <span key={label}>
            <i
              className="mr-1 inline-block h-2 w-2 align-middle rounded-sm"
              style={{ background: color }}
            />
            {label}
          </span>
        ))}
      </div>
    </>,
    "col-span-12",
  );
}

export function RecentPanel({ data }: { data: MetricsResponse }) {
  return card(
    <>
      {sectionTitle("Recent validations")}
      <div className="overflow-auto" style={{ maxHeight: 380 }}>
        <table className="w-full font-mono text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="p-1">id</th>
              <th className="p-1">email</th>
              <th className="p-1">cherry</th>
              <th className="p-1">zuhal</th>
              <th className="p-1">when</th>
            </tr>
          </thead>
          <tbody>
            {data.recent_validated.map((r, i) => (
              <tr key={i} className="border-t border-slate-800">
                <td className="p-1 text-slate-400">{r.unique_id ?? "—"}</td>
                <td
                  className="p-1"
                  style={{
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.candidate_email ?? "—"}
                </td>
                <td className="p-1">
                  <Pill v={r.racknerd_status} />
                </td>
                <td className="p-1">
                  <Pill v={r.zuhal_status} />
                </td>
                <td className="p-1 text-slate-400">
                  {relativeTime(r.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>,
    "col-span-12 lg:col-span-7",
  );
}

export function ErrorsPanel({ data }: { data: MetricsResponse }) {
  return card(
    <>
      {sectionTitle("Top errors")}
      <div className="overflow-auto" style={{ maxHeight: 380 }}>
        <table className="w-full font-mono text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="p-1">#</th>
              <th className="p-1">src</th>
              <th className="p-1">message</th>
            </tr>
          </thead>
          <tbody>
            {data.top_recent_errors.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-2 text-slate-500">
                  no errors
                </td>
              </tr>
            ) : (
              data.top_recent_errors.map((r, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="p-1 text-right text-slate-300">{fmt(r.n)}</td>
                  <td className="p-1">
                    <Pill v={r.source} />
                  </td>
                  <td className="p-1 text-slate-300">{r.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>,
    "col-span-12 lg:col-span-5",
  );
}
