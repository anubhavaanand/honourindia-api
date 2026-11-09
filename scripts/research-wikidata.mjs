#!/usr/bin/env node
/**
 * Bulk research script: queries the Wikidata SPARQL endpoint for Indian
 * scientists, mathematicians, engineers, physicians and great minds across all
 * of Indian history, and writes candidate records to data/wikidata-candidates.json.
 *
 * This is the enabler for scaling the catalogue from 137 → 1,000 → 3,000 figures.
 *
 * Usage: node scripts/research-wikidata.mjs   (or npm run research:wikidata)
 * Requires: network access to https://query.wikidata.org/sparql
 */

import { createWriteStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_FILE = path.join(ROOT, 'data', 'wikidata-candidates.json')
const ENDPOINT = 'https://query.wikidata.org/sparql'

const UA = 'HonourIndia-research/1.0 (billboard project honouring Indian scientists; contact via repository)'

const PAGE_LIMIT = 1000
const MAX_PAGES = 5 // ~5,000 rows; enough for the 3,000 figure target after filtering
const PAGE_DELAY_MS = 1000

const SPARQL_TEMPLATE = `
SELECT ?person ?personLabel ?birth ?death ?sitelink ?commonsFile ?description (GROUP_CONCAT(DISTINCT ?occupationLabel; separator=" · ") AS ?fields)
WHERE {
  ?person wdt:P31 wd:Q5 .
  {
    ?person wdt:P27 wd:Q668 .          # country of citizenship = India
  } UNION {
    ?person wdt:P19 ?placeOfBirth .    # place of birth in India
    ?placeOfBirth wdt:P17 wd:Q668 .
  }
  ?person wdt:P106 ?occupation .       # occupation
  VALUES ?occupation {
    wd:Q169470   # scientist
    wd:Q159902   # mathematician
    wd:Q169475   # physicist
    wd:Q169469   # chemist
    wd:Q165091   # biologist
    wd:Q169482   # physician
    wd:Q42973    # engineer
    wd:Q42964    # astronomer
    wd:Q169484   # biochemist
    wd:Q169480   # meteorologist
    wd:Q169481   # geologist
    wd:Q169485   # botanist
    wd:Q169483   # zoologist
    wd:Q169486   # geneticist
    wd:Q169487   # anatomist
    wd:Q169488   # pathologist
    wd:Q169489   # epidemiologist
    wd:Q169490   # immunologist
    wd:Q169491   # neuroscientist
    wd:Q169492   # psychologist
    wd:Q169493   # sociologist
    wd:Q169494   # anthropologist
    wd:Q169495   # archaeologist
    wd:Q169496   # historian
    wd:Q169497   # economist
    wd:Q169498   # statistician
  }
  OPTIONAL { ?person wdt:P569 ?birth . }
  OPTIONAL { ?person wdt:P570 ?death . }
  OPTIONAL { ?person wdt:P18 ?commonsFile . }               # Wikimedia Commons file (portrait)
  OPTIONAL {
    ?enwiki schema:about ?person .                          # enwiki sitelink → page title
    ?enwiki schema:isPartOf <https://en.wikipedia.org/> .
    BIND(REPLACE(STR(?enwiki), "^https://en.wikipedia.org/wiki/", "") AS ?sitelink)
  }
  OPTIONAL { ?person schema:description ?description . FILTER(LANG(?description) = 'en') }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?person ?personLabel ?birth ?death ?sitelink ?commonsFile ?description
ORDER BY ?birth
LIMIT __LIMIT__ OFFSET __OFFSET__
`

function sparqlPage(offset) {
  return SPARQL_TEMPLATE.replace('__LIMIT__', String(PAGE_LIMIT)).replace('__OFFSET__', String(offset))
}

function binding(b, key) {
  return b[key] ? b[key].value : null
}

function wikidataId(uri) {
  return uri ? String(uri).split('/').pop() : null
}

function yearOf(value) {
  if (!value) return null
  const m = String(value).match(/^\+?(\d{4})/)
  return m ? parseInt(m[1], 10) : null
}

async function fetchWithRetry(query, tries = 7) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
        },
        body: `query=${encodeURIComponent(query)}`,
      })
      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after')
        const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000 * (i + 1)
        console.log(`  …rate limited (429), waiting ${wait / 1000}s`)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      return await res.json()
    } catch (err) {
      lastErr = err
      if (i === tries - 1) throw err
      const wait = 3000 * (i + 1)
      console.log(`  …retrying in ${wait / 1000}s (${err.message})`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr
}

async function main() {
  const all = new Map()
  let offset = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    console.log(`Fetching page ${page + 1} (OFFSET ${offset}, LIMIT ${PAGE_LIMIT})...`)
    const json = await fetchWithRetry(sparqlPage(offset))
    const bindings = json?.results?.bindings ?? []
    if (bindings.length === 0) break

    for (const b of bindings) {
      const id = wikidataId(binding(b, 'person'))
      if (!id || all.has(id)) continue
      all.set(id, {
        wikidataId: id,
        name: binding(b, 'personLabel'),
        born: yearOf(binding(b, 'birth')),
        died: yearOf(binding(b, 'death')),
        field: binding(b, 'fields'),
        wiki: binding(b, 'sitelink') ? decodeURIComponent(binding(b, 'sitelink').replace(/_/g, ' ')) : null,
        commonsFile: binding(b, 'commonsFile'),
        description: binding(b, 'description'),
      })
    }

    console.log(`  ${bindings.length} bindings (${all.size} unique people so far)`)
    if (bindings.length < PAGE_LIMIT) break
    offset += PAGE_LIMIT
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS))
  }

  const candidates = Array.from(all.values()).sort((a, b) => {
    if (a.born === null && b.born === null) return 0
    if (a.born === null) return 1
    if (b.born === null) return 1
    return a.born - b.born
  })

  await new Promise((resolve, reject) => {
    const stream = createWriteStream(OUT_FILE)
    stream.write(JSON.stringify(candidates, null, 2) + '\n')
    stream.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  console.log(`\nWrote ${candidates.length} candidates to ${OUT_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
