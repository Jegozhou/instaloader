export function TaskCenter({ history, onClear }) {
  return <div class="page-stack">
    <section class="page-header">
      <div><span class="eyebrow">TASK CENTER</span><h1>任务中心</h1><p>仅保留最近 50 条安全摘要；不会保存 Cookie、session 内容或账号密码。</p></div>
      <button type="button" class="secondary-button" disabled={!history.length} onClick={onClear}>清空历史</button>
    </section>
    <section class="table-card">
      {!history.length ? <div class="empty-state">还没有任务记录。</div> : <div class="task-table">
        {history.map((item, index) => <article class="task-row" key={item.jobId || index}>
          <div>
            <strong>{item.targets?.map(target => target.value || target.type).join('、') || '未命名任务'}</strong>
            <small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '时间未记录'}</small>
          </div>
          <span class={`task-status ${item.status}`}>{item.status}</span>
          <span>{item.authMode}</span>
          <span>{item.targetsCompleted ?? '—'} / {item.targetsFailed ?? 0}</span>
          <span class="path-cell">{item.outputDirectory || '默认目录'}</span>
        </article>)}
      </div>}
    </section>
  </div>
}
