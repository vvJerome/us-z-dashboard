import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { InspectPage } from "./pages/InspectPage";
import { MonitorPage } from "./pages/MonitorPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5_000 },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inspect" element={<InspectPage />} />
          <Route path="/jobs/:jobId/monitor" element={<MonitorPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
