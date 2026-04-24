import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { APP_VERSION } from "../../../domain/release/app-version";

const LATEST_RELEASE_PAGE_URL = "https://github.com/freecodetiger/PRAW/releases";

export type AppUpdateCheckResult =
  | {
      status: "available";
      currentVersion: string;
      latestVersion: string;
      releaseUrl: string;
    }
  | {
      status: "up-to-date";
      currentVersion: string;
      latestVersion: string;
      releaseUrl: string;
    }
  | {
      status: "error";
      currentVersion: string;
      message: string;
      releaseUrl: string;
    };

export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  try {
    return await invoke<AppUpdateCheckResult>("check_app_update");
  } catch (error) {
    return {
      status: "error",
      currentVersion: APP_VERSION,
      message: error instanceof Error ? error.message : String(error),
      releaseUrl: LATEST_RELEASE_PAGE_URL,
    };
  }
}

export async function openAppReleasePage(releaseUrl = LATEST_RELEASE_PAGE_URL): Promise<void> {
  await openUrl(releaseUrl);
}

export function isVersionNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const width = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < width; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function parseVersionParts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}
