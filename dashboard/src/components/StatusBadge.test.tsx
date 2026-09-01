import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JobStatus } from "../types/job";
import { StatusBadge } from "./StatusBadge";

const STATUSES: JobStatus[] = [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

describe("StatusBadge", () => {
  it.each(STATUSES)("renders label for %s", (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it("gives each status a visually distinct variant", () => {
    const classesByStatus = STATUSES.map((status) => {
      const { container, unmount } = render(<StatusBadge status={status} />);
      const classes = (container.firstChild as HTMLElement).className;
      unmount();
      return classes;
    });
    expect(new Set(classesByStatus).size).toBe(STATUSES.length);
  });

  it("shows a spinning loading indicator only for RUNNING", () => {
    const { container: running } = render(<StatusBadge status="RUNNING" />);
    expect(running.querySelector(".animate-spin")).toBeInTheDocument();

    const { container: completed } = render(<StatusBadge status="COMPLETED" />);
    expect(completed.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("falls back to a default variant for an unrecognized status", () => {
    render(<StatusBadge status="SOMETHING_NEW" />);
    expect(screen.getByText("SOMETHING_NEW")).toBeInTheDocument();
  });
});
