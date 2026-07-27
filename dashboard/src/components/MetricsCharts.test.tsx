import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunHistoryChart, ThroughputChart } from "./MetricsCharts";

// jsdom has no real canvas 2D context, so Chart.js can't actually draw —
// stub it to a no-op and just verify these components mount/unmount and
// hand Chart.js the data we give them, without asserting on chart.js's
// own (third-party) rendering internals.
interface FakeChartData {
  labels: unknown;
  datasets: { data: unknown }[];
}

const chartInstances: { data: FakeChartData; destroy: () => void }[] = [];

vi.mock("chart.js", () => {
  class FakeChart {
    data: FakeChartData;
    constructor(_ctx: unknown, config: { data: FakeChartData }) {
      this.data = config.data;
      chartInstances.push(this);
    }
    update() {}
    destroy() {}
    static register() {}
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

describe("ThroughputChart", () => {
  it("renders a canvas and passes the series through to Chart.js", () => {
    chartInstances.length = 0;
    const series = [
      { minute: "12:00", count: 5 },
      { minute: "12:01", count: 8 },
    ];
    const { container } = render(<ThroughputChart series={series} />);
    expect(container.querySelector("canvas")).toBeInTheDocument();
    expect(chartInstances[0].data.datasets[0].data).toEqual([5, 8]);
  });

  it("does not throw with an empty series", () => {
    expect(() => render(<ThroughputChart series={[]} />)).not.toThrow();
  });
});

describe("RunHistoryChart", () => {
  it("renders a canvas for non-empty run history", () => {
    chartInstances.length = 0;
    const rows = [
      {
        hour: "2026-05-15T12:00",
        valid: 10,
        catch_all: 2,
        invalid: 1,
        errored: 0,
        disc_failed: 0,
      },
    ];
    const { container } = render(<RunHistoryChart rows={rows} />);
    expect(container.querySelector("canvas")).toBeInTheDocument();
    expect(chartInstances).toHaveLength(1);
  });

  it("does not create a chart when rows are empty", () => {
    chartInstances.length = 0;
    render(<RunHistoryChart rows={[]} />);
    expect(chartInstances).toHaveLength(0);
  });
});
