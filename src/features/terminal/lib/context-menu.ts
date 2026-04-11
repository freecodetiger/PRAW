interface ContainsTarget {
  contains(candidate: unknown): boolean;
}

interface ContextMenuPositionInput {
  clickX: number;
  clickY: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

const VIEWPORT_MARGIN = 8;

export function shouldCloseContextMenu(menu: ContainsTarget | null, target: unknown): boolean {
  if (!menu) {
    return true;
  }

  return !menu.contains(target);
}

export function calculateContextMenuPosition({
  clickX,
  clickY,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
}: ContextMenuPositionInput): { left: number; top: number } {
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - menuWidth - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - menuHeight - VIEWPORT_MARGIN);

  return {
    left: clamp(clickX, VIEWPORT_MARGIN, maxLeft),
    top: clamp(clickY, VIEWPORT_MARGIN, maxTop),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
