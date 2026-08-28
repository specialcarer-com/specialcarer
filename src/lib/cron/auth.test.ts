import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { requireCronAuth } from "./auth";

function request(authorization?: string): NextRequest {
  return new NextRequest("https://example.com/api/cron/test", {
    headers: authorization ? { authorization } : undefined,
  });
}

async function errorBody(response: Response): Promise<{ error: string }> {
  return response.json() as Promise<{ error: string }>;
}

describe("requireCronAuth", () => {
  const previousSecret = process.env.CRON_SECRET;

  function restoreSecret(): void {
    if (previousSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousSecret;
    }
  }

  it("returns 500 when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const response = requireCronAuth(request());

    assert.ok(response);
    assert.equal(response.status, 500);
    assert.deepEqual(await errorBody(response), {
      error: "CRON_SECRET not configured",
    });
    restoreSecret();
  });

  it("returns 401 when Authorization is missing", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const response = requireCronAuth(request());

    assert.ok(response);
    assert.equal(response.status, 401);
    assert.deepEqual(await errorBody(response), { error: "Unauthorized" });
    restoreSecret();
  });

  it("returns 401 when the bearer secret is wrong", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const response = requireCronAuth(request("Bearer wrong-secret"));

    assert.ok(response);
    assert.equal(response.status, 401);
    assert.deepEqual(await errorBody(response), { error: "Unauthorized" });
    restoreSecret();
  });

  it("allows a matching bearer secret using the timing-safe comparator", () => {
    process.env.CRON_SECRET = "correct-secret";

    assert.equal(requireCronAuth(request("Bearer correct-secret")), null);
    restoreSecret();
  });
});
