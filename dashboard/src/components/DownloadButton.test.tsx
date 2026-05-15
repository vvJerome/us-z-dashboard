import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../test-utils";
import { DownloadButton } from "./DownloadButton";

vi.mock("../api/jobs", () => ({
  fetchJobDownload: vi.fn(),
}));

import { fetchJobDownload } from "../api/jobs";

describe("DownloadButton", () => {
  it("renders a Download button", () => {
    renderWithQuery(<DownloadButton jobId="job-1" filename="records.jsonl" />);
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
  });

  it("calls the download API with the correct job ID", async () => {
    vi.mocked(fetchJobDownload).mockResolvedValue({ url: "/api/jobs/job-1/file" });
    renderWithQuery(<DownloadButton jobId="job-1" filename="records.jsonl" />);
    await userEvent.click(screen.getByRole("button", { name: /download/i }));
    await waitFor(() => expect(fetchJobDownload).toHaveBeenCalledWith("job-1"));
  });

  it("shows loading state while fetching", async () => {
    vi.mocked(fetchJobDownload).mockImplementation(() => new Promise(() => {}));
    renderWithQuery(<DownloadButton jobId="job-1" filename="records.jsonl" />);
    await userEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(await screen.findByRole("button", { name: /downloading/i })).toBeDisabled();
  });

  it("returns to idle state after successful download", async () => {
    vi.mocked(fetchJobDownload).mockResolvedValue({ url: "/api/jobs/job-1/file" });
    renderWithQuery(<DownloadButton jobId="job-1" filename="records.jsonl" />);
    await userEvent.click(screen.getByRole("button", { name: /download/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /download/i })).not.toBeDisabled(),
    );
  });

  it("shows error message when download fails", async () => {
    vi.mocked(fetchJobDownload).mockRejectedValue(new Error("Network error"));
    renderWithQuery(<DownloadButton jobId="job-1" filename="records.jsonl" />);
    await userEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});
