import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'

const MAX_WIDGET_BYTES = 256 * 1024


test('production WorkBuddy build is self-contained and within widget size limit', async () => {
  const widgetPath = new URL('../workbuddy/widget.html', import.meta.url)
  const serverPath = new URL('../workbuddy/server.mjs', import.meta.url)
  const bridgePath = new URL('../workbuddy/python/instaloader/workbench_bridge.py', import.meta.url)
  const [widget, server, bridge, widgetStat] = await Promise.all([
    readFile(widgetPath, 'utf8'),
    readFile(serverPath, 'utf8'),
    readFile(bridgePath, 'utf8'),
    stat(widgetPath),
  ])

  assert.match(widget, /<script>[\s\S]+<\/script>/)
  assert.doesNotMatch(widget, /<script[^>]+src=/i)
  assert.doesNotMatch(widget, /<link[^>]+href=/i)
  assert.ok(widgetStat.size <= MAX_WIDGET_BYTES, `widget.html is ${widgetStat.size} bytes`)

  assert.match(server, /ui:\/\/instagram-workbench\/dashboard/)
  assert.match(server, /text\/html;profile=mcp-app/)
  assert.match(bridge, /Structured JSONL bridge between WorkBuddy and the Instaloader Python API/)
})
