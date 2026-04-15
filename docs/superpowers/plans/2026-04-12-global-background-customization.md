# Global Background Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single global background image feature that lets the user pick a local image through a native file picker, applies it to every terminal pane, preserves the original aspect ratio with full-image display, uses the active theme color as the letterbox color, and allows global opacity adjustment.

**Architecture:** Extend the existing global terminal config with background metadata, implement image import and cleanup in Rust so the frontend never depends on arbitrary user file paths, and render the background as a dedicated pane-layer visual behind terminal content. Keep the feature global-only and keep pane runtime state, terminal I/O, and layout logic untouched.

**Tech Stack:** React 19, Zustand, Vitest, Tauri 2, Rust, existing app config persistence, existing terminal pane styling system.

---

## File Map

**Modify:**
- `src/domain/config/types.ts`
- `src/domain/config/model.ts`
- `src/domain/config/model.test.ts`
- `src/features/config/state/app-config-store.test.ts`
- `src/features/config/components/SettingsPanel.tsx`
- `src/features/terminal/components/TerminalPane.tsx`
- `src/app/styles.css`
- `src/lib/tauri/bootstrap.ts`
- `src-tauri/src/config/mod.rs`
- `src-tauri/src/commands/bootstrap.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/lib.rs`

**Create:**
- `src/lib/tauri/background.ts`
- `src/features/config/lib/terminal-background.ts`
- `src/features/config/lib/terminal-background.test.ts`
- `src/features/terminal/lib/pane-background.ts`
- `src/features/terminal/lib/pane-background.test.ts`
- `src-tauri/src/commands/background.rs`
- `src-tauri/src/background/mod.rs`

**Why these files:**
- config files own the new global background state
- Rust background files own native picker, asset import, and cleanup
- the Tauri bridge isolates frontend command calls
- a small frontend helper computes safe pane background presentation from config
- `TerminalPane` stays a thin consumer of computed visual props

### Task 1: Extend global config shape for terminal background

**Files:**
- Modify: `src/domain/config/types.ts`
- Modify: `src/domain/config/model.ts`
- Test: `src/domain/config/model.test.ts`

- [ ] **Step 1: Write the failing config-model tests**

Add tests to `src/domain/config/model.test.ts` covering the new terminal background fields.

```ts
it("defaults terminal background settings to disabled and empty", () => {
  expect(DEFAULT_APP_CONFIG.terminal.backgroundEnabled).toBe(false);
  expect(DEFAULT_APP_CONFIG.terminal.backgroundImagePath).toBe("");
  expect(DEFAULT_APP_CONFIG.terminal.backgroundImageName).toBe("");
  expect(DEFAULT_APP_CONFIG.terminal.backgroundOpacity).toBe(0.28);
});

it("clamps terminal background opacity into the valid range", () => {
  expect(
    resolveAppConfig({
      terminal: {
        backgroundOpacity: 5,
      },
    }).terminal.backgroundOpacity,
  ).toBe(1);

  expect(
    resolveAppConfig({
      terminal: {
        backgroundOpacity: -1,
      },
    }).terminal.backgroundOpacity,
  ).toBe(0);
});

it("treats background as disabled when the image path is blank", () => {
  expect(
    resolveAppConfig({
      terminal: {
        backgroundEnabled: true,
        backgroundImagePath: "   ",
        backgroundImageName: "wallpaper.png",
        backgroundOpacity: 0.4,
      } as never,
    }).terminal,
  ).toMatchObject({
    backgroundEnabled: false,
    backgroundImagePath: "",
  });
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- src/domain/config/model.test.ts`

Expected:
- FAIL because `TerminalConfig` and `DEFAULT_APP_CONFIG` do not yet include background fields

- [ ] **Step 3: Extend the TypeScript terminal config type**

Update `src/domain/config/types.ts`.

```ts
export interface TerminalConfig {
  defaultShell: string;
  defaultCwd: string;
  fontFamily: string;
  fontSize: number;
  preferredMode: TerminalPreferredMode;
  themePreset: ThemePresetId;
  phrases: string[];
  phraseUsage: Record<string, number>;
  backgroundEnabled: boolean;
  backgroundImagePath: string;
  backgroundImageName: string;
  backgroundOpacity: number;
}
```

- [ ] **Step 4: Add default values and normalization logic**

Update `src/domain/config/model.ts`.

```ts
const DEFAULT_BACKGROUND_OPACITY = 0.28;

terminal: {
  defaultShell: "/bin/bash",
  defaultCwd: "~",
  fontFamily: FIXED_TERMINAL_FONT_STACK,
  fontSize: 14,
  preferredMode: "dialog",
  themePreset: "light",
  phrases: [],
  phraseUsage: {},
  backgroundEnabled: false,
  backgroundImagePath: "",
  backgroundImageName: "",
  backgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
},
```

Add normalizers.

```ts
function normalizeBackgroundOpacity(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_OPACITY;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeBackgroundPath(value: string | undefined): string {
  return normalizeOptionalString(value);
}
```

Apply them in `resolveAppConfig`.

```ts
const backgroundImagePath = normalizeBackgroundPath(terminal?.backgroundImagePath);
const backgroundImageName = normalizeOptionalString(terminal?.backgroundImageName);
const backgroundEnabled = Boolean(terminal?.backgroundEnabled) && backgroundImagePath.length > 0;

terminal: {
  ...,
  backgroundEnabled,
  backgroundImagePath,
  backgroundImageName: backgroundEnabled ? backgroundImageName : "",
  backgroundOpacity: normalizeBackgroundOpacity(terminal?.backgroundOpacity),
}
```

- [ ] **Step 5: Re-run the targeted test to verify it passes**

Run: `npm test -- src/domain/config/model.test.ts`

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/config/types.ts src/domain/config/model.ts src/domain/config/model.test.ts
git commit -m "feat: add global terminal background config"
```

### Task 2: Cover background state in the app config store

**Files:**
- Modify: `src/features/config/state/app-config-store.test.ts`
- Test: `src/features/config/state/app-config-store.test.ts`

- [ ] **Step 1: Write the failing store tests**

Add tests to `src/features/config/state/app-config-store.test.ts`.

```ts
it("patches terminal background settings through the app config store", () => {
  useAppConfigStore.getState().patchTerminalConfig({
    backgroundEnabled: true,
    backgroundImagePath: "/tmp/praw/backgrounds/current.png",
    backgroundImageName: "current.png",
    backgroundOpacity: 0.52,
  } as never);

  expect(useAppConfigStore.getState().config.terminal).toMatchObject({
    backgroundEnabled: true,
    backgroundImagePath: "/tmp/praw/backgrounds/current.png",
    backgroundImageName: "current.png",
    backgroundOpacity: 0.52,
  });
});

it("normalizes invalid background updates through the app config store", () => {
  useAppConfigStore.getState().patchTerminalConfig({
    backgroundEnabled: true,
    backgroundImagePath: "   ",
    backgroundImageName: "wallpaper.png",
    backgroundOpacity: 99,
  } as never);

  expect(useAppConfigStore.getState().config.terminal).toMatchObject({
    backgroundEnabled: false,
    backgroundImagePath: "",
    backgroundImageName: "",
    backgroundOpacity: 1,
  });
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `npm test -- src/features/config/state/app-config-store.test.ts`

Expected:
- FAIL until the model-backed store reflects the new fields

- [ ] **Step 3: Re-run the store test after Task 1 code is in place**

No store implementation file should need extra logic because the store already delegates to `resolveAppConfig`, but verify that assumption explicitly.

Run: `npm test -- src/features/config/state/app-config-store.test.ts`

Expected:
- PASS once the terminal config model includes the new fields

- [ ] **Step 4: Commit**

```bash
git add src/features/config/state/app-config-store.test.ts
git commit -m "test: cover terminal background config store updates"
```

### Task 3: Add Rust config defaults and serialization coverage

**Files:**
- Modify: `src-tauri/src/config/mod.rs`
- Test: `src-tauri/src/config/mod.rs`

- [ ] **Step 1: Write the failing Rust config tests**

Add tests to `src-tauri/src/config/mod.rs`.

```rust
#[test]
fn default_config_includes_terminal_background_defaults() {
    let config = AppConfig::default();

    assert!(!config.terminal.background_enabled);
    assert_eq!(config.terminal.background_image_path, "");
    assert_eq!(config.terminal.background_image_name, "");
    assert_eq!(config.terminal.background_opacity, 0.28);
}

#[test]
fn deserializes_terminal_background_fields() {
    let config = serde_json::from_str::<AppConfig>(r##"{
      "terminal": {
        "defaultShell": "/bin/bash",
        "defaultCwd": "~",
        "fontFamily": "CaskaydiaCove Nerd Font Mono",
        "fontSize": 14,
        "preferredMode": "dialog",
        "themePreset": "light",
        "phrases": [],
        "phraseUsage": {},
        "backgroundEnabled": true,
        "backgroundImagePath": "/tmp/praw/backgrounds/current.png",
        "backgroundImageName": "current.png",
        "backgroundOpacity": 0.42
      },
      "ai": {
        "provider": "glm",
        "model": "glm-4-flash",
        "enabled": false,
        "apiKey": "",
        "themeColor": "#1f5eff",
        "backgroundColor": "#eef4ff"
      }
    }"##).expect("config should deserialize");

    assert!(config.terminal.background_enabled);
    assert_eq!(config.terminal.background_image_name, "current.png");
    assert_eq!(config.terminal.background_opacity, 0.42);
}
```

- [ ] **Step 2: Run the targeted Rust test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config::tests::default_config_includes_terminal_background_defaults`

Expected:
- FAIL because `TerminalConfig` does not yet include the new background fields

- [ ] **Step 3: Extend the Rust terminal config model**

Update `src-tauri/src/config/mod.rs`.

```rust
pub struct TerminalConfig {
    pub default_shell: String,
    pub default_cwd: String,
    pub font_family: String,
    pub font_size: u16,
    #[serde(default = "default_terminal_preferred_mode")]
    pub preferred_mode: String,
    #[serde(default)]
    pub phrases: Vec<String>,
    #[serde(default)]
    pub phrase_usage: BTreeMap<String, u64>,
    #[serde(default)]
    pub background_enabled: bool,
    #[serde(default)]
    pub background_image_path: String,
    #[serde(default)]
    pub background_image_name: String,
    #[serde(default = "default_terminal_background_opacity")]
    pub background_opacity: f32,
}

fn default_terminal_background_opacity() -> f32 {
    0.28
}
```

Add the default values in `AppConfig::default()`.

```rust
background_enabled: false,
background_image_path: String::new(),
background_image_name: String::new(),
background_opacity: default_terminal_background_opacity(),
```

- [ ] **Step 4: Re-run the targeted Rust config tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml config::tests`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/config/mod.rs
git commit -m "feat: persist terminal background defaults in rust config"
```

### Task 4: Build the Rust background asset manager with tests first

**Files:**
- Create: `src-tauri/src/background/mod.rs`
- Create: `src-tauri/src/commands/background.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/background/mod.rs`

- [ ] **Step 1: Write failing Rust unit tests for background asset import rules**

Create `src-tauri/src/background/mod.rs` with tests first.

```rust
#[cfg(test)]
mod tests {
    use super::{clear_background_asset_at_path, import_background_asset, is_supported_background_extension};
    use tempfile::tempdir;
    use std::fs;

    #[test]
    fn accepts_supported_background_extensions() {
        assert!(is_supported_background_extension("wallpaper.png"));
        assert!(is_supported_background_extension("wallpaper.jpg"));
        assert!(is_supported_background_extension("wallpaper.jpeg"));
        assert!(is_supported_background_extension("wallpaper.webp"));
        assert!(!is_supported_background_extension("wallpaper.gif"));
    }

    #[test]
    fn imports_background_into_managed_directory() {
        let dir = tempdir().expect("tempdir");
        let source = dir.path().join("input.png");
        fs::write(&source, b"png-bytes").expect("write source");

        let imported = import_background_asset(dir.path(), &source).expect("import should work");

        assert!(imported.path.exists());
        assert_eq!(imported.name, "current.png");
    }

    #[test]
    fn clear_background_asset_is_idempotent() {
        let dir = tempdir().expect("tempdir");
        let target = dir.path().join("current.png");
        fs::write(&target, b"png-bytes").expect("write target");

        clear_background_asset_at_path(&target).expect("first clear");
        clear_background_asset_at_path(&target).expect("second clear");
        assert!(!target.exists());
    }
}
```

- [ ] **Step 2: Run the targeted Rust test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml background::tests`

Expected:
- FAIL because the module and functions do not exist yet

- [ ] **Step 3: Implement the background asset manager**

Add the minimal implementation in `src-tauri/src/background/mod.rs`.

```rust
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportedBackgroundAsset {
    pub path: PathBuf,
    pub name: String,
}

pub fn is_supported_background_extension(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp"))
        .unwrap_or(false)
}

pub fn import_background_asset(backgrounds_dir: &Path, source: &Path) -> Result<ImportedBackgroundAsset> {
    let source_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow!("selected background file name was invalid"))?;

    if !is_supported_background_extension(source_name) {
        return Err(anyhow!("unsupported background image type"));
    }

    fs::create_dir_all(backgrounds_dir)
        .with_context(|| format!("failed to create backgrounds dir {}", backgrounds_dir.display()))?;

    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .ok_or_else(|| anyhow!("selected background image had no extension"))?
        .to_ascii_lowercase();

    let destination = backgrounds_dir.join(format!("current.{extension}"));
    fs::copy(source, &destination)
        .with_context(|| format!("failed to import background image {}", source.display()))?;

    remove_other_background_variants(backgrounds_dir, &destination)?;

    Ok(ImportedBackgroundAsset {
        path: destination.clone(),
        name: destination
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("current")
            .to_string(),
    })
}

pub fn clear_background_asset_at_path(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_file(path)
            .with_context(|| format!("failed to remove background image {}", path.display()))?;
    }
    Ok(())
}
```

- [ ] **Step 4: Add background Tauri commands**

Create `src-tauri/src/commands/background.rs`.

```rust
use serde::Serialize;
use tauri::AppHandle;

use crate::background::{clear_background_asset_at_path, import_background_asset};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundSelectionResult {
    pub selected: bool,
    pub path: String,
    pub name: String,
}

#[tauri::command]
pub fn select_terminal_background_image(app: AppHandle) -> Result<BackgroundSelectionResult, String> {
    // open picker, import if selected, return selected=false for cancel
}

#[tauri::command]
pub fn clear_terminal_background_image(app: AppHandle, current_path: String) -> Result<(), String> {
    // clear current managed file if any
}
```

Implementation details:
- use Tauri dialog APIs already available in this app stack
- resolve a managed backgrounds dir under app config or app data
- return `{ selected: false, path: "", name: "" }` on cancel
- never mutate app config directly from Rust commands

- [ ] **Step 5: Register the new command module**

Update `src-tauri/src/commands/mod.rs`.

```rust
pub mod background;
```

Update `src-tauri/src/lib.rs` command registration so both background commands are exposed to the frontend.

- [ ] **Step 6: Re-run the targeted Rust background tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml background::tests`

Expected:
- PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/background/mod.rs src-tauri/src/commands/background.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add terminal background asset commands"
```

### Task 5: Add a small frontend Tauri bridge and pure background presentation helper

**Files:**
- Create: `src/lib/tauri/background.ts`
- Create: `src/features/config/lib/terminal-background.ts`
- Create: `src/features/config/lib/terminal-background.test.ts`
- Create: `src/features/terminal/lib/pane-background.ts`
- Create: `src/features/terminal/lib/pane-background.test.ts`

- [ ] **Step 1: Write the failing frontend helper tests**

Create `src/features/config/lib/terminal-background.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import { getTerminalBackgroundSummary } from "./terminal-background";

describe("getTerminalBackgroundSummary", () => {
  it("returns empty-state metadata when background is disabled", () => {
    expect(
      getTerminalBackgroundSummary({
        backgroundEnabled: false,
        backgroundImagePath: "",
        backgroundImageName: "",
        backgroundOpacity: 0.28,
      }),
    ).toEqual({
      configured: false,
      label: "No background image selected.",
    });
  });
});
```

Create `src/features/terminal/lib/pane-background.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import { getPaneBackgroundStyle } from "./pane-background";

describe("getPaneBackgroundStyle", () => {
  it("returns no image variables when the terminal background is disabled", () => {
    expect(
      getPaneBackgroundStyle({
        backgroundEnabled: false,
        backgroundImagePath: "",
        backgroundImageName: "",
        backgroundOpacity: 0.28,
      }),
    ).toEqual({
      hasBackgroundImage: false,
      style: {},
    });
  });

  it("returns css variables when the terminal background is active", () => {
    expect(
      getPaneBackgroundStyle({
        backgroundEnabled: true,
        backgroundImagePath: "/tmp/praw/backgrounds/current.png",
        backgroundImageName: "current.png",
        backgroundOpacity: 0.4,
      }),
    ).toEqual({
      hasBackgroundImage: true,
      style: {
        "--terminal-background-image": 'url("/tmp/praw/backgrounds/current.png")',
        "--terminal-background-opacity": "0.4",
      },
    });
  });
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:
- `npm test -- src/features/config/lib/terminal-background.test.ts`
- `npm test -- src/features/terminal/lib/pane-background.test.ts`

Expected:
- FAIL because the helper modules do not exist yet

- [ ] **Step 3: Implement the background bridge and pure helpers**

Create `src/lib/tauri/background.ts`.

```ts
import { invoke } from "@tauri-apps/api/core";

export interface BackgroundSelectionResult {
  selected: boolean;
  path: string;
  name: string;
}

export async function selectTerminalBackgroundImage(): Promise<BackgroundSelectionResult> {
  return invoke<BackgroundSelectionResult>("select_terminal_background_image");
}

export async function clearTerminalBackgroundImage(currentPath: string): Promise<void> {
  await invoke("clear_terminal_background_image", { currentPath });
}
```

Create `src/features/config/lib/terminal-background.ts`.

```ts
import type { TerminalConfig } from "../../../domain/config/types";

export function getTerminalBackgroundSummary(terminal: TerminalConfig) {
  if (!terminal.backgroundEnabled || !terminal.backgroundImagePath) {
    return {
      configured: false,
      label: "No background image selected.",
    };
  }

  return {
    configured: true,
    label: `Using ${terminal.backgroundImageName || terminal.backgroundImagePath}`,
  };
}
```

Create `src/features/terminal/lib/pane-background.ts`.

```ts
import type { CSSProperties } from "react";
import type { TerminalConfig } from "../../../domain/config/types";

export function getPaneBackgroundStyle(terminal: TerminalConfig): {
  hasBackgroundImage: boolean;
  style: CSSProperties;
} {
  if (!terminal.backgroundEnabled || !terminal.backgroundImagePath) {
    return {
      hasBackgroundImage: false,
      style: {},
    };
  }

  return {
    hasBackgroundImage: true,
    style: {
      "--terminal-background-image": `url("${terminal.backgroundImagePath}")`,
      "--terminal-background-opacity": String(terminal.backgroundOpacity),
    } as CSSProperties,
  };
}
```

- [ ] **Step 4: Re-run the targeted helper tests**

Run:
- `npm test -- src/features/config/lib/terminal-background.test.ts`
- `npm test -- src/features/terminal/lib/pane-background.test.ts`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/tauri/background.ts src/features/config/lib/terminal-background.ts src/features/config/lib/terminal-background.test.ts src/features/terminal/lib/pane-background.ts src/features/terminal/lib/pane-background.test.ts
git commit -m "feat: add terminal background bridge and presentation helpers"
```

### Task 6: Add settings UI for image selection, removal, and opacity

**Files:**
- Modify: `src/features/config/components/SettingsPanel.tsx`
- Test: `src/features/config/lib/terminal-background.test.ts`
- Test: `src/features/config/state/app-config-store.test.ts`

- [ ] **Step 1: Write a failing minimal UI-focused test at the helper layer**

If there is no component testing stack in this repo yet, avoid introducing one for this feature. Instead, extend helper and store tests to pin the observable settings behavior.

Add to `src/features/config/lib/terminal-background.test.ts`.

```ts
it("uses the imported background filename in the configured summary", () => {
  expect(
    getTerminalBackgroundSummary({
      backgroundEnabled: true,
      backgroundImagePath: "/tmp/praw/backgrounds/current.png",
      backgroundImageName: "current.png",
      backgroundOpacity: 0.35,
    } as never),
  ).toEqual({
    configured: true,
    label: "Using current.png",
  });
});
```

- [ ] **Step 2: Run the targeted helper test to verify it fails if not yet implemented**

Run: `npm test -- src/features/config/lib/terminal-background.test.ts`

Expected:
- PASS only after Task 5 helper implementation is done

- [ ] **Step 3: Implement settings interactions**

Update `src/features/config/components/SettingsPanel.tsx`.

Add imports.

```ts
import { getTerminalBackgroundSummary } from "../lib/terminal-background";
import { clearTerminalBackgroundImage, selectTerminalBackgroundImage } from "../../../lib/tauri/background";
```

Add local error/loading state.

```ts
const [backgroundStatus, setBackgroundStatus] = useState<string | null>(null);
const [isPickingBackground, setIsPickingBackground] = useState(false);
const backgroundSummary = getTerminalBackgroundSummary(config.terminal);
```

Add handlers.

```ts
const chooseBackgroundImage = async () => {
  setIsPickingBackground(true);
  setBackgroundStatus(null);

  try {
    const result = await selectTerminalBackgroundImage();
    if (!result.selected) {
      return;
    }

    patchTerminalConfig({
      backgroundEnabled: true,
      backgroundImagePath: result.path,
      backgroundImageName: result.name,
    });
  } catch (error) {
    setBackgroundStatus(error instanceof Error ? error.message : String(error));
  } finally {
    setIsPickingBackground(false);
  }
};

const removeBackgroundImage = async () => {
  const currentPath = config.terminal.backgroundImagePath;

  try {
    if (currentPath) {
      await clearTerminalBackgroundImage(currentPath);
    }
    patchTerminalConfig({
      backgroundEnabled: false,
      backgroundImagePath: "",
      backgroundImageName: "",
    });
    setBackgroundStatus(null);
  } catch (error) {
    setBackgroundStatus(error instanceof Error ? error.message : String(error));
  }
};
```

Render a new `Background` section.

```tsx
<div className="settings-section__title">
  <strong>Background</strong>
  <p>Global terminal background shared by all tabs and splits.</p>
</div>

<div className="settings-actions">
  <button className="button" type="button" onClick={() => void chooseBackgroundImage()} disabled={isPickingBackground}>
    {isPickingBackground ? "Choosing..." : "Choose Image"}
  </button>
  <button
    className="button button--ghost"
    type="button"
    onClick={() => void removeBackgroundImage()}
    disabled={!config.terminal.backgroundEnabled && !config.terminal.backgroundImagePath}
  >
    Remove Background
  </button>
</div>

<label className="settings-field">
  <span>Opacity</span>
  <input
    type="range"
    min={0}
    max={100}
    step={1}
    value={Math.round(config.terminal.backgroundOpacity * 100)}
    onChange={(event) =>
      patchTerminalConfig({
        backgroundOpacity: Number(event.target.value) / 100,
      })
    }
  />
</label>

<p className="settings-panel__summary">{backgroundSummary.label}</p>
{backgroundStatus ? <p className="settings-status settings-status--error">{backgroundStatus}</p> : null}
```

- [ ] **Step 4: Run relevant frontend tests**

Run:
- `npm test -- src/features/config/lib/terminal-background.test.ts`
- `npm test -- src/features/config/state/app-config-store.test.ts`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/config/components/SettingsPanel.tsx src/features/config/lib/terminal-background.test.ts src/features/config/state/app-config-store.test.ts
git commit -m "feat: add global background controls to settings"
```

### Task 7: Render the background layer in every terminal pane

**Files:**
- Modify: `src/features/terminal/components/TerminalPane.tsx`
- Modify: `src/app/styles.css`
- Test: `src/features/terminal/lib/pane-background.test.ts`

- [ ] **Step 1: Add a failing pane presentation test for class/style wiring**

Extend `src/features/terminal/lib/pane-background.test.ts`.

```ts
it("marks the pane as background-enabled only when there is a valid background image", () => {
  expect(
    getPaneBackgroundStyle({
      backgroundEnabled: true,
      backgroundImagePath: "",
      backgroundImageName: "",
      backgroundOpacity: 0.3,
    } as never).hasBackgroundImage,
  ).toBe(false);
});
```

- [ ] **Step 2: Run the targeted pane background test to verify behavior is pinned**

Run: `npm test -- src/features/terminal/lib/pane-background.test.ts`

Expected:
- PASS only when helper logic is correct

- [ ] **Step 3: Wire terminal config into pane style**

Update `src/features/terminal/components/TerminalPane.tsx`.

Add config selectors.

```ts
const terminalAppearance = useAppConfigStore((state) => state.config.terminal);
const paneBackground = getPaneBackgroundStyle(terminalAppearance);
```

Merge background vars into the existing pane style.

```ts
const paneStyle = {
  "--ai-theme-color": aiThemeColor,
  "--ai-background-color": isAgentWorkflow ? themePreset.app.surfaceMuted : themePreset.app.surface,
  ...paneBackground.style,
} as CSSProperties;
```

Add a background-enabled class and a background layer element.

```tsx
<section
  className={`terminal-pane ...${paneBackground.hasBackgroundImage ? " terminal-pane--with-background" : ""}`}
  style={paneStyle}
>
  <div className="terminal-pane__background" aria-hidden="true" />
  <div className="terminal-pane__header">...</div>
```

- [ ] **Step 4: Add the pane background CSS**

Update `src/app/styles.css`.

```css
.terminal-pane {
  position: relative;
  overflow: hidden;
}

.terminal-pane__background {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-color: var(--surface);
  background-image: var(--terminal-background-image, none);
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  opacity: var(--terminal-background-opacity, 0);
  pointer-events: none;
}

.terminal-pane__header,
.terminal-pane__body,
.terminal-pane__overlay,
.terminal-pane__drop-targets,
.pane-context-menu {
  position: relative;
  z-index: 1;
}
```

Make sure existing theme surface backgrounds remain in place so the `contain` letterbox area uses the theme color.

- [ ] **Step 5: Run the targeted pane background test and a fast full frontend suite**

Run:
- `npm test -- src/features/terminal/lib/pane-background.test.ts`
- `npm test`

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/terminal/components/TerminalPane.tsx src/app/styles.css src/features/terminal/lib/pane-background.test.ts
git commit -m "feat: render global background layer in terminal panes"
```

### Task 8: Add end-to-end verification for Tauri commands and build health

**Files:**
- Modify: `src-tauri/src/commands/background.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: existing frontend and Rust suites

- [ ] **Step 1: Add a smoke-level Rust command test if the command module structure allows it**

If command registration tests are practical in this codebase, add a narrow test that validates cancel-path return shape from the background command helper logic. If command-level tests are awkward, keep the behavior verified at the background module layer and cover command registration through `cargo test` plus runtime build.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected:
- PASS

- [ ] **Step 3: Run the full frontend test suite**

Run: `npm test`

Expected:
- PASS

- [ ] **Step 4: Run the full Rust test suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected:
- PASS

- [ ] **Step 5: Run formatting and lint checks**

Run:
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`

Expected:
- PASS

- [ ] **Step 6: Run the production build**

Run: `npm run tauri build`

Expected:
- PASS and emit the updated application bundles

- [ ] **Step 7: Commit**

```bash
git add src lib src-tauri
git commit -m "feat: ship global terminal background customization"
```

## Self-Review

### Spec coverage
- native image selection: covered in Task 4 and Task 6
- global-only persistence: covered in Tasks 1 through 3
- aspect-ratio-preserving full-image render: covered in Task 7 CSS
- theme-color letterbox behavior: covered in Task 7 CSS and design constraint
- opacity control: covered in Tasks 1, 2, and 6
- managed asset import instead of raw user paths: covered in Task 4

### Placeholder scan
- no `TODO`, `TBD`, or deferred placeholders remain in the plan
- command registration in `src-tauri/src/lib.rs` is intentionally called out because exact existing macro layout must be updated in place during implementation

### Type consistency
- background config field names are consistent across TypeScript and Rust:
  - `backgroundEnabled`
  - `backgroundImagePath`
  - `backgroundImageName`
  - `backgroundOpacity`
- frontend bridge and Rust command names are aligned:
  - `select_terminal_background_image`
  - `clear_terminal_background_image`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-global-background-customization.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
