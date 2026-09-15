#!/usr/bin/env bash
set -euo pipefail

dry_run="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry_run="true"; shift ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
workbuddy_home="${WORKBUDDY_HOME:-$HOME/.workbuddy}"
app_root="$workbuddy_home/apps/instagram-workbench"
skill_root="$workbuddy_home/skills/instagram-workbench"
config_file="$workbuddy_home/.mcp.json"
output_root="${INSTALOADER_WORKBENCH_CWD:-$HOME/Downloads/Instaloader}"
node_bin="$(command -v node || true)"
python_bin="$(command -v python3 || command -v python || true)"

[[ -n "$node_bin" ]] || { echo "请先安装 Node.js 20 或更高版本。" >&2; exit 1; }
node_major="$($node_bin -p "process.versions.node.split('.')[0]")"
[[ "$node_major" -ge 20 ]] || { echo "Node.js 版本过低：$($node_bin --version)，需要 20+" >&2; exit 1; }
[[ -n "$python_bin" ]] || { echo "请先安装 Python 3.9 或更高版本。" >&2; exit 1; }
python_ok="$($python_bin -c 'import sys; print(1 if sys.version_info >= (3, 9) else 0)')"
[[ "$python_ok" == "1" ]] || { echo "Python 版本过低：$($python_bin --version)，需要 3.9+" >&2; exit 1; }

[[ -f "$repo_root/workbuddy/server.mjs" && -f "$repo_root/workbuddy/widget.html" ]] || {
  echo "安装包不完整：缺少 WorkBuddy 构建产物。源码安装请先运行 npm install && npm run build。" >&2
  exit 1
}
[[ -f "$repo_root/workbuddy/python/instaloader/workbench_bridge.py" ]] || {
  echo "安装包不完整：缺少 workbuddy/python/instaloader/workbench_bridge.py。请重新构建。" >&2
  exit 1
}
[[ -f "$repo_root/agents/instagram-workbench/SKILL.md" ]] || { echo "安装包不完整：缺少 instagram-workbench Skill" >&2; exit 1; }

echo "WorkBuddy 目录：$workbuddy_home"
echo "Instagram 工作台：$app_root"
echo "Instagram Skill：$skill_root"
echo "Python：$python_bin"
echo "默认下载目录：$output_root"
if [[ "$dry_run" == "true" ]]; then
  echo "预检通过；未修改任何文件。"
  exit 0
fi

mkdir -p "$workbuddy_home/apps" "$workbuddy_home/skills" "$output_root"
timestamp="$(date +%Y%m%d-%H%M%S)"
if [[ -e "$app_root" ]]; then
  mv "$app_root" "$app_root.backup-$timestamp"
  echo "旧图形工作台已备份：$app_root.backup-$timestamp"
fi
if [[ -e "$skill_root" ]]; then
  mv "$skill_root" "$skill_root.backup-$timestamp"
  echo "旧 Skill 已备份：$skill_root.backup-$timestamp"
fi
mkdir -p "$app_root"
cp -R "$repo_root/workbuddy/." "$app_root/"
cp -R "$repo_root/agents/instagram-workbench" "$skill_root"

"$python_bin" -m pip --version >/dev/null 2>&1 || {
  echo "当前 Python 缺少 pip，无法安装 WorkBuddy 的本机 Python 依赖。" >&2
  exit 1
}
"$python_bin" -m pip install \
  --disable-pip-version-check \
  --no-input \
  --upgrade \
  --target "$app_root/python" \
  'requests>=2.25' \
  'browser_cookie3>=0.19.1'
PYTHONPATH="$app_root/python" "$python_bin" -c 'import instaloader.workbench_bridge' || {
  echo "WorkBuddy Python Bridge 自检失败。" >&2
  exit 1
}

mkdir -p "$workbuddy_home"
if [[ -f "$config_file" ]]; then
  backup_file="$config_file.instagram-workbench-backup-$timestamp"
  cp "$config_file" "$backup_file"
  echo "MCP 配置 backup：$backup_file"
else
  printf '{\n  "mcpServers": {}\n}\n' > "$config_file"
fi

tmp_config="$config_file.instagram-workbench-tmp-$timestamp"
"$node_bin" --input-type=module - "$config_file" "$tmp_config" "$node_bin" "$app_root/server.mjs" "$python_bin" "$output_root" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises'
const [source, target, nodeBin, server, pythonBin, outputRoot] = process.argv.slice(2)
const config = JSON.parse(await readFile(source, 'utf8'))
config.mcpServers ||= {}
config.mcpServers['instagram-workbench'] = {
  command: nodeBin,
  args: [server],
  env: {
    WORKBUDDY_INSTAGRAM_WORKBENCH: '1',
    INSTALOADER_PYTHON: pythonBin,
    INSTALOADER_WORKBENCH_CWD: outputRoot,
  },
}
await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
NODE
mv "$tmp_config" "$config_file"
chmod 600 "$config_file" 2>/dev/null || true

"$node_bin" --check "$app_root/server.mjs"
echo
echo "安装完成。请保存 WorkBuddy 中正在编辑的内容，然后完全退出并重新打开。"
echo "重新打开后输入：打开 Instagram 下载工作台"
echo "默认下载目录：$output_root"
echo "安装器不会读取或上传 Instagram session/Cookie 内容；这些文件仅在你选择对应登录方式时由本机 Bridge 访问。"
