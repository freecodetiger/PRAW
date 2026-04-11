export type HistoryHighlightKind =
  | "plain"
  | "command"
  | "subcommand"
  | "option"
  | "path"
  | "env"
  | "string"
  | "operator"
  | "url"
  | "error"
  | "warning"
  | "success"
  | "number"
  | "time";

export interface HistoryHighlightToken {
  text: string;
  kind: HistoryHighlightKind;
}

const SUBCOMMAND_COMMANDS = new Set([
  "npm",
  "pnpm",
  "yarn",
  "git",
  "cargo",
  "docker",
  "kubectl",
  "systemctl",
  "uv",
  "pip",
  "python",
]);

const COMMAND_OPERATOR_PATTERN = /^(?:\|\||&&|>>|<<|\|&|[|<>;])/;
const URL_AT_START_PATTERN = /^https?:\/\/[^\s"')\]}]+/i;
const PATH_AT_START_PATTERN = /^(?:~\/|\/|\.\.?\/)[^\s:;,"')\]}]+/;
const DATETIME_AT_START_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/;
const TIME_AT_START_PATTERN = /^\d{1,2}:\d{2}(?::\d{2})?/;
const NUMBER_AT_START_PATTERN = /^\d+(?:\.\d+)?/;

const OUTPUT_PATTERNS: Array<{ kind: Exclude<HistoryHighlightKind, "command" | "subcommand" | "option" | "env" | "string" | "operator">; regex: RegExp }> = [
  { kind: "url", regex: URL_AT_START_PATTERN },
  { kind: "time", regex: DATETIME_AT_START_PATTERN },
  { kind: "time", regex: TIME_AT_START_PATTERN },
  { kind: "path", regex: PATH_AT_START_PATTERN },
  { kind: "error", regex: /^(?:not found|timed out|timeout|error|errors|failed|failure|fatal|exception|cannot|denied)/i },
  { kind: "warning", regex: /^(?:warning|warn|deprecated|caution)/i },
  { kind: "success", regex: /^(?:build|built|success|successful|succeeded|done|completed|ok|passed)/i },
  { kind: "number", regex: NUMBER_AT_START_PATTERN },
];

export function highlightCommandText(text: string): HistoryHighlightToken[] {
  if (text.length === 0) {
    return [];
  }

  const tokens: HistoryHighlightToken[] = [];
  let index = 0;
  let commandName: string | null = null;
  let argumentIndex = 0;

  while (index < text.length) {
    const char = text[index];
    if (isWhitespace(char)) {
      const nextIndex = consumeWhile(text, index, isWhitespace);
      tokens.push({ text: text.slice(index, nextIndex), kind: "plain" });
      index = nextIndex;
      continue;
    }

    const operatorMatch = text.slice(index).match(COMMAND_OPERATOR_PATTERN);
    if (operatorMatch) {
      const operator = operatorMatch[0];
      tokens.push({ text: operator, kind: "operator" });
      index += operator.length;
      if (operator === "|" || operator === "||" || operator === "&&" || operator === ";") {
        commandName = null;
        argumentIndex = 0;
      }
      continue;
    }

    const token = readCommandToken(text, index);
    const kind = classifyCommandToken(token, commandName, argumentIndex);
    tokens.push({ text: token, kind });

    if (kind === "command") {
      commandName = normalizeBareToken(token);
      argumentIndex = 0;
    } else if (commandName) {
      argumentIndex += 1;
    }

    index += token.length;
  }

  return mergeAdjacentTokens(tokens);
}

export function highlightOutputText(text: string): HistoryHighlightToken[] {
  if (text.length === 0) {
    return [];
  }

  const tokens: HistoryHighlightToken[] = [];
  let index = 0;

  while (index < text.length) {
    const match = matchOutputToken(text, index);
    if (match) {
      tokens.push(match);
      index += match.text.length;
      continue;
    }

    tokens.push({ text: text[index], kind: "plain" });
    index += 1;
  }

  return mergeAdjacentTokens(tokens);
}

function classifyCommandToken(
  token: string,
  commandName: string | null,
  argumentIndex: number,
): HistoryHighlightKind {
  if (token === "--") {
    return "operator";
  }

  if (isQuotedToken(token)) {
    return "string";
  }

  if (!commandName && isEnvironmentAssignment(token)) {
    return "env";
  }

  if (!commandName) {
    return "command";
  }

  if (isOptionToken(token)) {
    return "option";
  }

  if (isUrlToken(token)) {
    return "url";
  }

  if (isPathToken(token)) {
    return "path";
  }

  if (argumentIndex === 0 && SUBCOMMAND_COMMANDS.has(commandName) && isSubcommandToken(token)) {
    return "subcommand";
  }

  return "plain";
}

function matchOutputToken(text: string, index: number): HistoryHighlightToken | null {
  const previous = index > 0 ? text[index - 1] : "";
  const slice = text.slice(index);

  for (const pattern of OUTPUT_PATTERNS) {
    if (!canStartStructuredToken(pattern.kind, previous)) {
      continue;
    }

    const match = slice.match(pattern.regex);
    if (!match) {
      continue;
    }

    const matchedText = match[0];
    const next = slice[matchedText.length] ?? "";
    if (!isValidBoundary(pattern.kind, previous, next, matchedText)) {
      continue;
    }

    return {
      text: matchedText,
      kind: pattern.kind,
    };
  }

  return null;
}

function canStartStructuredToken(kind: HistoryHighlightKind, previous: string): boolean {
  if (kind === "path") {
    return previous === "" || /[\s([{:"'`]/.test(previous);
  }

  if (kind === "url" || kind === "time" || kind === "number") {
    return previous === "" || !isWordCharacter(previous);
  }

  if (kind === "error" || kind === "warning" || kind === "success") {
    return previous === "" || !isWordCharacter(previous);
  }

  return true;
}

function isValidBoundary(kind: HistoryHighlightKind, previous: string, next: string, text: string): boolean {
  if (kind === "number") {
    return next === "" || !/[A-Za-z_]/.test(next) || /[a-z]/i.test(next);
  }

  if (kind === "error" || kind === "warning" || kind === "success" || kind === "time") {
    return next === "" || !isWordCharacter(next);
  }

  if (kind === "url" || kind === "path") {
    return text.length > 0;
  }

  return previous === "" || !isWordCharacter(previous);
}

function readCommandToken(text: string, index: number): string {
  const quote = text[index];
  if (quote === '"' || quote === "'" || quote === "`") {
    let cursor = index + 1;
    while (cursor < text.length) {
      const current = text[cursor];
      if (current === "\\" && quote !== "'" && cursor + 1 < text.length) {
        cursor += 2;
        continue;
      }
      if (current === quote) {
        cursor += 1;
        break;
      }
      cursor += 1;
    }
    return text.slice(index, cursor);
  }

  let cursor = index;
  while (cursor < text.length) {
    const current = text[cursor];
    if (isWhitespace(current)) {
      break;
    }
    if (text.slice(cursor).match(COMMAND_OPERATOR_PATTERN)) {
      break;
    }
    cursor += 1;
  }
  return text.slice(index, cursor);
}

function normalizeBareToken(token: string): string {
  return token.replace(/^['"`]|['"`]$/g, "").toLowerCase();
}

function isEnvironmentAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

function isQuotedToken(token: string): boolean {
  return token.length >= 2 && ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'")) || (token.startsWith("`") && token.endsWith("`")));
}

function isOptionToken(token: string): boolean {
  return /^-{1,2}[A-Za-z0-9]/.test(token);
}

function isUrlToken(token: string): boolean {
  return /^https?:\/\//i.test(token);
}

function isPathToken(token: string): boolean {
  return /^(?:~\/|\/|\.\.?\/)/.test(token) || /^[^\s]+\//.test(token);
}

function isSubcommandToken(token: string): boolean {
  return /^[A-Za-z][A-Za-z0-9:_-]*$/.test(token);
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

function consumeWhile(text: string, index: number, predicate: (char: string) => boolean): number {
  let cursor = index;
  while (cursor < text.length && predicate(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function mergeAdjacentTokens(tokens: HistoryHighlightToken[]): HistoryHighlightToken[] {
  const merged: HistoryHighlightToken[] = [];
  for (const token of tokens) {
    if (token.text.length === 0) {
      continue;
    }
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === token.kind) {
      previous.text += token.text;
      continue;
    }
    merged.push({ ...token });
  }
  return merged;
}

function isWordCharacter(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}
