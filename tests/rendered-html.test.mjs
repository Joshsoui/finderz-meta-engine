import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defines Finderz Meta Engine metadata", async () => {
  const source = await readFile(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /title:\s*"Finderz Meta Engine"/);
  assert.match(source, /<html lang="nl"/);
});
