import assert from "node:assert/strict";
import { test } from "node:test";
import { createSubmitHandler } from "./submit/submit-handler";
import { createUploadUrlHandler } from "./upload-url/upload-url-handler";

function request(body: unknown) {
  return new Request("https://www.specialcarer.com/api/references/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function referenceLookup(result: {
  data: unknown;
  error: { message: string } | null;
}) {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    async maybeSingle() {
      return result;
    },
  };
  return query;
}

test("upload submit rejects a path that is not the persisted signed upload path", async () => {
  const expectedPath = "reference-token/expected.pdf";
  const handler = createSubmitHandler(
    (() =>
      ({
        from() {
          return referenceLookup({
            data: {
              id: "reference-id",
              status: "invited",
              token_expires_at: "2099-01-01T00:00:00.000Z",
              upload_path: expectedPath,
            },
            error: null,
          });
        },
      } as never)) as never
  );

  const response = await handler(
    request({
      token: "reference-token",
      response_mode: "upload",
      uploaded_file_path: "reference-token/someone-elses-document.pdf",
      uploaded_file_size: 1024,
      uploaded_file_mime: "application/pdf",
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "A valid uploaded reference document is required",
  });
});

test("submit returns 500 when the invitation lookup fails", async () => {
  const handler = createSubmitHandler(
    (() =>
      ({
        from() {
          return referenceLookup({
            data: null,
            error: { message: "Database temporarily unavailable" },
          });
        },
      } as never)) as never
  );

  const response = await handler(
    request({
      token: "reference-token",
      response_mode: "declined",
      decline_reason: "I no longer work with this person.",
    })
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "Database temporarily unavailable",
  });
});

test("signed upload URL route returns 500 when the invitation lookup fails", async () => {
  const handler = createUploadUrlHandler(
    (() =>
      ({
        from() {
          return referenceLookup({
            data: null,
            error: { message: "Database temporarily unavailable" },
          });
        },
      } as never)) as never
  );

  const response = await handler(
    request({
      token: "reference-token",
      filename: "reference.pdf",
      mime: "application/pdf",
      size: 1024,
    })
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "Database temporarily unavailable",
  });
});
