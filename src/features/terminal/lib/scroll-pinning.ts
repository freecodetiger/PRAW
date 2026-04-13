const PINNED_BOTTOM_THRESHOLD = 48;

export function resolvePinnedBottomState(distanceFromBottom: number, manualJumpPending: boolean): boolean {
  if (manualJumpPending) {
    return true;
  }

  return distanceFromBottom <= PINNED_BOTTOM_THRESHOLD;
}
