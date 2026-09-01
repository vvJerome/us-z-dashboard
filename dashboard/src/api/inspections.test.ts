import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ request: vi.fn().mockResolvedValue({}) }));

import { request } from "./client";
import {
  createInspection,
  deleteInspection,
  fetchInspection,
  fetchInspections,
} from "./inspections";

describe("inspections api", () => {
  afterEach(() => {
    vi.mocked(request).mockClear();
  });

  it("fetchInspections calls the base endpoint", async () => {
    await fetchInspections();
    expect(request).toHaveBeenCalledWith("/api/inspections");
  });

  it("fetchInspection calls the id sub-path", async () => {
    await fetchInspection("insp-1");
    expect(request).toHaveBeenCalledWith("/api/inspections/insp-1");
  });

  it("createInspection posts a JSON body with snake_case keys", async () => {
    await createInspection("Wisconsin run", "vps-1", "/data/pipeline.db");
    expect(request).toHaveBeenCalledWith("/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Wisconsin run",
        vps_id: "vps-1",
        db_path: "/data/pipeline.db",
      }),
    });
  });

  it("deleteInspection issues a DELETE to the id sub-path", async () => {
    await deleteInspection("insp-1");
    expect(request).toHaveBeenCalledWith("/api/inspections/insp-1", {
      method: "DELETE",
    });
  });
});
