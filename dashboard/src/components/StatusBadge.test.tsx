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

  it("applies gray classes for QUEUED", () => {
    const { container } = render(<StatusBadge status="QUEUED" />);
    expect(container.firstChild).toHaveClass("bg-gray-700");
  });

  it("applies blue classes for RUNNING", () => {
    const { container } = render(<StatusBadge status="RUNNING" />);
    expect(container.firstChild).toHaveClass("bg-blue-900");
  });

  it("applies green classes for COMPLETED", () => {
    const { container } = render(<StatusBadge status="COMPLETED" />);
    expect(container.firstChild).toHaveClass("bg-green-900");
  });

  it("applies red classes for FAILED", () => {
    const { container } = render(<StatusBadge status="FAILED" />);
    expect(container.firstChild).toHaveClass("bg-red-900");
  });

  it("applies yellow classes for CANCELLED", () => {
    const { container } = render(<StatusBadge status="CANCELLED" />);
    expect(container.firstChild).toHaveClass("bg-yellow-900");
  });
});
