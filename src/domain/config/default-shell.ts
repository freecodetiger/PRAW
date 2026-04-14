export function resolvePlatformDefaultShell(platform: string | undefined): string {
  return isMacPlatform(platform) ? "/bin/zsh" : "/bin/bash";
}

export function detectCurrentPlatform(): string | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  return navigator.platform;
}

export const DEFAULT_TERMINAL_SHELL = resolvePlatformDefaultShell(detectCurrentPlatform());

function isMacPlatform(platform: string | undefined): boolean {
  if (typeof platform !== "string") {
    return false;
  }

  return /mac/i.test(platform);
}
