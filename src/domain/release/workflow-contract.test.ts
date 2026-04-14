// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readWorkflow(name: string): string {
  const path = fileURLToPath(new URL(`../../../.github/workflows/${name}`, import.meta.url));
  return readFileSync(path, "utf8");
}

describe("release workflow contract", () => {
  it("uses a shared commit-based prerelease tag instead of per-workflow run numbers", () => {
    const workflow = readWorkflow("desktop-release.yml");

    expect(workflow).toContain('tagName: ${{ steps.release_meta.outputs.main_tag }}');
    expect(workflow).toContain('releaseName: ${{ steps.release_meta.outputs.main_name }}');
    expect(workflow).toContain('releaseBody: ${{ steps.release_meta.outputs.main_body }}');
    expect(workflow).toContain("id: release_meta");
    expect(workflow).not.toContain("github.run_number");
  });

  it("builds macOS and Linux bundles from the same desktop release workflow", () => {
    const workflow = readWorkflow("desktop-release.yml");

    expect(workflow).toContain("name: desktop-release");
    expect(workflow).toContain("build-desktop");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("ubuntu-22.04");
    expect(workflow).toContain("--bundles app,dmg --target aarch64-apple-darwin");
    expect(workflow).toContain("--bundles app,dmg --target x86_64-apple-darwin");
    expect(workflow).toContain("--bundles deb,appimage,rpm");
  });

  it("keeps formal version tags publishing into the shared git tag release", () => {
    const workflow = readWorkflow("desktop-release.yml");

    expect(workflow).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(workflow).toContain("tagName: ${{ github.ref_name }}");
    expect(workflow).toContain('releaseBody: ${{ steps.release_meta.outputs.tag_body }}');
  });

  it("includes author-facing release note sections for prereleases and tags", () => {
    const workflow = readWorkflow("desktop-release.yml");

    expect(workflow).toContain("### 作者的话");
    expect(workflow).toContain('echo "这是从 \\`main\\` 自动产出的桌面端预发布版本。"');
    expect(workflow).toContain("这一版聚合了 macOS 与 Linux 的桌面端安装资产");
  });
});
