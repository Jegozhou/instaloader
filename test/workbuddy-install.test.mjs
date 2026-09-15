import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'


async function installerSources() {
  return Promise.all([
    readFile(new URL('../scripts/install-workbuddy-app.sh', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/install-workbuddy-app.ps1', import.meta.url), 'utf8'),
  ])
}


test('installers configure the app-local Python bridge runtime', async () => {
  const sources = await installerSources()
  for (const source of sources) {
    assert.match(source, /INSTALOADER_PYTHON/)
    assert.match(source, /INSTALOADER_WORKBENCH_CWD/)
    assert.match(source, /browser_cookie3/i)
    assert.match(source, /workbuddy[\\/]python|python[\\/]instaloader/i)
  }
})


test('installers preserve the no-secret-copy boundary', async () => {
  const sources = await installerSources()
  for (const source of sources) {
    assert.doesNotMatch(source, /copy[^\n]*(session|cookies?)/i)
    assert.doesNotMatch(source, /cp[^\n]*(session|cookies?)/i)
  }
})
