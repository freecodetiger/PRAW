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
        #[serde(alias = "paneId")]
        leaf_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabSnapshot {
    pub tab_id: String,
    pub title: String,
    pub shell: String,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowSnapshot {
    pub layout: Option<LayoutNode>,
    pub tabs: Vec<TabSnapshot>,
    pub active_tab_id: String,
    pub next_tab_number: u32,
}

impl WindowSnapshot {
    pub fn is_empty(&self) -> bool {
        self.layout.is_none() || self.tabs.is_empty()
    }
}
