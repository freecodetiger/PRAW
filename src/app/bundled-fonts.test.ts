import { describe, expect, it, vi } from "vitest";

import { createBundledTerminalFontSources, loadBundledTerminalFonts } from "./bundled-fonts";

describe("bundled terminal fonts", () => {
  it("describes regular and bold bundled faces", () => {
    expect(createBundledTerminalFontSources("/fonts/regular.ttf", "/fonts/bold.ttf")).toEqual([
      {
        family: "CaskaydiaCove Nerd Font Mono",
        source: "/fonts/regular.ttf",
        weight: "400",
        style: "normal",
      },
      {
        family: "CaskaydiaCove Nerd Font Mono",
        source: "/fonts/bold.ttf",
        weight: "700",
        style: "normal",
      },
    ]);
  });

  it("loads every bundled face and keeps registration non-fatal", async () => {
    const add = vi.fn();
    const load = vi.fn().mockResolvedValue(undefined);

    class FakeFontFace {
      family: string;
      source: string;
      descriptors: FontFaceDescriptors;

      constructor(family: string, source: string, descriptors: FontFaceDescriptors) {
        this.family = family;
        this.source = source;
        this.descriptors = descriptors;
      }

      async load() {
        await load();
        return this as unknown as FontFace;
      }
    }

    await expect(
      loadBundledTerminalFonts(
        createBundledTerminalFontSources("/fonts/regular.ttf", "/fonts/bold.ttf"),
        FakeFontFace as unknown as typeof FontFace,
        { fonts: { add } } as unknown as Pick<Document, "fonts">,
      ),
    ).resolves.toBeUndefined();

    expect(load).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledTimes(2);
  });
});
