import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ request: vi.fn().mockResolvedValue({}) }));

import { request } from "./client";
import {
  createZeroBounceJob,
  fetchZeroBounceJob,
  fetchZeroBounceJobs,
} from "./zerobounce";

describe("zerobounce api", () => {
  afterEach(() => {
    vi.mocked(request).mockClear();
  });

  it("fetchZeroBounceJobs calls the base endpoint with no-store", async () => {
    await fetchZeroBounceJobs();
    expect(request).toHaveBeenCalledWith("/api/zerobounce", {
      cache: "no-store",
    });
  });

  it("fetchZeroBounceJob calls the id sub-path with no-store", async () => {
    await fetchZeroBounceJob("zb-1");
    expect(request).toHaveBeenCalledWith("/api/zerobounce/zb-1", {
      cache: "no-store",
    });
  });

  it("createZeroBounceJob encodes the email column and posts the file", async () => {
    const file = new File(["data"], "emails.csv");
    await createZeroBounceJob(file, "contact email");

    const [url, init] = vi.mocked(request).mock.calls[0];
    expect(url).toBe("/api/zerobounce?email_col=contact%20email");
    expect(init?.method).toBe("POST");
    expect((init?.body as FormData).get("file")).toBe(file);
  });
});
