import { SUPPORTED_TARGETS } from '../ui-contract.js'

export function SettingsPanel({ settings, onChange, onClearHistory }) {
  return <div class="page-stack">
    <section class="page-header"><div><span class="eyebrow">SETTINGS</span><h1>设置</h1><p>这里只保存工作台偏好；敏感会话内容不会写入浏览器存储。</p></div></section>
    <section class="form-section">
      <div class="form-grid two">
        <label>
          <span>默认目标类型</span>
          <select value={settings.defaultTargetType} onChange={event => onChange({ defaultTargetType: event.currentTarget.value })}>
            {SUPPORTED_TARGETS.map(target => <option key={target.value} value={target.value}>{target.label}</option>)}
          </select>
        </label>
        <div />
        <label class="check-line">
          <input type="checkbox" checked={settings.rememberOutputPath} onChange={event => onChange({ rememberOutputPath: event.currentTarget.checked })} />
          <span><strong>记住输出目录</strong><small>关闭时不会持久化下载目录</small></span>
        </label>
        <label class="check-line">
          <input type="checkbox" checked={settings.rememberAuthPaths} onChange={event => onChange({ rememberAuthPaths: event.currentTarget.checked })} />
          <span><strong>记住身份文件路径</strong><small>只保存路径，不保存 Cookie/session 内容</small></span>
        </label>
      </div>
    </section>
    <section class="notice-card">
      <strong>本机与权限</strong>
      <p>Widget 不直接访问 Instagram；所有网络请求由本机 Python Instaloader 执行。工作台资源不依赖远程 CDN。</p>
    </section>
    <section class="danger-zone">
      <div><strong>清除本机任务历史</strong><p>删除 Widget localStorage 中的安全摘要，不会删除已下载文件。</p></div>
      <button type="button" class="danger-button" onClick={onClearHistory}>清除</button>
    </section>
  </div>
}
