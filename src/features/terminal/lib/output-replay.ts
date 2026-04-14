export type TerminalReplayPlan =
  | {
      type: "hydrate";
      content: string;
    }
  | {
      type: "append";
      content: string;
    }
  | {
      type: "noop";
    };

export function getTerminalReplayPlan(renderedContent: string, bufferedContent: string): TerminalReplayPlan {
  if (renderedContent.length === 0) {
    return {
      type: "hydrate",
      content: bufferedContent,
    };
  }

  if (bufferedContent === renderedContent) {
    return {
      type: "noop",
    };
  }

  if (bufferedContent.startsWith(renderedContent)) {
    return {
      type: "append",
      content: bufferedContent.slice(renderedContent.length),
    };
  }

  // 直接 hydrate - 避免复杂的匹配逻辑导致性能问题
  return {
    type: "hydrate",
    content: bufferedContent,
  };
}
