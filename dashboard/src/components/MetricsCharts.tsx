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
      chartRef.current.update("none");
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
        animation: false,
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
    label: "valid",
    color: "rgba(16,185,129,0.85)",
    border: "rgba(16,185,129,1)",
  },
  {
    key: "catch_all" as const,
    label: "catch_all",
    color: "rgba(245,158,11,0.80)",
    border: "rgba(245,158,11,1)",
  },
  {
    key: "invalid" as const,
    label: "invalid",
    color: "rgba(244,63,94,0.75)",
    border: "rgba(244,63,94,1)",
  },
  {
    key: "errored" as const,
    label: "error",
    color: "rgba(100,116,139,0.70)",
    border: "rgba(100,116,139,1)",
  },
  {
    key: "disc_failed" as const,
    label: "discovery",
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
      chartRef.current.update("none");
      return;
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: RUN_COLORS.map((s) => ({
          label: s.label,
          data: rows.map((r) => r[s.key] ?? 0),
          backgroundColor: s.color,
          borderColor: s.border,
          borderWidth: 1,
          fill: true,
          pointRadius: 0,
          tension: 0.25,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
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
