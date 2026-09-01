import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";

vi.mock("../components/JobList", () => ({
  JobList: () => <div data-testid="job-list" />,
}));

describe("Dashboard", () => {
  it("renders JobList", () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("job-list")).toBeInTheDocument();
  });
});
