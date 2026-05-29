/**
 * Smoke test for the chat_attachments migration.
 *
 * Asserts the migration file exists with a 14-digit YYYYMMDDHHMMSS prefix
 * (the Supabase CLI silently ignores 8-digit prefixes) and contains the
 * required structural elements: bucket insert, table create, RLS enable,
 * the participants-read policy, the sender-insert policy, the has_attachments
 * column on chat_messages, and the after-insert trigger.
 *
 * We're not standing up a real Supabase instance here — that's what
 * `.github/workflows/supabase-migrations.yml` does on workflow_dispatch.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function findMigration(): string {
  const files = readdirSync(MIGRATIONS_DIR);
  const match = files.find((f) => /chat_attachments\.sql$/.test(f));
  if (!match) throw new Error("chat_attachments migration not found");
  return match;
}

describe("supabase/migrations chat_attachments", () => {
  it("uses a 14-digit YYYYMMDDHHMMSS prefix", () => {
    const file = findMigration();
    assert.match(file, /^\d{14}_chat_attachments\.sql$/);
  });

  it("creates the chat-attachments storage bucket as private", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, findMigration()), "utf8");
    assert.match(sql, /storage\.buckets/);
    assert.match(sql, /'chat-attachments'/);
    assert.match(sql, /false/); // public = false
  });

  it("creates chat_attachments table with required columns and constraint", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, findMigration()), "utf8");
    assert.match(sql, /create table if not exists public\.chat_attachments/);
    assert.match(sql, /message_id\s+uuid not null references public\.chat_messages/);
    assert.match(sql, /size_bytes\s+integer not null check/);
    assert.match(sql, /10485760/); // 10 MB
    assert.match(sql, /filename\s+text not null/);
  });

  it("enables RLS and declares participant select + sender insert policies", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, findMigration()), "utf8");
    assert.match(sql, /alter table public\.chat_attachments enable row level security/);
    assert.match(sql, /participants read attachments/);
    assert.match(sql, /sender inserts own attachments/);
  });

  it("adds has_attachments to chat_messages and a trigger to maintain it", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, findMigration()), "utf8");
    assert.match(sql, /alter table public\.chat_messages\s+add column if not exists has_attachments/);
    assert.match(sql, /create or replace function public\.chat_attachments_mark_parent/);
    assert.match(sql, /create trigger chat_attachments_mark_parent_trg/);
  });

  it("declares storage.objects policies scoped to chat-attachments + participants", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, findMigration()), "utf8");
    assert.match(sql, /chat attachments: participants select/);
    assert.match(sql, /chat attachments: participants insert/);
    assert.match(sql, /bucket_id = 'chat-attachments'/);
  });
});
