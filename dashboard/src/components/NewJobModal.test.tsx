import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewJobModal } from "./NewJobModal";

vi.mock("../api/jobs", () => ({
  createJob: vi.fn().mockResolvedValue({ id: "job-1", status: "QUEUED" }),
  fetchJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
}));

function renderModal(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NewJobModal onClose={onClose} />
    </QueryClientProvider>,
  );
}

function makeFile(
  name: string,
  sizeBytes: number,
  type = "application/octet-stream",
): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

describe("NewJobModal — file validation", () => {
  it("submit button is disabled when no file is selected", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /run scraper/i })).toBeDisabled();
  });

  it("rejects a .xlsx file and shows an error", async () => {
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    // applyAccept:false bypasses the browser accept filter so our JS validation runs
    await userEvent.upload(input as HTMLElement, makeFile("report.xlsx", 100), {
      applyAccept: false,
    });
    expect(
      await screen.findByText(/only .jsonl and .csv/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run scraper/i })).toBeDisabled();
  });

  it("rejects a file over 100 MB", async () => {
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    const bigFile = makeFile("huge.jsonl", 101 * 1024 * 1024);
    await userEvent.upload(input as HTMLElement, bigFile);
    expect(await screen.findByText(/100 mb limit/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run scraper/i })).toBeDisabled();
  });

  it("accepts a valid .jsonl file and enables submit", async () => {
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(
      input as HTMLElement,
      makeFile("records.jsonl", 1024),
    );
    expect(screen.queryByText(/not allowed|limit/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run scraper/i }),
    ).not.toBeDisabled();
  });

  it("accepts a valid .csv file and enables submit", async () => {
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLElement, makeFile("data.csv", 512));
    expect(
      screen.getByRole("button", { name: /run scraper/i }),
    ).not.toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("submits the form and closes modal on success", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(
      input as HTMLElement,
      makeFile("records.jsonl", 1024),
    );
    await userEvent.click(screen.getByRole("button", { name: /run scraper/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
