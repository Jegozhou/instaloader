import { spawn } from 'node:child_process'

const DEFAULT_MAX_EVENTS = 200
const DEFAULT_MAX_STDERR = 8192
const TERMINAL_EVENTS = new Set(['completed', 'failed'])

function isSecretKey(key) {
  const normalized = String(key).toLowerCase()
  if (normalized.endsWith('file') || normalized.endsWith('path')) return false
  return normalized.includes('password')
    || normalized === 'cookie'
    || normalized === 'cookies'
    || normalized.startsWith('cookiecontents')
    || normalized === 'session'
    || normalized.startsWith('sessioncontents')
    || normalized.startsWith('sessiondata')
    || normalized.startsWith('sessiontoken')
}

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    isSecretKey(key) ? '[REDACTED]' : redactSecrets(nested),
  ]))
}

function internalFailure(message) {
  return {
    event: 'failed',
    jobId: null,
    timestamp: new Date().toISOString(),
    data: { code: 'INTERNAL_ERROR', message },
  }
}

function validEvent(event) {
  return Boolean(
    event
    && typeof event === 'object'
    && typeof event.event === 'string'
    && event.data
    && typeof event.data === 'object',
  )
}

export function runBridge(command, options = {}) {
  const python = options.python
    || process.env.INSTALOADER_PYTHON
    || (process.platform === 'win32' ? 'python' : 'python3')
  const cwd = options.cwd || process.cwd()
  const env = { ...process.env, ...(options.env || {}) }
  const spawnImpl = options.spawnImpl || spawn
  const maxEvents = Math.max(1, Number(options.maxEvents || DEFAULT_MAX_EVENTS))
  const maxStderr = Math.max(0, Number(options.maxStderr || DEFAULT_MAX_STDERR))

  return new Promise((resolve) => {
    let child
    try {
      child = spawnImpl(
        python,
        ['-m', 'instaloader.workbench_bridge'],
        { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] },
      )
    } catch {
      const final = internalFailure('Unable to start the local Instaloader bridge.')
      resolve({ events: [final], final })
      return
    }

    const events = []
    let final = null
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let malformed = false
    let settled = false

    const pushEvent = (event) => {
      const safeEvent = redactSecrets(event)
      events.push(safeEvent)
      if (events.length > maxEvents) events.splice(0, events.length - maxEvents)
      if (TERMINAL_EVENTS.has(safeEvent.event)) final = safeEvent
    }

    const parseLine = (line) => {
      const trimmed = line.trim()
      if (!trimmed || malformed) return
      try {
        const event = JSON.parse(trimmed)
        if (!validEvent(event)) throw new Error('Invalid bridge event')
        pushEvent(event)
      } catch {
        malformed = true
      }
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8')
      let newline
      while ((newline = stdoutBuffer.indexOf('\n')) >= 0) {
        parseLine(stdoutBuffer.slice(0, newline))
        stdoutBuffer = stdoutBuffer.slice(newline + 1)
      }
    })

    child.stderr.on('data', (chunk) => {
      if (stderrBuffer.length >= maxStderr) return
      stderrBuffer = (stderrBuffer + chunk.toString('utf8')).slice(0, maxStderr)
    })

    const finish = (code) => {
      if (settled) return
      settled = true
      if (stdoutBuffer.trim()) parseLine(stdoutBuffer)
      if (malformed) {
        final = internalFailure('The local Instaloader bridge returned invalid structured output.')
        pushEvent(final)
      } else if (!final) {
        final = internalFailure(
          code === 0
            ? 'The local Instaloader bridge ended without a completion event.'
            : 'The local Instaloader bridge exited before reporting a result.',
        )
        pushEvent(final)
      }
      resolve({ events, final })
    }

    child.on('error', () => finish(-1))
    child.on('close', finish)

    const abort = () => {
      if (!settled) child.kill()
    }
    if (options.signal) {
      if (options.signal.aborted) {
        abort()
      } else {
        options.signal.addEventListener('abort', abort, { once: true })
      }
    }

    try {
      child.stdin.end(JSON.stringify(redactSecrets(command)))
    } catch {
      finish(-1)
    }
  })
}
