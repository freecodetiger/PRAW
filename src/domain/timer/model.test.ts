import { describe, expect, it } from "vitest";

import {
  REST_MESSAGES,
  TIMER_REST_MESSAGE_SETS,
  formatCountdownDuration,
  formatHeaderDateTime,
  getRemainingSeconds,
} from "./model";

describe("timer model", () => {
  it("formats the header date as Chinese month/day weekday and 24-hour time", () => {
    expect(formatHeaderDateTime(new Date(2026, 3, 27, 16, 46))).toBe("4月27日 周一 16:46");
  });

  it("formats countdown durations with minutes until an hour and hours after that", () => {
    expect(formatCountdownDuration(25 * 60)).toBe("25:00");
    expect(formatCountdownDuration(65 * 60 + 5)).toBe("01:05:05");
    expect(formatCountdownDuration(-3)).toBe("00:00");
  });

  it("calculates remaining whole seconds from an absolute end time", () => {
    expect(getRemainingSeconds(20_500, 10_000)).toBe(11);
    expect(getRemainingSeconds(10_000, 20_000)).toBe(0);
  });

  it("provides rest messages for the finished state", () => {
    expect(REST_MESSAGES.length).toBeGreaterThan(1);
    expect(REST_MESSAGES).toContain("这一轮结束了，先留一点空白。");
  });

  it("provides at least eight restrained and healing rest messages", () => {
    expect(TIMER_REST_MESSAGE_SETS.restrained.length).toBeGreaterThanOrEqual(8);
    expect(TIMER_REST_MESSAGE_SETS.healing.length).toBeGreaterThanOrEqual(8);
    expect(TIMER_REST_MESSAGE_SETS.healing).toContain("辛苦了，慢慢回来就好。");
  });
});
