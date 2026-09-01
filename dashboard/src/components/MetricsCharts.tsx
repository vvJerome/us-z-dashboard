import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { useEffect, useRef } from "react";
import type { MetricsResponse } from "../types/metrics";
import { relativeTime } from "../pages/monitor/formatters";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
);

interface ThroughputChartProps {
  series: MetricsResponse["throughput_60min"];
}

export function ThroughputChart({ series }: ThroughputChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const labels = series.map((p) => p.minute);
    const data = series.map((p) => p.count);

    if (chartRef.current) {
      chartRef.current.data.labels = labels;
      chartRef.current.data.datasets[0].data = data;
      // Poll updates shift every bar at once - animating the transition
      // (instead of "none", an instant snap) is what actually reads as
      // smooth rather than a flicker on a 60-bar chart.
      chartRef.current.update();
      return;
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { data, borderWidth: 0, backgroundColor: "rgba(34,211,238,0.75)" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400, easing: "easeOutCubic" },
        plugins: {
          legend: { display: false },
          tooltip: { intersect: false, mode: "index" },
        },
        scales: {
          x: {
            ticks: { color: "#64748b", maxTicksLimit: 8 },
            grid: { display: false },
          },
          y: {
            ticks: { color: "#64748b" },
            grid: { color: "rgba(100,116,139,0.15)" },
            beginAtZero: true,
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [series]);

  return <canvas ref={canvasRef} />;
}

const RUN_COLORS = [
  {
    key: "valid" as const,
    label: "Valid",
    color: "rgba(16,185,129,0.85)",
    border: "rgba(16,185,129,1)",
  },
  {
    key: "catch_all" as const,
    label: "Catch all",
    color: "rgba(245,158,11,0.80)",
    border: "rgba(245,158,11,1)",
  },
  {
    key: "invalid" as const,
    label: "Invalid",
    color: "rgba(244,63,94,0.75)",
    border: "rgba(244,63,94,1)",
  },
  {
    key: "errored" as const,
    label: "Error",
    color: "rgba(100,116,139,0.70)",
    border: "rgba(100,116,139,1)",
  },
  {
    key: "discovery" as const,
    label: "Discovery",
    color: "rgba(127,29,29,0.65)",
    border: "rgba(127,29,29,1)",
  },
];

interface RunHistoryChartProps {
  rows: MetricsResponse["run_history"];
}

function hourLabel(hour: string): string {
  return hour ? hour.slice(5, 13).replace("T", " ") : "";
}

export function RunHistoryChart({ rows }: RunHistoryChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !rows.length) return;
    const labels = rows.map((r) => hourLabel(r.hour));

    if (chartRef.current) {
      chartRef.current.data.labels = labels;
      RUN_COLORS.forEach((s, i) => {
        if (chartRef.current) {
          chartRef.current.data.datasets[i].data = rows.map(
            (r) => r[s.key] ?? 0,
          );
        }
      });
      chartRef.current.update();
      return;
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: RUN_COLORS.map((s) => ({
          label: s.label,
          data: rows.map((r) => r[s.key] ?? 0),
          backgroundColor: s.color,
          borderColor: s.border,
          borderWidth: 1,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400, easing: "easeOutCubic" },
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: { intersect: false } },
        scales: {
          x: {
            stacked: true,
            ticks: { color: "#64748b", maxTicksLimit: 12, autoSkip: true },
            grid: { display: false },
          },
          y: {
            stacked: true,
            ticks: { color: "#64748b" },
            grid: { color: "rgba(100,116,139,0.12)" },
            beginAtZero: true,
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [rows]);

  return <canvas ref={canvasRef} />;
}

const STALL_THRESHOLD_MIN = 10;

function ageMinutes(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 60000;
}

interface HeartbeatRowProps {
  label: string;
  iso: string | null;
}

function HeartbeatRow({ label, iso }: HeartbeatRowProps) {
  const age = ageMinutes(iso);
  const stalled = age != null && age > STALL_THRESHOLD_MIN;
  const cls =
    age == null
      ? "text-muted-foreground"
      : stalled
        ? "text-rose-300"
        : "text-emerald-300";
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cls}>
        {age == null ? "N/A" : `${relativeTime(iso)} ago`}
        {stalled ? " ⚠ stalled" : ""}
      </span>
    </div>
  );
}

interface HeartbeatIndicatorProps {
  heartbeats: MetricsResponse["heartbeats"];
}

export function HeartbeatIndicator({ heartbeats }: HeartbeatIndicatorProps) {
  return (
    <div className="space-y-2">
      <HeartbeatRow label="Producer" iso={heartbeats.producer} />
      <HeartbeatRow label="Dispatcher" iso={heartbeats.dispatcher} />
    </div>
  );
}

export type PipelineHealthStatus = "healthy" | "stalled" | "unknown";

// Lets the Pipeline health card show its verdict in the title itself,
// rather than requiring a read of both heartbeat rows to tell if
// anything's actually wrong - a "stalled" producer is otherwise easy to
// miss since this card carries the least visual weight in the grid.
export function pipelineHealthStatus(
  heartbeats: MetricsResponse["heartbeats"],
): PipelineHealthStatus {
  const ages = [heartbeats.producer, heartbeats.dispatcher].map(ageMinutes);
  if (ages.every((a) => a == null)) return "unknown";
  return ages.some((a) => a != null && a > STALL_THRESHOLD_MIN)
    ? "stalled"
    : "healthy";
}
