param([switch]$DryRun)
$ErrorActionPreference = 'Stop'

$WorkBuddyHome = if ($env:WORKBUDDY_HOME) { $env:WORKBUDDY_HOME } else { Join-Path $env:USERPROFILE '.workbuddy' }
$AppRoot = Join-Path $WorkBuddyHome 'apps\instagram-workbench'
$SkillRoot = Join-Path $WorkBuddyHome 'skills\instagram-workbench'
$ConfigFile = Join-Path $WorkBuddyHome '.mcp.json'
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue

Write-Host "将移除 WorkBuddy 应用：$AppRoot"
Write-Host "将移除 WorkBuddy Skill：$SkillRoot"
Write-Host '将从 MCP 配置移除：instagram-workbench'
Write-Host '不会删除下载目录、session/Cookie 文件或安装器创建的历史备份。'
if ($DryRun) { Write-Host '预检通过；未修改任何文件。'; exit 0 }

if (Test-Path $AppRoot) { Remove-Item $AppRoot -Recurse -Force }
if (Test-Path $SkillRoot) { Remove-Item $SkillRoot -Recurse -Force }

if (Test-Path $ConfigFile) {
  if (-not $NodeCommand) { throw "需要 Node.js 来安全更新 $ConfigFile" }
  $Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $BackupFile = "$ConfigFile.instagram-workbench-uninstall-backup-$Stamp"
  Copy-Item $ConfigFile $BackupFile
  $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
  if ($null -ne $Config.mcpServers) {
    $Config.mcpServers.PSObject.Properties.Remove('instagram-workbench')
  }
  $Config | ConvertTo-Json -Depth 20 | Set-Content $ConfigFile -Encoding utf8
  Write-Host "MCP 配置 backup：$BackupFile"
}

Write-Host 'Instagram 下载工作台已卸载。下载文件与本地登录材料未被删除。'
