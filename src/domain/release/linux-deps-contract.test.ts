// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readScript() {
  const path = fileURLToPath(new URL("../../../scripts/install-linux-deps.sh", import.meta.url));
  return readFileSync(path, "utf8");
}

describe("linux dependency installer contract", () => {
  it("uses non-interactive apt invocations with retries and bounded timeouts", () => {
    const script = readScript();

    expect(script).toContain("DEBIAN_FRONTEND=noninteractive");
    expect(script).toContain("--no-install-recommends");
    expect(script).toContain("Acquire::Retries=3");
    expect(script).toContain("timeout 15m");
    expect(script).toContain("for attempt in 1 2 3");
  });
});
