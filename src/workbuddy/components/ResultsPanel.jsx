export function ResultsPanel({ result }) {
  if (!result) return <div class="page-stack">
    <section class="page-header"><div><span class="eyebrow">RESULTS</span><h1>下载结果</h1><p>完成任务后，这里会显示结构化结果和安全事件时间线。</p></div></section>
    <section class="empty-state large">暂无下载结果。</section>
  </div>

  const failed = result.event === 'failed'
  const events = Array.isArray(result.events) ? result.events : []

  return <div class="page-stack">
    <section class="page-header">
      <div><span class="eyebrow">RESULTS</span><h1>{failed ? '任务未完成' : '任务完成'}</h1><p>{failed ? result.message || result.code : `Job ${result.jobId || '—'}`}</p></div>
      <span class={`validation-badge ${failed ? 'danger' : 'success'}`}>{failed ? 'FAILED' : 'COMPLETED'}</span>
    </section>
    <section class="metric-grid">
      <article class="metric-card"><span>目标完成</span><strong>{result.targetsCompleted ?? '—'}</strong><small>失败 {result.targetsFailed ?? 0}</small></article>
      <article class="metric-card"><span>下载计数</span><strong>{result.downloaded ?? '未提供'}</strong><small>Instaloader 并非所有目标都暴露统一计数</small></article>
      <article class="metric-card"><span>输出目录</span><strong class="small-strong">{result.outputDirectory || '默认目录'}</strong><small>本机文件系统</small></article>
    </section>
    <section class="timeline-card">
      <div class="section-heading"><div><span class="eyebrow">EVENTS</span><h2>事件时间线</h2></div></div>
      {!events.length ? <div class="empty-state">没有可显示的事件。</div> : <div class="timeline">
        {events.map((event, index) => <div class="timeline-item" key={`${event.timestamp || ''}-${index}`}>
          <span class={`timeline-dot ${event.event}`} />
          <div>
            <strong>{event.data?.stage || event.data?.message || event.event}</strong>
            <small>{event.timestamp ? new Date(event.timestamp).toLocaleString() : ''}</small>
          </div>
          <code>{event.event}</code>
        </div>)}
      </div>}
    </section>
  </div>
}
