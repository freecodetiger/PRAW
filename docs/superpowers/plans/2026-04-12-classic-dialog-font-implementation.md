# Classic And Dialog Font Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CaskaydiaCove Nerd Font Mono` the bundled default font for both terminal modes, lock classic mode to that bundled font, and make the settings font controls affect dialog mode only.

**Architecture:** Split terminal font configuration into dialog-only persisted settings, keep classic font family and size as runtime constants, and route font values by render mode in `TerminalPane`. Bundle and preload the mono font before the React app mounts so classic `xterm` never measures against a fallback font on first render.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, Vite asset pipeline, `@xterm/xterm`

---

## File Structure

- Create: `src/domain/config/font-defaults.ts`
  - Shared font constants for bundled mono family and fixed classic/dialog default sizes.
- Create: `src/features/terminal/lib/terminal-fonts.ts`
  - Pure helper that resolves the runtime font family/size for `classic` and `dialog`.
- Create: `src/features/terminal/lib/terminal-fonts.test.ts`
  - Unit tests for mode-specific font routing.
- Create: `src/app/bundled-fonts.ts`
  - Bundled font manifest plus the preload function used before React mount.
- Create: `src/app/bundled-fonts.test.ts`
  - Unit tests for the font manifest and loader behavior using injected doubles.
- Create: `src/assets/fonts/CaskaydiaCoveNerdFontMono-Regular.ttf`
  - Bundled regular face used by classic and dialog defaults.
- Create: `src/assets/fonts/CaskaydiaCoveNerdFontMono-Bold.ttf`
  - Bundled bold face so ANSI bold text in classic does not synthesize unpredictably.
- Modify: `src/domain/config/types.ts`
  - Replace shared terminal font fields with dialog-only fields.
- Modify: `src/domain/config/model.ts`
  - Add dialog font defaults and legacy migration from `fontFamily` / `fontSize`.
- Modify: `src/domain/config/model.test.ts`
  - Cover dialog defaults and legacy migration.
- Modify: `src/features/config/state/app-config-store.test.ts`
  - Verify store updates dialog font settings only.
- Modify: `src/features/config/components/SettingsPanel.tsx`
  - Show classic fixed-font summary and dialog-only editable controls.
- Modify: `src/features/terminal/components/TerminalPane.tsx`
  - Resolve classic/dialog font values separately and expose dialog font CSS variables.
- Modify: `src/app/styles.css`
  - Apply dialog font family and size through CSS variables instead of global inheritance.
- Modify: `src/main.tsx`
  - Wait for bundled font preload before mounting `<App />`.
- Modify: `src-tauri/src/config/mod.rs`
  - Rename persisted font fields to dialog-only names and add serde aliases for legacy config.

## Task 1: Split Frontend Config Into Dialog-Only Font Settings

**Files:**
- Create: `src/domain/config/font-defaults.ts`
- Modify: `src/domain/config/types.ts`
- Modify: `src/domain/config/model.ts`
- Test: `src/domain/config/model.test.ts`
- Test: `src/features/config/state/app-config-store.test.ts`

- [ ] **Step 1: Write the failing frontend config tests**

```ts
// src/domain/config/model.test.ts
import { describe, expect, it } from "vitest";

import { DEFAULT_APP_CONFIG, resolveAppConfig } from "./model";
import { DEFAULT_BUNDLED_MONO_FONT_FAMILY } from "./font-defaults";

describe("resolveAppConfig", () => {
  it("uses the bundled mono font as the default dialog font", () => {
    expect(DEFAULT_APP_CONFIG.terminal.dialogFontFamily).toBe(DEFAULT_BUNDLED_MONO_FONT_FAMILY);
    expect(DEFAULT_APP_CONFIG.terminal.dialogFontSize).toBe(14);
  });

  it("migrates legacy shared font keys into dialog font settings", () => {
    expect(
      resolveAppConfig({
        terminal: {
          fontFamily: "JetBrains Mono",
          fontSize: 16,
        },
      }),
    ).toEqual({
      terminal: {
        ...DEFAULT_APP_CONFIG.terminal,
        dialogFontFamily: "JetBrains Mono",
        dialogFontSize: 16,
      },
      ai: DEFAULT_APP_CONFIG.ai,
    });
  });
});

// src/features/config/state/app-config-store.test.ts
it("patches dialog font settings without reintroducing shared terminal font fields", () => {
  useAppConfigStore.getState().patchTerminalConfig({
    dialogFontFamily: "IBM Plex Mono",
    dialogFontSize: 15,
  });

  expect(useAppConfigStore.getState().config.terminal.dialogFontFamily).toBe("IBM Plex Mono");
  expect(useAppConfigStore.getState().config.terminal.dialogFontSize).toBe(15);
});
```

- [ ] **Step 2: Run the frontend config tests to verify they fail**

Run: `npx vitest run src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`

Expected: FAIL with TypeScript or assertion errors mentioning missing `dialogFontFamily` / `dialogFontSize` fields and legacy `fontFamily` migration not implemented.

- [ ] **Step 3: Add dialog-only font defaults and migration support**

```ts
// src/domain/config/font-defaults.ts
export const DEFAULT_BUNDLED_MONO_FONT_FAMILY =
  "\"CaskaydiaCove Nerd Font Mono\", \"CaskaydiaCove Nerd Font\", monospace";

export const DEFAULT_DIALOG_FONT_SIZE = 14;
export const CLASSIC_TERMINAL_FONT_SIZE = 14;

// src/domain/config/types.ts
export interface TerminalConfig {
  defaultShell: string;
  defaultCwd: string;
  dialogFontFamily: string;
  dialogFontSize: number;
  preferredMode: TerminalPreferredMode;
  themePreset: ThemePresetId;
  phrases: string[];
  phraseUsage: Record<string, number>;
}

// src/domain/config/model.ts
import { DEFAULT_BUNDLED_MONO_FONT_FAMILY, DEFAULT_DIALOG_FONT_SIZE } from "./font-defaults";

export interface TerminalConfigInput {
  defaultShell?: string;
  defaultCwd?: string;
  dialogFontFamily?: string;
  dialogFontSize?: number;
  fontFamily?: string;
  fontSize?: number;
  preferredMode?: string;
  themePreset?: string;
  phrases?: string[];
  phraseUsage?: Record<string, number>;
}

export interface AppConfigInput {
  terminal?: TerminalConfigInput;
  ai?: Partial<AiConfig>;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  terminal: {
    defaultShell: "/bin/bash",
    defaultCwd: "~",
    dialogFontFamily: DEFAULT_BUNDLED_MONO_FONT_FAMILY,
    dialogFontSize: DEFAULT_DIALOG_FONT_SIZE,
    preferredMode: "dialog",
    themePreset: "light",
    phrases: [],
    phraseUsage: {},
  },
  ai: {
    provider: "",
    model: "",
    enabled: false,
    apiKey: "",
    themeColor: "#1f5eff",
    backgroundColor: "#eef4ff",
  },
};

function normalizeDialogFontFamily(terminal: TerminalConfigInput | undefined): string {
  return normalizeString(
    terminal?.dialogFontFamily ?? terminal?.fontFamily,
    DEFAULT_APP_CONFIG.terminal.dialogFontFamily,
  );
}

function normalizeDialogFontSize(terminal: TerminalConfigInput | undefined): number {
  return normalizeFontSize(terminal?.dialogFontSize ?? terminal?.fontSize);
}

export function resolveAppConfig(input?: AppConfigInput | null): AppConfig {
  const terminal = input?.terminal;
  const ai = input?.ai;
  const phrases = normalizePhraseList(terminal?.phrases);

  return {
    terminal: {
      defaultShell: normalizeString(terminal?.defaultShell, DEFAULT_APP_CONFIG.terminal.defaultShell),
      defaultCwd: normalizeString(terminal?.defaultCwd, DEFAULT_APP_CONFIG.terminal.defaultCwd),
      dialogFontFamily: normalizeDialogFontFamily(terminal),
      dialogFontSize: normalizeDialogFontSize(terminal),
      preferredMode: normalizePreferredMode(terminal?.preferredMode),
      themePreset: normalizeThemePreset(terminal?.themePreset),
      phrases,
      phraseUsage: normalizePhraseUsage(terminal?.phraseUsage, phrases),
    },
    ai: {
      provider: normalizeAiIdentifier(ai?.provider),
      model: normalizeAiIdentifier(ai?.model),
      enabled: typeof ai?.enabled === "boolean" ? ai.enabled : DEFAULT_APP_CONFIG.ai.enabled,
      apiKey: normalizeOptionalString(ai?.apiKey),
      themeColor: normalizeHexColor(ai?.themeColor, DEFAULT_APP_CONFIG.ai.themeColor),
      backgroundColor: normalizeHexColor(ai?.backgroundColor, DEFAULT_APP_CONFIG.ai.backgroundColor),
    },
  };
}
```

- [ ] **Step 4: Run the frontend config tests to verify they pass**

Run: `npx vitest run src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`

Expected: PASS for the new dialog font default and legacy migration assertions.

- [ ] **Step 5: Commit the frontend config split**

```bash
git add src/domain/config/font-defaults.ts src/domain/config/types.ts src/domain/config/model.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts
git commit -m "refactor: split dialog font settings from terminal config"
```

## Task 2: Mirror The Config Split In Tauri And Preserve Legacy Persistence

**Files:**
- Modify: `src-tauri/src/config/mod.rs`
- Test: `src-tauri/src/config/mod.rs`

- [ ] **Step 1: Write the failing Rust config tests**

```rust
#[test]
fn deserializes_legacy_shared_font_keys_into_dialog_font_fields() {
    let config = serde_json::from_str::<AppConfig>(
        r##"{
            "terminal": {
                "defaultShell": "/bin/bash",
                "defaultCwd": "~",
                "fontFamily": "JetBrains Mono",
                "fontSize": 16,
                "preferredMode": "classic"
            },
            "ai": {
                "provider": "",
                "model": "",
                "enabled": false,
                "apiKey": "",
                "themeColor": "#1f5eff",
                "backgroundColor": "#eef4ff"
            }
        }"##,
    )
    .expect("legacy config should deserialize");

    assert_eq!(config.terminal.dialog_font_family, "JetBrains Mono");
    assert_eq!(config.terminal.dialog_font_size, 16);
}

#[test]
fn serializes_dialog_only_font_keys() {
    let json = serde_json::to_value(AppConfig::default()).expect("config should serialize");
    let terminal = json.get("terminal").expect("terminal should exist");

    assert!(terminal.get("dialogFontFamily").is_some());
    assert!(terminal.get("dialogFontSize").is_some());
    assert!(terminal.get("fontFamily").is_none());
    assert!(terminal.get("fontSize").is_none());
}
```

- [ ] **Step 2: Run the Rust config tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config::tests`

Expected: FAIL with unknown `dialog_font_family` / `dialog_font_size` fields or serialization still producing `fontFamily`.

- [ ] **Step 3: Rename the persisted Rust fields and add serde aliases**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalConfig {
    pub default_shell: String,
    pub default_cwd: String,
    #[serde(
        default = "default_terminal_dialog_font_family",
        alias = "fontFamily"
    )]
    pub dialog_font_family: String,
    #[serde(
        default = "default_terminal_dialog_font_size",
        alias = "fontSize"
    )]
    pub dialog_font_size: u16,
    #[serde(default = "default_terminal_preferred_mode")]
    pub preferred_mode: String,
    #[serde(default)]
    pub phrases: Vec<String>,
    #[serde(default)]
    pub phrase_usage: BTreeMap<String, u64>,
}

fn default_terminal_dialog_font_family() -> String {
    "\"CaskaydiaCove Nerd Font Mono\", \"CaskaydiaCove Nerd Font\", monospace".to_string()
}

fn default_terminal_dialog_font_size() -> u16 {
    14
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            terminal: TerminalConfig {
                default_shell: std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()),
                default_cwd: "~".to_string(),
                dialog_font_family: default_terminal_dialog_font_family(),
                dialog_font_size: default_terminal_dialog_font_size(),
                preferred_mode: "dialog".to_string(),
                phrases: Vec::new(),
                phrase_usage: BTreeMap::new(),
            },
            ai: AiConfig {
                provider: "glm".to_string(),
                model: "glm-5-flash".to_string(),
                enabled: false,
                api_key: String::new(),
                theme_color: "#1f5eff".to_string(),
                background_color: "#eef4ff".to_string(),
            },
        }
    }
}
```

- [ ] **Step 4: Run the Rust config tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config::tests`

Expected: PASS for both new tests plus the existing phrase/config serialization tests.

- [ ] **Step 5: Commit the Tauri config migration**

```bash
git add src-tauri/src/config/mod.rs
git commit -m "refactor: migrate persisted terminal fonts to dialog-only keys"
```

## Task 3: Route Classic And Dialog Fonts Separately In The UI

**Files:**
- Create: `src/features/terminal/lib/terminal-fonts.ts`
- Test: `src/features/terminal/lib/terminal-fonts.test.ts`
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/features/config/components/SettingsPanel.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write the failing font-routing tests**

```ts
import { describe, expect, it } from "vitest";

import { DEFAULT_BUNDLED_MONO_FONT_FAMILY, CLASSIC_TERMINAL_FONT_SIZE } from "../../../domain/config/font-defaults";
import { resolveTerminalRenderFont } from "./terminal-fonts";

describe("resolveTerminalRenderFont", () => {
  it("locks classic mode to the bundled mono font and fixed size", () => {
    expect(
      resolveTerminalRenderFont("classic", {
        dialogFontFamily: "JetBrains Mono",
        dialogFontSize: 17,
      }),
    ).toEqual({
      fontFamily: DEFAULT_BUNDLED_MONO_FONT_FAMILY,
      fontSize: CLASSIC_TERMINAL_FONT_SIZE,
    });
  });

  it("uses dialog settings for dialog mode", () => {
    expect(
      resolveTerminalRenderFont("dialog", {
        dialogFontFamily: "JetBrains Mono",
        dialogFontSize: 17,
      }),
    ).toEqual({
      fontFamily: "JetBrains Mono",
      fontSize: 17,
    });
  });
});
```

- [ ] **Step 2: Run the font-routing tests to verify they fail**

Run: `npx vitest run src/features/terminal/lib/terminal-fonts.test.ts`

Expected: FAIL because `resolveTerminalRenderFont` does not exist.

- [ ] **Step 3: Implement mode-specific font routing and wire it into the pane**

```ts
// src/features/terminal/lib/terminal-fonts.ts
import {
  CLASSIC_TERMINAL_FONT_SIZE,
  DEFAULT_BUNDLED_MONO_FONT_FAMILY,
} from "../../../domain/config/font-defaults";
import type { PaneRenderMode } from "../../../domain/terminal/dialog";

interface DialogFontSettings {
  dialogFontFamily: string;
  dialogFontSize: number;
}

export function resolveTerminalRenderFont(mode: PaneRenderMode, settings: DialogFontSettings) {
  return mode === "classic"
    ? {
        fontFamily: DEFAULT_BUNDLED_MONO_FONT_FAMILY,
        fontSize: CLASSIC_TERMINAL_FONT_SIZE,
      }
    : {
        fontFamily: settings.dialogFontFamily,
        fontSize: settings.dialogFontSize,
      };
}

// src/features/terminal/components/TerminalPane.tsx
const dialogFontFamily = useAppConfigStore((state) => state.config.terminal.dialogFontFamily);
const dialogFontSize = useAppConfigStore((state) => state.config.terminal.dialogFontSize);
const resolvedTerminalFont = resolveTerminalRenderFont(renderMode, {
  dialogFontFamily,
  dialogFontSize,
});

const paneStyle = {
  "--ai-theme-color": aiThemeColor,
  "--ai-background-color": isAgentWorkflow ? themePreset.app.surfaceMuted : themePreset.app.surface,
  "--dialog-terminal-font-family": dialogFontFamily,
  "--dialog-terminal-font-size": `${dialogFontSize}px`,
} as CSSProperties;

<ClassicTerminalSurface
  sessionId={currentStreamSessionId}
  bufferedOutput={bufferedOutput}
  fontFamily={resolvedTerminalFont.fontFamily}
  fontSize={resolvedTerminalFont.fontSize}
  theme={themePreset.terminal}
  isActive={Boolean(isActive)}
  presentation={tabState?.presentation ?? "default"}
  write={write}
  resize={resize}
/>

// src/features/config/components/SettingsPanel.tsx
<p className="settings-panel__summary">
  Shell {config.terminal.defaultShell} · Mode {terminalModeLabel} · Theme {themePresetLabel} ·
  Classic Font CaskaydiaCove Nerd Font Mono · Dialog Font {config.terminal.dialogFontFamily}{" "}
  {config.terminal.dialogFontSize}px · AI {aiStatus}
</p>

<div className="settings-section__title">
  <strong>Classic Terminal Font</strong>
  <p>CaskaydiaCove Nerd Font Mono is bundled and fixed in classic mode for stable xterm rendering.</p>
</div>

<div className="settings-section__title">
  <strong>Dialog Terminal Font</strong>
  <p>These controls apply only to dialog mode.</p>
</div>

<input
  type="number"
  min={10}
  max={32}
  step={1}
  value={config.terminal.dialogFontSize}
  onChange={(event) =>
    patchTerminalConfig({
      dialogFontSize: Number(event.target.value),
    })
  }
/>

<input
  value={config.terminal.dialogFontFamily}
  onChange={(event) => patchTerminalConfig({ dialogFontFamily: event.target.value })}
/>

/* src/app/styles.css */
.dialog-terminal,
.dialog-terminal__input,
.dialog-terminal__ghost,
.dialog-terminal__candidate,
.command-block__output,
.dialog-terminal__prompt,
.command-block__header,
.command-block__session-label,
.command-block__status {
  font-family: var(--dialog-terminal-font-family);
}

.dialog-terminal__input,
.dialog-terminal__ghost,
.command-block__output,
.dialog-terminal__prompt,
.command-block__header,
.command-block__session-label,
.command-block__status {
  font-size: var(--dialog-terminal-font-size);
}
```

- [ ] **Step 4: Run the font-routing tests to verify they pass**

Run: `npx vitest run src/features/terminal/lib/terminal-fonts.test.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`

Expected: PASS with classic locked to bundled mono and dialog honoring its own settings.

- [ ] **Step 5: Commit the runtime font split**

```bash
git add src/features/terminal/lib/terminal-fonts.ts src/features/terminal/lib/terminal-fonts.test.ts src/features/terminal/components/TerminalPane.tsx src/features/config/components/SettingsPanel.tsx src/app/styles.css
git commit -m "feat: split classic and dialog terminal font routing"
```

## Task 4: Bundle And Preload The Mono Font Before App Mount

**Files:**
- Create: `src/app/bundled-fonts.ts`
- Test: `src/app/bundled-fonts.test.ts`
- Create: `src/assets/fonts/CaskaydiaCoveNerdFontMono-Regular.ttf`
- Create: `src/assets/fonts/CaskaydiaCoveNerdFontMono-Bold.ttf`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the failing bundled-font loader tests**

```ts
import { describe, expect, it, vi } from "vitest";

import { createBundledTerminalFontSources, loadBundledTerminalFonts } from "./bundled-fonts";

describe("bundled terminal fonts", () => {
  it("describes regular and bold bundled faces", () => {
    expect(
      createBundledTerminalFontSources("/fonts/regular.ttf", "/fonts/bold.ttf"),
    ).toEqual([
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
        { fonts: { add } } as Document,
      ),
    ).resolves.toBeUndefined();

    expect(load).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the bundled-font tests to verify they fail**

Run: `npx vitest run src/app/bundled-fonts.test.ts`

Expected: FAIL because `bundled-fonts.ts` does not exist.

- [ ] **Step 3: Add the bundled font manifest, preload helper, assets, and startup hook**

```ts
// src/app/bundled-fonts.ts
import regularMonoUrl from "../assets/fonts/CaskaydiaCoveNerdFontMono-Regular.ttf?url";
import boldMonoUrl from "../assets/fonts/CaskaydiaCoveNerdFontMono-Bold.ttf?url";

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

// src/main.tsx
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { loadBundledTerminalFonts } from "./app/bundled-fonts";
import "./app/styles.css";

async function bootstrap() {
  await loadBundledTerminalFonts();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
}

void bootstrap();
```

- [ ] **Step 4: Run bundled-font tests and a production build**

Run: `npx vitest run src/app/bundled-fonts.test.ts src/features/terminal/lib/terminal-fonts.test.ts`

Expected: PASS for the loader and font-routing tests.

Run: `npm run build`

Expected: PASS with Vite emitting the bundled `.ttf` assets into `dist/assets/` and TypeScript compiling the renamed dialog font fields.

- [ ] **Step 5: Commit the bundled font preload**

```bash
git add src/app/bundled-fonts.ts src/app/bundled-fonts.test.ts src/assets/fonts/CaskaydiaCoveNerdFontMono-Regular.ttf src/assets/fonts/CaskaydiaCoveNerdFontMono-Bold.ttf src/main.tsx
git commit -m "feat: bundle and preload terminal mono font"
```

## Task 5: Run Full Regression Checks And Manual Smoke Verification

**Files:**
- Modify: none
- Test: `src/domain/config/model.test.ts`
- Test: `src/features/config/state/app-config-store.test.ts`
- Test: `src/features/terminal/lib/terminal-fonts.test.ts`
- Test: `src/app/bundled-fonts.test.ts`
- Test: `src-tauri/src/config/mod.rs`

- [ ] **Step 1: Run the focused automated test suite**

Run: `npx vitest run src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts src/features/terminal/lib/terminal-fonts.test.ts src/app/bundled-fonts.test.ts`

Expected: PASS for dialog font defaults, legacy migration, font routing, and bundled loader behavior.

- [ ] **Step 2: Run the Rust config regression tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config::tests`

Expected: PASS for legacy config aliases and dialog-only serialization.

- [ ] **Step 3: Run a full build**

Run: `npm run build`

Expected: PASS with no TypeScript errors and bundled font assets included in the frontend build output.

- [ ] **Step 4: Manual smoke test the shipped behavior**

```text
1. Start the app with `npm run tauri dev`.
2. Open settings and verify the classic font row is descriptive-only.
3. Confirm dialog mode shows `CaskaydiaCove Nerd Font Mono` at first launch.
4. Change dialog font to `JetBrains Mono`; verify dialog text updates and classic text does not.
5. Switch to classic mode and run `vim`, `top`, and `ssh` (or a harmless equivalent command available locally); verify classic still behaves like a real terminal.
6. Restart the app and verify the dialog font persists while classic remains locked to the bundled mono font.
```

- [ ] **Step 5: Confirm the worktree is clean after verification**

Run: `git status --short`

Expected: no output. If this command shows changes, stop and fold those fixes back into the appropriate task above instead of creating an unplanned verification-only commit.
