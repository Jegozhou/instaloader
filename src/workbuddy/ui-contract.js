const LOGIN_REQUIRED_TARGETS = new Set(['hashtag', 'feed', 'stories', 'saved'])
const LOGIN_REQUIRED_CONTENT = new Set(['stories', 'highlights', 'comments', 'geotags'])

export const SUPPORTED_TARGETS = Object.freeze([
  { value: 'profile', label: '主页', placeholder: 'username' },
  { value: 'hashtag', label: 'Hashtag', placeholder: '#hashtag' },
  { value: 'shortcode', label: '单条帖子', placeholder: 'shortcode' },
  { value: 'feed', label: '我的 Feed', placeholder: ':feed' },
  { value: 'stories', label: '关注 Stories', placeholder: ':stories' },
  { value: 'saved', label: '已保存帖子', placeholder: ':saved' },
])

export const CONTENT_OPTIONS = Object.freeze([
  ['profilePic', '头像'],
  ['posts', '帖子'],
  ['stories', 'Stories'],
  ['highlights', 'Highlights'],
  ['tagged', 'Tagged'],
  ['reels', 'Reels'],
  ['igtv', 'IGTV'],
  ['comments', '评论'],
  ['geotags', '地理位置'],
  ['captions', '文字说明'],
  ['metadataJson', 'JSON 元数据'],
])

export const DEFAULT_SETTINGS = Object.freeze({
  defaultTargetType: 'profile',
  rememberOutputPath: false,
  rememberAuthPaths: false,
})

export function createDefaultRequest(targetType = 'profile') {
  return {
    targets: [{ type: targetType, value: '' }],
    content: {
      profilePic: true,
      posts: true,
      stories: false,
      highlights: false,
      tagged: false,
      reels: false,
      igtv: false,
      comments: false,
      geotags: false,
      captions: true,
      metadataJson: true,
    },
    filters: {
      fastUpdate: false,
      latestStampsFile: null,
      maxCount: null,
      postFilter: null,
      storyItemFilter: null,
    },
    output: {
      directory: null,
      dirnamePattern: '{target}',
      filenamePattern: '{date_utc}_UTC',
      sanitizePaths: true,
      resume: true,
    },
    auth: {
      mode: 'anonymous',
      username: null,
      sessionFile: null,
      browser: null,
      cookieFile: null,
    },
  }
}

export function requestRequiresLogin(request) {
  const targets = Array.isArray(request?.targets) ? request.targets : []
  if (targets.some(target => LOGIN_REQUIRED_TARGETS.has(target?.type))) return true
  const content = request?.content || {}
  return [...LOGIN_REQUIRED_CONTENT].some(key => Boolean(content[key]))
}

export function sanitizeTaskSummary(record = {}) {
  const safeTargets = Array.isArray(record.targets)
    ? record.targets.map(target => ({ type: target?.type || '', value: target?.value || '' }))
    : []
  return {
    jobId: record.jobId || null,
    status: record.status || 'unknown',
    authMode: record.authMode || 'anonymous',
    outputDirectory: record.outputDirectory || null,
    targets: safeTargets,
    createdAt: record.createdAt || null,
    completedAt: record.completedAt || null,
    targetsCompleted: Number.isFinite(record.targetsCompleted) ? record.targetsCompleted : null,
    targetsFailed: Number.isFinite(record.targetsFailed) ? record.targetsFailed : null,
    downloaded: Number.isFinite(record.downloaded) ? record.downloaded : null,
    skipped: Number.isFinite(record.skipped) ? record.skipped : null,
  }
}

export function appendTaskHistory(history, record) {
  const safe = sanitizeTaskSummary(record)
  return [safe, ...(Array.isArray(history) ? history : [])].slice(0, 50)
}

export function loadJsonStorage(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function saveJsonStorage(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function safeSettings(value = {}) {
  return {
    defaultTargetType: SUPPORTED_TARGETS.some(target => target.value === value.defaultTargetType)
      ? value.defaultTargetType
      : DEFAULT_SETTINGS.defaultTargetType,
    rememberOutputPath: Boolean(value.rememberOutputPath),
    rememberAuthPaths: Boolean(value.rememberAuthPaths),
  }
}
