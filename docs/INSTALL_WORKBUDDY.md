# WorkBuddy Instagram 下载工作台安装指南

这个工作台是 Instaloader 的可选图形层。原有 Python API 和 `instaloader` CLI 保持可用；不安装 WorkBuddy 也不影响原项目的使用方式。

## 要求

- Python 3.9 或更高版本，并且带有 `pip`。
- Node.js 20 或更高版本，用于 WorkBuddy MCP App 的构建/运行。
- WorkBuddy。

安装器会把 WorkBuddy 所需的 Python 依赖（`requests` 与 `browser_cookie3`）安装到应用自己的 `python/` 目录，不会替换系统 Python 中已有的 Instaloader。

## 从源码安装

```bash
git clone https://github.com/Jegozhou/instaloader.git
cd instaloader
git checkout feat/workbuddy-workbench

npm ci
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

1. 检查 Node.js 20+、Python 3.9+ 与 `pip`。
2. 安装完整 `workbuddy/` 产物到 `~/.workbuddy/apps/instagram-workbench`（Windows 使用用户目录下的 `.workbuddy`），其中包括 MCP Server、Widget 和应用私有的 Instaloader Python 源码。
3. 把 `requests>=2.25` 与 `browser_cookie3>=0.19.1` 安装到该应用私有 `python/` 目录。
4. 安装 `agents/instagram-workbench` Skill。
5. 创建默认下载目录 `~/Downloads/Instaloader`；可在运行安装器前通过 `INSTALOADER_WORKBENCH_CWD` 改成其他目录。
6. 在修改 WorkBuddy `.mcp.json` 前创建带时间戳的备份，只添加/更新 `instagram-workbench` 这一项，不删除其他 MCP Server 配置。
7. 在 MCP Server 环境中记录 Python 可执行文件路径和默认下载目录，随后执行本机 Bridge 导入与 Node Server 语法自检。

安装器**不会**读取、复制或上传 Instaloader session 文件、浏览器 Cookie、Instagram 密码或下载内容。Session/Cookie 文件只有在你主动选择相应身份模式时，才由本机 Python Bridge 按路径访问。

## 使用发布包

仓库的 `WorkBuddy Release Package` workflow 会生成可移植 ZIP。发布 staging 也可以在源码目录中手动生成：

```bash
npm ci
npm run build
npm run package:workbuddy
```

输出目录为：

```text
dist/workbuddy-instagram-workbench/
```

该目录只包含运行 WorkBuddy 工作台所需的白名单文件：MCP Server、Widget、应用私有 Instaloader Python 源码、Skill、插件清单、安装/卸载脚本、许可与安装文档。它不会包含用户 Session、Cookie、下载目录或其他本机凭据。

ZIP 解压后，在解压目录内运行对应平台的安装脚本即可。

## 启动

重新打开 WorkBuddy 后输入：

> 打开 Instagram 下载工作台

WorkBuddy 会调用 `show_instagram_workbench` 并打开完整 MCP App Widget。

## 三种身份模式

### 匿名

适合 Instagram 当前仍允许匿名访问的内容。最终能否访问由 Instagram 与 Instaloader 的实际响应决定。

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

当前 Instaloader 4.15.x 的 `download_hashtag()` 需要登录，因此 Hashtag、Feed、Stories、Saved 会在匿名模式下被工作台提前拦截。Profile 与 Shortcode 是否可匿名访问仍取决于 Instagram 的实际响应以及目标本身的权限。

Instaloader CLI 原本支持的其他目标仍可以继续通过命令行使用。

## 默认下载目录

安装器默认使用：

```text
~/Downloads/Instaloader
```

Windows 对应用户目录下的 `Downloads\Instaloader`。任务中显式填写保存目录时，以任务配置为准。

## 卸载

macOS / Linux：

```bash
bash scripts/uninstall-workbuddy-app.sh
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-workbuddy-app.ps1
```

卸载器只移除 `instagram-workbench` 应用目录、对应 Skill 与 `.mcp.json` 中同名 MCP Server 条目。修改配置前会创建备份；不会删除下载文件、Session/Cookie 文件，也不会删除其他 MCP Server 配置。两个卸载器都支持先检查路径而不执行删除：POSIX 使用 `--dry-run`，PowerShell 使用 `-DryRun`。

## 开发验证

Python Bridge 单元测试：

```bash
python -m unittest discover -s test -p 'test_workbench_bridge*.py' -v
```

WorkBuddy 构建与 Node 测试：

```bash
npm ci
npm run build
npm run test:node
node --check workbuddy/server.mjs
```

或者一次执行：

```bash
npm run check
```

仓库中的 `.github/workflows/workbuddy.yml` 会使用已提交的 `package-lock.json` 通过 `npm ci` 安装依赖，并执行 Python Bridge 测试、WorkBuddy 构建、Node 契约/产物测试、Bundled Python Bridge 导入检查和 Server 语法检查。

`.github/workflows/workbuddy-release.yml` 会在 Linux 与 Windows 干净 runner 上实际安装并卸载 staging 包，验证它不会覆盖无关 MCP 配置或删除用户下载；Linux job 还会生成可下载的发布 ZIP artifact。

## 排障

### `workbuddy/server.mjs`、`widget.html` 或 Bundled Python Bridge 不存在

源码仓库需要先执行：

```bash
npm ci
npm run build
```

构建完成后应存在：

```text
workbuddy/server.mjs
workbuddy/widget.html
workbuddy/python/instaloader/workbench_bridge.py
```

### Python 依赖安装失败

安装器需要通过 `pip` 将运行依赖放到应用私有目录。如果网络、代理或 Python 安装阻止 `pip install`，修复对应环境后重新运行安装器即可；无需修改系统里的 Instaloader 包。

### 浏览器 Cookie 验证失败

安装器会安装 `browser_cookie3`，但浏览器本身仍必须存在有效的 Instagram 登录状态，并且本机系统必须允许读取对应 Cookie 存储。

### Hashtag / Feed / Stories / Saved 被提前拦截

当前 Instaloader 版本要求这些目标使用已验证的登录状态。切换到 Session 文件或浏览器 Cookie 模式后重新验证。

### WorkBuddy 没有出现图形界面

检查 `~/.workbuddy/.mcp.json` 是否存在 `instagram-workbench` 条目，并确认其 `server.mjs` 路径存在。保存当前 WorkBuddy 内容后完全退出并重新打开。
