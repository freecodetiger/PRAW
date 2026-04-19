// @vitest-environment node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string): string {
  const path = fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url));
  return readFileSync(path, 'utf8');
}

describe('public installation guidance contract', () => {
  it('surfaces a beginner-friendly macOS install section in the README', () => {
    const readme = readRepoFile('README.md');

    expect(readme).toContain('## macOS 安装');
    expect(readme).toContain('## Install on macOS');
    expect(readme).toContain('macOS 已正式发布');
    expect(readme).toContain('formal public release');
    expect(readme).toContain('https://github.com/freecodetiger/PRAW/releases');
    expect(readme).toContain('Apple Silicon');
    expect(readme).toContain('Intel');
    expect(readme).toContain('docs/installing-macos.md');
  });

  it('documents unsigned macOS releases separately from formal signing setup', () => {
    const docs = readRepoFile('docs/releasing.md');

    expect(docs).toContain('## Unsigned macOS builds');
    expect(docs).toContain('main prerelease lane and tagged formal releases can both publish unsigned macOS artifacts');
    expect(docs).toContain('docs/installing-macos.md');
    expect(docs).toContain('Version-tagged formal releases can also publish unsigned macOS artifacts');
    expect(docs).toContain('Apple credentials are only required for signed/notarized macOS releases');
  });

  it('puts macOS install help directly into generated release notes', () => {
    const workflow = readRepoFile('.github/workflows/desktop-release.yml');

    expect(workflow).toContain('### macOS 安装');
    expect(workflow).toContain('Apple Silicon Mac 请优先下载 aarch64 / arm64 资产');
    expect(workflow).toContain('Intel Mac 请优先下载 x64 / x86_64 资产');
    expect(workflow).toContain('docs/installing-macos.md');
    expect(workflow).toContain('仍要打开');
  });
});
