import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateUuidV4,
  resetBookingRequestId,
} from "@/lib/bookings/client-request-id";
import { isClientRequestId } from "@/lib/bookings/server-pricing";

describe("generateUuidV4", () => {
  it("falls back to a valid v4 UUID when crypto.randomUUID is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xab) },
    });
    try {
      const id = generateUuidV4();
      assert.match(
        id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      assert.equal(isClientRequestId(id), true);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it("replaces the stored request ID when booking inputs change", () => {
    const originalCrypto = globalThis.crypto;
    let calls = 0;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        randomUUID: () =>
          `00000000-0000-4000-8000-${String(++calls).padStart(12, "0")}`,
      },
    });
    try {
      const ref = { current: generateUuidV4() };
      resetBookingRequestId(ref);
      assert.equal(ref.current, "00000000-0000-4000-8000-000000000002");
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it("uses a new request ID when a lost-response retry follows a notes edit", () => {
    const originalCrypto = globalThis.crypto;
    let calls = 0;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        randomUUID: () =>
          `00000000-0000-4000-8000-${String(++calls).padStart(12, "0")}`,
      },
    });
    try {
      const bookingRequestIdRef = { current: generateUuidV4() };
      const firstSubmissionId = bookingRequestIdRef.current;

      // The initial response was lost. Verify the page treats notes as a
      // booking input, then model the effect it runs before resubmission.
      const pageSource = readFileSync(
        resolve(__dirname, "../../app/m/book/[id]/page.tsx"),
        "utf8",
      );
      const resetStart = pageSource.indexOf(
        "resetBookingRequestId(bookingRequestIdRef);",
      );
      const resetEnd = pageSource.indexOf("  ]);", resetStart);
      assert.notEqual(resetStart, -1, "booking request ID reset effect must exist");
      assert.notEqual(resetEnd, -1, "booking request ID reset effect must close");
      const resetEffect = pageSource.slice(resetStart, resetEnd + "  ]);".length);
      assert.match(resetEffect, /\n    notes,\n/);

      resetBookingRequestId(bookingRequestIdRef);
      const notesEditedResubmissionId = bookingRequestIdRef.current;

      assert.notEqual(notesEditedResubmissionId, firstSubmissionId);
      assert.equal(
        notesEditedResubmissionId,
        "00000000-0000-4000-8000-000000000002",
      );
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });
});
