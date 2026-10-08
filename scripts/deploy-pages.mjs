#!/usr/bin/env node
/**
 * Publishes dist-pages/ to the gh-pages branch (force push — the branch is a
 * disposable build artifact). Run scripts/build-pages.mjs first, or use:
 *   npm run deploy:pages
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'dist-pages')

if (!existsSync(path.join(OUT, 'index.html'))) {
  console.error('dist-pages/ not built — run `npm run build:pages` first.')
  process.exit(1)
}

const remote = execSync('git remote get-url origin', { cwd: ROOT, encoding: 'utf8' }).trim()
const sh = (cmd) => execSync(cmd, { cwd: OUT, stdio: 'inherit' })

sh('git init -b gh-pages')
try {
  sh(`git remote add origin ${remote}`)
} catch {
  sh(`git remote set-url origin ${remote}`)
}
sh('git add -A')
try {
  sh('git commit -m "publish: static GitHub Pages edition"')
} catch {
  console.log('nothing new to publish')
}
sh('git push -f origin gh-pages')
console.log('pushed gh-pages.')
