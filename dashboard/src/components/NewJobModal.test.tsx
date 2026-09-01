import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewJobModal } from "./NewJobModal";

vi.mock("../api/jobs", () => ({
  createJob: vi.fn().mockResolvedValue({ id: "job-1", status: "QUEUED" }),
  fetchJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
}));

vi.mock("../api/vps", () => ({
  fetchVpsList: vi.fn().mockResolvedValue([]),
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

describe("NewJobModal, file validation", () => {
  it("submit button is disabled when no file is selected", () => {
    renderModal();
    expect(
      screen.getByRole("button", { name: /run enrichment/i }),
    ).toBeDisabled();
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
    expect(
      screen.getByRole("button", { name: /run enrichment/i }),
    ).toBeDisabled();
  });

  it("rejects a file over 1 GB", async () => {
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    const bigFile = makeFile("huge.jsonl", 1);
    Object.defineProperty(bigFile, "size", { value: 1025 * 1024 * 1024 });
    await userEvent.upload(input as HTMLElement, bigFile);
    expect(await screen.findByText(/1 gb limit/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run enrichment/i }),
    ).toBeDisabled();
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
      screen.getByRole("button", { name: /run enrichment/i }),
    ).not.toBeDisabled();
  });

  it("accepts a valid .csv file and enables submit", async () => {
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLElement, makeFile("data.csv", 512));
    expect(
      screen.getByRole("button", { name: /run enrichment/i }),
    ).not.toBeDisabled();
  });

  it("accepts a file dropped onto the drop zone", () => {
    renderModal();
    const dropzone = screen.getByText(/drag a \.jsonl or \.csv file here/i)
      .parentElement as HTMLElement;
    const file = makeFile("dropped.jsonl", 1024);

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(screen.getByText(/dropped\.jsonl/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run enrichment/i }),
    ).not.toBeDisabled();
  });

  it("rejects a dropped file with a disallowed extension", () => {
    renderModal();
    const dropzone = screen.getByText(/drag a \.jsonl or \.csv file here/i)
      .parentElement as HTMLElement;
    const file = makeFile("dropped.xlsx", 1024);

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(screen.getByText(/only .jsonl and .csv/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run enrichment/i }),
    ).toBeDisabled();
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
    await userEvent.click(
      screen.getByRole("button", { name: /run enrichment/i }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("passes the trimmed job name when one is entered", async () => {
    const { createJob } = await import("../api/jobs");
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(
      input as HTMLElement,
      makeFile("records.jsonl", 1024),
    );
    await userEvent.type(
      screen.getByLabelText(/job name/i),
      "  Q3 outreach list  ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /run enrichment/i }),
    );

    await waitFor(() =>
      expect(createJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        "Q3 outreach list",
      ),
    );
  });

  it("passes undefined for name when the field is left blank", async () => {
    const { createJob } = await import("../api/jobs");
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(
      input as HTMLElement,
      makeFile("records.jsonl", 1024),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /run enrichment/i }),
    );

    await waitFor(() =>
      expect(createJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        undefined,
      ),
    );
  });
});

describe("NewJobModal, VPS selector", () => {
  beforeEach(async () => {
    const { fetchJobs } = await import("../api/jobs");
    vi.mocked(fetchJobs).mockResolvedValue({ jobs: [], total: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render a VPS selector when no VPS is configured", () => {
    renderModal();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("lists each VPS as a selectable card, labeling local vs remote, and auto-selects the local one", async () => {
    const { fetchVpsList } = await import("../api/vps");
    vi.mocked(fetchVpsList).mockResolvedValue([
      {
        id: "vps-remote",
        name: "worker-v3",
        is_local: false,
        is_active: true,
        ssh_host: "worker.example.com",
        ssh_user: "devonly",
        ssh_port: 22,
        data_dir: "/data",
        created_at: new Date().toISOString(),
      },
      {
        id: "vps-local",
        name: "local-test",
        is_local: true,
        is_active: true,
        ssh_host: null,
        ssh_user: "devonly",
        ssh_port: 22,
        data_dir: "/data",
        created_at: new Date().toISOString(),
      },
    ]);
    renderModal();

    expect(await screen.findByText("worker-v3")).toBeInTheDocument();
    expect(screen.getByText("worker.example.com")).toBeInTheDocument();
    expect(screen.getByText("local-test")).toBeInTheDocument();
    expect(screen.getAllByText("Local")).toHaveLength(1);
    // NewJobModal's own useEffect prefers the local VPS over the first entry.
    expect(screen.getByRole("radio", { name: /local-test/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /worker-v3/i })).not.toBeChecked();
  });

  it("shows Busy for a VPS with a job currently running on it", async () => {
    const { fetchVpsList } = await import("../api/vps");
    const { fetchJobs } = await import("../api/jobs");
    vi.mocked(fetchVpsList).mockResolvedValue([
      {
        id: "vps-a",
        name: "vps-a",
        is_local: true,
        is_active: true,
        ssh_host: null,
        ssh_user: "devonly",
        ssh_port: 22,
        data_dir: "/data",
        created_at: new Date().toISOString(),
      },
    ]);
    vi.mocked(fetchJobs).mockResolvedValue({
      total: 1,
      jobs: [
        {
          id: "job-running",
          status: "RUNNING",
          name: null,
          input_filename: "in.jsonl",
          config: { enable_proxy: false, skip_duplicates: true },
          worker_session: null,
          created_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          finished_at: null,
          error_message: null,
          output_file_key: null,
          vps_id: "vps-a",
        },
      ],
    });
    renderModal();

    expect(await screen.findByText("Busy")).toBeInTheDocument();
  });

  it("switches the selected VPS on click", async () => {
    const { fetchVpsList } = await import("../api/vps");
    vi.mocked(fetchVpsList).mockResolvedValue([
      {
        id: "vps-a",
        name: "vps-a",
        is_local: true,
        is_active: true,
        ssh_host: null,
        ssh_user: "devonly",
        ssh_port: 22,
        data_dir: "/data",
        created_at: new Date().toISOString(),
      },
      {
        id: "vps-b",
        name: "vps-b",
        is_local: false,
        is_active: true,
        ssh_host: "b.example.com",
        ssh_user: "devonly",
        ssh_port: 22,
        data_dir: "/data",
        created_at: new Date().toISOString(),
      },
    ]);
    renderModal();

    const vpsB = await screen.findByRole("radio", { name: /vps-b/i });
    await userEvent.click(vpsB);
    expect(vpsB).toBeChecked();
  });
});
