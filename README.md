# PRAW

> A modern desktop terminal workspace for developers who want split panes, readable command history, raw terminal compatibility, and AI-friendly CLI workflows.

[中文](#中文) | [English](#english)

## 中文

PRAW 是一个基于 `Tauri + React + Rust` 构建的桌面终端应用。它保留真实 shell 和原生 CLI 语义，同时围绕多分屏、Dialog 命令流、Classic/raw terminal 兼容模式，以及 AI CLI 工作流做额外优化。

当前公开版本只发布 Linux 平台安装包。

### 下载

请从官方网站下载最新 Linux 版本：

- 官网：[praw.top](https://praw.top/)
- 当前发布平台：Linux
- 当前安装包类型：`.deb`、`.rpm`、`.AppImage`

### 主要特性

- 多分屏终端工作区，支持横向/纵向拆分
- Dialog 模式：更适合阅读命令历史和普通命令输出
- Classic/raw terminal 模式：保留真实终端语义，兼容复杂 CLI/TUI
- AI mode：面向 `codex`、`claude`、`qwen` 等 AI CLI 的 raw-like 交互体验
- AI mode 旁路输入：在查看历史时快速发送 prompt
- 可复制、可粘贴的终端交互，针对中文输入法和 AI CLI 场景做了兼容优化
- 命令补全、短语补全、主题和字体配置

### Linux 安装

根据你的发行版选择安装包：

```bash
# Debian / Ubuntu
sudo apt install ./PRAW_0.1.0_amd64.deb

# Fedora / RHEL / openSUSE 等 rpm 系发行版
sudo rpm -i ./PRAW-0.1.0-1.x86_64.rpm

# AppImage
chmod +x ./PRAW_0.1.0_amd64.AppImage
./PRAW_0.1.0_amd64.AppImage
```

### 本地开发

```bash
npm install
npm run tauri dev
```

常用检查：

```bash
npm run typecheck
npm test
npm run build
```

### 技术栈

- `Tauri`：桌面应用外壳和系统桥接
- `React 19`：工作区、分屏、设置和交互界面
- `TypeScript`：前端领域模型和 UI 逻辑
- `Rust`：终端会话、PTY、系统侧逻辑
- `xterm.js`：raw terminal 渲染
- `Zustand`：应用状态管理

### 状态

PRAW 仍处于快速迭代阶段。Linux 是当前唯一公开发布平台；macOS 和其他平台暂不作为正式发布目标。

### 许可证

PRAW 使用 [Apache License 2.0](./LICENSE) 开源。

## English

PRAW is a desktop terminal app built with `Tauri + React + Rust`. It keeps a real shell and native CLI semantics, while adding a workspace-oriented interface for split panes, readable command history, raw terminal compatibility, and AI CLI workflows.

The current public release is Linux-only.

### Download

Download the latest Linux build from the official website:

- Website: [praw.top](https://praw.top/)
- Current release platform: Linux
- Current package formats: `.deb`, `.rpm`, `.AppImage`

### Highlights

- Multi-pane terminal workspace with horizontal and vertical splits
- Dialog mode for readable command history and ordinary command output
- Classic/raw terminal mode for compatibility-sensitive CLI and TUI behavior
- AI mode optimized for raw-like `codex`, `claude`, `qwen`, and similar AI CLI workflows
- Quick side-channel prompt input for AI mode
- Copy/paste behavior tuned for AI CLI sessions and Chinese IME edge cases
- Command completion, phrase completion, themes, and font controls

### Linux Install

Choose the package for your distribution:

```bash
# Debian / Ubuntu
sudo apt install ./PRAW_0.1.0_amd64.deb

# Fedora / RHEL / openSUSE and other rpm-based distributions
sudo rpm -i ./PRAW-0.1.0-1.x86_64.rpm

# AppImage
chmod +x ./PRAW_0.1.0_amd64.AppImage
./PRAW_0.1.0_amd64.AppImage
```

### Development

```bash
npm install
npm run tauri dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run build
```

### Tech Stack

- `Tauri` for the desktop shell and native bridge
- `React 19` for workspace UI and interaction-heavy surfaces
- `TypeScript` for frontend domain modeling
- `Rust` for terminal sessions, PTY, and system-side logic
- `xterm.js` for raw terminal rendering
- `Zustand` for app state

### Status

PRAW is still moving quickly. Linux is the only public release platform right now; macOS and other platforms are not formal release targets yet.

### License

PRAW is open source under the [Apache License 2.0](./LICENSE).
