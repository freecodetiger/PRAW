import { describe, expect, it } from "vitest";

import {
  getNextPhraseSelection,
  getPhraseMatches,
  normalizeImportedPhraseText,
} from "./phrase-completion";

describe("phrase-completion", () => {
  it("normalizes imported text into unique non-empty phrases", () => {
    expect(normalizeImportedPhraseText("codex\n\n claude \ncodex\ncd projects/\n")).toEqual([
      "codex",
      "claude",
      "cd projects/",
    ]);
  });

  it("treats CRLF text files the same as LF text files", () => {
    expect(normalizeImportedPhraseText("codex\r\nclaude\r\ncd projects/\r\n")).toEqual([
      "codex",
      "claude",
      "cd projects/",
    ]);
  });

  it("returns no matches below the minimum prefix length", () => {
    expect(getPhraseMatches("c", ["codex"], {})).toEqual([]);
  });

  it("matches whole-line prefixes and excludes exact matches", () => {
    expect(getPhraseMatches("cd p", ["cd projects/", "cd playground/"], {})).toMatchObject([
      { phrase: "cd projects/", suffix: "rojects/" },
      { phrase: "cd playground/", suffix: "layground/" },
    ]);
    expect(getPhraseMatches("codex", ["codex"], {})).toEqual([]);
  });

  it("sorts by recent usage first and import order second", () => {
    expect(
      getPhraseMatches(
        "cd ",
        ["cd playground/", "cd projects/", "cd /tmp"],
        { "cd projects/": 9, "cd playground/": 2 },
      ).map((entry) => entry.phrase),
    ).toEqual(["cd projects/", "cd playground/", "cd /tmp"]);
  });

  it("cycles candidate selection in both directions", () => {
    expect(getNextPhraseSelection(0, 3, "next")).toBe(1);
    expect(getNextPhraseSelection(2, 3, "next")).toBe(0);
    expect(getNextPhraseSelection(0, 3, "previous")).toBe(2);
  });
});
