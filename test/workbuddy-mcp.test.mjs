import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { PassThrough, Writable } from 'node:stream'
import test from 'node:test'

import { runBridge, redactSecrets } from '../src/workbuddy/bridge-runner.mjs'
import { APP_MIME, APP_URI, TOOL_NAMES } from '../src/workbuddy/contract.mjs'
import { createServer } from '../src/workbuddy/server.mjs'


function fakeSpawn({ stdout = '', stderr = '', code = 0 }) {
  return () => {
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.stdin = new Writable({ write(_chunk, _encoding, callback) { callback() } })
    process.nextTick(() => {
      child.stdout.end(stdout)
      child.stderr.end(stderr)
      child.emit('close', code)
    })
    return child
  }
}


function abortableSpawn() {
  let killed = false
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new Writable({ write(_chunk, _encoding, callback) { callback() } })
  child.kill = () => {
    killed = true
    child.emit('close', null)
    return true
  }
  return { child, wasKilled: () => killed }
}


test('MCP contract uses the WorkBuddy app resource and four tools', () => {
  assert.equal(APP_URI, 'ui://instagram-workbench/dashboard')
  assert.equal(APP_MIME, 'text/html;profile=mcp-app')
  assert.deepEqual(TOOL_NAMES, [
    'show_instagram_workbench',
    'instagram_validate_request',
    'instagram_account_status',
    'instagram_start_download',
  ])
})


test('MCP SDK accepts all WorkBuddy tool and resource registrations', () => {
  const server = createServer({
    widgetHtml: '<!doctype html><div id="root"></div>',
    runBridge: async () => ({
      events: [{ event: 'completed', jobId: 'test', data: { ok: true } }],
      final: { event: 'completed', jobId: 'test', data: { ok: true } },
    }),
  })
  assert.equal(typeof server.connect, 'function')
})


test('runBridge parses JSONL and keeps the terminal event', async () => {
  const result = await runBridge(
    { command: 'validate', request: { targets: [{ type: 'profile', value: 'instagram' }] } },
    {
      spawnImpl: fakeSpawn({
        stdout: [
          JSON.stringify({ event: 'progress', jobId: '1', data: { stage: '准备任务' } }),
          JSON.stringify({ event: 'completed', jobId: '1', data: { ok: true } }),
          '',
        ].join('\n'),
      }),
    },
  )
  assert.equal(result.final.event, 'completed')
  assert.equal(result.final.data.ok, true)
  assert.equal(result.events.length, 2)
})


test('runBridge forwards isolated cwd and environment to the Python child', async () => {
  let invocation
  const spawnImpl = (command, args, options) => {
    invocation = { command, args, options }
    return fakeSpawn({
      stdout: `${JSON.stringify({ event: 'completed', jobId: '1', data: { ok: true } })}\n`,
    })()
  }

  await runBridge(
    { command: 'validate', request: {} },
    {
      python: '/custom/python',
      cwd: '/tmp/workbench-output',
      env: { PYTHONPATH: '/tmp/workbench-python', WORKBENCH_TEST: '1' },
      spawnImpl,
    },
  )

  assert.equal(invocation.command, '/custom/python')
  assert.deepEqual(invocation.args, ['-m', 'instaloader.workbench_bridge'])
  assert.equal(invocation.options.cwd, '/tmp/workbench-output')
  assert.equal(invocation.options.env.PYTHONPATH, '/tmp/workbench-python')
  assert.equal(invocation.options.env.WORKBENCH_TEST, '1')
  assert.equal(invocation.options.stdio[0], 'pipe')
})


test('runBridge bounds event history while retaining final event', async () => {
  const result = await runBridge(
    { command: 'download', request: {} },
    {
      maxEvents: 2,
      spawnImpl: fakeSpawn({
        stdout: [
          JSON.stringify({ event: 'log', jobId: '1', data: { message: 'one' } }),
          JSON.stringify({ event: 'log', jobId: '1', data: { message: 'two' } }),
          JSON.stringify({ event: 'completed', jobId: '1', data: { ok: true } }),
          '',
        ].join('\n'),
      }),
    },
  )
  assert.equal(result.events.length, 2)
  assert.equal(result.events[0].data.message, 'two')
  assert.equal(result.final.event, 'completed')
})


test('malformed child output becomes a safe INTERNAL_ERROR', async () => {
  const result = await runBridge(
    { command: 'validate', request: {} },
    { spawnImpl: fakeSpawn({ stdout: 'not-json\n', stderr: 'child diagnostic' }) },
  )
  assert.equal(result.final.event, 'failed')
  assert.equal(result.final.data.code, 'INTERNAL_ERROR')
  assert.match(result.final.data.message, /invalid structured output/i)
  assert.doesNotMatch(JSON.stringify(result), /child diagnostic/)
})


test('runBridge kills the Python child when the MCP request is aborted', async () => {
  const controller = new AbortController()
  const spawned = abortableSpawn()
  const resultPromise = runBridge(
    { command: 'download', request: {} },
    { signal: controller.signal, spawnImpl: () => spawned.child },
  )
  controller.abort()
  const result = await resultPromise
  assert.equal(spawned.wasKilled(), true)
  assert.equal(result.final.event, 'failed')
})


test('redactSecrets removes secret fields recursively but preserves local path fields', () => {
  const redacted = redactSecrets({
    auth: {
      password: 'secret',
      cookie: 'secret-cookie',
      sessionContents: 'secret-session',
      sessionFile: '/tmp/session-user',
      cookieFile: '/tmp/Cookies',
    },
  })
  assert.equal(redacted.auth.password, '[REDACTED]')
  assert.equal(redacted.auth.cookie, '[REDACTED]')
  assert.equal(redacted.auth.sessionContents, '[REDACTED]')
  assert.equal(redacted.auth.sessionFile, '/tmp/session-user')
  assert.equal(redacted.auth.cookieFile, '/tmp/Cookies')
})


test('server source registers the WorkBuddy tools without a password schema or external CSP', () => {
  const source = readFileSync(new URL('../src/workbuddy/server.mjs', import.meta.url), 'utf8')
  for (const name of TOOL_NAMES) assert.match(source, new RegExp(`['"]${name}['"]`))
  assert.doesNotMatch(source, /password/i)
  assert.match(source, /visibility:\s*\['app'\]/)
  assert.match(source, /resourceDomains:\s*\[\]/)
  assert.match(source, /connectDomains:\s*\[\]/)
})
