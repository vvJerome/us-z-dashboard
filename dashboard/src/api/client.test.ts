import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "./client";

function mockFetchOnce(
  response: Partial<Response> & { json?: () => Promise<unknown> },
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({}),
      ...response,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("returns the parsed JSON body on success", async () => {
    mockFetchOnce({ json: async () => ({ id: "job-1" }) });
    await expect(request("/api/jobs/job-1")).resolves.toEqual({ id: "job-1" });
  });

  it("returns undefined for a 204 response without parsing a body", async () => {
    const json = vi.fn();
    mockFetchOnce({ ok: true, status: 204, json });
    await expect(request("/api/jobs/job-1")).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it("throws the server's detail message on a non-ok response", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({ detail: "Job not found" }),
    });
    await expect(request("/api/jobs/missing")).rejects.toThrow("Job not found");
  });

  it("falls back to statusText when the error body has no detail field", async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    });
    await expect(request("/api/jobs/x")).rejects.toThrow(
      "Internal Server Error",
    );
  });

  it("falls back to statusText when the error body isn't valid JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });
    await expect(request("/api/jobs/x")).rejects.toThrow("Bad Gateway");
  });

  it("passes init options through to fetch", async () => {
    mockFetchOnce({ json: async () => ({}) });
    await request("/api/jobs", { method: "POST" });
    expect(fetch).toHaveBeenCalledWith("/api/jobs", { method: "POST" });
  });
});
