# PRAW

> A modern desktop terminal workspace for developers who want split panes, readable command history, raw terminal compatibility, voice input, and AI-friendly CLI workflows.
>
> Official Website / 官网：**[praw.top](https://praw.top/)**  
> Start here for the latest product updates, downloads, and release information.

[中文](#中文) | [English](#english)

## Editor's Note | 编者的话

> 这个项目由两名武汉大学计算机学院的本科生发起。学生时代我们有过许多梦想，而做出一款真正好用、能够被更多人看见的产品，一直是其中很重要的一个。PRAW 还在持续成长，后续也会不断吸收大家的意见和反馈进行更新。如果你有任何想法，欢迎发在评论区，或直接和我们沟通。每一条评论、每一颗 Star，都是对我们极大的认可，也是在提醒我们把这件事认真做下去。希望这份还不算成熟、但足够真诚的行动，能为开源社区带来一点微小而长期的价值，也让更多人因为这个项目知道我们的存在。
>
> This project was started by two undergraduate students from the School of Computer Science at Wuhan University. During our student years, we carried many dreams, and one of the most important was to build a product that is genuinely useful and can be seen by more people. PRAW is still growing, and we will keep improving it by listening closely to feedback and suggestions. If you have any thoughts, feel free to leave a comment or reach out to us directly. Every comment and every star means a great deal to us. They are not only encouragement, but also a reminder to keep taking this work seriously. We hope this project, still young but made with sincerity, can contribute something small yet lasting to the open source community, and let more people know who we are through what we build.

## 中文

PRAW 是一个基于 `Tauri + React + Rust` 构建的桌面终端应用。它保留真实 shell 和原生 CLI 语义，同时围绕多分屏工作区、可读的命令历史、Classic/raw terminal 兼容模式、语音输入，以及 AI CLI 工作流做额外优化。

当前公开发布同时覆盖 Linux 与 macOS 正式安装包。

### 下载

请从官网或 GitHub Releases 下载最新版：

- 官网直达：**[praw.top](https://praw.top/)**
- Releases: https://github.com/freecodetiger/PRAW/releases
- Linux 安装包：`.deb`、`.rpm`、`.AppImage`
- macOS 安装包：`.dmg`、`.app.tar.gz`

### 主要特性

- 多分屏终端工作区，支持横向/纵向拆分
- Dialog 模式：更适合阅读命令历史和普通命令输出
- Classic/raw terminal 模式：保留真实终端语义，兼容复杂 CLI/TUI
- AI mode：面向 `codex`、`claude`、`qwen` 等 AI CLI 的 raw-like 交互体验
- AI mode 旁路输入：在查看历史时快速发送 prompt
- 语音输入：支持通过快捷键或旁路输入中的麦克风按钮进行语音转文字，适合中英文 prompt 输入
- 可复制、可粘贴的终端交互，针对中文输入法和 AI CLI 场景做了兼容优化
- 命令补全、短语补全、主题和字体配置

### Linux 安装

根据你的发行版选择安装包：

```bash
# Debian / Ubuntu
sudo apt install ./PRAW_0.1.1_amd64.deb

# Fedora / RHEL / openSUSE 等 rpm 系发行版
sudo rpm -i ./PRAW-0.1.1-1.x86_64.rpm

# AppImage
chmod +x ./PRAW_0.1.1_amd64.AppImage
./PRAW_0.1.1_amd64.AppImage
```

## macOS 安装

macOS 已正式发布，请从 GitHub Releases 下载最新版：

- Releases: https://github.com/freecodetiger/PRAW/releases
- **Apple Silicon** Mac 请优先选择 `aarch64` / `arm64` 资产
- **Intel** Mac 请优先选择 `x64` / `x86_64` 资产
- 大多数用户直接使用 `.dmg`
- 如果需要手动解包或排障，可使用 `.app.tar.gz`
- 详细安装说明见：[docs/installing-macos.md](./docs/installing-macos.md)

### 本地开发

```bash
npm install
npm run tauri dev
```

如果你在 Linux 本地开发并启用了语音转文字能力，请先安装 ALSA 开发包：

```bash
sudo apt install libasound2-dev
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

PRAW 仍处于快速迭代阶段。Linux 与 macOS 安装包均已公开发布，其余平台暂未公开发布。

### 许可证

PRAW 使用 [Apache License 2.0](./LICENSE) 开源。

## English

PRAW is a desktop terminal app built with `Tauri + React + Rust`. It keeps a real shell and native CLI semantics, while adding a workspace-oriented interface for split panes, readable command history, raw terminal compatibility, voice input, and AI CLI workflows.

The current public release includes formal Linux and macOS packages.

### Download

Download the latest build from the website or GitHub Releases:

- Official Website: **[praw.top](https://praw.top/)**
- Releases: https://github.com/freecodetiger/PRAW/releases
- Linux packages: `.deb`, `.rpm`, `.AppImage`
- macOS packages: `.dmg`, `.app.tar.gz`

### Highlights

- Multi-pane terminal workspace with horizontal and vertical splits
- Dialog mode for readable command history and ordinary command output
- Classic/raw terminal mode for compatibility-sensitive CLI and TUI behavior
- AI mode optimized for raw-like `codex`, `claude`, `qwen`, and similar AI CLI workflows
- Quick side-channel prompt input for AI mode
- Voice input for AI prompts, available from shortcuts or the bypass microphone control, with Chinese and English speech-to-text support
- Copy/paste behavior tuned for AI CLI sessions and Chinese IME edge cases
- Command completion, phrase completion, themes, and font controls

### Linux Install

Choose the package for your distribution:

```bash
# Debian / Ubuntu
sudo apt install ./PRAW_0.1.1_amd64.deb

# Fedora / RHEL / openSUSE and other rpm-based distributions
sudo rpm -i ./PRAW-0.1.1-1.x86_64.rpm

# AppImage
chmod +x ./PRAW_0.1.1_amd64.AppImage
./PRAW_0.1.1_amd64.AppImage
```

## Install on macOS

macOS is now part of the formal public release. Download the latest build from GitHub Releases:

- Releases: https://github.com/freecodetiger/PRAW/releases
- Use `aarch64` / `arm64` assets on **Apple Silicon**
- Use `x64` / `x86_64` assets on **Intel**
- Most users should start with the `.dmg`
- Use `.app.tar.gz` only if you want the unpacked app bundle for manual inspection or troubleshooting
- Full install guide: [docs/installing-macos.md](./docs/installing-macos.md)

### Development

```bash
npm install
npm run tauri dev
```

If you are developing on Linux with the voice-to-text feature enabled, install the ALSA development package first:

```bash
sudo apt install libasound2-dev
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

PRAW is still moving quickly. Linux and macOS packages are publicly released today. Other platforms are not public targets yet.

### License

PRAW is open source under the [Apache License 2.0](./LICENSE).
