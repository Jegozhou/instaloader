import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { runBridge } from './bridge-runner.mjs'
import { APP_MIME, APP_URI } from './contract.mjs'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(currentDirectory, '..')
const APP_ONLY_META = { ui: { resourceUri: APP_URI, visibility: ['app'] } }

const AuthShape = {
  mode: z.enum(['anonymous', 'session', 'browser']).default('anonymous'),
  username: z.string().nullable().optional(),
  sessionFile: z.string().nullable().optional(),
  browser: z.string().nullable().optional(),
  cookieFile: z.string().nullable().optional(),
}

const DownloadRequestShape = {
  targets: z.array(z.object({
    type: z.enum(['profile', 'hashtag', 'shortcode', 'feed', 'stories', 'saved']),
    value: z.string(),
  })).min(1),
  content: z.object({
    profilePic: z.boolean().optional(),
    posts: z.boolean().optional(),
    stories: z.boolean().optional(),
    highlights: z.boolean().optional(),
    tagged: z.boolean().optional(),
    reels: z.boolean().optional(),
    igtv: z.boolean().optional(),
    comments: z.boolean().optional(),
    geotags: z.boolean().optional(),
    captions: z.boolean().optional(),
    metadataJson: z.boolean().optional(),
  }).optional(),
  filters: z.object({
    fastUpdate: z.boolean().optional(),
    latestStampsFile: z.string().nullable().optional(),
    maxCount: z.number().int().positive().nullable().optional(),
    postFilter: z.string().nullable().optional(),
    storyItemFilter: z.string().nullable().optional(),
  }).optional(),
  output: z.object({
    directory: z.string().nullable().optional(),
    dirnamePattern: z.string().optional(),
    filenamePattern: z.string().optional(),
    sanitizePaths: z.boolean().optional(),
    resume: z.boolean().optional(),
  }).optional(),
  auth: z.object(AuthShape).optional(),
}

function toolResult(result, successText) {
  const failed = result.final?.event === 'failed'
  const message = failed ? result.final?.data?.message || 'Operation failed.' : successText
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: {
      ...result.final?.data,
      event: result.final?.event,
      jobId: result.final?.jobId,
      events: result.events,
    },
    isError: failed,
  }
}

export function createServer(options = {}) {
  const widgetHtml = options.widgetHtml
    || readFileSync(options.widgetPath || join(currentDirectory, 'widget.html'), 'utf8')
  const run = options.runBridge || ((command) => runBridge(command, { cwd: pluginRoot }))
  const server = new McpServer({ name: 'workbuddy-instagram-workbench', version: '1.0.0' })

  server.registerTool('show_instagram_workbench', {
    title: '打开 Instagram 下载工作台',
    description: '打开本机运行的 Instaloader 图形工作台，用于配置下载目标、身份模式、筛选条件和保存方式。',
    inputSchema: {},
    _meta: { ui: { resourceUri: APP_URI } },
  }, async () => ({
    content: [{
      type: 'text',
      text: 'Instagram 下载工作台已打开。终端客户端会显示本段文字，支持 MCP Apps 的客户端会显示完整界面。',
    }],
    structuredContent: {
      version: '1.0.0',
      mode: 'interactive-widget',
      capabilities: ['anonymous', 'session-file', 'browser-cookie', 'downloads'],
    },
    _meta: { ui: { resourceUri: APP_URI } },
  }))

  server.registerTool('instagram_validate_request', {
    title: '验证 Instagram 下载任务',
    description: '在不开始下载的情况下验证工作台任务配置。',
    inputSchema: DownloadRequestShape,
    _meta: APP_ONLY_META,
  }, async (request) => toolResult(
    await run({ command: 'validate', request }),
    '下载任务配置有效。',
  ))

  server.registerTool('instagram_account_status', {
    title: '验证 Instagram 身份状态',
    description: '验证匿名、Instaloader session 文件或浏览器 Cookie 登录状态，只返回安全的账号摘要。',
    inputSchema: AuthShape,
    _meta: APP_ONLY_META,
  }, async (auth) => toolResult(
    await run({ command: 'account_status', auth }),
    'Instagram 身份状态已验证。',
  ))

  server.registerTool('instagram_start_download', {
    title: '开始 Instagram 下载任务',
    description: '通过本机 Instaloader 引擎执行已经确认的下载任务。',
    inputSchema: DownloadRequestShape,
    _meta: APP_ONLY_META,
  }, async (request) => toolResult(
    await run({ command: 'download', request }),
    'Instagram 下载任务已完成。',
  ))

  const resourceMeta = {
    ui: {
      prefersBorder: false,
      permissions: {},
      csp: { resourceDomains: [], connectDomains: [] },
    },
  }

  server.registerResource('instagram-workbench-dashboard', APP_URI, {
    title: 'Instagram 下载工作台',
    description: '本机运行的 Instaloader 交互式 WorkBuddy 工作台',
    mimeType: APP_MIME,
    _meta: resourceMeta,
  }, async () => ({
    contents: [{
      uri: APP_URI,
      text: widgetHtml,
      mimeType: APP_MIME,
      _meta: resourceMeta,
    }],
  }))

  return server
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await createServer().connect(new StdioServerTransport())
}
