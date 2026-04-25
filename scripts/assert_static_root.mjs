import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";

const originalCwd = process.cwd();
const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "profile-api-cwd-"));
process.chdir(tempCwd);

try {
  const { publicIndexPath } = await import("../dist/index.js");

  assert.equal(path.basename(publicIndexPath), "index.html");
  assert.equal(path.basename(path.dirname(publicIndexPath)), "public");
  assert.equal(fs.existsSync(publicIndexPath), true, "public index must resolve outside process.cwd()");
  assert.notEqual(path.resolve(publicIndexPath), path.join(tempCwd, "public", "index.html"));
} finally {
  process.chdir(originalCwd);
  fs.rmSync(tempCwd, { recursive: true, force: true });
}

console.log("static root assertion passed");
