param([switch]$DryRun)
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$WorkBuddyHome = if ($env:WORKBUDDY_HOME) { $env:WORKBUDDY_HOME } else { Join-Path $env:USERPROFILE '.workbuddy' }
$AppRoot = Join-Path $WorkBuddyHome 'apps\instagram-workbench'
$SkillRoot = Join-Path $WorkBuddyHome 'skills\instagram-workbench'
$ConfigFile = Join-Path $WorkBuddyHome '.mcp.json'
$OutputRoot = if ($env:INSTALOADER_WORKBENCH_CWD) { $env:INSTALOADER_WORKBENCH_CWD } else { Join-Path $env:USERPROFILE 'Downloads\Instaloader' }
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
$PythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCommand) { $PythonCommand = Get-Command py -ErrorAction SilentlyContinue }

if (-not $NodeCommand) { throw '请先安装 Node.js 20 或更高版本。' }
$Node = $NodeCommand.Source
$Major = [int]((& $Node -p "process.versions.node.split('.')[0]").Trim())
if ($Major -lt 20) { throw 'Node.js 版本过低，需要 20+。' }
if (-not $PythonCommand) { throw '请先安装 Python 3.9 或更高版本。' }
$Python = $PythonCommand.Source
$PythonOk = (& $Python -c "import sys; print(1 if sys.version_info >= (3, 9) else 0)").Trim()
if ($PythonOk -ne '1') { throw 'Python 版本过低，需要 3.9+。' }

$ServerSource = Join-Path $RepoRoot 'workbuddy\server.mjs'
$WidgetSource = Join-Path $RepoRoot 'workbuddy\widget.html'
$BridgeSource = Join-Path $RepoRoot 'workbuddy\python\instaloader\workbench_bridge.py'
$SkillSource = Join-Path $RepoRoot 'agents\instagram-workbench'
if (!(Test-Path $ServerSource) -or !(Test-Path $WidgetSource) -or !(Test-Path $BridgeSource) -or !(Test-Path (Join-Path $SkillSource 'SKILL.md'))) {
  throw '安装包不完整。源码安装请先运行 npm install 和 npm run build。'
}

Write-Host "WorkBuddy 目录：$WorkBuddyHome"
Write-Host "Instagram 工作台：$AppRoot"
Write-Host "Python：$Python"
Write-Host "默认下载目录：$OutputRoot"
if ($DryRun) { Write-Host '预检通过；未修改任何文件。'; exit 0 }

New-Item -ItemType Directory -Force -Path (Split-Path $AppRoot), (Split-Path $SkillRoot), $OutputRoot | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (Test-Path $AppRoot) { Move-Item $AppRoot "$AppRoot.backup-$Stamp" }
if (Test-Path $SkillRoot) { Move-Item $SkillRoot "$SkillRoot.backup-$Stamp" }
New-Item -ItemType Directory -Force -Path $AppRoot | Out-Null
Copy-Item (Join-Path $RepoRoot 'workbuddy\*') -Destination $AppRoot -Recurse -Force
Copy-Item $SkillSource -Destination $SkillRoot -Recurse

& $Python -m pip --version *> $null
if ($LASTEXITCODE -ne 0) { throw '当前 Python 缺少 pip，无法安装 WorkBuddy 的本机 Python 依赖。' }
& $Python -m pip install --disable-pip-version-check --no-input --upgrade --target (Join-Path $AppRoot 'python') 'requests>=2.25' 'browser_cookie3>=0.19.1'
if ($LASTEXITCODE -ne 0) { throw '安装 WorkBuddy Python 依赖失败。' }
$OldPythonPath = $env:PYTHONPATH
try {
  $env:PYTHONPATH = Join-Path $AppRoot 'python'
  & $Python -c 'import instaloader.workbench_bridge'
  if ($LASTEXITCODE -ne 0) { throw 'WorkBuddy Python Bridge 自检失败。' }
} finally {
  $env:PYTHONPATH = $OldPythonPath
}

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
  env = [pscustomobject]@{
    WORKBUDDY_INSTAGRAM_WORKBENCH = '1'
    INSTALOADER_PYTHON = $Python
    INSTALOADER_WORKBENCH_CWD = $OutputRoot
  }
}
$Config.mcpServers | Add-Member -NotePropertyName 'instagram-workbench' -NotePropertyValue $ServerEntry -Force
$Config | ConvertTo-Json -Depth 20 | Set-Content $ConfigFile -Encoding utf8
& $Node --check (Join-Path $AppRoot 'server.mjs')
if ($LASTEXITCODE -ne 0) { throw 'WorkBuddy MCP Server 语法自检失败。' }

Write-Host ''
Write-Host '安装完成。请保存 WorkBuddy 中正在编辑的内容，然后完全退出并重新打开。'
Write-Host '重新打开后输入：打开 Instagram 下载工作台'
Write-Host "默认下载目录：$OutputRoot"
Write-Host '安装器不会读取或上传 Instagram session/Cookie 内容；这些文件仅在你选择对应登录方式时由本机 Bridge 访问。'
