# WorkBuddy Instagram 下载工作台安装指南

这个工作台是 Instaloader 的可选图形层。原有 Python API 和 `instaloader` CLI 保持可用；不安装 WorkBuddy 也不影响原项目的使用方式。

## 要求

- Python 3.9 或更高版本（与当前 Instaloader 包一致）。
- Node.js 20 或更高版本，仅用于 WorkBuddy MCP App 的构建/运行。
- WorkBuddy。
- 如需直接从浏览器读取 Instagram Cookie，安装 Instaloader 的 `browser_cookie3` 可选依赖。

## 从源码安装

```bash
git clone https://github.com/Jegozhou/instaloader.git
cd instaloader
git checkout feat/workbuddy-workbench

python -m pip install -e '.[browser_cookie3]'
npm install
npm run build
```

macOS / Linux：

```bash
bash scripts/install-workbuddy-app.sh
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-workbuddy-app.ps1
```

安装器会：

1. 检查 Node.js 20+。
2. 把构建后的 `workbuddy/server.mjs` 与 `workbuddy/widget.html` 安装到 `~/.workbuddy/apps/instagram-workbench`（Windows 使用用户目录下的 `.workbuddy`）。
3. 安装 `agents/instagram-workbench` Skill。
4. 在修改 WorkBuddy `.mcp.json` 前创建带时间戳的备份。
5. 只添加/更新 `instagram-workbench` 这一项，不删除其他 MCP Server 配置。

安装器**不会**读取、复制或上传 Instaloader session 文件、浏览器 Cookie、Instagram 密码或下载内容。

## 启动

重新打开 WorkBuddy 后输入：

> 打开 Instagram 下载工作台

WorkBuddy 会调用 `show_instagram_workbench` 并打开完整 MCP App Widget。

## 三种身份模式

### 匿名

适合 Instagram 当前允许匿名访问的公开内容。最终能否访问由 Instagram 与 Instaloader 的实际响应决定。

### Instaloader Session 文件

选择 `Session 文件`，填写 Instagram 用户名；session 路径可留空，让 Instaloader 使用默认 session 路径，也可以显式指定本机路径。

工作台只把路径交给本机 Python Bridge。session 文件内容不会返回 Widget，也不会写入任务历史。

### 浏览器 Cookie

选择 `浏览器 Cookie` 并填写浏览器名称，例如 `firefox`、`chrome`、`edge`、`safari` 等。此能力复用 Instaloader 现有 `browser_cookie3` 逻辑。

工作台不会复制原始 Cookie；验证结果只包含登录成功与否、用户名和安全状态消息。

## 密码边界

工作台没有 Instagram 密码输入框，MCP schema 也没有密码字段。需要登录的能力应使用已有 session 文件或浏览器 Cookie，而不是把密码交给工作台。

## V1 支持的可视化目标

- Profile / 主页
- Hashtag
- Shortcode / 单条帖子
- Feed
- Stories
- Saved

Instaloader CLI 原本支持的其他目标仍可以继续通过命令行使用。

## 开发验证

Python Bridge 单元测试：

```bash
python -m unittest discover -s test -p 'test_workbench_bridge.py' -v
```

WorkBuddy 构建与 Node 测试：

```bash
npm install
npm run build
npm run test:node
node --check workbuddy/server.mjs
```

仓库还包含 `.github/workflows/workbuddy.yml`。若 fork 尚未启用 GitHub Actions，需要先在 GitHub 仓库的 Actions 页面启用工作流。

## 排障

### `workbuddy/server.mjs` 或 `widget.html` 不存在

源码仓库需要先执行：

```bash
npm install
npm run build
```

### 浏览器 Cookie 验证失败

确认安装了可选依赖：

```bash
python -m pip install -e '.[browser_cookie3]'
```

并确认相应浏览器中当前存在有效的 Instagram 登录状态。

### Feed / Stories / Saved 被提前拦截

这些目标需要已验证的登录状态。切换到 Session 文件或浏览器 Cookie 模式后重新验证。

### WorkBuddy 没有出现图形界面

检查 `~/.workbuddy/.mcp.json` 是否存在 `instagram-workbench` 条目，并确认其 `server.mjs` 路径存在。保存当前 WorkBuddy 内容后完全退出并重新打开。
