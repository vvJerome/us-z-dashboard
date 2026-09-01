import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MetricsResponse } from "../../types/metrics";
import { ErrorsPanel, RecentPanel, RunHistoryPanel } from "./DrillDownPanels";
import {
  CostPanel,
  DiscoveryPanel,
  PipelineHealthPanel,
  SmtpOutcomePanel,
  ThroughputPanel,
} from "./Panels";

vi.mock("chart.js", () => {
  class FakeChart {
    static register() {}
    update() {}
    destroy() {}
  }
  return {
    Chart: FakeChart,
    BarController: class {},
    BarElement: class {},
    CategoryScale: class {},
    Filler: class {},
    LinearScale: class {},
    LineController: class {},
    LineElement: class {},
    PointElement: class {},
    Tooltip: class {},
  };
});

function makeMetrics(
  overrides: Partial<MetricsResponse> = {},
): MetricsResponse {
  return {
    run_id: "run_1",
    as_of: "2026-05-15T12:00:00",
    build_ms: 5,
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
    cost: { spent_usd: 1, ceiling_usd: 10, pct: 10 },
    cost_breakdown: { services: [] },
    run_history: [],
    recent_validated: [],
    top_recent_errors: [],
    run_events: [],
    ...overrides,
  };
}

describe("ThroughputPanel", () => {
  it("shows N/A for trend with no prior-window data", () => {
    render(<ThroughputPanel data={makeMetrics({ throughput_60min: [] })} />);
    expect(screen.getByText("Trend").nextSibling).toHaveTextContent("N/A");
  });

  it("shows an upward arrow when the recent window outpaces the prior one", () => {
    const points = [
      ...Array(30)
        .fill(1)
        .map((n, i) => ({ minute: `${i}`, count: n })),
      ...Array(15)
        .fill(10)
        .map((n, i) => ({ minute: `${30 + i}`, count: n })),
    ];
    render(
      <ThroughputPanel data={makeMetrics({ throughput_60min: points })} />,
    );
    expect(screen.getByText(/↑/)).toBeInTheDocument();
  });

  it("shows a downward arrow when the recent window is slower than the prior one", () => {
    const points = [
      ...Array(30)
        .fill(10)
        .map((n, i) => ({ minute: `${i}`, count: n })),
      ...Array(15)
        .fill(1)
        .map((n, i) => ({ minute: `${30 + i}`, count: n })),
    ];
    render(
      <ThroughputPanel data={makeMetrics({ throughput_60min: points })} />,
    );
    expect(screen.getByText(/↓/)).toBeInTheDocument();
  });

  it("shows 'done' for a completed run regardless of eta_hours", () => {
    render(
      <ThroughputPanel
        data={makeMetrics({
          rate: { last_15min: 0, per_hour: 0, eta_hours: 3, complete: true },
        })}
      />,
    );
    expect(screen.getByText(/done/)).toBeInTheDocument();
  });

  it("shows eta in days once it crosses 48 hours", () => {
    render(
      <ThroughputPanel
        data={makeMetrics({
          rate: { last_15min: 0, per_hour: 0, eta_hours: 72, complete: false },
        })}
      />,
    );
    expect(screen.getByText(/3\.0 d/)).toBeInTheDocument();
  });
});

describe("CostPanel", () => {
  it("shows 4 decimal places for sub-cent spend", () => {
    render(
      <CostPanel
        data={makeMetrics({
          cost: { spent_usd: 0.0042, ceiling_usd: null, pct: null },
        })}
      />,
    );
    expect(screen.getByText("$0.0042")).toBeInTheDocument();
  });

  it("shows 4 decimal places for a sub-cent per-service cost", () => {
    render(
      <CostPanel
        data={makeMetrics({
          cost_breakdown: {
            services: [{ name: "zuhal", calls: 3, cost_usd: 0.0015 }],
          },
        })}
      />,
    );
    expect(screen.getByText("$0.0015")).toBeInTheDocument();
  });
});

describe("SmtpOutcomePanel", () => {
  it("colors the error rate red above 70%", () => {
    render(
      <SmtpOutcomePanel
        data={makeMetrics({
          backends: { smtp: { error_pct: 85, total: 10, error: 8 } },
        })}
      />,
    );
    expect(screen.getByText("85.0%")).toHaveClass("text-rose-300");
  });

  it("colors the error rate amber between 40% and 70%", () => {
    render(
      <SmtpOutcomePanel
        data={makeMetrics({
          backends: { smtp: { error_pct: 55, total: 10, error: 5 } },
        })}
      />,
    );
    expect(screen.getByText("55.0%")).toHaveClass("text-amber-300");
  });

  it("colors the error rate green at or below 40%", () => {
    render(
      <SmtpOutcomePanel
        data={makeMetrics({
          backends: { smtp: { error_pct: 5, total: 10, valid: 9 } },
        })}
      />,
    );
    expect(screen.getByText("5.0%")).toHaveClass("text-emerald-300");
  });

  it("calls onSelectVerdict when a verdict row is clicked, and toggles it off on a second click", async () => {
    const onSelectVerdict = vi.fn();
    render(
      <SmtpOutcomePanel
        data={makeMetrics()}
        selectedVerdict={null}
        onSelectVerdict={onSelectVerdict}
      />,
    );
    await userEvent.click(screen.getByText("Valid"));
    expect(onSelectVerdict).toHaveBeenCalledWith("valid");

    onSelectVerdict.mockClear();
    render(
      <SmtpOutcomePanel
        data={makeMetrics()}
        selectedVerdict="valid"
        onSelectVerdict={onSelectVerdict}
      />,
    );
    await userEvent.click(screen.getAllByText("Valid")[1]);
    expect(onSelectVerdict).toHaveBeenCalledWith(null);
  });

  it("does not make verdict rows interactive when onSelectVerdict is omitted", () => {
    render(<SmtpOutcomePanel data={makeMetrics()} />);
    expect(screen.getByText("Valid").closest("button")).toBeDisabled();
  });
});

describe("PipelineHealthPanel", () => {
  it("shows Unknown when there are no heartbeats at all", () => {
    render(
      <PipelineHealthPanel
        data={makeMetrics({
          heartbeats: { producer: null, dispatcher: null },
        })}
      />,
    );
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("shows Healthy when the most recent heartbeat is within the stall threshold", () => {
    render(
      <PipelineHealthPanel
        data={makeMetrics({
          heartbeats: {
            producer: new Date().toISOString(),
            dispatcher: null,
          },
        })}
      />,
    );
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("shows Stalled when a heartbeat is older than the stall threshold", () => {
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    render(
      <PipelineHealthPanel
        data={makeMetrics({
          heartbeats: { producer: stale, dispatcher: null },
        })}
      />,
    );
    expect(screen.getByText("Stalled")).toBeInTheDocument();
  });
});

describe("CostPanel trend", () => {
  it("shows a since-last-poll delta once spend increases across a re-render", () => {
    const { rerender } = render(
      <CostPanel
        data={makeMetrics({ cost: { spent_usd: 1, ceiling_usd: 10, pct: 10 } })}
      />,
    );
    expect(screen.queryByText(/since last poll/)).not.toBeInTheDocument();

    rerender(
      <CostPanel
        data={makeMetrics({
          cost: { spent_usd: 1.5, ceiling_usd: 10, pct: 15 },
        })}
      />,
    );
    expect(screen.getByText(/\+\$0\.50 since last poll/)).toBeInTheDocument();
  });
});

describe("DiscoveryPanel trend", () => {
  it("shows a hit-rate delta once the rate changes across a re-render", () => {
    const base = {
      first_party: 10,
      third_party: 5,
      failed: 1,
      total_input: 16,
    };
    const { rerender } = render(
      <DiscoveryPanel
        data={makeMetrics({ discovery: { ...base, hit_rate_pct: 50 } })}
      />,
    );
    expect(screen.queryByText(/pts\)/)).not.toBeInTheDocument();

    rerender(
      <DiscoveryPanel
        data={makeMetrics({ discovery: { ...base, hit_rate_pct: 62 } })}
      />,
    );
    expect(screen.getByText(/↑ 12\.0 pts/)).toBeInTheDocument();
  });
});

describe("ErrorsPanel", () => {
  it("renders 'no errors' when the list is empty", async () => {
    render(<ErrorsPanel data={makeMetrics({ top_recent_errors: [] })} />);
    await userEvent.click(screen.getByRole("button", { name: /top errors/i }));
    expect(screen.getByText("No errors")).toBeInTheDocument();
  });

  it("renders each error row when errors are present", async () => {
    render(
      <ErrorsPanel
        data={makeMetrics({
          top_recent_errors: [
            { source: "cherry", message: "timeout", n: 12 },
            { source: "bbops", message: "rate limited", n: 3 },
          ],
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /top errors/i }));
    expect(screen.getByText("timeout")).toBeInTheDocument();
    expect(screen.getByText("rate limited")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});

describe("collapsible drill-down cards", () => {
  it("starts collapsed, and expands/re-collapses Recent validations on chevron click", async () => {
    render(
      <RecentPanel
        data={makeMetrics({
          recent_validated: [
            {
              unique_id: "u1",
              candidate_email: "a@b.com",
              racknerd_status: "valid",
              canonical_status: "valid",
              canonical_source: "zerobounce",
              updated_at: null,
            },
          ],
        })}
      />,
    );
    const user = userEvent.setup();
    expect(screen.queryByText("a@b.com")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /recent validations/i }),
    );
    expect(screen.getByText("a@b.com")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /recent validations/i }),
    );
    expect(screen.queryByText("a@b.com")).not.toBeInTheDocument();
  });

  it("keeps the Run timeline subtitle visible while collapsed by default", () => {
    render(
      <RunHistoryPanel
        data={makeMetrics({
          run_history: [
            {
              hour: "2026-05-15T12:00",
              valid: 1,
              catch_all: 0,
              invalid: 0,
              errored: 0,
              discovery: 0,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/elapsed/i)).toBeVisible();
  });
});

describe("RecentPanel filtering", () => {
  const rows = [
    {
      unique_id: "u1",
      candidate_email: "valid@b.com",
      racknerd_status: "valid",
      canonical_status: "valid",
      canonical_source: "zerobounce",
      updated_at: null,
    },
    {
      unique_id: "u2",
      candidate_email: "blocked@b.com",
      racknerd_status: "blocked",
      canonical_status: "invalid",
      canonical_source: "smtp",
      updated_at: null,
    },
  ];

  it("forces the card open and shows only matching rows when a filter is set", () => {
    render(
      <RecentPanel
        data={makeMetrics({ recent_validated: rows })}
        filterVerdict="blocked"
        onClearFilter={vi.fn()}
      />,
    );
    expect(screen.getByText("blocked@b.com")).toBeInTheDocument();
    expect(screen.queryByText("valid@b.com")).not.toBeInTheDocument();
  });

  it("calls onClearFilter when the clear link is clicked", async () => {
    const onClearFilter = vi.fn();
    render(
      <RecentPanel
        data={makeMetrics({ recent_validated: rows })}
        filterVerdict="blocked"
        onClearFilter={onClearFilter}
      />,
    );
    await userEvent.click(screen.getByText("clear"));
    expect(onClearFilter).toHaveBeenCalled();
  });

  it("shows all rows when no filter is set", async () => {
    render(<RecentPanel data={makeMetrics({ recent_validated: rows })} />);
    await userEvent.click(
      screen.getByRole("button", { name: /recent validations/i }),
    );
    expect(screen.getByText("valid@b.com")).toBeInTheDocument();
    expect(screen.getByText("blocked@b.com")).toBeInTheDocument();
  });
});
