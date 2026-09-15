# WorkBuddy Instagram 下载工作台

## 定位

这个工作台不是新的 Instagram 下载引擎，而是现有 Instaloader Python 能力的本机可视化编排层。

```text
WorkBuddy Widget
    ↓ MCP tool
Node MCP Server
    ↓ JSON command
python -m instaloader.workbench_bridge
    ↓ existing Instaloader API
Instagram / local filesystem
```

原有 `instaloader` CLI 和 Python API 仍是兼容边界。

## 工作台页面

### 总览

显示当前身份模式、最近任务、本机执行状态，以及主页 / Reels / Stories / Shortcode 快捷入口。

### 新建下载

按顺序配置：

1. 目标
2. 内容
3. 筛选
4. 保存
5. 身份
6. 验证并执行

需要登录的目标或内容在匿名模式下会提前提示并阻止执行。当前 Instaloader 4.15.x 中 Hashtag、Feed、Stories、Saved 目标需要登录。

### 任务中心

保存最多 50 条本机安全摘要：job id、状态、目标摘要、身份模式、时间、结果计数和用户选择保留的输出目录。

不会保存 Cookie、session 内容或 Instagram 密码。

### 下载结果

显示最后一次任务的结构化结果和事件时间线。Instaloader 并不为所有目标提供统一总量，因此界面使用阶段进度和可观察计数，不伪造百分比。

### 设置

保存非敏感偏好。输出目录与身份文件路径默认不持久化，只有用户显式开启后才保存路径本身。

## MCP 工具

### `show_instagram_workbench`

打开 MCP App Widget。

### `instagram_validate_request`

只验证结构化请求，不开始网络下载。

### `instagram_account_status`

验证匿名、session 文件或浏览器 Cookie 模式，只返回安全账号摘要。

### `instagram_start_download`

调用本机 Python Bridge 执行 Instaloader 下载任务。

后三个工具使用 App-only visibility，避免它们作为一般聊天工具被无意直接调用。

## Python Bridge

入口：

```bash
python -m instaloader.workbench_bridge
```

stdin 接收一个 JSON 对象；stdout 只输出 JSON Lines 事件。普通 Instaloader 日志和诊断被重定向到 stderr，避免破坏 Node 解析。

命令：

```json
{"command":"validate","request":{}}
{"command":"account_status","auth":{}}
{"command":"download","request":{}}
```

事件：

```json
{
  "event": "progress",
  "jobId": "...",
  "timestamp": "...",
  "data": {"stage": "下载中"}
}
```

失败代码包括：

- `INVALID_REQUEST`
- `AUTH_REQUIRED`
- `AUTH_FAILED`
- `TARGET_NOT_FOUND`
- `RATE_LIMITED`
- `NETWORK_ERROR`
- `DOWNLOAD_ABORTED`
- `INTERNAL_ERROR`

## 安全模型

- Widget CSP 不声明任何外部 resource/connect domain。
- Instagram 请求只发生在 Python 层。
- MCP schema 没有密码字段。
- 未识别的认证字段不会进入规范化请求。
- Node Bridge Runner 会对可能的 password/cookie/session 内容字段再次脱敏。
- child stderr 有长度上限且不会作为用户可见结果回传。
- 输出目录命名和文件命名模式只能使用相对路径，不能通过 `..` 或绝对路径越出用户选择的输出目录。
- MCP 请求取消时，Node Bridge Runner 会终止对应的 Python 子进程。
- Widget localStorage 只保存安全任务摘要和用户明确允许保留的路径。
- 安装器不会复制任何 session/Cookie 文件。
- 构建产物自带 `workbuddy/python/instaloader` 源码；安装器把 `requests` 与 `browser_cookie3` 放进应用私有 Python 目录，不覆盖系统 Instaloader。

## 下载目标映射

| 工作台目标 | Instaloader 操作 |
|---|---|
| Profile | `check_profile_id()` + `download_profiles()` |
| Hashtag | `download_hashtag()`（当前版本需要登录） |
| Shortcode | `Post.from_shortcode()` + `download_post()` |
| Feed | `download_feed_posts()` |
| Stories | `download_stories()` |
| Saved | `download_saved_posts()` |

Profile 的 Posts / Reels / Stories / Highlights / Tagged / IGTV 等复用 `download_profiles()` 已有参数；`maxCount` 映射到 `max_count`，并启用 `raise_errors=True` 让工作台能够获得结构化失败结果。Profile 解析走 `check_profile_id()`，保留上游已有的 profile ID 与改名跟踪行为。

## 进度阶段

V1 固定使用以下阶段：

1. 准备任务
2. 验证身份
3. 解析目标
4. 下载中
5. 保存元数据
6. 完成

当底层能够观察到项目计数时可以附加 counters，但不把阶段虚构成百分比。

## 构建与运行时

`npm run build` 生成：

```text
workbuddy/server.mjs
workbuddy/widget.html
workbuddy/python/instaloader/
```

Widget 使用显式 in-memory esbuild 输出并内联 JavaScript/CSS；构建时强制检查 `widget.html` 不超过 256 KiB。Server 在安装态优先使用 `workbuddy/python` 中的 Instaloader，在源码态回退到仓库根目录的 Python 包。

安装器默认把下载工作目录设置为 `~/Downloads/Instaloader`，避免任务在 `~/.workbuddy/apps` 内产生媒体文件。任务显式指定输出目录时，以任务配置为准。

## 源码结构

```text
instaloader/workbench_bridge.py       Python 结构化适配层
src/workbuddy/bridge-runner.mjs       Python child-process / JSONL runner
src/workbuddy/server.mjs              MCP Server 源码
src/workbuddy/widget.jsx              MCP Apps 客户端入口
src/workbuddy/app.jsx                 工作台状态与导航
src/workbuddy/components/             页面组件
src/workbuddy/styles.css              本地样式
agents/instagram-workbench/SKILL.md    WorkBuddy Skill
scripts/build-workbuddy-app.mjs        生产构建
scripts/install-workbuddy-app.*        安装器
workbuddy/                             生产构建输出（含 Python runtime 源码）
```

## V1 明确不做

- 密码登录或密码存储
- 云端任务队列
- 后台常驻下载服务
- 多机同步
- 下载媒体的内嵌图库浏览
- 绕过 Instagram 认证、访问控制、速率限制或账号限制
