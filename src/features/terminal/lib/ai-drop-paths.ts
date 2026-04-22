export interface PhysicalDragPosition {
  x: number;
  y: number;
}

export interface PaneRectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function formatDroppedPathsForShell(paths: string[]): string {
  const uniquePaths = Array.from(
    new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0)),
  );

  return uniquePaths.map(quoteShellPath).join(" ");
}

export function appendDroppedPathsToDraft(currentDraft: string, droppedText: string): string {
  if (droppedText.length === 0) {
    return currentDraft;
  }

  if (currentDraft.length === 0) {
    return droppedText;
  }

  return /\s$/u.test(currentDraft) ? `${currentDraft}${droppedText}` : `${currentDraft} ${droppedText}`;
}

export function isDragPositionInsidePane(
  position: PhysicalDragPosition,
  rect: PaneRectLike,
): boolean {
  return position.x >= rect.left && position.x <= rect.right && position.y >= rect.top && position.y <= rect.bottom;
}

function quoteShellPath(path: string): string {
  return `'${path.replace(/'/gu, `'"'"'`)}'`;
}
