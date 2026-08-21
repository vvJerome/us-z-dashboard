import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SaveInspectionDialog } from "./SaveInspectionDialog";

const createInspection = vi.fn();

vi.mock("../api/inspections", () => ({
  createInspection: (...args: unknown[]) => createInspection(...args),
  fetchInspections: vi.fn().mockResolvedValue([]),
  fetchInspection: vi.fn(),
  deleteInspection: vi.fn(),
}));

function renderDialog(onClose = vi.fn(), onSaved = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SaveInspectionDialog
        vpsId="vps-1"
        dbPath="/home/devonly/pipeline.db"
        onClose={onClose}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
}

describe("SaveInspectionDialog", () => {
  it("save button is disabled until a name is entered", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    renderDialog(onClose);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("creates the inspection and calls onSaved with the new id", async () => {
    createInspection.mockResolvedValueOnce({
      id: "insp-1",
      name: "Wisconsin run",
      vps_id: "vps-1",
      db_path: "/home/devonly/pipeline.db",
    });
    const onSaved = vi.fn();
    renderDialog(vi.fn(), onSaved);

    await userEvent.type(screen.getByLabelText(/name/i), "Wisconsin run");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("insp-1"));
    expect(createInspection).toHaveBeenCalledWith(
      "Wisconsin run",
      "vps-1",
      "/home/devonly/pipeline.db",
    );
  });

  it("shows an error message when creation fails", async () => {
    createInspection.mockRejectedValueOnce(new Error("VPS not found"));
    renderDialog();

    await userEvent.type(screen.getByLabelText(/name/i), "Bad save");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/vps not found/i)).toBeInTheDocument();
  });
});
