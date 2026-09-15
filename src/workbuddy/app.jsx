import { useEffect, useMemo, useState } from 'preact/hooks'

import { Overview } from './components/Overview.jsx'
import { ResultsPanel } from './components/ResultsPanel.jsx'
import { SettingsPanel } from './components/SettingsPanel.jsx'
import { TaskBuilder } from './components/TaskBuilder.jsx'
import { TaskCenter } from './components/TaskCenter.jsx'
import {
  DEFAULT_SETTINGS,
  appendTaskHistory,
  createDefaultRequest,
  loadJsonStorage,
  safeSettings,
  saveJsonStorage,
} from './ui-contract.js'

const HISTORY_KEY = 'workbuddy.instagram.history.v1'
const SETTINGS_KEY = 'workbuddy.instagram.settings.v1'
const OUTPUT_PATH_KEY = 'workbuddy.instagram.output-path.v1'
const AUTH_PATHS_KEY = 'workbuddy.instagram.auth-paths.v1'

const NAV_ITEMS = [
  ['overview', '总览', '⌂'],
  ['new', '新建下载', '＋'],
  ['tasks', '任务中心', '≡'],
  ['results', '下载结果', '✓'],
  ['settings', '设置', '⚙'],
]

function initialState() {
  if (typeof window === 'undefined') {
    return { settings: { ...DEFAULT_SETTINGS }, history: [], request: createDefaultRequest() }
  }
  const settings = safeSettings(loadJsonStorage(window.localStorage, SETTINGS_KEY, DEFAULT_SETTINGS))
  const history = loadJsonStorage(window.localStorage, HISTORY_KEY, [])
  const request = createDefaultRequest(settings.defaultTargetType)

  if (settings.rememberOutputPath) {
    request.output.directory = window.localStorage.getItem(OUTPUT_PATH_KEY) || null
  }
  if (settings.rememberAuthPaths) {
    const stored = loadJsonStorage(window.localStorage, AUTH_PATHS_KEY, {})
    request.auth = {
      ...request.auth,
      mode: stored.mode || request.auth.mode,
      username: stored.username || null,
      sessionFile: stored.sessionFile || null,
      browser: stored.browser || null,
      cookieFile: stored.cookieFile || null,
    }
  }
  return { settings, history: Array.isArray(history) ? history.slice(0, 50) : [], request }
}

function readToolData(result) {
  const data = result?.structuredContent || {}
  if (result?.isError || data.event === 'failed') {
    const error = new Error(data.message || result?.content?.[0]?.text || 'WorkBuddy 工具调用失败。')
    error.data = data
    throw error
  }
  return data
}

export function WorkbenchApp({ client, connectionStatus }) {
  const initial = useMemo(initialState, [])
  const [view, setView] = useState('overview')
  const [settings, setSettings] = useState(initial.settings)
  const [history, setHistory] = useState(initial.history)
  const [request, setRequest] = useState(initial.request)
  const [accountStatus, setAccountStatus] = useState({
    authenticated: false,
    username: null,
    authMode: 'anonymous',
    message: '匿名模式',
  })
  const [validation, setValidation] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(connectionStatus || '正在连接 WorkBuddy…')

  useEffect(() => setStatus(connectionStatus || '工作台已就绪'), [connectionStatus])

  useEffect(() => {
    if (typeof window === 'undefined') return
    saveJsonStorage(window.localStorage, SETTINGS_KEY, safeSettings(settings))
  }, [settings])

  useEffect(() => {
    if (typeof window === 'undefined') return
    saveJsonStorage(window.localStorage, HISTORY_KEY, history)
  }, [history])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (settings.rememberOutputPath && request.output.directory) {
      window.localStorage.setItem(OUTPUT_PATH_KEY, request.output.directory)
    } else if (!settings.rememberOutputPath) {
      window.localStorage.removeItem(OUTPUT_PATH_KEY)
    }

    if (settings.rememberAuthPaths) {
      saveJsonStorage(window.localStorage, AUTH_PATHS_KEY, {
        mode: request.auth.mode,
        username: request.auth.username,
        sessionFile: request.auth.sessionFile,
        browser: request.auth.browser,
        cookieFile: request.auth.cookieFile,
      })
    } else {
      window.localStorage.removeItem(AUTH_PATHS_KEY)
    }
  }, [request.output.directory, request.auth, settings.rememberOutputPath, settings.rememberAuthPaths])

  const callTool = async (name, args) => {
    if (!client) throw new Error('当前处于独立预览模式；请在 WorkBuddy 中打开工作台后执行本机操作。')
    return client.callServerTool({ name, arguments: args })
  }

  const verifyAccount = async () => {
    if (request.auth.mode === 'anonymous') {
      setAccountStatus({ authenticated: false, username: null, authMode: 'anonymous', message: '匿名模式' })
      return
    }
    setBusy(true)
    setStatus('正在验证本机身份状态…')
    try {
      const data = readToolData(await callTool('instagram_account_status', request.auth))
      setAccountStatus({
        authenticated: Boolean(data.authenticated),
        username: data.username || null,
        authMode: data.authMode || request.auth.mode,
        message: data.message || '身份验证完成',
      })
      setStatus(data.message || '身份验证完成')
    } catch (error) {
      setAccountStatus({ authenticated: false, username: null, authMode: request.auth.mode, message: error.message })
      setStatus(error.message)
    } finally {
      setBusy(false)
    }
  }

  const validateRequest = async () => {
    setBusy(true)
    setValidation(null)
    setStatus('正在验证下载配置…')
    try {
      const data = readToolData(await callTool('instagram_validate_request', request))
      setValidation({ ok: true, message: '配置验证通过。', request: data.request })
      setStatus('配置验证通过')
    } catch (error) {
      setValidation({ ok: false, error: error.message })
      setStatus(error.message)
    } finally {
      setBusy(false)
    }
  }

  const runDownload = async () => {
    setBusy(true)
    setValidation(null)
    setStatus('下载任务执行中 · Instaloader 正在本机运行')
    const createdAt = new Date().toISOString()
    try {
      const data = readToolData(await callTool('instagram_start_download', request))
      const completedAt = new Date().toISOString()
      const nextResult = { ...data, message: '下载任务已完成。' }
      setResult(nextResult)
      setHistory(current => appendTaskHistory(current, {
        ...nextResult,
        status: 'completed',
        targets: request.targets,
        authMode: request.auth.mode,
        outputDirectory: data.outputDirectory || request.output.directory,
        createdAt,
        completedAt,
      }))
      setStatus('下载任务已完成')
      setView('results')
    } catch (error) {
      const completedAt = new Date().toISOString()
      const failure = { ...(error.data || {}), event: 'failed', status: 'failed', message: error.message }
      setResult(failure)
      setHistory(current => appendTaskHistory(current, {
        ...failure,
        status: 'failed',
        targets: request.targets,
        authMode: request.auth.mode,
        outputDirectory: request.output.directory,
        createdAt,
        completedAt,
      }))
      setStatus(error.message)
      setView('results')
    } finally {
      setBusy(false)
    }
  }

  const quickStart = type => {
    const next = createDefaultRequest('profile')
    if (type === 'shortcode') {
      next.targets = [{ type: 'shortcode', value: '' }]
    } else if (type === 'reels') {
      next.content.posts = false
      next.content.reels = true
    } else if (type === 'stories') {
      next.content.posts = false
      next.content.stories = true
    }
    if (settings.rememberOutputPath) next.output.directory = request.output.directory
    if (settings.rememberAuthPaths) next.auth = { ...request.auth }
    setRequest(next)
    setValidation(null)
    setView('new')
  }

  const updateSettings = patch => setSettings(current => safeSettings({ ...current, ...patch }))
  const clearHistory = () => {
    setHistory([])
    if (typeof window !== 'undefined') window.localStorage.removeItem(HISTORY_KEY)
    setStatus('本机任务历史已清除')
  }

  const latestTask = history[0] || null

  return <div class="workbench-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">IL</div>
        <div><strong>Instaloader</strong><small>WorkBuddy Workbench</small></div>
      </div>
      <nav>
        {NAV_ITEMS.map(([id, label, icon]) => <button
          type="button"
          key={id}
          class={view === id ? 'active' : ''}
          onClick={() => setView(id)}
        ><span>{icon}</span>{label}</button>)}
      </nav>
      <div class="sidebar-footer">
        <span class={`connection-dot ${client ? 'online' : ''}`} />
        <div><strong>{client ? 'MCP 已连接' : '预览模式'}</strong><small>本机执行 · v1.0.0</small></div>
      </div>
    </aside>

    <main class="main-column">
      <header class="topbar">
        <div class="breadcrumb">Instagram / {NAV_ITEMS.find(item => item[0] === view)?.[1]}</div>
        <div class="top-status">{busy && <span class="spinner" />}{status}</div>
      </header>
      <div class="content-scroll">
        {view === 'overview' && <Overview account={accountStatus} latestTask={latestTask} onQuickStart={quickStart} />}
        {view === 'new' && <TaskBuilder
          request={request}
          validation={validation}
          accountStatus={accountStatus}
          busy={busy}
          onChange={next => { setRequest(next); setValidation(null) }}
          onValidate={validateRequest}
          onRun={runDownload}
          onVerifyAccount={verifyAccount}
        />}
        {view === 'tasks' && <TaskCenter history={history} onClear={clearHistory} />}
        {view === 'results' && <ResultsPanel result={result} />}
        {view === 'settings' && <SettingsPanel settings={settings} onChange={updateSettings} onClearHistory={clearHistory} />}
      </div>
    </main>
  </div>
}
