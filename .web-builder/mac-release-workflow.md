# PRAW macOS Release Workflow

日期：2026-04-14

## 目标

先建立一个 **稳定、可重复的 macOS release lane**，当前目标是：

- GitHub Actions 可触发
- merge 到 `main` 后自动创建 macOS prerelease
- 生成 macOS `.app` 和 `.dmg`
- tag push 时创建正式 release

当前阶段**仍不**把下面这些高耦合事项一起塞进去：

- Apple code signing
- notarization

## 为什么现在把 `.dmg` 也放进自动流程

根据本地证据：

- `tauri build` 已经能完成 `.app` bundling
- 当前失败点在 DMG packaging

所以当前 workflow 的策略是：

1. 在 CI 中直接尝试 `.app + .dmg`
2. merge 到 `main` 先自动发 prerelease
3. tag release 再发正式 release
4. 如果 DMG 在远端仍失败，再回退到 `.app` only，而不是阻塞整个 release lane

## 触发方式

工作流文件：`.github/workflows/macos-release.yml`

### 1. 手动触发

- `workflow_dispatch`
- 用于先验证 CI 能否稳定产物

### 2. main 分支自动触发

- `push.branches: main`
- 用于 PR merge 后自动产出可下载的 macOS 预发布版本

### 3. 标签触发

- `push.tags: v*`
- 例如：`v0.1.0`

## 当前实现范围

- 平台：`macos-latest`
- 架构：
  - `aarch64-apple-darwin`
  - `x86_64-apple-darwin`
- 构建命令：
  - `tauri-action`
  - `args: --bundles app,dmg --target <triple>`

## 发布策略

### workflow_dispatch

- 只构建
- 上传 workflow artifacts
- 不创建 GitHub Release

### push to main

- 构建
- 自动创建 prerelease
- 上传 macOS `.app` / `.dmg` 资产

### tag push

- 构建
- 创建正式 release
- 上传 macOS `.app` / `.dmg` 资产

## 仍未解决的问题

1. DMG 是否能在 GitHub macOS runner 上稳定通过
2. 是否需要 Apple Developer 签名证书
3. 是否需要 notarization
4. Intel 构建是否在当前 runner 上长期稳定

## 建议验收

当 GitHub Actions 实际跑通后，可把 `mac-release-workflow` 标记为完成，验收标准：

- merge 到 `main` 可自动创建 macOS prerelease
- 手动触发可成功产出 `.app` / `.dmg` 工件
- tag push 可创建正式 release
- release 中包含 macOS installable 资产
- secrets / signing 缺口被明确记录
