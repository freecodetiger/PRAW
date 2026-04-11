interface ContainsTarget {
  contains(candidate: unknown): boolean;
}

export function shouldCloseContextMenu(menu: ContainsTarget | null, target: unknown): boolean {
  if (!menu) {
    return true;
  }

  return !menu.contains(target);
}
