import { ChevronDown } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  HeartbeatIndicator,
  pipelineHealthStatus,
  ThroughputChart,
} from "../../components/MetricsCharts";
import { useCountUp } from "../../hooks/useCountUp";
import { usePrevious } from "../../hooks/usePrevious";
import type { MetricsResponse } from "../../types/metrics";
import { fmt, fmtPct } from "./formatters";

interface NumProps {
  value: number;
}

interface NumFixedProps {
  value: number;
  digits: number;
}

// Wraps a raw count in the count-up animation so polling updates ease
// toward the new value instead of snapping (which reads as a flicker).
function Num({ value }: NumProps) {
  return <>{fmt(Math.round(useCountUp(value)))}</>;
}

function NumFixed({ value, digits }: NumFixedProps) {
  return <>{useCountUp(value).toFixed(digits)}</>;
}

// Keyed by the raw state name the API returns (used to look up
// data.states[s]); STATE_LABELS below is what's actually shown on screen.
const STATE_ORDER: [string, string][] = [
  ["VALIDATED", "text-emerald-300"],
  ["VALIDATING", "text-sky-300"],
  ["DISCOVERED", "text-foreground"],
  ["VALIDATION_FAILED", "text-rose-300"],
  ["DISCOVERY_FAILED", "text-rose-300"],
  ["COST_SKIPPED", "text-rose-300"],
];

const STATE_LABELS: Record<string, string> = {
  VALIDATED: "Validated",
  VALIDATING: "Validating",
  DISCOVERED: "Discovered",
  VALIDATION_FAILED: "Validation failed",
  DISCOVERY_FAILED: "Discovery failed",
  COST_SKIPPED: "Cost skipped",
};

const PILL_COLORS: Record<string, string> = {
  valid: "bg-emerald-900 text-emerald-300",
  dual_valid: "bg-emerald-900 text-emerald-300",
  ms_valid: "bg-emerald-900 text-emerald-300",
  catch_all: "bg-amber-900 text-amber-300",
  dual_catch_all: "bg-amber-900 text-amber-300",
  invalid: "bg-rose-950 text-rose-300",
  blocked: "bg-red-950 text-red-400",
  error: "bg-secondary text-secondary-foreground",
  unknown: "bg-secondary text-secondary-foreground",
  not_run: "bg-secondary text-secondary-foreground",
  do_not_mail: "bg-red-950 text-red-400",
  abuse: "bg-red-950 text-red-400",
  disposable: "bg-amber-900 text-amber-300",
};

const PILL_LABELS: Record<string, string> = {
  valid: "Valid",
  dual_valid: "Dual valid",
  ms_valid: "MS valid",
  catch_all: "Catch all",
  dual_catch_all: "Dual catch all",
  invalid: "Invalid",
  blocked: "Blocked",
  error: "Error",
  unknown: "Unknown",
  not_run: "Not run",
  do_not_mail: "Do not mail",
  abuse: "Abuse",
  disposable: "Disposable",
  // Error sources (ErrorsPanel's "src" column) - kept as their conventional
  // acronym casing rather than the generic humanize() fallback's "Dns".
  dns: "DNS",
  serper: "Serper",
  smtp: "SMTP",
};

// Fallback for values with no explicit label above (e.g. an error source
// like "dns" or "serper") - just enough to avoid a raw snake_case dump.
export function humanize(v: string): string {
  const spaced = v.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function Pill({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="text-muted-foreground">N/A</span>;
  const cls = PILL_COLORS[v] ?? "bg-secondary text-secondary-foreground";
  return (
    <span
      className={`inline-block rounded-full px-2 py-px text-[11px] font-semibold ${cls}`}
    >
      {PILL_LABELS[v] ?? humanize(v)}
    </span>
  );
}

export function card(children: React.ReactNode, extraCls = "") {
  return (
    <Card className={extraCls}>
      <CardContent className="p-2.5">{children}</CardContent>
    </Card>
  );
}

function sectionTitle(t: string) {
  return <CardTitle className="mb-2 text-muted-foreground">{t}</CardTitle>;
}

// Used for the lower-priority "drill down" panels (run history, recent
// validations, top errors) - collapsed by whoever's reading doesn't need
// them open at all times, unlike the at-a-glance cards above.
export function CollapsibleCard({
  title,
  subtitle,
  extraCls = "",
  forceOpen = false,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  extraCls?: string;
  // Set true to expand a card in response to something outside it (e.g.
  // a drill-down filter picked in a sibling card) - the user can still
  // collapse it again afterward, this only forces it open once.
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <Card className={extraCls}>
      <CardContent className="p-2.5">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="mb-2 flex w-full flex-wrap items-baseline justify-between gap-2 text-left"
            >
              <span className="flex flex-wrap items-baseline gap-2">
                <CardTitle className="text-muted-foreground">{title}</CardTitle>
                {subtitle}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>{children}</CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export function StatePanel({ data }: { data: MetricsResponse }) {
  return card(
    <>
      {sectionTitle("State machine")}
      <div className="grid grid-cols-2 gap-y-1.5">
        {STATE_ORDER.map(([s, cls]) => (
          <Fragment key={s}>
            <div className="text-sm text-muted-foreground">
              {STATE_LABELS[s] ?? s}
            </div>
            <div
              className={`text-right font-semibold tabular-nums transition-colors ${cls}`}
            >
              <Num value={data.states[s] ?? 0} />
            </div>
          </Fragment>
        ))}
      </div>
      <div className="mt-2 flex justify-between border-t pt-2 text-xs text-muted-foreground">
        <span>
          Total:{" "}
          <b className="tabular-nums text-foreground">
            <Num value={data.totals.all} />
          </b>
        </span>
        <span>
          Pending:{" "}
          <b className="tabular-nums text-foreground">
            <Num value={data.totals.pending} />
          </b>
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
  let trendEl = <span className="text-muted-foreground">N/A</span>;
  if (priorAvg > 0) {
    const delta = ((recentAvg - priorAvg) / priorAvg) * 100;
    const arrow = delta > 2 ? "↑" : delta < -2 ? "↓" : "→";
    const cls =
      delta > 2
        ? "text-emerald-300"
        : delta < -2
          ? "text-rose-300"
          : "text-muted-foreground";
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
      ? "N/A"
      : eta >= 48
        ? `${(eta / 24).toFixed(1)} d`
        : `${eta.toFixed(1)} h`;

  return card(
    <div className="flex flex-col">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        {sectionTitle("Throughput (last 60 minutes)")}
        <div className="text-xs text-muted-foreground">
          <b className="tabular-nums text-foreground">
            <Num value={data.rate.per_hour} />
          </b>
          /hr · ETA <b className="text-foreground">{etaStr}</b>
        </div>
      </div>
      <div className="relative h-[85px]">
        <ThroughputChart series={s} />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-3 border-t pt-2 text-center text-xs">
        <div>
          <div className="text-muted-foreground">Peak / min</div>
          <div className="tabular-nums text-base font-semibold">
            <Num value={peak} />
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Avg / min</div>
          <div className="tabular-nums text-base font-semibold">
            <NumFixed value={avg} digits={1} />
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Last 15 m</div>
          <div className="tabular-nums text-base font-semibold">
            <Num value={last15} />
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Trend</div>
          <div className="text-base font-semibold transition-colors">
            {trendEl}
          </div>
        </div>
      </div>
    </div>,
    "col-span-12 md:col-span-5",
  );
}

export function CostPanel({ data }: { data: MetricsResponse }) {
  const { cost, cost_breakdown, totals } = data;
  const pct = cost.pct ?? 0;
  const animatedSpent = useCountUp(cost.spent_usd);
  const animatedPct = useCountUp(Math.min(100, pct));
  const processed = totals.all - totals.pending;
  let projected = "N/A";
  if (processed > 0 && totals.all > 0 && cost.spent_usd > 0) {
    projected = `$${((cost.spent_usd * totals.all) / processed).toFixed(2)}`;
  }
  const prevSpent = usePrevious(cost.spent_usd);
  const spentDelta = prevSpent != null ? cost.spent_usd - prevSpent : null;
  return card(
    <div className="flex flex-col">
      {sectionTitle("Cost")}
      <div className="flex items-baseline gap-1.5">
        <div className="tabular-nums text-2xl font-bold">
          $
          {animatedSpent < 0.01
            ? animatedSpent.toFixed(4)
            : animatedSpent.toFixed(2)}
        </div>
        {spentDelta != null && spentDelta > 0 && (
          <span className="tabular-nums text-xs text-muted-foreground">
            +${spentDelta.toFixed(spentDelta < 0.01 ? 4 : 2)} since last poll
          </span>
        )}
      </div>
      <Progress value={Math.min(100, pct)} className="mt-2" />
      <div className="tabular-nums mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{animatedPct.toFixed(1)}% used</span>
        <span>
          of {cost.ceiling_usd ? `$${cost.ceiling_usd.toFixed(2)}` : "N/A"}
        </span>
      </div>
      <div className="mt-2 space-y-1 border-t pt-2 text-xs">
        {cost_breakdown.services.map((s) => (
          <div key={s.name} className="flex justify-between">
            <span className="capitalize text-muted-foreground">{s.name}</span>
            <span>
              <span className="text-foreground">
                $
                {s.cost_usd < 0.01
                  ? s.cost_usd.toFixed(4)
                  : s.cost_usd.toFixed(2)}
              </span>
              <span className="text-muted-foreground"> ({fmt(s.calls)})</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-2 text-xs text-muted-foreground">
        Est. full run: <b className="text-foreground">{projected}</b>
      </div>
    </div>,
    "col-span-12 lg:col-span-3",
  );
}

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

interface SmtpOutcomePanelProps {
  data: MetricsResponse;
  selectedVerdict?: string | null;
  onSelectVerdict?: (verdict: string | null) => void;
}

export function SmtpOutcomePanel({
  data,
  selectedVerdict = null,
  onSelectVerdict,
}: SmtpOutcomePanelProps) {
  const b = data.backends.smtp ?? { error_pct: 0, total: 0 };
  const errCls =
    b.error_pct > 70
      ? "text-rose-300"
      : b.error_pct > 40
        ? "text-amber-300"
        : "text-emerald-300";
  return card(
    <>
      {sectionTitle("SMTP validation results")}
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-xs text-muted-foreground">
          <Num value={b.total} /> probes · err{" "}
          <span className={`transition-colors ${errCls}`}>
            {fmtPct(b.error_pct)}
          </span>
        </span>
      </div>
      {/* Always renders the full fixed set of verdict types (like
          StatePanel does for pipeline states), rather than only the ones
          currently nonzero - a verdict type appearing/disappearing between
          polls was changing this card's height and shifting everything
          below it, which read as a flicker. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {VERDICT_ORDER.map((v) => (
          <button
            key={v}
            type="button"
            disabled={!onSelectVerdict}
            onClick={() => onSelectVerdict?.(selectedVerdict === v ? null : v)}
            className={cn(
              "flex items-center justify-between gap-2 rounded px-0.5 -mx-0.5 transition-colors",
              onSelectVerdict && "cursor-pointer hover:bg-secondary/60",
              selectedVerdict === v && "bg-secondary",
            )}
            title={
              onSelectVerdict
                ? "Filter recent validations to this outcome"
                : undefined
            }
          >
            <Pill v={v} />
            <span className="tabular-nums text-sm font-semibold text-foreground">
              <Num value={b[v] ?? 0} />
            </span>
          </button>
        ))}
      </div>
    </>,
    "col-span-12 lg:col-span-4",
  );
}

const HEALTH_STATUS: Record<
  ReturnType<typeof pipelineHealthStatus>,
  { label: string; cls: string }
> = {
  healthy: { label: "Healthy", cls: "bg-emerald-900 text-emerald-300" },
  stalled: { label: "Stalled", cls: "bg-rose-950 text-rose-300" },
  unknown: { label: "Unknown", cls: "bg-secondary text-secondary-foreground" },
};

export function PipelineHealthPanel({ data }: { data: MetricsResponse }) {
  const status = HEALTH_STATUS[pipelineHealthStatus(data.heartbeats)];
  return card(
    <>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <CardTitle className="text-muted-foreground">Pipeline health</CardTitle>
        <span
          className={`inline-block rounded-full px-2 py-px text-[11px] font-semibold ${status.cls}`}
        >
          {status.label}
        </span>
      </div>
      <HeartbeatIndicator heartbeats={data.heartbeats} />
    </>,
    "col-span-12 md:col-span-3",
  );
}

export function DiscoveryPanel({ data }: { data: MetricsResponse }) {
  const d = data.discovery;
  const p = (n: number) => (d.total_input ? (n / d.total_input) * 100 : 0);
  const prevHitRate = usePrevious(d.hit_rate_pct);
  const hitRateDelta = prevHitRate != null ? d.hit_rate_pct - prevHitRate : 0;
  return card(
    <div className="flex flex-col">
      {sectionTitle("Discovery (cumulative)")}
      {/* first_party: dns/company_db, a direct lookup against data the
          business itself owns. third_party: serper/serper_fallback/places,
          resolved via an external search or maps API instead. */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-muted-foreground">First party</div>
          <div className="tabular-nums text-xl font-bold text-emerald-300">
            <Num value={d.first_party} />
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Third party</div>
          <div className="tabular-nums text-xl font-bold text-amber-300">
            <Num value={d.third_party} />
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Failed</div>
          <div className="tabular-nums text-xl font-bold text-rose-300">
            <Num value={d.failed} />
          </div>
        </div>
      </div>
      <div className="mt-auto pt-3">
        <div className="flex h-2 overflow-hidden rounded bg-muted">
          <div
            className="bg-emerald-500 transition-[width]"
            style={{ width: `${p(d.first_party)}%` }}
          />
          <div
            className="bg-amber-400 transition-[width]"
            style={{ width: `${p(d.third_party)}%` }}
          />
          <div
            className="bg-rose-500 transition-[width]"
            style={{ width: `${p(d.failed)}%` }}
          />
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground">
          Hit rate{" "}
          <b className="tabular-nums text-foreground">
            <NumFixed value={d.hit_rate_pct} digits={1} />
          </b>
          % of{" "}
          <span className="tabular-nums text-foreground">
            <Num value={d.total_input} />
          </span>{" "}
          input
          {Math.abs(hitRateDelta) >= 0.1 && (
            <span
              className={
                hitRateDelta > 0 ? "text-emerald-300" : "text-rose-300"
              }
            >
              {" "}
              ({hitRateDelta > 0 ? "↑" : "↓"}{" "}
              {Math.abs(hitRateDelta).toFixed(1)} pts)
            </span>
          )}
        </div>
      </div>
    </div>,
    "col-span-12 lg:col-span-5",
  );
}
