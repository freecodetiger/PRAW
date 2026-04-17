import type { SettingsPanelLanguage } from "../../../domain/config/settings-panel-language";
import type { TerminalShortcutConfigKey } from "../../../domain/config/terminal-shortcuts";

interface SettingsPanelCopy {
  header: {
    eyebrow: string;
    title: string;
    close: string;
    runtimeSummary: string;
    shell: string;
    mode: string;
    theme: string;
    workspaceFont: string;
    ai: string;
    disabled: string;
    notConfigured: string;
    blockMode: string;
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
    themePreset: string;
    workspaceFontTitle: string;
    workspaceFontDescription: string;
    workspaceFontSize: string;
    workspaceFontFamily: string;
    shortcutsTitle: string;
    shortcutsDescription: string;
    shortcutLabels: Record<TerminalShortcutConfigKey, string>;
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
  speech: {
    sectionTitle: string;
    sectionDescription: string;
    enableProvider: string;
    apiKey: string;
    language: string;
    languageOptions: {
      auto: string;
      zh: string;
      en: string;
    };
    localKeySummary: string;
  };
}

const SETTINGS_PANEL_COPY: Record<SettingsPanelLanguage, SettingsPanelCopy> = {
  en: {
    header: {
      eyebrow: "Workspace Settings",
      title: "Runtime profile",
      close: "Close",
      runtimeSummary: "Shell {shell} · Mode {mode} · Theme {theme} · Workspace Font {workspaceFont} {dialogFontSize}px · AI {aiStatus}",
      shell: "Shell",
      mode: "Mode",
      theme: "Theme",
      workspaceFont: "Workspace Font",
      ai: "AI",
      disabled: "disabled",
      notConfigured: "not configured",
      blockMode: "Blocks",
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
      sectionDescription: "The terminal uses a single block workspace. Interactive commands open a live island when needed.",
      defaultShell: "Default shell",
      defaultCwd: "Default cwd",
      themePreset: "Theme preset",
      workspaceFontTitle: "Workspace Font",
      workspaceFontDescription: "These controls apply to block transcripts, the command composer, and live islands.",
      workspaceFontSize: "Workspace font size",
      workspaceFontFamily: "Workspace font family",
      shortcutsTitle: "Pane Shortcuts",
      shortcutsDescription: "These stay active whenever the app window is focused.",
      shortcutLabels: {
        splitRight: "Split Right",
        splitDown: "Split Down",
        editNote: "Edit Note",
        toggleFocusPane: "Toggle Focus Pane",
        toggleAiVoiceBypass: "Toggle AI Voice Bypass",
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
    speech: {
      sectionTitle: "Speech Input",
      sectionDescription: "Press-and-hold voice input in AI bypass uses an independent Bailian realtime key.",
      enableProvider: "Enable speech input",
      apiKey: "Speech API key",
      language: "Speech language",
      languageOptions: {
        auto: "Auto (Chinese + English)",
        zh: "Chinese",
        en: "English",
      },
      localKeySummary: "This speech key is stored separately from the main AI provider key.",
    },
  },
  "zh-CN": {
    header: {
      eyebrow: "工作区设置",
      title: "运行配置",
      close: "关闭",
      runtimeSummary: "Shell {shell} · 模式 {mode} · 主题 {theme} · Workspace Font {workspaceFont} {dialogFontSize}px · AI {aiStatus}",
      shell: "Shell",
      mode: "模式",
      theme: "主题",
      workspaceFont: "Workspace Font",
      ai: "AI",
      disabled: "已禁用",
      notConfigured: "未配置",
      blockMode: "Blocks",
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
      sectionDescription: "终端统一使用 block workspace；遇到交互式命令时会在当前 block 中打开 live island。",
      defaultShell: "默认 shell",
      defaultCwd: "默认 cwd",
      themePreset: "Theme preset",
      workspaceFontTitle: "Workspace Font",
      workspaceFontDescription: "这些设置会同时作用于 block transcript、命令输入区和 live island。",
      workspaceFontSize: "Workspace 字体大小",
      workspaceFontFamily: "Workspace 字体家族",
      shortcutsTitle: "Pane Shortcuts",
      shortcutsDescription: "这些快捷键会在应用窗口聚焦时始终生效。",
      shortcutLabels: {
        splitRight: "向右分屏",
        splitDown: "向下分屏",
        editNote: "Edit Note",
        toggleFocusPane: "切换聚焦分屏",
        toggleAiVoiceBypass: "切换 AI 语音旁路",
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
    speech: {
      sectionTitle: "Speech Input",
      sectionDescription: "按住 AI 旁路输入里的语音按钮时，会使用独立的百炼实时语音 key。",
      enableProvider: "启用语音输入",
      apiKey: "语音 API key",
      language: "语音语言",
      languageOptions: {
        auto: "自动（中文 + English）",
        zh: "中文",
        en: "English",
      },
      localKeySummary: "这个语音 key 与主 AI provider key 分开存储。",
    },
  },
};

export function getSettingsPanelCopy(language: SettingsPanelLanguage): SettingsPanelCopy {
  return SETTINGS_PANEL_COPY[language];
}
