#!/usr/bin/env node
/**
 * Issues an Honour India API key.
 *
 *   npm run issue-key -- --name "Acme Widget"
 *
 * Prints the plaintext key ONCE and stores only its sha-256 hash in
 * data/keys.json. The hash is safe to commit; the plaintext is not stored
 * anywhere. Restart the server after issuing keys (the index loads at boot).
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const KEY_FILE = path.join(ROOT, 'data/keys.json')

const nameArgIdx = process.argv.indexOf('--name')
const name = nameArgIdx !== -1 ? process.argv[nameArgIdx + 1]?.trim() : undefined
if (!name) {
  console.error('Usage: npm run issue-key -- --name "Site or app name"')
  process.exit(1)
}

const raw = `hi_${randomBytes(24).toString('base64url')}`
const hash = createHash('sha256').update(raw, 'utf8').digest('hex')

const file = existsSync(KEY_FILE)
  ? JSON.parse(readFileSync(KEY_FILE, 'utf8'))
  : {
      $comment:
        'API keys, stored as sha-256 hashes only — safe to commit. Issue with: npm run issue-key -- --name "Name". Plaintext is shown once at issuance and never stored.',
      keys: [],
    }

const id = `k_${file.keys.length + 1}_${randomBytes(2).toString('hex')}`
file.keys.push({
  id,
  name,
  hash,
  createdAt: new Date().toISOString(),
  enabled: true,
})

writeFileSync(KEY_FILE, JSON.stringify(file, null, 2) + '\n')

console.log(`\n  API key issued for: ${name}`)
console.log(`  key id: ${id}`)
console.log('\n  ' + raw)
console.log('\n  Shown once — store it now. Only the sha-256 hash was saved to data/keys.json.')
console.log('  Restart the server to pick up the new key. Usage:\n')
console.log(`    curl -H "Authorization: Bearer ${raw}" http://localhost:3000/api/v1/whoami\n`)
