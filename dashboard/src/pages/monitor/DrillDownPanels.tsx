import { RunHistoryChart } from "../../components/MetricsCharts";
import type { MetricsResponse } from "../../types/metrics";
import { fmt, relativeTime } from "./formatters";
import { CollapsibleCard, humanize, Pill } from "./Panels";

export function RunHistoryPanel({ data }: { data: MetricsResponse }) {
  const rows = data.run_history;
  const started = rows[0]?.hour.replace("T", " ") ?? "N/A";
  return (
    <CollapsibleCard
      title="Run timeline (hourly)"
      subtitle={
        <span className="text-xs text-muted-foreground">
          started <span className="text-foreground">{started}</span> · elapsed{" "}
          <span className="text-foreground">{rows.length}h</span>
        </span>
      }
      extraCls="col-span-12"
    >
      <div className="relative h-[55px]">
        <RunHistoryChart rows={rows} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {[
          ["#10b981", "Valid"],
          ["#f59e0b", "Catch all"],
          ["#f43f5e", "Invalid"],
          ["#64748b", "Error/unknown"],
          ["#7f1d1d", "Discovery"],
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
    </CollapsibleCard>
  );
}

interface RecentPanelProps {
  data: MetricsResponse;
  filterVerdict?: string | null;
  onClearFilter?: () => void;
}

export function RecentPanel({
  data,
  filterVerdict = null,
  onClearFilter,
}: RecentPanelProps) {
  const rows = filterVerdict
    ? data.recent_validated.filter((r) => r.racknerd_status === filterVerdict)
    : data.recent_validated;
  return (
    <CollapsibleCard
      title="Recent validations"
      extraCls="col-span-12 lg:col-span-7"
      forceOpen={!!filterVerdict}
    >
      {filterVerdict && (
        <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          Filtered to <Pill v={filterVerdict} />
          <button
            type="button"
            onClick={onClearFilter}
            className="text-foreground underline-offset-2 hover:underline"
          >
            clear
          </button>
        </div>
      )}
      <div className="max-h-[100px] overflow-auto">
        <table className="w-full font-mono text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="p-1">ID</th>
              <th className="p-1">Email</th>
              <th className="p-1">Proxy25</th>
              <th className="p-1">Outcome</th>
              <th className="p-1">Source</th>
              <th className="p-1">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-2 text-muted-foreground">
                  No validations match this filter
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.unique_id ?? i} className="border-t">
                  <td className="p-1 text-muted-foreground">
                    {r.unique_id ?? "N/A"}
                  </td>
                  <td className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap p-1">
                    {r.candidate_email ?? "N/A"}
                  </td>
                  <td className="p-1">
                    <Pill v={r.racknerd_status} />
                  </td>
                  <td className="p-1">
                    <Pill v={r.canonical_status} />
                  </td>
                  <td className="p-1 text-muted-foreground">
                    {r.canonical_source ?? "N/A"}
                  </td>
                  <td className="p-1 text-muted-foreground">
                    {relativeTime(r.updated_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}

export function RunEventsPanel({ data }: { data: MetricsResponse }) {
  return (
    <CollapsibleCard title="Run events" extraCls="col-span-12 lg:col-span-7">
      <div className="max-h-[100px] overflow-auto">
        <table className="w-full font-mono text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="p-1">Event</th>
              <th className="p-1">Detail</th>
              <th className="p-1">When</th>
            </tr>
          </thead>
          <tbody>
            {data.run_events.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-2 text-muted-foreground">
                  No events
                </td>
              </tr>
            ) : (
              data.run_events.map((e, i) => (
                <tr key={i} className="border-t">
                  <td className="p-1">{humanize(e.event)}</td>
                  <td className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap p-1 text-muted-foreground">
                    {e.detail ?? "N/A"}
                  </td>
                  <td className="p-1 text-muted-foreground">
                    {relativeTime(e.ts)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}

export function ErrorsPanel({ data }: { data: MetricsResponse }) {
  return (
    <CollapsibleCard title="Top errors" extraCls="col-span-12 lg:col-span-5">
      <div className="max-h-[100px] overflow-auto">
        <table className="w-full font-mono text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="p-1">Count</th>
              <th className="p-1">Source</th>
              <th className="p-1">Message</th>
            </tr>
          </thead>
          <tbody>
            {data.top_recent_errors.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-2 text-muted-foreground">
                  No errors
                </td>
              </tr>
            ) : (
              data.top_recent_errors.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-1 text-right text-muted-foreground">
                    {fmt(r.n)}
                  </td>
                  <td className="p-1">
                    <Pill v={r.source} />
                  </td>
                  <td className="p-1 text-muted-foreground">{r.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}
