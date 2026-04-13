interface LiveConsoleLayoutInput {
  paneHeight: number;
}

interface LiveConsoleLayout {
  heightPx: number;
  compact: boolean;
}

const DEFAULT_HEIGHT = 248;
const COMPACT_HEIGHT = 136;
const COMPACT_THRESHOLD = 420;

export function resolveLiveConsoleLayout({ paneHeight }: LiveConsoleLayoutInput): LiveConsoleLayout {
  if (paneHeight <= COMPACT_THRESHOLD) {
    return {
      heightPx: COMPACT_HEIGHT,
      compact: true,
    };
  }

  return {
    heightPx: DEFAULT_HEIGHT,
    compact: false,
  };
}
