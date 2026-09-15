# WorkBuddy Instagram Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native WorkBuddy MCP App around the existing Instaloader engine, with a structured Python bridge, safe session/browser-cookie authentication, a locally bundled interactive widget, and installation/tests, while preserving the existing CLI and Python API.

**Architecture:** A Node.js MCP server exposes the WorkBuddy App resource and tools. Privileged operations spawn `python -m instaloader.workbench_bridge`, which accepts one JSON command and emits JSON Lines events. The widget uses MCP Apps APIs and never reads Instagram secrets directly.

**Tech Stack:** Python 3.9+, existing Instaloader APIs, Node.js 20+, `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, Preact, esbuild, Node built-in test runner, existing Python unittest suite.

**Spec:** `docs/superpowers/specs/2026-09-15-workbuddy-instagram-workbench-design.md`

## Global Constraints

- Preserve the existing `instaloader=instaloader.__main__:main` CLI entry point and public Python API.
- Never add an Instagram password field, schema property, persisted password, raw cookie/session content, telemetry, or CDN dependency.
- Authentication modes are anonymous, local Instaloader session file, and browser cookies via the existing optional `browser_cookie3` behavior.
- WorkBuddy widget network access remains disabled; Instagram network requests occur only in Python.
- V1 visual targets are profile, hashtag, shortcode, feed, stories, and saved.
- Progress is stage/counter based; do not invent percentage completion.
- Work remains on `feat/workbuddy-workbench` until reviewed and merged.

---

### Task 1: Python request contract and JSONL protocol

**Files:**
- Create: `instaloader/workbench_bridge.py`
- Create: `test/test_workbench_bridge.py`

**Interfaces:**
- Produces: `validate_download_request(request: dict) -> dict`
- Produces: `normalize_download_request(request: dict) -> dict`
- Produces: `emit_event(event: str, job_id: str, data: dict, stream) -> None`
- Produces CLI module entry: `python -m instaloader.workbench_bridge`

- [ ] **Step 1: Write failing validation tests**

Add tests proving that an empty target list fails with `INVALID_REQUEST`, anonymous `feed`/`stories`/`saved` fails with `AUTH_REQUIRED`, a valid public profile request is normalized with defaults, and validation never echoes password/cookie/session contents.

```python
from instaloader.workbench_bridge import BridgeError, normalize_download_request


def test_empty_targets_are_rejected():
    with pytest.raises(BridgeError) as error:
        normalize_download_request({"targets": []})
    assert error.value.code == "INVALID_REQUEST"


def test_feed_requires_authenticated_mode():
    with pytest.raises(BridgeError) as error:
        normalize_download_request({
            "targets": [{"type": "feed", "value": ":feed"}],
            "auth": {"mode": "anonymous"},
        })
    assert error.value.code == "AUTH_REQUIRED"
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `python -m pytest test/test_workbench_bridge.py -q`

Expected: import/attribute failure because `instaloader.workbench_bridge` does not exist.

- [ ] **Step 3: Implement the minimum contract/validation layer**

Implement a `BridgeError(code, message)` class, supported target/auth constants, default dictionaries for content/filter/output/auth, target syntax validation, authentication requirements, and a secret-scrubbing helper. Do not perform network operations in this task.

- [ ] **Step 4: Add JSONL protocol tests**

Use `subprocess.run([sys.executable, '-m', 'instaloader.workbench_bridge'], input=...)` to verify that a `validate` command returns machine-only JSONL with a terminal `completed` event and malformed JSON returns a terminal `failed` event with `INVALID_REQUEST`.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `python -m pytest test/test_workbench_bridge.py -q`

Expected: all bridge contract/protocol tests pass.

- [ ] **Step 6: Commit**

Commit message: `feat: add WorkBuddy bridge contract`

---

### Task 2: Authentication and Instaloader execution adapter

**Files:**
- Modify: `instaloader/workbench_bridge.py`
- Modify: `test/test_workbench_bridge.py`
- Modify only if required to avoid duplication: `instaloader/__main__.py`

**Interfaces:**
- Produces: `check_account_status(auth: dict, loader_factory=Instaloader) -> dict`
- Produces: `execute_download(request: dict, loader_factory=Instaloader, event_sink=...) -> dict`
- Produces stable bridge failure codes from existing Instaloader exceptions.

- [ ] **Step 1: Write failing authentication tests**

Test anonymous status, missing session file -> `AUTH_FAILED`, session-file verification returning only `{authenticated, username, authMode, message}`, and browser-cookie mode without `browser_cookie3` -> `AUTH_FAILED`. Fake the loader/context; no live Instagram requests.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `python -m pytest test/test_workbench_bridge.py -q`

Expected: missing account/execution functions.

- [ ] **Step 3: Implement safe authentication adapter**

Reuse existing session loading/test-login behavior. Reuse or extract the existing browser-cookie helper without changing CLI-visible behavior. Do not return cookie jars, passwords, or session file contents.

- [ ] **Step 4: Write failing target-routing tests**

Cover profile, hashtag, shortcode, feed, stories, and saved. Assert that request options map to the existing Instaloader constructor/method calls and that stage events include `准备任务`, `验证身份`, `解析目标`, `下载中`, `保存元数据`, `完成` where applicable.

- [ ] **Step 5: Implement execution routing**

Construct `Instaloader` with request content/output options and invoke public methods corresponding to each target. Generate UUID job ids and bounded structured logs/counters. Translate `ProfileNotExistsException`, login errors, aborts, and network exceptions to stable bridge codes.

- [ ] **Step 6: Run bridge tests and upstream regression tests**

Run: `python -m pytest test/test_workbench_bridge.py -q`

Then run the repository's existing Python test command; if pytest is not the native runner, use the command documented/configured by the repository.

Expected: bridge tests and upstream tests pass.

- [ ] **Step 7: Commit**

Commit message: `feat: execute Instaloader jobs through WorkBuddy bridge`

---

### Task 3: Node MCP server and Python bridge runner

**Files:**
- Create: `package.json`
- Create: `src/workbuddy/bridge-runner.mjs`
- Create: `src/workbuddy/server.mjs`
- Create: `test/workbuddy-mcp.test.mjs`
- Create later built artifact: `workbuddy/server.mjs`

**Interfaces:**
- Produces: `runBridge(command, options?) -> Promise<{events, final}>`
- MCP tools: `show_instagram_workbench`, `instagram_validate_request`, `instagram_account_status`, `instagram_start_download`
- MCP resource: `ui://instagram-workbench/dashboard`, MIME `text/html;profile=mcp-app`

- [ ] **Step 1: Write failing bridge-runner tests**

Use a temporary fake Python-compatible child script or injectable spawn function to prove line-delimited JSON parsing, bounded event history, malformed child output -> `INTERNAL_ERROR`, non-zero exit handling, and secret redaction.

- [ ] **Step 2: Run Node tests and verify RED**

Run: `node --test test/workbuddy-mcp.test.mjs`

Expected: module-not-found failures.

- [ ] **Step 3: Implement bridge runner**

Spawn the configured Python executable with `-m instaloader.workbench_bridge`, send one JSON command, parse stdout one line at a time, keep stderr bounded for diagnostics, and never include environment dumps or unredacted secrets in user-visible errors.

- [ ] **Step 4: Add failing MCP registration tests**

Assert the app URI/MIME, opening tool metadata, the four tool names, no password property in schemas, and resource CSP with no external connect/resource domains.

- [ ] **Step 5: Implement MCP server source**

Follow the reference WorkBuddy MCP App shape: `McpServer`, `StdioServerTransport`, local widget resource, tool `_meta.ui.resourceUri`, and structured output. MCP validation tool maps to bridge `validate`; account tool maps to `account_status`; start tool maps to `download`.

- [ ] **Step 6: Run Node tests and verify GREEN**

Run: `node --test test/workbuddy-mcp.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit**

Commit message: `feat: add WorkBuddy MCP server`

---

### Task 4: WorkBuddy interactive widget

**Files:**
- Create: `src/workbuddy/contract.js`
- Create: `src/workbuddy/widget.jsx`
- Create: `src/workbuddy/app.jsx`
- Create: `src/workbuddy/components/Overview.jsx`
- Create: `src/workbuddy/components/TaskBuilder.jsx`
- Create: `src/workbuddy/components/AccountPanel.jsx`
- Create: `src/workbuddy/components/TaskCenter.jsx`
- Create: `src/workbuddy/components/ResultsPanel.jsx`
- Create: `src/workbuddy/styles.css`
- Create: `test/workbuddy-contract.test.mjs`

**Interfaces:**
- `createDefaultRequest()` exactly matches the Python request defaults.
- Local history stores at most 50 safe task summaries.
- Widget calls MCP tools; it has no direct Instagram/network code.

- [ ] **Step 1: Write failing contract tests**

Test default request shape, six target types, login-required target detection, safe local-history serialization, max-50 history retention, and absence of password/cookie/session content keys in persisted task summaries.

- [ ] **Step 2: Run contract tests and verify RED**

Run: `node --test test/workbuddy-contract.test.mjs`

Expected: module-not-found failures.

- [ ] **Step 3: Implement shared UI contract helpers**

Keep validation-display helpers pure and testable. Do not duplicate Python network logic.

- [ ] **Step 4: Implement widget shell and five modules**

Build left navigation for 总览、新建下载、任务中心、下载结果、设置. Task Builder exposes the spec's target/content/filter/output/auth sections, lock badges for authenticated-only options, normalized request preview, validation action, and run action. Account Panel supports anonymous/session/browser modes but no password UI.

- [ ] **Step 5: Integrate MCP Apps client**

Connect with `@modelcontextprotocol/ext-apps`, follow host theme, request fullscreen where supported, call tools for validation/account/download, show indeterminate stage progress/counters, and persist only safe UI/history data.

- [ ] **Step 6: Run tests and build smoke check**

Run: `node --test test/workbuddy-contract.test.mjs test/workbuddy-mcp.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit**

Commit message: `feat: add Instagram WorkBuddy widget`

---

### Task 5: Build, plugin manifest, Skill, and installers

**Files:**
- Create: `build.mjs`
- Create: `.mcp.json`
- Create: `.codebuddy-plugin/plugin.json`
- Create: `agents/instagram-workbench/SKILL.md`
- Create: `scripts/build-workbuddy-app.mjs`
- Create: `scripts/install-workbuddy-app.sh`
- Create: `scripts/install-workbuddy-app.ps1`
- Create/update generated: `workbuddy/server.mjs`
- Create/update generated: `workbuddy/widget.html`
- Modify: `.gitignore` only if build tooling introduces generated temporary paths.

**Interfaces:**
- Plugin name: `workbuddy-instagram-workbench`
- MCP server name: `instagram-workbench`
- `.mcp.json` command: `node ${CODEBUDDY_PLUGIN_ROOT}/workbuddy/server.mjs`

- [ ] **Step 1: Add failing release-integrity tests**

Extend Node tests to assert manifest paths exist, `.mcp.json` points to the built server, widget contains no `http://`, `https://` or CDN script/style imports, and Skill mentions `show_instagram_workbench` plus the no-password boundary.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/workbuddy-*.test.mjs`

Expected: missing manifest/build/install files.

- [ ] **Step 3: Implement build pipeline and metadata**

Use esbuild to bundle the Preact widget into a self-contained `workbuddy/widget.html` and bundle/copy the MCP server. Configure Node >=20 and required MCP/Preact dependencies.

- [ ] **Step 4: Implement WorkBuddy Skill and installers**

Installers must back up an existing WorkBuddy `.mcp.json`, merge only the `instagram-workbench` entry, install the Skill, never copy session/cookie files, and be idempotent enough to rerun safely.

- [ ] **Step 5: Build and run release-integrity tests**

Run: `npm install`

Run: `npm run build`

Run: `node --test test/workbuddy-*.test.mjs`

Expected: build succeeds and tests pass.

- [ ] **Step 6: Commit**

Commit message: `feat: package Instagram workbench for WorkBuddy`

---

### Task 6: Documentation and full verification

**Files:**
- Modify: `README.rst`
- Create: `docs/INSTALL_WORKBUDDY.md`
- Create: `docs/WORKBUDDY_WORKBENCH.md`
- Modify: Draft PR description after verification.

**Interfaces:**
- Documentation must clearly distinguish upstream Instaloader CLI from the optional WorkBuddy application layer.

- [ ] **Step 1: Document install/use/security boundaries**

Add source install instructions, Node.js 20+ requirement for WorkBuddy only, launch phrase `打开 Instagram 下载工作台`, anonymous/session/browser-cookie modes, supported v1 target types, and explicit statement that the UI does not request/store Instagram passwords.

- [ ] **Step 2: Run the complete verification set**

Run Python bridge tests and upstream Python tests.

Run: `npm run build`

Run: `node --test test/workbuddy-*.test.mjs`

Run a repository search for forbidden WorkBuddy secret/password schema patterns and remote widget assets.

Expected: all tests/build checks pass; no password field/schema and no remote Widget dependency.

- [ ] **Step 3: Inspect final diff**

Confirm the original CLI entry point remains unchanged, the core engine files were not needlessly rewritten, generated artifacts correspond to source, and no session/cookie fixture or secret material was committed.

- [ ] **Step 4: Commit documentation**

Commit message: `docs: document WorkBuddy Instagram workbench`

- [ ] **Step 5: Update Draft PR**

Summarize implemented components, verification commands/results, known v1 limits, and keep the PR draft until final review.
