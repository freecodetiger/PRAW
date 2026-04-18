import { create } from "zustand";

import {
  DEFAULT_APP_CONFIG,
  resolveAppConfig,
  type AppConfigInput,
} from "../../../domain/config/model";
import type { AiConfig, AppConfig, SpeechConfig, TerminalConfig, UiConfig } from "../../../domain/config/types";

interface AppConfigStore {
  config: AppConfig;
  hydrateConfig: (config: AppConfigInput | null | undefined) => void;
  patchTerminalConfig: (config: Partial<TerminalConfig>) => void;
  patchAiConfig: (config: Partial<AiConfig>) => void;
  patchSpeechConfig: (config: Partial<SpeechConfig>) => void;
  patchUiConfig: (config: Partial<UiConfig>) => void;
}

export const useAppConfigStore = create<AppConfigStore>((set) => ({
  config: DEFAULT_APP_CONFIG,

  hydrateConfig: (config) =>
    set(() => ({
      config: resolveAppConfig(config),
    })),

  patchTerminalConfig: (terminal) =>
    set((state) => ({
      config: resolveAppConfig({
        ...state.config,
        terminal: {
          ...state.config.terminal,
          ...terminal,
        },
      }),
    })),

  patchAiConfig: (ai) =>
    set((state) => ({
      config: resolveAppConfig({
        ...state.config,
        ai: {
          ...state.config.ai,
          ...ai,
        },
      }),
    })),

  patchSpeechConfig: (speech) =>
    set((state) => ({
      config: resolveAppConfig({
        ...state.config,
        speech: {
          ...state.config.speech,
          ...speech,
        },
      }),
    })),

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
}));
