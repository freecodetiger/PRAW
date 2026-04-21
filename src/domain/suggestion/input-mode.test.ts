import { describe, expect, it } from "vitest";

import { classifyCompletionInput } from "./input-mode";

describe("input-mode", () => {
  it.each([
    "git ch",
    "npm r",
    "pnpm test",
    "cargo t",
    "./script.sh",
    "../bin/tool",
    "docker lo",
    "mysql -u root -p",
    "mysqldump mydb",
    "mysqladmin -u root ping",
  ])(
    "classifies %s as prefix",
    (draft) => {
      expect(classifyCompletionInput(draft, "/bin/bash")).toBe("prefix");
    },
  );

  it.each([
    "查看 3000 端口被谁占用",
    "启动这个项目",
    "提交当前改动",
    "find process using port 3000",
    "连接本地 mysql",
    "导出 mysql 数据库",
  ])(
    "classifies %s as intent",
    (draft) => {
      expect(classifyCompletionInput(draft, "/bin/bash")).toBe("intent");
    },
  );

  it("keeps ambiguous short drafts in prefix mode", () => {
    expect(classifyCompletionInput("np", "/bin/bash")).toBe("prefix");
  });
});
