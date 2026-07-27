import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

export function renderWithQuery(ui: ReactElement, options?: RenderOptions) {
  const client = makeClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
    options,
  );
}
