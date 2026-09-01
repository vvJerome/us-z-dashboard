import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../test-utils";
import type { VpsInstance } from "../types/vps";
import { VpsPage } from "./VpsPage";

vi.mock("../api/vps", () => ({
  fetchVpsList: vi.fn(),
  createVps: vi.fn(),
  deleteVps: vi.fn(),
}));
vi.mock("../api/jobs", () => ({
  fetchJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
}));

import { createVps, deleteVps, fetchVpsList } from "../api/vps";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeVps(overrides: Partial<VpsInstance> = {}): VpsInstance {
  return {
    id: "vps-1",
    name: "worker-v3",
    is_local: false,
    is_active: true,
    ssh_host: "worker.example.com",
    ssh_user: "root",
    ssh_port: 22,
    data_dir: "/data",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("VpsPage", () => {
  it("shows a skeleton loading state before data arrives", () => {
    vi.mocked(fetchVpsList).mockImplementation(() => new Promise(() => {}));
    const { container } = renderWithQuery(<VpsPage />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
  });

  it("shows an error state when the workers list fails to load", async () => {
    vi.mocked(fetchVpsList).mockRejectedValue(new Error("network error"));
    renderWithQuery(<VpsPage />);
    expect(
      await screen.findByText(/failed to load workers/i),
    ).toBeInTheDocument();
  });

  it("shows an empty state when no workers are registered", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([]);
    renderWithQuery(<VpsPage />);
    expect(
      await screen.findByText(/no workers registered yet/i),
    ).toBeInTheDocument();
  });

  it("lists registered workers with their status", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([makeVps()]);
    renderWithQuery(<VpsPage />);
    expect(await screen.findByText("worker-v3")).toBeInTheDocument();
    expect(screen.getByText("worker.example.com")).toBeInTheDocument();
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it("opens the Add VPS form in a modal dialog", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([]);
    renderWithQuery(<VpsPage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^add vps$/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /add a worker vps/i }),
    ).toBeInTheDocument();
  });

  it("submits the add-VPS form", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([]);
    vi.mocked(createVps).mockResolvedValue(makeVps({ id: "vps-2" }));
    renderWithQuery(<VpsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^add vps$/i }));
    await userEvent.type(screen.getByLabelText(/^name$/i), "form-worker");
    await userEvent.type(
      screen.getByLabelText(/pipeline directory/i),
      "/opt/universal-scraper-v3",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^add vps$/i, hidden: false }),
    );

    expect(createVps).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "form-worker",
        repo_dir: "/opt/universal-scraper-v3",
      }),
    );
  });

  it("closes the dialog and clears the form after a successful add", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([]);
    vi.mocked(createVps).mockResolvedValue(makeVps({ id: "vps-2" }));
    renderWithQuery(<VpsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^add vps$/i }));
    await userEvent.type(screen.getByLabelText(/^name$/i), "new-worker");
    await userEvent.type(
      screen.getByLabelText(/pipeline directory/i),
      "/opt/universal-scraper-v3",
    );
    const submitButtons = screen.getAllByRole("button", { name: /add vps/i });
    await userEvent.click(submitButtons[submitButtons.length - 1]);

    await screen.findByText(/new-worker added/i);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a validation error and does not submit when required fields are missing", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([]);
    renderWithQuery(<VpsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^add vps$/i }));
    const submitButtons = screen.getAllByRole("button", { name: /add vps/i });
    await userEvent.click(submitButtons[submitButtons.length - 1]);

    expect(createVps).not.toHaveBeenCalled();
  });

  it("labels the directory fields as Data Directory and Pipeline directory", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([]);
    renderWithQuery(<VpsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^add vps$/i }));

    expect(screen.getByLabelText(/^data directory$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^pipeline directory$/i)).toBeInTheDocument();
  });

  it("turns whitespace typed into a directory field into a slash", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([]);
    renderWithQuery(<VpsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^add vps$/i }));
    const repoDirField = screen.getByLabelText(
      /^pipeline directory$/i,
    ) as HTMLInputElement;
    await userEvent.clear(repoDirField);
    await userEvent.type(repoDirField, "/opt/universal scraper v3");

    expect(repoDirField).toHaveValue("/opt/universal/scraper/v3");
  });

  it("rejects an unsafe directory path client-side via zod, without submitting", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([]);
    renderWithQuery(<VpsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^add vps$/i }));
    await userEvent.type(screen.getByLabelText(/^name$/i), "bad-worker");
    const repoDirField = screen.getByLabelText(/^pipeline directory$/i);
    await userEvent.clear(repoDirField);
    await userEvent.type(repoDirField, "relative/not/absolute");
    const submitButtons = screen.getAllByRole("button", { name: /add vps/i });
    await userEvent.click(submitButtons[submitButtons.length - 1]);

    expect(createVps).not.toHaveBeenCalled();
  });

  it("removes a VPS when Remove is clicked", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([makeVps()]);
    vi.mocked(deleteVps).mockResolvedValue(undefined);
    renderWithQuery(<VpsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /remove/i }),
    );

    expect(deleteVps).toHaveBeenCalledWith("vps-1");
  });

  it("shows an error toast and keeps the row when removal fails", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([makeVps()]);
    vi.mocked(deleteVps).mockRejectedValue(
      new Error("VPS has active jobs; cancel them before removing"),
    );
    renderWithQuery(<VpsPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /remove/i }),
    );

    expect(deleteVps).toHaveBeenCalledWith("vps-1");
    expect(await screen.findByText("worker-v3")).toBeInTheDocument();
  });
});
