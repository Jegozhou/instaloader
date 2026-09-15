import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDirectory, '..')
const distDirectory = join(root, 'dist')
const releaseDirectory = join(distDirectory, 'workbuddy-instagram-workbench')

async function copyPath(source, target) {
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true })
}

export async function packageWorkBuddyRelease() {
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const requiredArtifacts = [
    join(root, 'workbuddy', 'server.mjs'),
    join(root, 'workbuddy', 'widget.html'),
    join(root, 'workbuddy', 'python', 'instaloader', 'workbench_bridge.py'),
  ]
  for (const artifact of requiredArtifacts) {
    try {
      await readFile(artifact)
    } catch {
      throw new Error(`Missing WorkBuddy build artifact: ${artifact}. Run npm run build first.`)
    }
  }

  await rm(releaseDirectory, { recursive: true, force: true })
  await mkdir(releaseDirectory, { recursive: true })

  const copies = [
    ['workbuddy', 'workbuddy'],
    ['agents/instagram-workbench', 'agents/instagram-workbench'],
    ['.codebuddy-plugin', '.codebuddy-plugin'],
    ['.mcp.json', '.mcp.json'],
    ['scripts/install-workbuddy-app.sh', 'scripts/install-workbuddy-app.sh'],
    ['scripts/install-workbuddy-app.ps1', 'scripts/install-workbuddy-app.ps1'],
    ['scripts/uninstall-workbuddy-app.sh', 'scripts/uninstall-workbuddy-app.sh'],
    ['scripts/uninstall-workbuddy-app.ps1', 'scripts/uninstall-workbuddy-app.ps1'],
    ['docs/INSTALL_WORKBUDDY.md', 'docs/INSTALL_WORKBUDDY.md'],
    ['docs/WORKBUDDY_WORKBENCH.md', 'docs/WORKBUDDY_WORKBENCH.md'],
    ['LICENSE', 'LICENSE'],
    ['README.rst', 'README.rst'],
  ]
  for (const [source, target] of copies) {
    await copyPath(join(root, source), join(releaseDirectory, target))
  }

  const manifest = {
    name: packageJson.name,
    version: packageJson.version,
    format: 1,
    entrypoint: 'workbuddy/server.mjs',
    installer: {
      posix: 'scripts/install-workbuddy-app.sh',
      windows: 'scripts/install-workbuddy-app.ps1',
    },
    uninstaller: {
      posix: 'scripts/uninstall-workbuddy-app.sh',
      windows: 'scripts/uninstall-workbuddy-app.ps1',
    },
    credentialPolicy: 'local-session-or-browser-cookie-only',
  }
  await writeFile(
    join(releaseDirectory, 'release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )

  return { releaseDirectory, manifest }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : null
if (invoked === fileURLToPath(import.meta.url)) {
  const { releaseDirectory: output, manifest } = await packageWorkBuddyRelease()
  console.log(`Packaged ${manifest.name}@${manifest.version} at ${output}`)
}
