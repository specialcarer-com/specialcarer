#!/usr/bin/env python3
"""
Install SpecialCarer branded email templates into Supabase Auth via the
Management API.

Usage (locally or in CI):
  SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=qupjaanyhnuvlexkwtpq \
    python scripts/email-templates/install.py

The 5 templates installed:
  - recovery       (password reset)            -> mailer_templates_recovery_*
  - confirmation   (signup email confirmation) -> mailer_templates_confirmation_*
  - magic_link     (passwordless sign-in)      -> mailer_templates_magic_link_*
  - email_change   (email change confirmation) -> mailer_templates_email_change_*
  - invite         (admin invite)              -> mailer_templates_invite_*

Subjects are set alongside via mailer_subjects_* fields.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "supabase" / "email-templates"

# Map of (file basename, Supabase config field prefix, subject) for the
# 5 Auth-mailer templates that Supabase actually renders on signup/recovery/etc.
TEMPLATE_MAP = [
    ("recovery.html",     "recovery",     "Reset your SpecialCarer password"),
    ("confirmation.html", "confirmation", "Your SpecialCarer verification code: {{ .Token }}"),
    ("magic_link.html",   "magic_link",   "Your SpecialCarer sign-in code: {{ .Token }}"),
    ("email_change.html", "email_change", "Confirm your new SpecialCarer email"),
    ("invite.html",       "invite",       "You're invited to SpecialCarer"),
]

# Transactional templates that are NOT part of Supabase Auth's built-in
# mailer (they're sent via Resend by application code). The install
# script doesn't upload them to Supabase, but it verifies the file
# exists alongside the auth templates so they ship together. Add new
# transactional templates here so CI fails fast on a missing file.
TRANSACTIONAL_TEMPLATES = [
    ("family_invite.html", "family_invite", "You've been invited to a SpecialCarer chat"),
]


def main() -> int:
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    project_ref = os.environ.get("SUPABASE_PROJECT_REF")
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN not set", file=sys.stderr)
        return 1
    if not project_ref:
        print("ERROR: SUPABASE_PROJECT_REF not set", file=sys.stderr)
        return 1

    payload: dict[str, str] = {}
    for filename, prefix, subject in TEMPLATE_MAP:
        path = TEMPLATES_DIR / filename
        if not path.exists():
            print(f"ERROR: template missing: {path}", file=sys.stderr)
            return 1
        html = path.read_text(encoding="utf-8")
        payload[f"mailer_templates_{prefix}_content"] = html
        payload[f"mailer_subjects_{prefix}"] = subject
        print(f"  prepared {prefix:13s} ({len(html):>5d} bytes) — subject: {subject}")

    # Verify transactional templates ship alongside auth templates.
    # These are sent by application code (Resend), not Supabase Auth,
    # so they aren't part of the PATCH payload.
    for filename, prefix, subject in TRANSACTIONAL_TEMPLATES:
        path = TEMPLATES_DIR / filename
        if not path.exists():
            print(f"ERROR: transactional template missing: {path}", file=sys.stderr)
            return 1
        size = path.stat().st_size
        print(f"  verified  {prefix:13s} ({size:>5d} bytes, transactional) — subject: {subject}")

    url = f"https://api.supabase.com/v1/projects/{project_ref}/config/auth"
    req = urllib.request.Request(
        url,
        method="PATCH",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "specialcarer-templates-installer/1.0",
        },
    )
    print(f"\nPATCH {url}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode("utf-8", errors="replace")

    print(f"HTTP {status}")
    # Print a compact body — full body may include all current config which is noisy.
    if status >= 400:
        print("BODY (error):")
        print(body[:4000])
        return 1
    # On success body echoes the full auth config. Just confirm the keys we set are present.
    try:
        echoed = json.loads(body)
    except json.JSONDecodeError:
        print("WARN: response was not JSON; raw first 500 chars:")
        print(body[:500])
        return 0

    print("\nVerification (echoed config):")
    for filename, prefix, _ in TEMPLATE_MAP:
        content_key = f"mailer_templates_{prefix}_content"
        subject_key = f"mailer_subjects_{prefix}"
        content_len = len(echoed.get(content_key) or "")
        subject_val = echoed.get(subject_key) or "(missing)"
        marker = "OK " if content_len > 1000 else "??"
        print(f"  {marker} {prefix:13s}  content={content_len:>5d} bytes  subject={subject_val!r}")

    print("\nDone. Templates are now live on Supabase.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
