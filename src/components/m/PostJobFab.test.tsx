/**
 * <PostJobFab> render tests (PR-R4).
 *
 * Static-markup harness (node:test + react-dom/server, same as
 * CarerCard.test.tsx). Asserts the a11y contract, the peach accent, the
 * destination route, and the default vs custom href.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PostJobFab from "./PostJobFab";

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node);
}

test("exposes the button a11y contract", () => {
  const html = render(h(PostJobFab));
  assert.match(html, /aria-label="Post a new job"/);
  assert.match(html, /role="button"/);
});

test("routes to /m/post-job by default", () => {
  const html = render(h(PostJobFab));
  assert.match(html, /href="\/m\/post-job"/);
});

test("honours a custom href", () => {
  const html = render(h(PostJobFab, { href: "/m/post-job?from=fab" }));
  assert.match(html, /href="\/m\/post-job\?from=fab"/);
});

test("uses the peach accent background", () => {
  const html = render(h(PostJobFab));
  assert.match(html, /bg-accent/);
});

test("renders a centered plus glyph", () => {
  const html = render(h(PostJobFab));
  // The + is drawn as an SVG cross, not a text glyph.
  assert.match(html, /M12 5v14M5 12h14/);
  assert.match(html, /place-items-center/);
});

test("is sized 56×56 (h-14 w-14) and fully rounded", () => {
  const html = render(h(PostJobFab));
  assert.match(html, /h-14/);
  assert.match(html, /w-14/);
  assert.match(html, /rounded-full/);
});
