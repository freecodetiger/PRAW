#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum LayoutNode {
    Split {
        id: String,
        axis: String,
        ratio: f64,
        first: Box<LayoutNode>,
        second: Box<LayoutNode>,
    },
    Leaf {
        id: String,
        pane_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaneSnapshot {
    pub pane_id: String,
    pub title: String,
    pub shell: String,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub layout: Option<LayoutNode>,
    pub active_pane_id: String,
    pub next_pane_number: u32,
    pub panes: Vec<PaneSnapshot>,
}

impl WorkspaceSnapshot {
    pub fn is_empty(&self) -> bool {
        self.layout.is_none() || self.panes.is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabSnapshot {
    pub tab_id: String,
    pub title: String,
    pub workspace: WorkspaceSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowSnapshot {
    pub tabs: Vec<TabSnapshot>,
    pub tab_order: Vec<String>,
    pub active_tab_id: String,
    pub next_tab_number: u32,
}

impl WindowSnapshot {
    pub fn is_empty(&self) -> bool {
        self.tabs.is_empty() || self.tab_order.is_empty()
    }
}

impl From<WorkspaceSnapshot> for WindowSnapshot {
    fn from(workspace: WorkspaceSnapshot) -> Self {
        if workspace.is_empty() {
            return Self::default();
        }

        Self {
            tabs: vec![TabSnapshot {
                tab_id: "tab:1".to_string(),
                title: "Tab 1".to_string(),
                workspace,
            }],
            tab_order: vec!["tab:1".to_string()],
            active_tab_id: "tab:1".to_string(),
            next_tab_number: 2,
        }
    }
}
