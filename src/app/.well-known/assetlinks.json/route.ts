import { NextResponse } from "next/server";

/**
 * Android App Links verification file.
 *
 * Google fetches `/.well-known/assetlinks.json` to verify that https://
 * specialcarers.com/m/* links should open in the native Android app.
 *
 * Set ANDROID_APP_LINKS_SHA256 on Vercel to the SHA-256 certificate
 * fingerprint of the signing key (debug or release). Multiple fingerprints
 * can be comma-separated for debug + release coexistence.
 *
 *   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
 *     -storepass android -keypass android | grep SHA256
 */
export async function GET() {
  const raw = process.env.ANDROID_APP_LINKS_SHA256?.trim();
  if (!raw) {
    return NextResponse.json([], {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  const fingerprints = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.allcare4ugroup.specialcarer",
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
