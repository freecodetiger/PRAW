# Settings Panel Bilingual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an English/Chinese language toggle inside the `Settings` panel, default it to English, and limit the language change strictly to settings-panel copy.

**Architecture:** Extend app config with a small UI-scoped language preference, normalize and persist it through the existing config store, and refactor `SettingsPanel` to render from a local bilingual copy dictionary. Keep the scope strictly local: only settings-panel text changes, while terminal panes, menus, pane headers, and workflow surfaces remain untouched.

**Tech Stack:** React 19, Zustand, TypeScript, Vitest

---

## File Structure

**Create**

- `src/domain/config/settings-panel-language.ts`
  - Defines supported settings-panel languages, defaults, and normalization helpers.
- `src/domain/config/settings-panel-language.test.ts`
  - Covers valid/invalid language normalization.
- `src/features/config/lib/settings-panel-copy.ts`
  - Bilingual copy dictionary and helper to retrieve localized settings-panel strings.
- `src/features/config/lib/settings-panel-copy.test.ts`
  - Ensures required copy exists for both languages.

**Modify**

- `src/domain/config/types.ts`
  - Add UI-scoped settings-panel language config.
- `src/domain/config/model.ts`
  - Add default value and normalization for settings-panel language.
- `src/domain/config/model.test.ts`
  - Verify default language, valid overrides, and invalid fallback behavior.
- `src/features/config/state/app-config-store.test.ts`
  - Verify language patches flow through config normalization.
- `src/features/config/components/SettingsPanel.tsx`
  - Replace inline strings with localized copy and add the in-panel language selector.
- `src/app/styles.css`
  - Add small styling for the language setting row only if needed.

## Task 1: Add Settings-Panel Language Config

**Files:**
- Create: `src/domain/config/settings-panel-language.ts`
- Test: `src/domain/config/settings-panel-language.test.ts`
- Modify: `src/domain/config/types.ts`
- Modify: `src/domain/config/model.ts`
- Modify: `src/domain/config/model.test.ts`
- Modify: `src/features/config/state/app-config-store.test.ts`

- [ ] **Step 1: Write the failing normalization tests**

```ts
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS_PANEL_LANGUAGE,
  normalizeSettingsPanelLanguage,
} from "./settings-panel-language";

describe("settings panel language", () => {
  it("defaults to english", () => {
    expect(DEFAULT_SETTINGS_PANEL_LANGUAGE).toBe("en");
  });

  it("accepts zh-CN", () => {
    expect(normalizeSettingsPanelLanguage("zh-CN")).toBe("zh-CN");
  });

  it("falls back to english for invalid values", () => {
    expect(normalizeSettingsPanelLanguage("fr")).toBe("en");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/domain/config/settings-panel-language.test.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`  
Expected: FAIL because the language module and config fields do not exist yet

- [ ] **Step 3: Add the language model and defaults**

```ts
export type SettingsPanelLanguage = "en" | "zh-CN";

export const DEFAULT_SETTINGS_PANEL_LANGUAGE: SettingsPanelLanguage = "en";

export function normalizeSettingsPanelLanguage(value: unknown): SettingsPanelLanguage {
  return value === "zh-CN" ? "zh-CN" : "en";
}
```

- [ ] **Step 4: Extend app config types and normalization**

```ts
export interface UiConfig {
  settingsPanelLanguage: SettingsPanelLanguage;
}

export interface AppConfig {
  terminal: TerminalConfig;
  ai: AiConfig;
  ui: UiConfig;
}
```

```ts
export const DEFAULT_APP_CONFIG: AppConfig = {
  terminal: { ... },
  ai: { ... },
  ui: {
    settingsPanelLanguage: DEFAULT_SETTINGS_PANEL_LANGUAGE,
  },
};
```

```ts
return {
  terminal: { ... },
  ai: { ... },
  ui: {
    settingsPanelLanguage: normalizeSettingsPanelLanguage(input?.ui?.settingsPanelLanguage),
  },
};
```

- [ ] **Step 5: Verify the tests pass**

Run: `npm test -- src/domain/config/settings-panel-language.test.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain/config/settings-panel-language.ts \
  src/domain/config/settings-panel-language.test.ts \
  src/domain/config/types.ts \
  src/domain/config/model.ts \
  src/domain/config/model.test.ts \
  src/features/config/state/app-config-store.test.ts
git commit -m "feat: add settings panel language config"
```

## Task 2: Extract Bilingual Settings Copy

**Files:**
- Create: `src/features/config/lib/settings-panel-copy.ts`
- Test: `src/features/config/lib/settings-panel-copy.test.ts`

- [ ] **Step 1: Write the failing copy-dictionary tests**

```ts
import { describe, expect, it } from "vitest";

import { getSettingsPanelCopy } from "./settings-panel-copy";

describe("settings panel copy", () => {
  it("returns english copy for en", () => {
    expect(getSettingsPanelCopy("en").header.title).toBe("Runtime profile");
  });

  it("returns chinese copy for zh-CN while preserving product nouns", () => {
    expect(getSettingsPanelCopy("zh-CN").header.title).toBe("运行配置");
    expect(getSettingsPanelCopy("zh-CN").terminal.sectionTitle).toBe("Terminal");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/config/lib/settings-panel-copy.test.ts`  
Expected: FAIL because the bilingual copy module does not exist yet

- [ ] **Step 3: Implement localized copy helpers**

```ts
export function getSettingsPanelCopy(language: SettingsPanelLanguage) {
  return SETTINGS_PANEL_COPY[language];
}

const SETTINGS_PANEL_COPY = {
  en: {
    header: {
      eyebrow: "Workspace Settings",
      title: "Runtime profile",
      close: "Close",
    },
    panelLanguage: {
      label: "Panel Language",
      description: "Only changes the language inside Settings.",
      options: {
        en: "English",
        "zh-CN": "中文",
      },
    },
    terminal: {
      sectionTitle: "Terminal",
      defaultShell: "Default shell",
      defaultCwd: "Default cwd",
    },
  },
  "zh-CN": {
    header: {
      eyebrow: "工作区设置",
      title: "运行配置",
      close: "关闭",
    },
    panelLanguage: {
      label: "Panel Language",
      description: "只改变 Settings 内部的语言。",
      options: {
        en: "English",
        "zh-CN": "中文",
      },
    },
    terminal: {
      sectionTitle: "Terminal",
      defaultShell: "默认 shell",
      defaultCwd: "默认 cwd",
    },
  },
} as const;
```

- [ ] **Step 4: Verify the tests pass**

Run: `npm test -- src/features/config/lib/settings-panel-copy.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/config/lib/settings-panel-copy.ts \
  src/features/config/lib/settings-panel-copy.test.ts
git commit -m "feat: add bilingual settings panel copy"
```

## Task 3: Localize SettingsPanel And Add In-Panel Language Switch

**Files:**
- Modify: `src/features/config/components/SettingsPanel.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write the failing config-store test for UI language patching**

```ts
it("patches ui settings without disturbing terminal and ai config", () => {
  useAppConfigStore.getState().hydrateConfig({
    ui: {
      settingsPanelLanguage: "zh-CN",
    },
  });

  expect(useAppConfigStore.getState().config.ui.settingsPanelLanguage).toBe("zh-CN");
  expect(useAppConfigStore.getState().config.terminal).toEqual(DEFAULT_APP_CONFIG.terminal);
  expect(useAppConfigStore.getState().config.ai).toEqual(DEFAULT_APP_CONFIG.ai);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/config/state/app-config-store.test.ts`  
Expected: FAIL because the config store cannot patch `ui` settings yet

- [ ] **Step 3: Extend the config store for UI patches**

```ts
interface AppConfigStore {
  config: AppConfig;
  hydrateConfig: (config: AppConfigInput | null | undefined) => void;
  patchTerminalConfig: (config: Partial<TerminalConfig>) => void;
  patchAiConfig: (config: Partial<AiConfig>) => void;
  patchUiConfig: (config: Partial<UiConfig>) => void;
}
```

```ts
patchUiConfig: (ui) =>
  set((state) => ({
    config: resolveAppConfig({
      ...state.config,
      ui: {
        ...state.config.ui,
        ...ui,
      },
    }),
  })),
```

- [ ] **Step 4: Localize `SettingsPanel` with the bilingual dictionary**

```tsx
const panelLanguage = useAppConfigStore((state) => state.config.ui.settingsPanelLanguage);
const patchUiConfig = useAppConfigStore((state) => state.patchUiConfig);
const copy = getSettingsPanelCopy(panelLanguage);

<label className="settings-field">
  <span>{copy.panelLanguage.label}</span>
  <select
    value={panelLanguage}
    onChange={(event) =>
      patchUiConfig({
        settingsPanelLanguage: event.target.value as SettingsPanelLanguage,
      })
    }
  >
    <option value="en">{copy.panelLanguage.options.en}</option>
    <option value="zh-CN">{copy.panelLanguage.options["zh-CN"]}</option>
  </select>
</label>
<p className="settings-panel__summary">{copy.panelLanguage.description}</p>
```

- [ ] **Step 5: Replace inline strings with localized copy while preserving product nouns**

```tsx
<p className="eyebrow">{copy.header.eyebrow}</p>
<strong>{copy.header.title}</strong>
<button className="button button--ghost" type="button" onClick={() => setIsOpen(false)}>
  {copy.header.close}
</button>
```

Use the same pattern throughout `SettingsPanel.tsx`, but keep product nouns in English:
- `Settings`
- `Terminal`
- `Dialog`
- `Classic`
- `Theme preset`
- `AI`
- provider/model names

- [ ] **Step 6: Add minimal styles only if the new language row needs spacing**

```css
.settings-panel__language {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

- [ ] **Step 7: Verify targeted tests and then full project verification**

Run: `npm test -- src/domain/config/settings-panel-language.test.ts src/features/config/lib/settings-panel-copy.test.ts src/domain/config/model.test.ts src/features/config/state/app-config-store.test.ts`  
Expected: PASS

Run: `npm test`  
Expected: PASS

Run: `npm run typecheck`  
Expected: PASS

Run: `npm run build`  
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/config/components/SettingsPanel.tsx \
  src/features/config/state/app-config-store.ts \
  src/features/config/state/app-config-store.test.ts \
  src/features/config/lib/settings-panel-copy.ts \
  src/features/config/lib/settings-panel-copy.test.ts \
  src/domain/config/settings-panel-language.ts \
  src/domain/config/settings-panel-language.test.ts \
  src/domain/config/types.ts \
  src/domain/config/model.ts \
  src/domain/config/model.test.ts \
  src/app/styles.css
git commit -m "feat: add bilingual settings panel copy"
```

## Self-Review

Spec coverage check:

- Language switch lives inside `Settings`: covered in Task 3.
- Default language is English: covered in Task 1.
- Scope is only settings-panel internal copy: covered in Task 2 and Task 3.
- Product nouns remain English: explicitly constrained in Task 3.
- Persistence through config: covered in Task 1 and Task 3.

Placeholder scan:

- No `TODO`, `TBD`, or omitted implementation placeholders remain.
- Every task includes exact files, explicit test commands, and concrete code shapes.

Type consistency:

- Language type is consistently `SettingsPanelLanguage`.
- Config path is consistently `ui.settingsPanelLanguage`.
- Copy lookup is consistently `getSettingsPanelCopy(language)`.
