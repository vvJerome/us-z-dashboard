import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { Dashboard } from "./pages/Dashboard";
import { InspectPage } from "./pages/InspectPage";
import { MonitorPage } from "./pages/MonitorPage";
import { VpsPage } from "./pages/VpsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5_000 },
  },
});

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SidebarProvider>
            <div className="flex h-svh w-full bg-background text-foreground">
              <AppSidebar />
              <main className="flex h-full min-w-0 flex-1 flex-col">
                <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="h-4" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Enrichment Engine
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inspect" element={<InspectPage />} />
                    <Route path="/vps" element={<VpsPage />} />
                    <Route
                      path="/inspect/:inspectionId"
                      element={<InspectPage />}
                    />
                    <Route
                      path="/jobs/:jobId/monitor"
                      element={<MonitorPage />}
                    />
                  </Routes>
                </div>
              </main>
            </div>
          </SidebarProvider>
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
