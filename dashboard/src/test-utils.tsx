import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

export function renderWithQuery(ui: ReactElement, options?: RenderOptions) {
  const client = makeClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        {ui}
        <Toaster />
      </QueryClientProvider>
    </MemoryRouter>,
    options,
  );
}

// For components that render <tr>/<td> directly (table rows) - wraps them in
// a real <table><tbody> so they're valid HTML instead of a bare <tr> under
// RTL's default <div> container.
export function renderTableRow(ui: ReactElement, options?: RenderOptions) {
  return renderWithQuery(
    <table>
      <tbody>{ui}</tbody>
    </table>,
    options,
  );
}
