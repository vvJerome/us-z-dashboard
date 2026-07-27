import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZeroBounceModal } from "./ZeroBounceModal";

vi.mock("../api/zerobounce", () => ({
  createZeroBounceJob: vi.fn().mockResolvedValue({ id: "zb-1", status: "QUEUED" }),
  fetchZeroBounceJobs: vi.fn().mockResolvedValue([]),
}));

import { createZeroBounceJob } from "../api/zerobounce";

function renderModal(onClose = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ZeroBounceModal onClose={onClose} />
    </QueryClientProvider>,
  );
}

function makeFile(name: string, content = "email\na@example.com"): File {
  return new File([content], name, { type: "text/csv" });
}

describe("ZeroBounceModal", () => {
  it("submit button is disabled when no file is selected", () => {
    renderModal();
    expect(
      screen.getByRole("button", { name: /run zerobounce/i }),
    ).toBeDisabled();
  });

  it("accepts .jsonl in addition to .csv/.txt", () => {
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    expect(input).toHaveAttribute("accept", ".csv,.jsonl,.txt");
  });

  it("enables submit once a file is chosen", async () => {
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLElement, makeFile("emails.csv"));
    expect(
      screen.getByRole("button", { name: /run zerobounce/i }),
    ).not.toBeDisabled();
  });

  it("defaults the email column to 'email'", () => {
    renderModal();
    expect(screen.getByLabelText(/email column name/i)).toHaveValue("email");
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("submits the file and email column, then closes on success", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const input = document.querySelector('input[type="file"]')!;
    const file = makeFile("emails.csv");
    await userEvent.upload(input as HTMLElement, file);

    const emailColInput = screen.getByLabelText(/email column name/i);
    await userEvent.clear(emailColInput);
    await userEvent.type(emailColInput, "contact_email");

    await userEvent.click(
      screen.getByRole("button", { name: /run zerobounce/i }),
    );

    await waitFor(() =>
      expect(createZeroBounceJob).toHaveBeenCalledWith(file, "contact_email"),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("shows an error message when the job fails to start", async () => {
    vi.mocked(createZeroBounceJob).mockRejectedValueOnce(
      new Error("Not enough ZeroBounce credits"),
    );
    renderModal();
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLElement, makeFile("emails.csv"));
    await userEvent.click(
      screen.getByRole("button", { name: /run zerobounce/i }),
    );
    expect(await screen.findByText(/not enough zerobounce credits/i)).toBeInTheDocument();
  });
});
