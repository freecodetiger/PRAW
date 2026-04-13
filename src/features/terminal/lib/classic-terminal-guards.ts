interface DisposableLike {
  dispose(): void;
}

interface CsiIdentifierLike {
  prefix?: string;
  final: string;
}

interface ParserLike {
  registerOscHandler(ident: number, callback: (data: string) => boolean | Promise<boolean>): DisposableLike;
  registerCsiHandler(
    identifier: CsiIdentifierLike,
    callback: (params: (number | number[])[]) => boolean | Promise<boolean>,
  ): DisposableLike;
}

interface ClassicTerminalGuardTarget {
  parser: ParserLike;
  sendResponse?: (data: string) => void | Promise<void>;
  queryColorResponses?: Partial<Record<(typeof OSC_SPECIAL_COLOR_IDENTIFIERS)[number], string>>;
}

const OSC_SPECIAL_COLOR_IDENTIFIERS = [10, 11, 12] as const;
const CSI_QUERY_IDENTIFIERS: ReadonlyArray<CsiIdentifierLike> = [
  { final: "c" },
  { prefix: ">", final: "c" },
  { final: "n" },
  { prefix: "?", final: "n" },
  { prefix: "?", final: "h" },
  { prefix: "?", final: "l" },
];
const CLASSIC_WORKFLOW_RESET_SEQUENCE = [
  "\u001b[0m",
  "\u001b[?1l",
  "\u001b[?9l",
  "\u001b[?25h",
  "\u001b[?1000l",
  "\u001b[?1002l",
  "\u001b[?1003l",
  "\u001b[?1004l",
  "\u001b[?1005l",
  "\u001b[?1006l",
  "\u001b[?1015l",
  "\u001b[?1016l",
  "\u001b[?1047l",
  "\u001b[?1048l",
  "\u001b[?1049l",
  "\u001b[?2004l",
].join("");
const DEFAULT_OSC_COLOR_QUERY_RESPONSES: Record<(typeof OSC_SPECIAL_COLOR_IDENTIFIERS)[number], string> = {
  10: "rgb:ffff/ffff/ffff",
  11: "rgb:0000/0000/0000",
  12: "rgb:ffff/ffff/ffff",
};

export function shouldSwallowOscColorQuery(data: string): boolean {
  return data
    .split(";")
    .map((segment) => segment.trim())
    .some((segment) => segment === "?");
}

export function shouldSwallowCsiQuery(identifier: string, params: ReadonlyArray<number | number[]>): boolean {
  const firstParam = typeof params[0] === "number" ? params[0] : undefined;

  switch (identifier) {
    case "c":
    case ">c":
      return firstParam === undefined || firstParam === 0;
    case "n":
      return firstParam === 5 || firstParam === 6;
    case "?n":
      return firstParam === 6 || firstParam === 15 || firstParam === 25 || firstParam === 26 || firstParam === 53;
    case "?h":
    case "?l":
      return firstParam === 1004;
    default:
      return false;
  }
}

export function resolveClassicOscColorQueryResponse(
  ident: (typeof OSC_SPECIAL_COLOR_IDENTIFIERS)[number],
  data: string,
  queryColorResponses: Partial<Record<(typeof OSC_SPECIAL_COLOR_IDENTIFIERS)[number], string>> = {},
): string | null {
  if (!shouldSwallowOscColorQuery(data)) {
    return null;
  }

  const color = queryColorResponses[ident] ?? DEFAULT_OSC_COLOR_QUERY_RESPONSES[ident];
  return `\u001b]${ident};${color}\u001b\\`;
}

export function resolveClassicCsiQueryResponse(
  identifier: string,
  params: ReadonlyArray<number | number[]>,
): string | null {
  if (!shouldSwallowCsiQuery(identifier, params)) {
    return null;
  }

  const firstParam = typeof params[0] === "number" ? params[0] : undefined;

  switch (identifier) {
    case "c":
      return "\u001b[?62;4;c";
    case ">c":
      return "\u001b[>0;10;1c";
    case "n":
      if (firstParam === 5) {
        return "\u001b[0n";
      }
      if (firstParam === 6) {
        return "\u001b[1;1R";
      }
      return null;
    case "?n":
      if (firstParam === 6) {
        return "\u001b[?1;1R";
      }
      return null;
    default:
      return null;
  }
}

export function installClassicTerminalProtocolGuards(target: ClassicTerminalGuardTarget): () => void {
  const disposables: DisposableLike[] = [];

  for (const ident of OSC_SPECIAL_COLOR_IDENTIFIERS) {
    disposables.push(
      target.parser.registerOscHandler(ident, (data) => {
        const response = resolveClassicOscColorQueryResponse(ident, data, target.queryColorResponses);
        if (!response) {
          return false;
        }

        void target.sendResponse?.(response);
        return true;
      }),
    );
  }

  for (const identifier of CSI_QUERY_IDENTIFIERS) {
    const key = `${identifier.prefix ?? ""}${identifier.final}`;
    disposables.push(
      target.parser.registerCsiHandler(identifier, (params) => {
        const response = resolveClassicCsiQueryResponse(key, params);
        if (!response && !shouldSwallowCsiQuery(key, params)) {
          return false;
        }

        if (response) {
          void target.sendResponse?.(response);
        }
        return true;
      }),
    );
  }

  return () => {
    for (const disposable of disposables) {
      disposable.dispose();
    }
  };
}

export function buildClassicTerminalWorkflowResetSequence(): string {
  return CLASSIC_WORKFLOW_RESET_SEQUENCE;
}
