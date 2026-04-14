# PRAW macOS Baseline Audit

日期：2026-04-14

## 结论

PRAW 当前已经具备 **macOS 开发基线**，但还没有达到 **macOS 发布基线**。

更具体地说：

- 开发/测试层面：可用
- Web 构建层面：可用
- Tauri 原生打包层面：部分可用
- DMG 发布层面：当前失败

## 运行证据

### 通过

- `npm test`
  - 结果：51 个 test files / 249 个 tests 全通过
- `cargo test`
  - 结果：30 个 Rust tests 全通过
- `npm run build`
  - 结果：通过

### 部分通过

- `npm run tauri build`
  - 已完成：
    - `Built application at: src-tauri/target/release/praw`
    - `Bundling PRAW.app`
  - 当前失败点：
    - `Bundling PRAW_0.1.0_aarch64.dmg`
    - `failed to bundle project error running bundle_dmg.sh`

## 代码层风险点

### 1. dialog shell integration 曾经是 bash-only，现在本分支已补 zsh

证据：

- `src-tauri/src/terminal/shell_integration.rs`
  - `build_shell_integration_command()` 现在同时支持 bash / zsh
  - bash 继续使用 `--rcfile`
  - zsh 改为 `ZDOTDIR` + `.zshenv` / `.zshrc`
  - 两者都发出相同的 OSC 133 marker 契约
- `src-tauri/src/terminal/shell_integration_test.rs`
  - 现在包含真实 PTY 运行时测试，证明交互式 zsh 会话会发出 `133;A/B/C/D/P` marker
- `src/domain/terminal/dialog.ts`
  - `isDialogShellSupported()` 现在接受 bash / zsh

影响：

- macOS 默认 shell 常见为 `zsh`
- 这个分支已经把 `zsh` 从 classic fallback 提升到 dialog-capable 路径
- 仍然不支持的 shell（例如 `fish`）继续走 classic fallback

### 2. 默认 shell 仍然带 bash 偏向

证据：

- 前端默认值：`src/domain/config/model.ts`
  - `defaultShell: "/bin/bash"`
- 恢复逻辑和大量测试 fixture 也都偏向 `/bin/bash`

影响：

- 在 macOS 上不一定会直接坏
- 但会放大 bash/zsh 行为差异，影响真实用户体验

### 3. 自动 release 尚未建立

证据：

- 仓库当前没有 `.github/workflows/`

影响：

- 即使本地开发基线成立，发布仍然依赖手工操作

## 当前可认定的阶段

### 可以认定为已完成

- `mac-baseline-audit`

因为：

- kit 已经成功接入 PRAW
- 当前 macOS 证据已经被写入仓库状态
- 主要技术风险已被收敛到明确问题，而不是模糊“可能不兼容”

### 还不能认定为已完成

- `mac-release-workflow`

因为：

- 还没有 CI workflow
- DMG bundling 当前失败
- 签名/公证策略尚未定义

## 下一步建议

优先顺序建议如下：

1. 先把 release lane 做成“可重复构建 unsigned macOS artifact”
2. 再决定是否接入签名 / notarization
3. 最后再补 zsh-native dialog integration，而不是把它和 release workflow 混在同一个改动里
