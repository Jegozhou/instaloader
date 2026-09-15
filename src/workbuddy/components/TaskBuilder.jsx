import { AccountPanel } from './AccountPanel.jsx'
import { CONTENT_OPTIONS, SUPPORTED_TARGETS, requestRequiresLogin } from '../ui-contract.js'

const LOGIN_CONTENT = new Set(['stories', 'highlights', 'comments', 'geotags'])
const SPECIAL_TARGETS = new Set(['feed', 'stories', 'saved'])

function targetValueFor(type) {
  return SPECIAL_TARGETS.has(type) ? `:${type}` : ''
}

export function TaskBuilder({
  request,
  validation,
  accountStatus,
  busy,
  onChange,
  onValidate,
  onRun,
  onVerifyAccount,
}) {
  const patchSection = (section, patch) => onChange({ ...request, [section]: { ...request[section], ...patch } })
  const requiresLogin = requestRequiresLogin(request)
  const blocked = requiresLogin && request.auth.mode === 'anonymous'
  const missingTarget = request.targets.some(target => !target.value)

  const updateTarget = (index, patch) => {
    const targets = request.targets.map((target, targetIndex) => targetIndex === index ? { ...target, ...patch } : target)
    onChange({ ...request, targets })
  }

  const changeTargetType = (index, type) => updateTarget(index, { type, value: targetValueFor(type) })

  const addTarget = () => onChange({
    ...request,
    targets: [...request.targets, { type: 'profile', value: '' }],
  })

  const removeTarget = index => {
    if (request.targets.length === 1) return
    onChange({ ...request, targets: request.targets.filter((_target, targetIndex) => targetIndex !== index) })
  }

  return <div class="page-stack">
    <section class="page-header">
      <div>
        <span class="eyebrow">NEW DOWNLOAD</span>
        <h1>新建下载</h1>
        <p>按目标、内容、筛选、保存和身份五个维度定义一次 Instaloader 任务。</p>
      </div>
      <div class={`validation-badge ${validation?.ok ? 'success' : validation?.error ? 'danger' : ''}`}>
        {validation?.ok ? '配置已验证' : validation?.error ? '需要修正' : '尚未验证'}
      </div>
    </section>

    <section class="form-section">
      <div class="form-section-title"><div><span class="step-index">01</span><h3>目标</h3></div></div>
      <div class="target-list">
        {request.targets.map((target, index) => {
          const descriptor = SUPPORTED_TARGETS.find(item => item.value === target.type)
          return <div class="target-row" key={`${index}-${target.type}`}>
            <select value={target.type} onChange={event => changeTargetType(index, event.currentTarget.value)}>
              {SUPPORTED_TARGETS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
            <input
              value={target.value}
              disabled={SPECIAL_TARGETS.has(target.type)}
              placeholder={descriptor?.placeholder || 'target'}
              onInput={event => updateTarget(index, { value: event.currentTarget.value })}
            />
            <button type="button" class="icon-button" disabled={request.targets.length === 1} onClick={() => removeTarget(index)}>×</button>
          </div>
        })}
      </div>
      <button type="button" class="text-button" onClick={addTarget}>＋ 添加目标</button>
    </section>

    <section class="form-section">
      <div class="form-section-title"><div><span class="step-index">02</span><h3>内容</h3></div></div>
      <div class="toggle-grid">
        {CONTENT_OPTIONS.map(([key, label]) => <label class="toggle-card" key={key}>
          <input
            type="checkbox"
            checked={Boolean(request.content[key])}
            onChange={event => patchSection('content', { [key]: event.currentTarget.checked })}
          />
          <span>
            <strong>{label}</strong>
            {LOGIN_CONTENT.has(key) && <small>需要登录</small>}
          </span>
        </label>)}
      </div>
    </section>

    <section class="form-section">
      <div class="form-section-title"><div><span class="step-index">03</span><h3>筛选</h3></div></div>
      <div class="form-grid two">
        <label class="check-line">
          <input type="checkbox" checked={request.filters.fastUpdate} onChange={event => patchSection('filters', { fastUpdate: event.currentTarget.checked })} />
          <span><strong>Fast Update</strong><small>遇到首个已下载项目后停止</small></span>
        </label>
        <label>
          <span>最大数量 <em>可选</em></span>
          <input type="number" min="1" value={request.filters.maxCount ?? ''} onInput={event => patchSection('filters', { maxCount: event.currentTarget.value ? Number(event.currentTarget.value) : null })} />
        </label>
        <label>
          <span>Post Filter <em>可选</em></span>
          <input value={request.filters.postFilter || ''} onInput={event => patchSection('filters', { postFilter: event.currentTarget.value || null })} placeholder="例如：is_video" />
        </label>
        <label>
          <span>Story Filter <em>可选</em></span>
          <input value={request.filters.storyItemFilter || ''} onInput={event => patchSection('filters', { storyItemFilter: event.currentTarget.value || null })} />
        </label>
        <label class="span-two">
          <span>Latest Stamps 文件 <em>可选</em></span>
          <input value={request.filters.latestStampsFile || ''} onInput={event => patchSection('filters', { latestStampsFile: event.currentTarget.value || null })} placeholder="本机路径" />
        </label>
      </div>
    </section>

    <section class="form-section">
      <div class="form-section-title"><div><span class="step-index">04</span><h3>保存</h3></div></div>
      <div class="form-grid two">
        <label class="span-two">
          <span>输出目录 <em>可选</em></span>
          <input value={request.output.directory || ''} onInput={event => patchSection('output', { directory: event.currentTarget.value || null })} placeholder="留空使用当前工作目录" />
        </label>
        <label>
          <span>目录命名</span>
          <input value={request.output.dirnamePattern} onInput={event => patchSection('output', { dirnamePattern: event.currentTarget.value })} />
        </label>
        <label>
          <span>文件命名</span>
          <input value={request.output.filenamePattern} onInput={event => patchSection('output', { filenamePattern: event.currentTarget.value })} />
        </label>
        <label class="check-line">
          <input type="checkbox" checked={request.output.sanitizePaths} onChange={event => patchSection('output', { sanitizePaths: event.currentTarget.checked })} />
          <span><strong>清理路径字符</strong><small>兼容 Windows 与 Unix</small></span>
        </label>
        <label class="check-line">
          <input type="checkbox" checked={request.output.resume} onChange={event => patchSection('output', { resume: event.currentTarget.checked })} />
          <span><strong>允许断点续传</strong><small>保留 Instaloader resume 行为</small></span>
        </label>
      </div>
    </section>

    <AccountPanel
      auth={request.auth}
      accountStatus={accountStatus}
      busy={busy}
      onChange={auth => patchSection('auth', auth)}
      onVerify={onVerifyAccount}
    />

    <section class="confirm-card">
      <div>
        <span class="eyebrow">06 · CONFIRM</span>
        <h3>确认并执行</h3>
        {blocked && <p class="error-copy">当前任务包含需要登录的内容，请切换到 Session 文件或浏览器 Cookie。</p>}
        {validation?.error && <p class="error-copy">{validation.error}</p>}
        {validation?.ok && <p class="success-copy">{validation.message || '配置验证通过。'}</p>}
      </div>
      <div class="confirm-actions">
        <button type="button" class="secondary-button" disabled={busy || missingTarget} onClick={onValidate}>验证配置</button>
        <button type="button" class="primary-button" disabled={busy || missingTarget || blocked} onClick={onRun}>
          {busy ? '执行中…' : '开始下载'}
        </button>
      </div>
      <details>
        <summary>查看结构化请求</summary>
        <pre>{JSON.stringify(request, null, 2)}</pre>
      </details>
    </section>
  </div>
}
