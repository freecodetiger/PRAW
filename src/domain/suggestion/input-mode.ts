import type { CompletionInputMode } from "./types";

const COMMAND_PREFIXES = new Set([
  "apt",
  "brew",
  "cargo",
  "cat",
  "cd",
  "curl",
  "docker",
  "echo",
  "git",
  "go",
  "kubectl",
  "ls",
  "make",
  "mysql",
  "mysqladmin",
  "mysqldump",
  "npm",
  "pnpm",
  "python",
  "python3",
  "ssh",
  "tail",
  "vim",
  "yarn",
]);

const ENGLISH_INTENT_PREFIXES = ["find ", "show ", "start ", "run ", "open ", "check ", "fix "];
const CJK_INTENT_WORDS = ["查看", "启动", "提交", "修复", "查", "运行", "同步", "打开", "连接", "导出"];

export function classifyCompletionInput(draft: string, _shell: string): CompletionInputMode {
  const trimmed = draft.trim();
  if (trimmed.length <= 2) {
    return "prefix";
  }

  if (isCommandLike(trimmed)) {
    return "prefix";
  }

  if (containsCjk(trimmed) && CJK_INTENT_WORDS.some((word) => trimmed.includes(word))) {
    return "intent";
  }

  const lowered = trimmed.toLowerCase();
  if (ENGLISH_INTENT_PREFIXES.some((prefix) => lowered.startsWith(prefix))) {
    return "intent";
  }

  return "prefix";
}

function isCommandLike(value: string): boolean {
  if (value.startsWith("./") || value.startsWith("../") || value.startsWith("/") || value.startsWith("~/")) {
    return true;
  }

  const [head] = value.split(/\s+/, 1);
  if (!head) {
    return false;
  }

  if (COMMAND_PREFIXES.has(head.toLowerCase())) {
    return true;
  }

  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}
