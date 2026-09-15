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


test('build pipeline produces local WorkBuddy artifacts', () => {
  const build = text('scripts/build-workbuddy-app.mjs')
  assert.match(build, /workbuddy\/widget\.html/)
  assert.match(build, /workbuddy\/server\.mjs/)
  assert.match(build, /bundle:\s*true/)
  assert.match(build, /minify:\s*true/)
})


test('installers merge only the named MCP entry and do not copy auth material', () => {
  for (const path of ['scripts/install-workbuddy-app.sh', 'scripts/install-workbuddy-app.ps1']) {
    const source = text(path)
    assert.match(source, /instagram-workbench/)
    assert.match(source, /backup/i)
    assert.match(source, /server\.mjs/)
    assert.match(source, /widget\.html/)
    assert.doesNotMatch(source, /cp .*session|Copy-Item .*session/i)
    assert.doesNotMatch(source, /cp .*cookie|Copy-Item .*cookie/i)
  }
})


test('built widget is self-contained when build artifacts exist', () => {
  const widgetUrl = new URL('../workbuddy/widget.html', import.meta.url)
  if (!existsSync(widgetUrl)) return
  const widget = readFileSync(widgetUrl, 'utf8')
  assert.doesNotMatch(widget, /<script[^>]+src=/i)
  assert.doesNotMatch(widget, /<link[^>]+href=/i)
  assert.doesNotMatch(widget, /https?:\/\//i)
})
