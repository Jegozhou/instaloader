# WorkBuddy Instagram Workbench Design

## Status

Approved direction: native WorkBuddy MCP App (option A) with A1 authentication: anonymous access plus reuse of local Instaloader session files or browser cookies. The workbench must never persist an Instagram password.

## Goal

Turn the existing Instaloader fork into a standard WorkBuddy graphical workbench without replacing or breaking the existing Python library and CLI. Users should be able to say “打开 Instagram 下载工作台” in WorkBuddy, configure a download task visually, run it through the local Instaloader engine, watch structured progress, and inspect the resulting local output.

## Non-goals for v1

- No Instagram password field or password storage.
- No attempt to bypass Instagram access controls, rate limits, authentication requirements, or account restrictions.
- No remote backend, cloud queue, hosted database, telemetry, or CDN dependency.
- No rewrite of `instaloader/instaloader.py`, `instaloader/structures.py`, or the public Instaloader Python API.
- No removal or behavior change of the existing `instaloader` CLI entry point.
- No multi-machine synchronization.

## Existing project constraints

The upstream project is a mature Python package and CLI. `setup.py` registers `instaloader=instaloader.__main__:main`, and the CLI already groups its capabilities into download targets, per-post/profile content options, filters, login/session handling, and output behavior. The workbench should adapt these existing capabilities rather than duplicate their implementation.

The existing CLI supports profiles, hashtags, locations, feed, stories, saved posts, shortcodes and JSON objects. Profile options include posts, stories, highlights, tagged media, Reels and IGTV. It also supports comments, geotags, captions, JSON metadata, post filters, story filters, fast-update, latest stamps, session files and browser-cookie import.

## Architecture

Use a three-part local architecture:

1. **WorkBuddy MCP App shell (Node.js)**
   - Implements the standard MCP App resource and tools.
   - Serves a locally bundled `text/html;profile=mcp-app` widget.
   - Spawns the Python bridge as a child process when tasks or account checks are requested.
   - Never receives or stores Instagram passwords.

2. **Workbench widget (Preact + MCP Apps client)**
   - Runs inside WorkBuddy.
   - Renders dashboard, task builder, session state, task history and result summaries.
   - Calls MCP tools for privileged/local operations; it does not directly read arbitrary local files or call Instagram.
   - Persists only non-sensitive UI preferences and recent task metadata in widget-local storage.

3. **Python bridge (`instaloader.workbench_bridge`)**
   - Thin adapter over existing Instaloader APIs and existing CLI helper logic.
   - Accepts one JSON command on stdin and emits JSON Lines events on stdout.
   - Owns validation and Instaloader execution.
   - Converts library/CLI exceptions into stable workbench error codes.
   - Keeps the download engine in Python so behavior remains aligned with upstream.

Data flow:

`WorkBuddy Widget -> MCP tool -> Node server -> Python bridge -> Instaloader API -> local filesystem / Instagram`

Events return in the reverse direction as structured JSON.

## Repository layout

```text
instaloader/
  __main__.py                  existing CLI, preserved
  instaloader.py               existing engine, preserved
  workbench_bridge.py          new structured adapter

src/workbuddy/
  widget.jsx                   MCP App entry
  app.jsx                      top-level workbench shell
  contract.js                  shared UI-side schemas/constants
  components/
    Overview.jsx
    TaskBuilder.jsx
    AccountPanel.jsx
    TaskCenter.jsx
    ResultsPanel.jsx

workbuddy/
  server.mjs                   built MCP server
  widget.html                  built self-contained widget

agents/instagram-workbench/
  SKILL.md                     WorkBuddy Agent skill / invocation guidance

.codebuddy-plugin/plugin.json  WorkBuddy plugin manifest
.mcp.json                      MCP server registration
package.json                   local build/test dependencies
build.mjs                      widget + MCP server build
scripts/
  build-workbuddy-app.mjs
  install-workbuddy-app.sh
  install-workbuddy-app.ps1

test/
  test_workbench_bridge.py
  workbuddy-contract.test.mjs
  workbuddy-mcp.test.mjs
```

Generated/built artifacts live under `workbuddy/`; editable source remains under `src/workbuddy/`.

## MCP App protocol

The app follows the same standard WorkBuddy shape as the reference workbench:

- `.codebuddy-plugin/plugin.json` points to `.mcp.json` and the Agent Skill.
- `.mcp.json` starts `node ${CODEBUDDY_PLUGIN_ROOT}/workbuddy/server.mjs`.
- The UI resource uses MIME type `text/html;profile=mcp-app`.
- Widget resources are bundled locally with no CDN requirement.
- The opening tool is `show_instagram_workbench`.
- App resource URI: `ui://instagram-workbench/dashboard`.
- The MCP App requests fullscreen after connection when the host allows it.

### MCP tools

#### `show_instagram_workbench`

Purpose: open the graphical workbench.

Input: none.

Structured output:

```json
{
  "version": "1.0.0",
  "mode": "interactive-widget",
  "capabilities": ["anonymous", "session-file", "browser-cookie", "downloads"]
}
```

#### `instagram_account_status`

Purpose: verify anonymous/session/browser-cookie mode and return a safe account summary.

Input:

```json
{
  "authMode": "anonymous | session | browser",
  "username": "optional username for session lookup",
  "sessionFile": "optional local session path",
  "browser": "optional browser name",
  "cookieFile": "optional browser cookie database path"
}
```

Output contains only:

```json
{
  "authenticated": true,
  "username": "example",
  "authMode": "session",
  "message": "Session verified"
}
```

No cookies, session contents or password values are returned to the widget.

#### `instagram_start_download`

Purpose: validate and execute one download job.

Input follows the `DownloadRequest` contract defined below.

For v1, execution is synchronous from the MCP tool perspective while the Python child emits incremental JSONL events internally. The server accumulates bounded event history and returns a final job record. The widget displays a running state while the tool call is active. This avoids adding a daemon/queue before it is needed.

#### `instagram_validate_request`

Purpose: validate a task without performing network/download side effects.

This is used by the task builder before enabling the final run button and is also useful for tests.

## Python bridge protocol

Run as:

```bash
python -m instaloader.workbench_bridge
```

The process reads exactly one JSON object from stdin and emits JSON Lines to stdout. All human-readable diagnostics go to stderr; stdout is machine-only.

### Commands

```json
{"command":"validate","request":{...}}
{"command":"account_status","auth":{...}}
{"command":"download","request":{...}}
```

### Event envelope

```json
{
  "event": "started | progress | log | completed | failed",
  "jobId": "uuid",
  "timestamp": "2026-09-15T00:00:00Z",
  "data": {}
}
```

Stable failure shape:

```json
{
  "event": "failed",
  "jobId": "uuid",
  "timestamp": "...",
  "data": {
    "code": "INVALID_REQUEST | AUTH_REQUIRED | AUTH_FAILED | TARGET_NOT_FOUND | RATE_LIMITED | NETWORK_ERROR | DOWNLOAD_ABORTED | INTERNAL_ERROR",
    "message": "safe human-readable text"
  }
}
```

Secrets, cookie values and session contents must never appear in events or logs.

## DownloadRequest contract

```json
{
  "targets": [
    {"type":"profile","value":"username"}
  ],
  "content": {
    "profilePic": true,
    "posts": true,
    "stories": false,
    "highlights": false,
    "tagged": false,
    "reels": false,
    "igtv": false,
    "comments": false,
    "geotags": false,
    "captions": true,
    "metadataJson": true
  },
  "filters": {
    "fastUpdate": false,
    "latestStampsFile": null,
    "maxCount": null,
    "postFilter": null,
    "storyItemFilter": null
  },
  "output": {
    "directory": null,
    "dirnamePattern": "{target}",
    "filenamePattern": "{date_utc}_UTC",
    "sanitizePaths": true,
    "resume": true
  },
  "auth": {
    "mode": "anonymous",
    "username": null,
    "sessionFile": null,
    "browser": null,
    "cookieFile": null
  }
}
```

### v1 target types

Expose the highest-value target types in the UI:

- `profile`
- `hashtag`
- `shortcode`
- `feed`
- `stories`
- `saved`

Location and followee expansion remain supported by the original CLI but stay out of the v1 visual task builder to keep the UI focused. They can be added later without changing the bridge envelope.

## Authentication and security model (A1)

### Anonymous

No session data is supplied. Publicly accessible targets use the existing anonymous Instaloader behavior.

### Session file

The user supplies/chooses a local session file path and, when necessary, a username. The Python bridge calls existing Instaloader session loading and `test_login()` behavior. The widget receives only the verified username and status.

### Browser cookies

Reuse the existing optional `browser_cookie3` path. Supported browser names must be derived from the existing CLI implementation rather than duplicated independently. If `browser_cookie3` is unavailable, return `AUTH_FAILED` with a clear install/feature message.

### Secret handling requirements

- No password input in the widget.
- No password in MCP schemas.
- No raw cookie/session data in MCP responses.
- No raw cookie/session data in localStorage.
- No cookie/session values in logs.
- Session/cookie paths may be retained only as explicit user preferences; default behavior is not to persist them.
- Widget has no direct external network access; Instagram network operations occur in Python.

## Workbench UX

The v1 left navigation contains five modules.

### 1. 总览

Show:

- current authentication state (anonymous / signed in as username)
- quick actions: 下载主页、下载 Reels、下载 Stories、下载单条帖子
- latest task summary
- local output summary from the latest completed task
- safety note: local execution, no password storage

### 2. 新建下载

A single task builder with progressive sections:

1. **目标**: target type + one or more values.
2. **内容**: profile picture, posts, Reels, Stories, Highlights, Tagged, IGTV, comments, geotags, captions, metadata JSON.
3. **筛选**: fast-update, max count, post filter, story filter, latest stamps.
4. **保存**: output directory and naming patterns.
5. **身份**: anonymous, session file, browser cookie.
6. **确认**: normalized request preview and validation result.

Options that require login show a lock badge and validation error when auth is anonymous.

### 3. 任务中心

For v1, task history is local metadata rather than a background service. Store the latest 50 task summaries in widget localStorage:

- job id
- created/completed time
- target summary
- status
- auth mode (never secret contents)
- downloaded/skipped/error counts when available
- output directory label/path when the user elects to retain it

The workbench does not promise that a task continues after WorkBuddy or the MCP server exits.

### 4. 下载结果

Display the final structured job result:

- requested targets
- completed/failed target counts
- downloaded/skipped item counts when observable
- output directory
- safe error list
- compact event/log timeline

The widget does not try to embed downloaded media in v1. It focuses on traceability and local output location.

### 5. 设置

Only non-sensitive preferences:

- theme follows WorkBuddy by default
- default target type
- default content toggles
- default naming patterns
- whether to remember output path/session path (off by default for auth-related paths)
- clear local task history

## Progress strategy

Instaloader does not expose a single universal percentage for all target types, so v1 must not display a fake percent complete. Use stage-based progress:

- `准备任务`
- `验证身份`
- `解析目标`
- `下载中`
- `保存元数据`
- `完成`

Where observable, include counters such as downloaded/skipped/failed items. The UI uses an indeterminate progress indicator plus counters rather than an invented percentage.

## Bridge implementation strategy

Avoid calling private internals when a public Instaloader method exists. Where the existing CLI contains reusable behavior that is currently trapped inside `__main__.py` (for example browser cookie import and request normalization), extract only small pure/helper functions if needed, preserving CLI behavior and tests.

The bridge should construct `Instaloader(...)` with options mapped from `DownloadRequest`, then route targets to the same existing operations used by the CLI. It should not shell out to `instaloader` itself.

## Error handling

Validation errors are returned before starting network activity.

Examples:

- Stories/Feed/Saved with anonymous auth -> `AUTH_REQUIRED`.
- Empty targets -> `INVALID_REQUEST`.
- Invalid target characters -> `INVALID_REQUEST`.
- Missing session file -> `AUTH_FAILED`.
- Browser-cookie feature requested without optional dependency -> `AUTH_FAILED`.
- Profile not found -> `TARGET_NOT_FOUND`.
- Rate-limit / HTTP throttling surfaced by Instaloader -> `RATE_LIMITED` when distinguishable, otherwise `NETWORK_ERROR`.

The MCP server treats malformed/non-JSON bridge output as `INTERNAL_ERROR` and includes no child-process environment dump in the user-visible response.

## Testing strategy

### Python

Use the existing Python test framework. Add focused tests around bridge validation, request-to-Instaloader option mapping, safe error conversion, and JSONL protocol. Tests must not require a live Instagram account.

Network-dependent behavior is covered by seams/fakes around bridge routing, not by modifying the core engine for testability.

### Node / MCP

Use Node's built-in test runner for:

- manifest and `.mcp.json` consistency
- MCP App resource MIME and URI
- tool registration and input validation
- child-process bridge parsing
- secret redaction behavior
- built widget contains no remote CDN references

### Compatibility

Run the existing Instaloader test suite after bridge changes. Existing CLI behavior is a regression boundary.

## Build and installation

Node.js 20+ is required for the WorkBuddy app build/runtime side. Python compatibility remains whatever the upstream package currently declares (Python >= 3.9 in this fork).

The WorkBuddy installer should:

1. install/copy the Agent Skill
2. add the MCP server entry without deleting unrelated entries
3. preserve a timestamped backup of an existing WorkBuddy `.mcp.json`
4. never copy session/cookie files into the plugin directory

The source repository remains usable as a normal Python package without running the WorkBuddy installer.

## Agent Skill

`agents/instagram-workbench/SKILL.md` should tell WorkBuddy to use `show_instagram_workbench` when users ask to open the Instagram/Instaloader download workbench, and explain the safety boundary:

- public downloads can run anonymously
- private/account-scoped capabilities require session/browser-cookie authentication
- never ask the user to put an Instagram password into the workbench
- do not claim a download succeeded until the MCP tool returns completion

## Version-one acceptance criteria

1. Existing `instaloader` CLI still starts and existing upstream tests remain green.
2. WorkBuddy can discover the plugin and open `show_instagram_workbench` as a full-screen MCP App widget.
3. The widget can create and validate a profile/hashtag/shortcode/feed/stories/saved request.
4. Anonymous public profile download can be executed through the bridge.
5. Session-file and browser-cookie modes can verify authentication without exposing secret material to the widget.
6. Login-required content is blocked early when no authenticated session is available.
7. Completion/failure is shown as a structured task record with stage/counter information and safe errors.
8. No Instagram password schema, password field, remote telemetry or CDN dependency exists.
9. Built artifacts, tests and installation instructions are included in the repository.
10. All work is isolated on `feat/workbuddy-workbench` until reviewed and merged.
