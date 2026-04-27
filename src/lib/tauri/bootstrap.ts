import { invoke } from "@tauri-apps/api/core";

import type { AppConfig } from "../../domain/config/types";
import type { WindowSnapshot } from "../../domain/window/snapshot";
import type { WorkspaceCollectionSnapshot } from "../../domain/workspaces/snapshot";

export interface AppBootstrapState {
  config: AppConfig;
  workspaceCollectionSnapshot: unknown | null;
  windowSnapshot: unknown | null;
}

export async function loadAppBootstrapState(): Promise<AppBootstrapState> {
  return invoke<AppBootstrapState>("load_app_bootstrap_state");
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  await invoke("save_app_config", { config });
}

export async function saveWindowSnapshot(snapshot: WindowSnapshot): Promise<void> {
  await invoke("save_window_snapshot", { snapshot });
}

export async function saveWorkspaceCollectionSnapshot(snapshot: WorkspaceCollectionSnapshot): Promise<void> {
  await invoke("save_workspace_collection_snapshot", { snapshot });
}
