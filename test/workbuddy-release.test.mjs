import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

function text(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function json(path) {
  return JSON.parse(text(path))
}


test('plugin manifest and MCP config expose the Instagram workbench', () => {
  const manifest = json('.codebuddy-plugin/plugin.json')
  const mcp = json('.mcp.json')
  assert.equal(manifest.name, 'workbuddy-instagram-workbench')
  assert.deepEqual(manifest.skills, ['./agents/instagram-workbench'])
  assert.equal(manifest.mcpServers, './.mcp.json')
  assert.deepEqual(mcp.mcpServers['instagram-workbench'], {
    command: 'node',
    args: ['${CODEBUDDY_PLUGIN_ROOT}/workbuddy/server.mjs'],
  })
})


test('Skill launches the MCP App and states the no-password boundary', () => {
  const skill = text('agents/instagram-workbench/SKILL.md')
  assert.match(skill, /show_instagram_workbench/)
  assert.match(skill, /打开 Instagram 下载工作台/)
  assert.match(skill, /不要.*密码|不.*密码/)
  assert.match(skill, /session/i)
  assert.match(skill, /Cookie/i)
})


test('build pipeline produces local WorkBuddy artifacts and bundled Python source', () => {
  const build = text('scripts/build-workbuddy-app.mjs')
  assert.match(build, /widget\.html/)
  assert.match(build, /server\.mjs/)
  assert.match(build, /pythonPackageTarget/)
  assert.match(build, /workbench_bridge\.py/)
  assert.match(build, /bundle:\s*true/)
  assert.match(build, /minify:\s*true/)
  assert.match(build, /256\s*\*\s*1024/)
})


test('installers merge only the named MCP entry and do not copy auth material', () => {
  for (const path of ['scripts/install-workbuddy-app.sh', 'scripts/install-workbuddy-app.ps1']) {
    const source = text(path)
    assert.match(source, /instagram-workbench/)
    assert.match(source, /backup/i)
    assert.match(source, /server\.mjs/)
    assert.match(source, /widget\.html/)
    assert.match(source, /INSTALOADER_PYTHON/)
    assert.match(source, /INSTALOADER_WORKBENCH_CWD/)
    assert.doesNotMatch(source, /cp .*session|Copy-Item .*session/i)
    assert.doesNotMatch(source, /cp .*cookie|Copy-Item .*cookie/i)
  }
})


test('release packaging has a portable staging command and uninstallers', () => {
  const packageJson = json('package.json')
  assert.equal(packageJson.scripts['package:workbuddy'], 'node scripts/package-workbuddy-release.mjs')
  for (const path of [
    'scripts/package-workbuddy-release.mjs',
    'scripts/uninstall-workbuddy-app.sh',
    'scripts/uninstall-workbuddy-app.ps1',
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path} must exist`)
  }
})


test('WorkBuddy CI consumes the committed npm lockfile reproducibly', () => {
  assert.equal(existsSync(new URL('../package-lock.json', import.meta.url)), true, 'package-lock.json must be committed')
  for (const path of ['.github/workflows/workbuddy.yml', '.github/workflows/workbuddy-release.yml']) {
    const workflow = text(path)
    assert.match(workflow, /npm ci --no-audit --no-fund/)
    assert.doesNotMatch(workflow, /npm install --no-audit --no-fund/)
  }
})


test('the aggregate bridge test command selects an available Python 3 executable', () => {
  const packageJson = json('package.json')
  assert.equal(packageJson.scripts['test:bridge'], 'node scripts/run-workbench-bridge-tests.mjs')
  assert.equal(existsSync(new URL('../scripts/run-workbench-bridge-tests.mjs', import.meta.url)), true)
})


test('built widget has no remote script or stylesheet references when artifacts exist', () => {
  const widgetUrl = new URL('../workbuddy/widget.html', import.meta.url)
  if (!existsSync(widgetUrl)) return
  const widget = readFileSync(widgetUrl, 'utf8')
  assert.doesNotMatch(widget, /<script[^>]+src=/i)
  assert.doesNotMatch(widget, /<link[^>]+href=/i)
})
