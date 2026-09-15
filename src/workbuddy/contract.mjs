export const APP_URI = 'ui://instagram-workbench/dashboard'
export const APP_MIME = 'text/html;profile=mcp-app'

export const TOOL_NAMES = Object.freeze([
  'show_instagram_workbench',
  'instagram_validate_request',
  'instagram_account_status',
  'instagram_start_download',
])

export const TARGET_TYPES = Object.freeze([
  'profile',
  'hashtag',
  'shortcode',
  'feed',
  'stories',
  'saved',
])

export const AUTH_MODES = Object.freeze([
  'anonymous',
  'session',
  'browser',
])

export const LOGIN_REQUIRED_TARGETS = new Set(['hashtag', 'feed', 'stories', 'saved'])
export const LOGIN_REQUIRED_CONTENT = new Set(['stories', 'highlights', 'comments', 'geotags'])
