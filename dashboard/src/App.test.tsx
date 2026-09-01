import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./api/jobs", () => ({
  fetchJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
  cancelJob: vi.fn(),
}));
vi.mock("./api/vps", () => ({
  fetchVpsList: vi.fn().mockResolvedValue([]),
}));
vi.mock("./api/zerobounce", () => ({
  fetchZeroBounceJobs: vi.fn().mockResolvedValue([]),
  createZeroBounceJob: vi.fn(),
}));

describe("App", () => {
  it("renders the Jobs page at the root route, with the sidebar nav", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /jobs/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /jobs/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: /^inspect$/i })).toHaveAttribute(
      "href",
      "/inspect",
    );
  });

  it("navigates to the Inspect DB page when its nav link is clicked", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /jobs/i });

    await userEvent.click(screen.getByRole("link", { name: /^inspect$/i }));

    expect(
      await screen.findByRole("heading", { name: /^inspect$/i }),
    ).toBeInTheDocument();
  });
});
