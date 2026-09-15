export function AccountPanel({ auth, accountStatus, busy, onChange, onVerify }) {
  const update = patch => onChange({ ...auth, ...patch })

  return <section class="form-section">
    <div class="form-section-title">
      <div>
        <span class="step-index">05</span>
        <h3>身份</h3>
      </div>
      <span class={`mini-status ${accountStatus?.authenticated ? 'success' : ''}`}>
        {accountStatus?.authenticated ? `已验证 ${accountStatus.username}` : '未验证'}
      </span>
    </div>

    <div class="segmented">
      {[
        ['anonymous', '匿名'],
        ['session', 'Session 文件'],
        ['browser', '浏览器 Cookie'],
      ].map(([mode, label]) => <button
        type="button"
        key={mode}
        class={auth.mode === mode ? 'active' : ''}
        onClick={() => update({ mode })}
      >{label}</button>)}
    </div>

    {auth.mode === 'anonymous' && <p class="field-hint">适合公开主页、Hashtag 和单条公开帖子。需要账号范围的内容会在执行前被拦截。</p>}

    {auth.mode === 'session' && <div class="form-grid two">
      <label>
        <span>Instagram 用户名</span>
        <input value={auth.username || ''} onInput={event => update({ username: event.currentTarget.value || null })} placeholder="your_username" />
      </label>
      <label>
        <span>Session 文件路径 <em>可选</em></span>
        <input value={auth.sessionFile || ''} onInput={event => update({ sessionFile: event.currentTarget.value || null })} placeholder="留空则使用 Instaloader 默认路径" />
      </label>
    </div>}

    {auth.mode === 'browser' && <div class="form-grid two">
      <label>
        <span>浏览器名称</span>
        <input value={auth.browser || ''} onInput={event => update({ browser: event.currentTarget.value || null })} placeholder="firefox / chrome / safari" />
      </label>
      <label>
        <span>Cookie 数据库路径 <em>可选</em></span>
        <input value={auth.cookieFile || ''} onInput={event => update({ cookieFile: event.currentTarget.value || null })} placeholder="留空则尝试浏览器默认位置" />
      </label>
    </div>}

    <div class="inline-actions">
      <button type="button" class="secondary-button" disabled={busy || auth.mode === 'anonymous'} onClick={onVerify}>
        {busy ? '验证中…' : '验证身份'}
      </button>
      <span class="field-hint">{accountStatus?.message || '身份信息不会写入任务历史。'}</span>
    </div>
  </section>
}
