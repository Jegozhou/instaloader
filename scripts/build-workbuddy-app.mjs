import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')
const workbuddyDirectory = join(root, 'workbuddy')

function outputByExtension(files, extension) {
  return files.find(file => file.path.endsWith(extension))?.text || ''
}

export async function buildWorkBuddyApp() {
  await mkdir(workbuddyDirectory, { recursive: true })

  const widgetBuild = await build({
    entryPoints: [join(root, 'src/workbuddy/widget.jsx')],
    bundle: true,
    minify: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120', 'safari17'],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: { '.js': 'jsx', '.jsx': 'jsx' },
  })

  const widgetJavaScript = outputByExtension(widgetBuild.outputFiles, '.js')
  const widgetCss = outputByExtension(widgetBuild.outputFiles, '.css')
  if (!widgetJavaScript) throw new Error('Widget build did not produce JavaScript output.')

  const widgetHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instagram 下载工作台</title>
<style>${widgetCss}</style>
</head>
<body>
<div id="root"></div>
<script>${widgetJavaScript}</script>
</body>
</html>
`
  await writeFile(join(workbuddyDirectory, 'widget.html'), widgetHtml, 'utf8')

  await build({
    entryPoints: [join(root, 'src/workbuddy/server.mjs')],
    outfile: join(workbuddyDirectory, 'server.mjs'),
    bundle: true,
    minify: true,
    platform: 'node',
    format: 'esm',
    target: ['node20'],
    packages: 'bundle',
  })

  return {
    server: join(workbuddyDirectory, 'server.mjs'),
    widget: join(workbuddyDirectory, 'widget.html'),
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : null
if (invoked === fileURLToPath(import.meta.url)) {
  const result = await buildWorkBuddyApp()
  console.log(`Built ${result.server}`)
  console.log(`Built ${result.widget}`)
}
