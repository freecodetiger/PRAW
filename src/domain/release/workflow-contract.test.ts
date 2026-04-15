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
    expect(workflow).toContain("releaseDraft: true");
    expect(workflow).toContain("prerelease: false");
  });

  it("includes author-facing release note sections for prereleases and tags", () => {
    const workflow = readWorkflow("desktop-release.yml");

    expect(workflow).toContain("### 作者的话");
    expect(workflow).toContain('echo "这是从 \\`main\\` 自动产出的桌面端预发布版本。"');
    expect(workflow).toContain("请作者在发布前补充本版本亮点、变更说明、已知问题和升级建议");
  });

  it("documents and wires the macOS signing secrets expected by CI", () => {
    const workflow = readWorkflow("desktop-release.yml");

    expect(workflow).toContain("APPLE_CERTIFICATE");
    expect(workflow).toContain("APPLE_CERTIFICATE_PASSWORD");
    expect(workflow).toContain("KEYCHAIN_PASSWORD");
    expect(workflow).toContain("APPLE_ID");
    expect(workflow).toContain("APPLE_PASSWORD");
    expect(workflow).toContain("APPLE_TEAM_ID");
    expect(workflow).toContain("Developer ID Application");
  });

  it("keeps unsigned macOS builds on an explicit signing identity path instead of passing raw certificates into tauri-action", () => {
    const workflow = readWorkflow("desktop-release.yml");
    const artifactsOnlySection = workflow.split("- name: Build workflow artifacts only")[1]?.split("- name: Build and publish main-branch prerelease")[0] ?? "";
    const prereleaseSection = workflow.split("- name: Build and publish main-branch prerelease")[1]?.split("- name: Build and publish tagged release")[0] ?? "";
    const taggedSection = workflow.split("- name: Build and publish tagged release")[1] ?? "";

    expect(artifactsOnlySection).toContain("APPLE_SIGNING_IDENTITY");
    expect(prereleaseSection).toContain("APPLE_SIGNING_IDENTITY");
    expect(taggedSection).toContain("APPLE_SIGNING_IDENTITY");

    expect(artifactsOnlySection).not.toContain("APPLE_CERTIFICATE");
    expect(artifactsOnlySection).not.toContain("APPLE_ID");
    expect(artifactsOnlySection).not.toContain("APPLE_PASSWORD");
    expect(artifactsOnlySection).not.toContain("APPLE_TEAM_ID");
    expect(prereleaseSection).not.toContain("APPLE_CERTIFICATE");
    expect(taggedSection).not.toContain("APPLE_CERTIFICATE");
    expect(workflow).toContain("Build and publish main-branch prerelease without notarization");
  });
});
