export function formatDialogPromptPath(cwd: string, widthPx: number): string {
  const normalized = cwd.trim();
  if (!normalized) {
    return "~";
  }

  if (!Number.isFinite(widthPx) || widthPx >= 480) {
    return normalized;
  }

  const segments = splitPathSegments(normalized);
  const fallback = segments.length > 0 ? segments[segments.length - 1] : normalized;

  if (widthPx < 280 || segments.length <= 1) {
    return fallback;
  }

  const tail = segments.slice(-2).join("/");
  return `.../${tail}`;
}

function splitPathSegments(path: string): string[] {
  const withoutTrailingSlash = path.replace(/\/+$/u, "");
  return withoutTrailingSlash
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "~");
}
