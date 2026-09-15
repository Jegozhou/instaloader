param([switch]$DryRun)
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$WorkBuddyHome = if ($env:WORKBUDDY_HOME) { $env:WORKBUDDY_HOME } else { Join-Path $env:USERPROFILE '.workbuddy' }
$AppRoot = Join-Path $WorkBuddyHome 'apps\instagram-workbench'
$SkillRoot = Join-Path $WorkBuddyHome 'skills\instagram-workbench'
$ConfigFile = Join-Path $WorkBuddyHome '.mcp.json'
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $Node) { throw '请先安装 Node.js 20 或更高版本。' }
$Major = [int]((& $Node -p "process.versions.node.split('.')[0]").Trim())
if ($Major -lt 20) { throw 'Node.js 版本过低，需要 20+。' }

$ServerSource = Join-Path $RepoRoot 'workbuddy\server.mjs'
$WidgetSource = Join-Path $RepoRoot 'workbuddy\widget.html'
$SkillSource = Join-Path $RepoRoot 'agents\instagram-workbench'
if (!(Test-Path $ServerSource) -or !(Test-Path $WidgetSource) -or !(Test-Path (Join-Path $SkillSource 'SKILL.md'))) {
  throw '安装包不完整。源码安装请先运行 npm install 和 npm run build。'
}

Write-Host "WorkBuddy 目录：$WorkBuddyHome"
Write-Host "Instagram 工作台：$AppRoot"
if ($DryRun) { Write-Host '预检通过；未修改任何文件。'; exit 0 }

New-Item -ItemType Directory -Force -Path (Split-Path $AppRoot), (Split-Path $SkillRoot) | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (Test-Path $AppRoot) { Move-Item $AppRoot "$AppRoot.backup-$Stamp" }
if (Test-Path $SkillRoot) { Move-Item $SkillRoot "$SkillRoot.backup-$Stamp" }
New-Item -ItemType Directory -Force -Path $AppRoot | Out-Null
Copy-Item $ServerSource, $WidgetSource -Destination $AppRoot
Copy-Item $SkillSource -Destination $SkillRoot -Recurse

if (Test-Path $ConfigFile) {
  $BackupFile = "$ConfigFile.instagram-workbench-backup-$Stamp"
  Copy-Item $ConfigFile $BackupFile
  Write-Host "MCP 配置 backup：$BackupFile"
  $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
} else {
  New-Item -ItemType Directory -Force -Path $WorkBuddyHome | Out-Null
  $Config = [pscustomobject]@{ mcpServers = [pscustomobject]@{} }
}
if ($null -eq $Config.mcpServers) {
  $Config | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) -Force
}
$ServerEntry = [pscustomobject]@{
  command = $Node
  args = @((Join-Path $AppRoot 'server.mjs'))
  env = [pscustomobject]@{ WORKBUDDY_INSTAGRAM_WORKBENCH = '1' }
}
$Config.mcpServers | Add-Member -NotePropertyName 'instagram-workbench' -NotePropertyValue $ServerEntry -Force
$Config | ConvertTo-Json -Depth 20 | Set-Content $ConfigFile -Encoding utf8
& $Node --check (Join-Path $AppRoot 'server.mjs')

Write-Host ''
Write-Host '安装完成。请保存 WorkBuddy 中正在编辑的内容，然后完全退出并重新打开。'
Write-Host '重新打开后输入：打开 Instagram 下载工作台'
Write-Host '安装器只复制应用和 Skill，不读取、复制或上传 Instagram session/Cookie 文件。'
