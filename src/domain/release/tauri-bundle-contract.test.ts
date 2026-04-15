// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readTauriConfig() {
  const path = fileURLToPath(new URL("../../../src-tauri/tauri.conf.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as {
    bundle?: { macOS?: { signingIdentity?: string } };
  };
}

describe("tauri bundle contract", () => {
  it("defaults macOS packaging to ad-hoc signing when no Apple identity is injected", () => {
    const config = readTauriConfig();

    expect(config.bundle?.macOS?.signingIdentity).toBe("-");
  });
});
