#!/usr/bin/env bash
set -euo pipefail

dry_run="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry_run="true"; shift ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

workbuddy_home="${WORKBUDDY_HOME:-$HOME/.workbuddy}"
app_root="$workbuddy_home/apps/instagram-workbench"
skill_root="$workbuddy_home/skills/instagram-workbench"
config_file="$workbuddy_home/.mcp.json"
node_bin="$(command -v node || true)"

echo "将移除 WorkBuddy 应用：$app_root"
echo "将移除 WorkBuddy Skill：$skill_root"
echo "将从 MCP 配置移除：instagram-workbench"
echo "不会删除下载目录、session/Cookie 文件或安装器创建的历史备份。"
if [[ "$dry_run" == "true" ]]; then
  echo "预检通过；未修改任何文件。"
  exit 0
fi

rm -rf "$app_root" "$skill_root"

if [[ -f "$config_file" ]]; then
  [[ -n "$node_bin" ]] || { echo "需要 Node.js 来安全更新 $config_file" >&2; exit 1; }
  timestamp="$(date +%Y%m%d-%H%M%S)"
  backup_file="$config_file.instagram-workbench-uninstall-backup-$timestamp"
  cp "$config_file" "$backup_file"
  tmp_config="$config_file.instagram-workbench-uninstall-tmp-$timestamp"
  "$node_bin" --input-type=module - "$config_file" "$tmp_config" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises'
const [source, target] = process.argv.slice(2)
const config = JSON.parse(await readFile(source, 'utf8'))
if (config.mcpServers && typeof config.mcpServers === 'object') {
  delete config.mcpServers['instagram-workbench']
}
await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
NODE
  mv "$tmp_config" "$config_file"
  chmod 600 "$config_file" 2>/dev/null || true
  echo "MCP 配置 backup：$backup_file"
fi

echo "Instagram 下载工作台已卸载。下载文件与本地登录材料未被删除。"
