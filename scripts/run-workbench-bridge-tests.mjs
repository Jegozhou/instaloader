import { spawnSync } from 'node:child_process'

const candidates = process.env.INSTALOADER_PYTHON
  ? [[process.env.INSTALOADER_PYTHON, []]]
  : process.platform === 'win32'
    ? [['py', ['-3']], ['python', []]]
    : [['python3', []], ['python', []]]

const python = candidates.find(([command, prefix]) => {
  const result = spawnSync(command, [...prefix, '--version'], { stdio: 'ignore' })
  return !result.error && result.status === 0
})

if (!python) {
  console.error('Python 3.9+ is required to run the WorkBuddy bridge tests.')
  process.exit(1)
}

const [command, prefix] = python
const result = spawnSync(command, [
  ...prefix,
  '-m', 'unittest', 'discover', '-s', 'test', '-p', 'test_workbench_bridge*.py', '-v',
], { stdio: 'inherit' })
process.exit(result.status ?? 1)
