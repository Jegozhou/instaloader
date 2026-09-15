---
name: instagram-workbench
description: Open and use the local Instaloader WorkBuddy workbench for Instagram download tasks.
---

# Instagram 下载工作台

当用户说“打开 Instagram 下载工作台”“打开 Instaloader 工作台”“用工作台下载 Instagram”或需要图形化配置 Instaloader 下载任务时，调用 MCP 工具 `show_instagram_workbench`。

## 使用边界

- 公开主页、Hashtag 和公开单条帖子可以匿名执行，但实际可访问性仍由 Instagram 和 Instaloader 决定。
- Feed、关注 Stories、Saved，以及需要账号权限的内容必须使用已验证的 Instaloader session 文件或本机浏览器 Cookie。
- 不要要求用户把 Instagram 密码输入工作台，也不要把密码放进 MCP 参数、提示词、日志或本地存储。
- 不要读取、回显或复制原始 Cookie/session 内容；工作台只传递用户明确选择的本机路径和安全状态摘要。
- 不要声称下载已完成，直到 `instagram_start_download` 返回完成事件。
- 遇到认证、访问限制、限流或目标不存在时，按工具返回的错误说明处理，不尝试绕过 Instagram 的访问控制或限制。

## 推荐流程

1. 用户需要完整界面时调用 `show_instagram_workbench`。
2. 工作台先用 `instagram_validate_request` 验证结构化任务。
3. 使用 session 或浏览器 Cookie 时，可用 `instagram_account_status` 验证登录状态。
4. 用户确认目标、内容、输出目录和身份模式后，再调用 `instagram_start_download`。
5. 以工具返回的结构化结果为准汇报成功、失败和本机输出位置。

CLI 仍然保留：用户明确想直接使用命令行时，不必强制打开工作台。
