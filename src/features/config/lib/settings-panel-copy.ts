import type { SettingsPanelLanguage } from "../../../domain/config/settings-panel-language";

interface SettingsPanelCopy {
  header: {
    eyebrow: string;
    title: string;
    close: string;
    runtimeSummary: string;
    shell: string;
    mode: string;
    theme: string;
    classicFont: string;
    dialogFont: string;
    ai: string;
    disabled: string;
    notConfigured: string;
    classicMode: string;
    dialogMode: string;
  };
  panelLanguage: {
    label: string;
    description: string;
    options: {
      en: string;
      "zh-CN": string;
    };
  };
  terminal: {
    sectionTitle: string;
    sectionDescription: string;
    defaultShell: string;
    defaultCwd: string;
    preferClassic: string;
    themePreset: string;
    classicFontTitle: string;
    classicFontDescription: string;
    dialogFontTitle: string;
    dialogFontDescription: string;
    dialogFontSize: string;
    dialogFontFamily: string;
    shortcutsTitle: string;
    shortcutsDescription: string;
    shortcutLabels: {
      splitRight: string;
      splitDown: string;
      editNote: string;
    };
    shortcutConflictWith: (label: string) => string;
    recorder: {
      pressKeys: string;
      reset: string;
      clear: string;
      invalidCombination: string;
    };
  };
  phrases: {
    title: string;
    description: string;
    import: string;
    clear: string;
    importedCount: (count: number) => string;
    importEmpty: string;
    importFailed: string;
  };
  ai: {
    sectionTitle: string;
    sectionDescription: string;
    enableProvider: string;
    smartSuggestionBubble: string;
    smartSuggestionBubbleDescription: string;
    provider: string;
    model: string;
    providerPlaceholder: string;
    modelPlaceholder: string;
    modelPlaceholderDisabled: string;
    apiKey: string;
    baseUrl: string;
    testConnection: string;
    testingConnection: string;
    localKeySummary: string;
    appearanceTitle: string;
    appearanceDescription: string;
    themeColor: string;
  };
}

const SETTINGS_PANEL_COPY: Record<SettingsPanelLanguage, SettingsPanelCopy> = {
  en: {
    header: {
      eyebrow: "Workspace Settings",
      title: "Runtime profile",
      close: "Close",
      runtimeSummary: "Shell {shell} · Mode {mode} · Theme {theme} · Classic Font {classicFont} · Dialog Font {dialogFont} {dialogFontSize}px · AI {aiStatus}",
      shell: "Shell",
      mode: "Mode",
      theme: "Theme",
      classicFont: "Classic Font",
      dialogFont: "Dialog Font",
      ai: "AI",
      disabled: "disabled",
      notConfigured: "not configured",
      classicMode: "Classic",
      dialogMode: "Dialog",
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
      sectionDescription: "Classic keeps a bundled fixed-width font for stability. Dialog mode remains configurable.",
      defaultShell: "Default shell",
      defaultCwd: "Default cwd",
      preferClassic: "Prefer classic terminal mode",
      themePreset: "Theme preset",
      classicFontTitle: "Classic Terminal Font",
      classicFontDescription: "CaskaydiaCove Nerd Font Mono is bundled and fixed in classic mode for stable xterm rendering.",
      dialogFontTitle: "Dialog Terminal Font",
      dialogFontDescription: "These controls apply only to dialog mode.",
      dialogFontSize: "Dialog font size",
      dialogFontFamily: "Dialog font family",
      shortcutsTitle: "Pane Shortcuts",
      shortcutsDescription: "These stay active whenever the app window is focused.",
      shortcutLabels: {
        splitRight: "Split Right",
        splitDown: "Split Down",
        editNote: "Edit Note",
      },
      shortcutConflictWith: (label) => `Conflicts with ${label}.`,
      recorder: {
        pressKeys: "Press keys…",
        reset: "Reset",
        clear: "Clear",
        invalidCombination: "Use a real key combination.",
      },
    },
    phrases: {
      title: "Common Phrases",
      description: "Import a text file with one phrase per line. Import replaces the current phrase list.",
      import: "Import Phrase File",
      clear: "Clear Phrases",
      importedCount: (count) => `${count} phrases imported`,
      importEmpty: "No valid phrases were found in the selected file.",
      importFailed: "Failed to read the selected phrase file.",
    },
    ai: {
      sectionTitle: "AI",
      sectionDescription: "Ghost completion uses the current tab input, cwd, shell, recent commands, and local directory summary.",
      enableProvider: "Enable assistant provider",
      smartSuggestionBubble: "Smart suggestion bubble",
      smartSuggestionBubbleDescription: "Auto-open the candidate bubble only when at least 3 suggestions are available. Tab can always open it manually.",
      provider: "Provider",
      model: "Model",
      providerPlaceholder: "Select provider",
      modelPlaceholder: "Enter official model name",
      modelPlaceholderDisabled: "Select provider first",
      apiKey: "API key",
      baseUrl: "Base URL",
      testConnection: "Test AI Connection",
      testingConnection: "Testing...",
      localKeySummary: "This key is currently stored in the local app config file.",
      appearanceTitle: "AI Appearance",
      appearanceDescription: "AI workflow panes follow the active theme. Accent color remains configurable.",
      themeColor: "Theme color",
    },
  },
  "zh-CN": {
    header: {
      eyebrow: "工作区设置",
      title: "运行配置",
      close: "关闭",
      runtimeSummary: "Shell {shell} · 模式 {mode} · 主题 {theme} · Classic Font {classicFont} · Dialog Font {dialogFont} {dialogFontSize}px · AI {aiStatus}",
      shell: "Shell",
      mode: "模式",
      theme: "主题",
      classicFont: "Classic Font",
      dialogFont: "Dialog Font",
      ai: "AI",
      disabled: "已禁用",
      notConfigured: "未配置",
      classicMode: "Classic",
      dialogMode: "Dialog",
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
      sectionDescription: "Classic 使用内置等宽字体以保证稳定性。Dialog 模式仍可自定义。",
      defaultShell: "默认 shell",
      defaultCwd: "默认 cwd",
      preferClassic: "优先使用 classic terminal 模式",
      themePreset: "Theme preset",
      classicFontTitle: "Classic Terminal Font",
      classicFontDescription: "Classic 模式固定使用内置的 CaskaydiaCove Nerd Font Mono，以保证 xterm 渲染稳定。",
      dialogFontTitle: "Dialog Terminal Font",
      dialogFontDescription: "这些设置只作用于 Dialog 模式。",
      dialogFontSize: "Dialog 字体大小",
      dialogFontFamily: "Dialog 字体家族",
      shortcutsTitle: "Pane Shortcuts",
      shortcutsDescription: "这些快捷键会在应用窗口聚焦时始终生效。",
      shortcutLabels: {
        splitRight: "向右分屏",
        splitDown: "向下分屏",
        editNote: "Edit Note",
      },
      shortcutConflictWith: (label) => `与 ${label} 冲突。`,
      recorder: {
        pressKeys: "按下快捷键…",
        reset: "重置",
        clear: "清除",
        invalidCombination: "请使用有效的组合键。",
      },
    },
    phrases: {
      title: "常用短语",
      description: "导入一个纯文本文件，每行一条短语。重新导入会覆盖当前短语列表。",
      import: "导入短语文件",
      clear: "清空短语",
      importedCount: (count) => `已导入 ${count} 条短语`,
      importEmpty: "所选文件中没有有效短语。",
      importFailed: "读取所选短语文件失败。",
    },
    ai: {
      sectionTitle: "AI",
      sectionDescription: "Ghost completion 会使用当前 tab 的输入、cwd、shell、最近命令和本地目录摘要。",
      enableProvider: "启用 assistant provider",
      smartSuggestionBubble: "智能弹出气泡",
      smartSuggestionBubbleDescription: "只有在候选数量至少为 3 时才自动展开候选气泡。任何时候都可以按 Tab 手动查看。",
      provider: "Provider",
      model: "Model",
      providerPlaceholder: "选择 provider",
      modelPlaceholder: "输入官方 model 名称",
      modelPlaceholderDisabled: "请先选择 provider",
      apiKey: "API key",
      baseUrl: "Base URL",
      testConnection: "测试 AI Connection",
      testingConnection: "测试中...",
      localKeySummary: "这个 key 当前保存在本地 app config 文件中。",
      appearanceTitle: "AI Appearance",
      appearanceDescription: "AI workflow pane 会跟随当前主题，accent color 仍可单独配置。",
      themeColor: "Theme color",
    },
  },
};

export function getSettingsPanelCopy(language: SettingsPanelLanguage): SettingsPanelCopy {
  return SETTINGS_PANEL_COPY[language];
}
