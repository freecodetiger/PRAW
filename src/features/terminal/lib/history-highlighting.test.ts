import { describe, expect, it } from "vitest";

import { highlightCommandText, highlightOutputText } from "./history-highlighting";

describe("highlightCommandText", () => {
  it("tokenizes env assignments, commands, subcommands, options, paths, urls, and redirects", () => {
    expect(highlightCommandText('NODE_ENV=production npm run build -- --watch ./src > /tmp/build.log')).toEqual([
      { text: 'NODE_ENV=production', kind: 'env' },
      { text: ' ', kind: 'plain' },
      { text: 'npm', kind: 'command' },
      { text: ' ', kind: 'plain' },
      { text: 'run', kind: 'subcommand' },
      { text: ' build ', kind: 'plain' },
      { text: '--', kind: 'operator' },
      { text: ' ', kind: 'plain' },
      { text: '--watch', kind: 'option' },
      { text: ' ', kind: 'plain' },
      { text: './src', kind: 'path' },
      { text: ' ', kind: 'plain' },
      { text: '>', kind: 'operator' },
      { text: ' ', kind: 'plain' },
      { text: '/tmp/build.log', kind: 'path' },
    ]);
  });

  it("keeps quoted strings and urls distinct", () => {
    expect(highlightCommandText('curl "https://example.com/api?q=1" --header "X-Test: 1"')).toEqual([
      { text: 'curl', kind: 'command' },
      { text: ' ', kind: 'plain' },
      { text: '"https://example.com/api?q=1"', kind: 'string' },
      { text: ' ', kind: 'plain' },
      { text: '--header', kind: 'option' },
      { text: ' ', kind: 'plain' },
      { text: '"X-Test: 1"', kind: 'string' },
    ]);
  });
});

describe("highlightOutputText", () => {
  it("highlights status words, paths, urls, times, and numbers", () => {
    expect(highlightOutputText('Build succeeded in 12.4s at 2026-04-12 09:41:22\nOpen /tmp/build.log or visit https://example.com/report')).toEqual([
      { text: 'Build', kind: 'success' },
      { text: ' ', kind: 'plain' },
      { text: 'succeeded', kind: 'success' },
      { text: ' in ', kind: 'plain' },
      { text: '12.4', kind: 'number' },
      { text: 's at ', kind: 'plain' },
      { text: '2026-04-12 09:41:22', kind: 'time' },
      { text: '\nOpen ', kind: 'plain' },
      { text: '/tmp/build.log', kind: 'path' },
      { text: ' or visit ', kind: 'plain' },
      { text: 'https://example.com/report', kind: 'url' },
    ]);
  });

  it("highlights warnings and errors without breaking surrounding text", () => {
    expect(highlightOutputText('warning: deprecated flag\nerror: file not found at ./src/main.ts')).toEqual([
      { text: 'warning', kind: 'warning' },
      { text: ': ', kind: 'plain' },
      { text: 'deprecated', kind: 'warning' },
      { text: ' flag\n', kind: 'plain' },
      { text: 'error', kind: 'error' },
      { text: ': file ', kind: 'plain' },
      { text: 'not found', kind: 'error' },
      { text: ' at ', kind: 'plain' },
      { text: './src/main.ts', kind: 'path' },
    ]);
  });
});
