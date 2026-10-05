import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (file: string) =>
  readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Android source and overlay declare only singular verified App Links", () => {
  for (const file of [
    "android/app/src/main/AndroidManifest.xml",
    "mobile/android-overlay/AndroidManifest.xml",
  ]) {
    const xml = read(file);
    assert.match(xml, /android:autoVerify="true"/);
    assert.deepEqual(
      [...xml.matchAll(/android:host="([^"]+)"/g)].map((m) => m[1]).sort(),
      ["specialcarer.com", "www.specialcarer.com"],
    );
    assert.doesNotMatch(xml, /specialcarers\.com/);
  }
});

test("Capacitor uses singular production URL and unique navigation entries", async () => {
  const previous = process.env.CAPACITOR_SERVER_URL;
  delete process.env.CAPACITOR_SERVER_URL;
  try {
    const { default: config } = await import("../capacitor.config");
    assert.equal(config.server?.url, "https://www.specialcarer.com/m");
    const hosts = config.server?.allowNavigation ?? [];
    assert.ok(hosts.includes("specialcarer.com"));
    assert.ok(hosts.includes("*.specialcarer.com"));
    assert.equal(new Set(hosts).size, hosts.length);
    assert.ok(hosts.includes("checkout.stripe.com"));
    assert.ok(hosts.every((host) => !host.includes("specialcarers.com")));
    assert.equal(config.server?.cleartext, false);
  } finally {
    if (previous === undefined) delete process.env.CAPACITOR_SERVER_URL;
    else process.env.CAPACITOR_SERVER_URL = previous;
  }
});

test("Expo config and runtime defaults agree on the singular origin", () => {
  const config = JSON.parse(read("expo-app/app.json"));
  assert.equal(config.expo.extra.webOrigin, "https://specialcarer.com");
  for (const file of [
    "expo-app/src/deeplink.ts",
    "expo-app/src/WebShell.tsx",
    "expo-app/src/location.ts",
  ]) {
    assert.match(read(file), /"https:\/\/specialcarer\.com"/);
    assert.doesNotMatch(read(file), /specialcarers\.com/);
  }
});

test("iOS setup documents singular Associated Domains, without claiming signed entitlement verification", () => {
  const instructions = read("mobile/ios-overlay/README.md");
  assert.match(instructions, /applinks:specialcarer\.com/);
  assert.match(instructions, /applinks:www\.specialcarer\.com/);
  assert.doesNotMatch(instructions, /applinks:(?:www\.)?specialcarers\.com/);
});

test("offline retry uses the same singular Capacitor URL", () => {
  const html = read("mobile/web/index.html");
  assert.match(html, /https:\/\/www\.specialcarer\.com\/m/);
  assert.doesNotMatch(html, /specialcarers\.com/);
});
