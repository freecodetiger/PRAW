import boldMonoUrl from "../assets/fonts/CaskaydiaCoveNerdFontMono-Bold.ttf?url";
import regularMonoUrl from "../assets/fonts/CaskaydiaCoveNerdFontMono-Regular.ttf?url";

export interface BundledTerminalFontSource {
  family: string;
  source: string;
  weight: string;
  style: "normal";
}

export function createBundledTerminalFontSources(
  regularUrl: string,
  boldUrl: string,
): BundledTerminalFontSource[] {
  return [
    {
      family: "CaskaydiaCove Nerd Font Mono",
      source: regularUrl,
      weight: "400",
      style: "normal",
    },
    {
      family: "CaskaydiaCove Nerd Font Mono",
      source: boldUrl,
      weight: "700",
      style: "normal",
    },
  ];
}

export const BUNDLED_TERMINAL_FONT_SOURCES = createBundledTerminalFontSources(
  regularMonoUrl,
  boldMonoUrl,
);

export async function loadBundledTerminalFonts(
  sources = BUNDLED_TERMINAL_FONT_SOURCES,
  FontFaceCtor: typeof FontFace = FontFace,
  doc: Pick<Document, "fonts"> = document,
): Promise<void> {
  await Promise.all(
    sources.map(async ({ family, source, weight, style }) => {
      const font = new FontFaceCtor(family, `url(${source})`, {
        weight,
        style,
        display: "swap",
      });
      const loaded = await font.load();
      doc.fonts.add(loaded);
    }),
  ).catch(() => undefined);
}
