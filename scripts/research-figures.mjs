import { createWriteStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ENDPOINT = 'https://query.wikidata.org/sparql'
const OUTPUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'wikidata-figures.json')

const SPARQL = `
SELECT ?person ?personLabel ?birth ?death ?occupation ?occupationLabel ?sitelink ?commonsFile ?description
WHERE {
  ?person wdt:P31 wd:Q5 .
  {
    ?person wdt:P27 wd:Q668 .
  } UNION {
    ?person wdt:P19 ?placeOfBirth .
    ?placeOfBirth wdt:P17 wd:Q668 .
  }
  ?person wdt:P106 ?occupation .
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
  OPTIONAL { ?person wdt:P18 ?commonsFile . }
  OPTIONAL { ?person wdt:P703 ?sitelink . }
  OPTIONAL { ?person schema:description ?description . FILTER(LANG(?description) = 'en') }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?birth
LIMIT 1500
`

async function main() {
  const headers = {
    Accept: 'application/sparql-results+json',
    'User-Agent': 'HonourIndia/1.0 (https://github.com/honourindia; research script) Node.js',
  }

  let response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: `query=${encodeURIComponent(SPARQL)}`,
    })
  } catch (err) {
    console.error('ERROR: Could not reach Wikidata SPARQL endpoint. Is network access available?', err)
    process.exit(1)
  }

  if (!response.ok) {
    console.error('ERROR: SPARQL request failed:', response.status, response.statusText)
    process.exit(1)
  }

  const json = await response.json()
  const bindings = json.results.bindings

  const figures = bindings.map((b) => {
    const get = (key) => (b[key] || {}).value
    const born = get('birth') ? new Date(get('birth')).getFullYear() : null
    const died = get('death') ? new Date(get('death')).getFullYear() : null
    const wiki = get('sitelink') ? get('sitelink').replace('https://en.wikipedia.org/wiki/', '').replace(/_/g, ' ') : get('personLabel')
    return {
      name: get('personLabel'),
      born,
      died,
      field: get('occupationLabel') || null,
      wiki,
      commonsFile: get('commonsFile') || null,
      description: get('description') || null,
    }
  })

  const stream = createWriteStream(OUTPUT)
  stream.write(JSON.stringify(figures, null, 2))
  stream.end()
  console.log(`Wrote ${figures.length} figures to ${OUTPUT}`)
}

main()
