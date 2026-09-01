import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { ThemeProvider } from "./theme-provider";

vi.mock("../api/vps", () => ({
  fetchVpsList: vi.fn().mockResolvedValue([]),
}));
vi.mock("../api/jobs", () => ({
  fetchJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
}));

function renderSidebar(path = "/") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <SidebarProvider>
            <SidebarTrigger />
            <AppSidebar />
          </SidebarProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe("AppSidebar", () => {
  it("renders links to Jobs and Inspect", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: /^jobs$/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: /^inspect$/i })).toHaveAttribute(
      "href",
      "/inspect",
    );
  });

  it("marks the current route's nav item active", () => {
    renderSidebar("/inspect");

    expect(screen.getByRole("link", { name: /^inspect$/i })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("link", { name: /^jobs$/i })).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("renders a link to Workers", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /workers/i })).toHaveAttribute(
      "href",
      "/vps",
    );
  });

  it("shows a VPS busy count on the Workers link once VPS data loads", async () => {
    const { fetchVpsList } = await import("../api/vps");
    vi.mocked(fetchVpsList).mockResolvedValue([
      {
        id: "vps-a",
        name: "vps-a",
        is_local: true,
        is_active: true,
        ssh_host: null,
        ssh_user: "root",
        ssh_port: 22,
        data_dir: "/data",
        created_at: new Date().toISOString(),
      },
    ]);
    renderSidebar();
    expect(await screen.findByText(/0\/1 busy/i)).toBeInTheDocument();
  });

  it("renders the theme toggle button", () => {
    renderSidebar();

    expect(
      screen.getByRole("button", { name: /toggle theme/i }),
    ).toBeInTheDocument();
  });

  it("hides nav labels and persists the collapsed state when the trigger is toggled", () => {
    renderSidebar();

    expect(screen.getByText("Jobs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle sidebar/i }));

    expect(screen.queryByText("Jobs")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("sidebar-collapsed")).toBe("true");
  });

  it("starts collapsed when localStorage remembers that state", () => {
    window.localStorage.setItem("sidebar-collapsed", "true");
    renderSidebar();

    expect(screen.queryByText("Jobs")).not.toBeInTheDocument();
  });
});
