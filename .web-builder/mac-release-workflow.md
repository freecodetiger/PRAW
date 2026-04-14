# PRAW macOS Release Workflow

日期：2026-04-14

## 目标

先建立一个 **稳定、可重复的 macOS release lane**，但第一阶段只要求：

- GitHub Actions 可触发
- 生成 macOS `.app` 工件
- tag push 时创建 GitHub Release 草稿

第一阶段**不**把下面这些高耦合事项一起塞进去：

- DMG
- Apple code signing
- notarization

## 为什么先只发 `.app`

根据本地证据：

- `tauri build` 已经能完成 `.app` bundling
- 当前失败点在 DMG packaging

所以当前最稳的 release 切法是：

1. 先把 `.app` 产出放进 CI
2. 让 tag 流程自动建 release 草稿
3. 等 release lane 稳定后，再补 DMG / 签名 / notarization

## 触发方式

工作流文件：`.github/workflows/macos-release.yml`

### 1. 手动触发

- `workflow_dispatch`
- 用于先验证 CI 能否稳定产物

### 2. 标签触发

- `push.tags: v*`
- 例如：`v0.1.0`

## 当前实现范围

- 平台：`macos-latest`
- 架构：
  - `aarch64-apple-darwin`
  - `x86_64-apple-darwin`
- 构建命令：
  - `tauri-action`
  - `args: --bundles app --target <triple>`

## 发布策略

### workflow_dispatch

- 只构建
- 上传 workflow artifacts
- 不创建 GitHub Release

### tag push

- 构建
- 创建 draft release
- 上传 macOS `.app` 资产

## 仍未解决的问题

1. 是否要发布 DMG
2. 是否需要 Apple Developer 签名证书
3. 是否需要 notarization
4. Intel 构建是否在当前 runner 上长期稳定

## 建议验收

当 GitHub Actions 实际跑通后，可把 `mac-release-workflow` 标记为完成，验收标准：

- 手动触发可成功产出 `.app` 工件
- tag push 可创建 draft release
- release 中包含 macOS app bundle 资产
- secrets / signing 缺口被明确记录
