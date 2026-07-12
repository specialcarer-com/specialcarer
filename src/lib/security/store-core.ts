/**
 * Pure cores for the recovery-code store (gap 13), free of server-only / admin
 * imports so the issue + consume logic can be unit-tested. store.ts wires these
 * to the real service-role client.
 */

export type StoredCode = { id: string; code_hash: string; used_at: string | null };

export type IssuePorts = {
  /** Delete all of a user's UNUSED codes (so a new batch is the only live one). */
  deleteUnused: () => Promise<void>;
  /** Insert the hashed rows for the new batch. */
  insert: (rows: { code_hash: string; batch_id: string }[]) => Promise<void>;
};

/**
 * Issue a new batch: invalidate prior unused codes FIRST, then insert the new
 * batch. Ordering matters — doing it the other way round would briefly leave
 * both batches live. Returns the plaintext codes passed in.
 */
export async function issueBatch(
  ports: IssuePorts,
  plaintext: string[],
  hash: (code: string) => Promise<string>,
  batchId: string,
): Promise<string[]> {
  await ports.deleteUnused();
  const rows = await Promise.all(
    plaintext.map(async (code) => ({ code_hash: await hash(code), batch_id: batchId })),
  );
  await ports.insert(rows);
  return plaintext;
}

export type ConsumePorts = {
  /** The user's currently-unused codes. */
  listUnused: () => Promise<StoredCode[]>;
  verify: (code: string, hash: string) => Promise<boolean>;
  /** Mark a code used, guarded on still-unused; returns true if it won the race. */
  markUsed: (id: string) => Promise<boolean>;
};

/**
 * Find the first unused code whose hash verifies and atomically mark it used.
 * Returns true on success. The markUsed guard means a concurrent double-submit
 * can't burn the same code twice.
 */
export async function consumeFromList(
  ports: ConsumePorts,
  code: string,
): Promise<boolean> {
  for (const row of await ports.listUnused()) {
    if (await ports.verify(code, row.code_hash)) {
      return ports.markUsed(row.id);
    }
  }
  return false;
}
