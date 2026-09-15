import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SUPPORTED_TARGETS,
  appendTaskHistory,
  createDefaultRequest,
  requestRequiresLogin,
  sanitizeTaskSummary,
} from '../src/workbuddy/ui-contract.js'


test('default request mirrors the Python bridge defaults', () => {
  const request = createDefaultRequest()
  assert.deepEqual(request.targets, [{ type: 'profile', value: '' }])
  assert.equal(request.content.profilePic, true)
  assert.equal(request.content.posts, true)
  assert.equal(request.content.stories, false)
  assert.equal(request.content.captions, true)
  assert.equal(request.content.metadataJson, true)
  assert.equal(request.output.dirnamePattern, '{target}')
  assert.equal(request.output.filenamePattern, '{date_utc}_UTC')
  assert.equal(request.output.sanitizePaths, true)
  assert.equal(request.output.resume, true)
  assert.deepEqual(request.auth, {
    mode: 'anonymous',
    username: null,
    sessionFile: null,
    browser: null,
    cookieFile: null,
  })
})


test('visual target list stays focused on the six v1 target types', () => {
  assert.deepEqual(SUPPORTED_TARGETS.map(target => target.value), [
    'profile', 'hashtag', 'shortcode', 'feed', 'stories', 'saved',
  ])
})


test('requestRequiresLogin detects target and content requirements', () => {
  const publicRequest = createDefaultRequest()
  publicRequest.targets[0].value = 'instagram'
  assert.equal(requestRequiresLogin(publicRequest), false)

  for (const type of ['feed', 'stories', 'saved']) {
    const request = createDefaultRequest()
    request.targets = [{ type, value: `:${type}` }]
    assert.equal(requestRequiresLogin(request), true)
  }

  for (const key of ['stories', 'highlights', 'comments', 'geotags']) {
    const request = createDefaultRequest()
    request.content[key] = true
    assert.equal(requestRequiresLogin(request), true)
  }
})


test('sanitizeTaskSummary never persists auth paths or arbitrary secret material', () => {
  const summary = sanitizeTaskSummary({
    jobId: 'job-1',
    status: 'completed',
    authMode: 'session',
    sessionFile: '/private/session',
    cookieFile: '/private/cookies',
    cookie: 'raw-cookie',
    outputDirectory: '/downloads',
    targets: [{ type: 'profile', value: 'instagram' }],
  })
  assert.deepEqual(summary, {
    jobId: 'job-1',
    status: 'completed',
    authMode: 'session',
    outputDirectory: '/downloads',
    targets: [{ type: 'profile', value: 'instagram' }],
    createdAt: null,
    completedAt: null,
    targetsCompleted: null,
    targetsFailed: null,
    downloaded: null,
    skipped: null,
  })
  assert.doesNotMatch(JSON.stringify(summary), /sessionFile|cookieFile|raw-cookie/)
})


test('appendTaskHistory keeps newest first and limits history to 50 records', () => {
  let history = []
  for (let index = 0; index < 55; index += 1) {
    history = appendTaskHistory(history, { jobId: `job-${index}`, status: 'completed' })
  }
  assert.equal(history.length, 50)
  assert.equal(history[0].jobId, 'job-54')
  assert.equal(history.at(-1).jobId, 'job-5')
})
