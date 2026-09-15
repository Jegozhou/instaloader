import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { App } from '@modelcontextprotocol/ext-apps'

import { WorkbenchApp } from './app.jsx'
import './styles.css'

function WorkBuddyBootstrap() {
  const clientRef = useRef(null)
  const [client, setClient] = useState(null)
  const [status, setStatus] = useState('正在连接 WorkBuddy…')

  useEffect(() => {
    if (window.parent === window) {
      setStatus('独立预览模式 · 本机操作需要在 WorkBuddy 中执行')
      return undefined
    }

    const app = new App(
      { name: 'workbuddy-instagram-workbench', version: '1.0.0' },
      {},
      { autoResize: true },
    )
    let disposed = false

    app.onhostcontextchanged = context => {
      if (context?.theme) document.documentElement.dataset.hostTheme = context.theme
    }
    app.ontoolresult = result => {
      if (result?.structuredContent?.version) setStatus(`已连接 WorkBuddy · v${result.structuredContent.version}`)
    }

    void app.connect().then(async () => {
      if (disposed) return
      clientRef.current = app
      setClient(app)
      document.documentElement.dataset.hostTheme = app.getHostContext()?.theme || 'light'
      setStatus('已连接 WorkBuddy · 本机 Instaloader 就绪')
      try {
        await app.requestDisplayMode({ mode: 'fullscreen' })
      } catch {
        // Hosts that do not offer fullscreen can continue inline.
      }
    }).catch(() => {
      if (!disposed) setStatus('Widget 已打开，但 MCP 连接失败；请重新加载 WorkBuddy 会话')
    })

    return () => {
      disposed = true
      clientRef.current = null
      setClient(null)
    }
  }, [])

  return <WorkbenchApp client={client} connectionStatus={status} />
}

render(<WorkBuddyBootstrap />, document.getElementById('root'))
