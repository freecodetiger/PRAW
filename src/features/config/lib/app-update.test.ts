import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { beforeEach, describe, expect, it, vi } from "vitest";

import packageInfo from "../../../../package.json";
import { APP_VERSION } from "../../../domain/release/app-version";
import { checkForAppUpdate, isVersionNewer, openAppReleasePage } from "./app-update";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedOpenUrl = vi.mocked(openUrl);

describe("app update checks", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedOpenUrl.mockReset();
  });

  it("uses the package version as the app version source", () => {
    expect(APP_VERSION).toBe(packageInfo.version);
  });

  it("compares multi-digit semantic versions", () => {
    expect(isVersionNewer("0.1.10", "0.1.5")).toBe(true);
    expect(isVersionNewer("v0.1.5", "0.1.5")).toBe(false);
    expect(isVersionNewer("0.1.4", "0.1.5")).toBe(false);
  });

  it("returns an available result when GitHub latest is newer", async () => {
    mockedInvoke.mockResolvedValue({
      status: "available",
      currentVersion: APP_VERSION,
      latestVersion: "0.1.6",
      releaseUrl: "https://github.com/freecodetiger/PRAW/releases/tag/v0.1.6",
    });

    await expect(checkForAppUpdate()).resolves.toEqual({
      status: "available",
      currentVersion: APP_VERSION,
      latestVersion: "0.1.6",
      releaseUrl: "https://github.com/freecodetiger/PRAW/releases/tag/v0.1.6",
    });
    expect(mockedInvoke).toHaveBeenCalledWith("check_app_update");
  });

  it("returns a user-facing error result when the backend update check fails", async () => {
    mockedInvoke.mockRejectedValue(new Error("GitHub API rate limited the release check"));

    await expect(checkForAppUpdate()).resolves.toEqual({
      status: "error",
      currentVersion: APP_VERSION,
      message: "GitHub API rate limited the release check",
      releaseUrl: "https://github.com/freecodetiger/PRAW/releases",
    });
  });

  it("opens the selected release page", async () => {
    await openAppReleasePage("https://github.com/freecodetiger/PRAW/releases/tag/v0.1.6");

    expect(mockedOpenUrl).toHaveBeenCalledWith("https://github.com/freecodetiger/PRAW/releases/tag/v0.1.6");
  });
});
