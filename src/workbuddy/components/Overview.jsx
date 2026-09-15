const QUICK_ACTIONS = [
  { id: 'profile', title: '下载主页', detail: '主页帖子、头像与元数据' },
  { id: 'reels', title: '下载 Reels', detail: '聚焦指定主页的 Reels' },
  { id: 'stories', title: '下载 Stories', detail: '需要已验证登录状态' },
  { id: 'shortcode', title: '下载单条帖子', detail: '使用 Instagram shortcode' },
]

export function Overview({ account, latestTask, onQuickStart }) {
  return <div class="page-stack">
    <section class="hero-card">
      <div>
        <span class="eyebrow">INSTALOADER · LOCAL MCP APP</span>
        <h1>Instagram 下载工作台</h1>
        <p>把 Instaloader 的下载目标、身份、筛选和保存规则组织成可复核的本机任务。</p>
      </div>
      <div class={`status-pill ${account?.authenticated ? 'success' : 'neutral'}`}>
        <span class="status-dot" />
        {account?.authenticated ? `已登录 · ${account.username}` : '匿名模式'}
      </div>
    </section>

    <section class="metric-grid">
      <article class="metric-card">
        <span>身份模式</span>
        <strong>{account?.authMode === 'browser' ? '浏览器 Cookie' : account?.authMode === 'session' ? 'Session 文件' : '匿名'}</strong>
        <small>凭据只由本机 Python 层使用</small>
      </article>
      <article class="metric-card">
        <span>最近任务</span>
        <strong>{latestTask?.status || '暂无'}</strong>
        <small>{latestTask?.targets?.map(item => item.value).filter(Boolean).join('、') || '创建第一个下载任务'}</small>
      </article>
      <article class="metric-card">
        <span>执行方式</span>
        <strong>本机 Instaloader</strong>
        <small>无远程队列 · 无遥测 · 无 CDN</small>
      </article>
    </section>

    <section>
      <div class="section-heading">
        <div>
          <span class="eyebrow">QUICK START</span>
          <h2>快速开始</h2>
        </div>
      </div>
      <div class="quick-grid">
        {QUICK_ACTIONS.map(action => <button class="quick-card" key={action.id} onClick={() => onQuickStart(action.id)}>
          <span class="quick-arrow">↗</span>
          <strong>{action.title}</strong>
          <small>{action.detail}</small>
        </button>)}
      </div>
    </section>

    <section class="notice-card">
      <strong>安全边界</strong>
      <p>工作台不要求也不保存 Instagram 密码。需要私密内容时，请复用 Instaloader session 文件或本机浏览器 Cookie。</p>
    </section>
  </div>
}
