#!/usr/bin/env node
/**
 * One-time migration script: backfill era, enduring, and stillUsed fields
 * for all figures in data/figures.json that are missing them.
 *
 * Era classification:
 *   born ≤ 1200              → 'ancient'
 *   1201 ≤ born ≤ 1700       → 'medieval'
 *   1701 ≤ born ≤ 1920       → 'colonial'
 *   born > 1920 AND died set → 'modern'
 *   born > 1920 AND died null→ 'living'
 *
 * Closes #29
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataPath = join(__dirname, '..', 'data', 'figures.json')

// Curated stillUsed strings, keyed by slug
const STILL_USED = {
  // ── COLONIAL (born 1701–1920) ──────────────────────────────────────────
  'cv-raman': 'Raman spectroscopy and the Raman effect in molecular analysis',
  'srinivasa-ramanujan': "Ramanujan's partition identities, mock theta functions and number theory",
  'jagadish-chandra-bose': 'millimetre-wave radio techniques and plant biophysics instrumentation',
  'homi-bhabha': "Bhabha scattering theory and the foundation of India's nuclear programme",
  'satyendra-nath-bose':
    'Bose–Einstein statistics and the boson — basis of quantum optics and superfluidity',
  'meghnad-saha': 'Saha ionisation equation used in stellar astrophysics and plasma physics',
  'subrahmanyan-chandrasekhar':
    'Chandrasekhar limit and mathematical theory of black holes and white dwarfs',
  'vikram-sarabhai': "India's space programme and ISRO institutional framework",
  'anna-mani': 'solar radiation measurement standards and Indian meteorological instrumentation',
  'janaki-ammal': 'botanical chromosome research and Indian ethnobotany field surveys',
  'asima-chatterjee': 'vinca alkaloid cancer-drug research and anti-epileptic phytochemistry',
  'anandi-gopal-joshi': "pioneering women's entry into Western medical education in India",
  'kadambini-ganguly': "pioneering women's professional medical practice in colonial India",
  'yellapragada-subbarow': 'methotrexate chemotherapy and the biochemistry of ATP and folate',
  'birbal-sahni': 'palaeobotany of Indian fossil flora and Gondwana plant taxonomy',
  'p-c-mahalanobis': 'Mahalanobis distance and large-scale sample-survey methodology',
  'salim-ali': 'systematic field ornithology and the Handbook of the Birds of India and Pakistan',
  'm-visvesvaraya': 'precision automatic flood-gate engineering and dam design principles',
  'g-d-naidu': "radio and electrical inventions and India's indigenous electronics tradition",
  'raj-chandra-bose': 'combinatorial design theory and the Bose–Chowla theorem in coding theory',
  'p-c-ray': "mercurous nitrite synthesis and founding India's modern chemical industry",
  'satish-dhawan':
    "turbulent boundary-layer research and leadership of India's launch-vehicle programme",
  't-r-govindachari':
    'alkaloid natural-product chemistry and Indian traditional-medicine phytochemistry',
  'kamala-sohonie': 'enzyme biochemistry research and cytochrome-C studies in Indian science',
  'b-c-roy': 'public-health infrastructure and medical education policy in independent India',
  'brahm-prakash': "India's nuclear metallurgy and space-grade materials programme",
  'b-p-pal': "high-yielding wheat varieties that underpinned India's Green Revolution",
  'r-n-chopra': 'pharmacological research on Indian medicinal plants and drug standardisation',
  's-ramanathan':
    "atmospheric electricity measurement and India's meteorological research tradition",
  'a-r-krishnan': 'crystal optics and liquid-viscosity research methods',
  'k-s-krishnan': 'co-discovery of the Raman effect and magnetic susceptibility measurements',
  'p-l-dhingra': 'plant physiology and soil-crop interaction research in India',
  's-m-mukherjee': "applied industrial chemistry and India's pharmaceutical research foundations",
  'v-r-thadani': 'pharmaceutical research and drug-standardisation methodology',
  's-p-chatterjee': 'regional geography methodology and cartographic survey techniques',
  'n-r-sen': 'fluid-mechanics and cosmological-relativity research in India',
  'b-m-udgaonkar': "zoological taxonomy and India's faunal survey traditions",
  'g-k-anklesaria': 'geological survey of Kutch and Rajasthan mineral resources',
  's-bhagavantam': 'Raman-effect applications and crystal-acoustics research',
  'k-n-bahl': 'earthworm systematics and soil-biology taxonomy in India',
  'p-maheshwari': 'plant embryology and test-tube fertilisation techniques',
  'm-s-ramanathan': "India's numerical weather-forecasting and monsoon-prediction methods",
  'd-s-koothan': "nuclear-physics education and India's atomic-energy policy advocacy",
  'b-d-nagchaudhuri': 'nuclear physics and cosmic-ray research in India',

  // ── MODERN (born > 1920, died set) ───────────────────────────────────
  'apj-abdul-kalam':
    "India's AGNI and PRITHVI missile systems and the PURA rural-development vision",
  'm-s-swaminathan': 'high-yielding rice and wheat varieties that powered the Green Revolution',
  'verghese-kurien': 'the cooperative dairy model of Operation Flood and Amul',
  'g-n-ramachandran': 'Ramachandran plot — the universal tool for protein-structure validation',
  'shakuntala-devi': 'mental-arithmetic techniques and mathematical puzzle pedagogy',
  'kalpana-chawla': "India's spaceflight heritage and women in aerospace inspiration",
  'e-c-george-sudarshan': 'quantum Zeno effect, optical coherence theory and V–A weak interaction',
  'roddam-narasimha': "laminar-to-turbulent transition theory and India's aerospace fluid dynamics",
  'bikash-sinha': "quark–gluon plasma research and India's particle-physics infrastructure",
  'u-r-rao': "India's INSAT satellite-communication programme",
  'harish-chandra':
    'harmonic analysis on semisimple Lie groups — foundational to modern representation theory',
  'm-s-narasimhan':
    'Narasimhan–Seshadri theorem — cornerstone of moduli spaces in algebraic geometry',
  'c-s-seshadri': 'geometric invariant theory and moduli of vector bundles',
  's-s-abhyankar': "resolution of singularities in algebraic geometry and Abhyankar's conjecture",
  'p-m-bhargava': "founding India's biotechnology policy and the Department of Biotechnology",
  'lalji-singh': 'DNA fingerprinting forensics and population genetics in India',
  'vasant-gowarikar': "India's SLV-3 space launch vehicle and long-range monsoon forecasting",
  'm-s-gopalakrishnan': "India's reactor engineering and atomic-energy infrastructure",
  's-ramaseshan': 'crystallography, X-ray optics and anomalous-dispersion methods',
  'r-s-mishra': 'differential geometry, tensor analysis and cosmological relativity',
  'a-p-mitra': 'ionospheric and solar-terrestrial physics research and measurement standards',
  'h-k-sen': 'upper-atmosphere and cosmic-ray physics research in India',

  // ── LIVING (born > 1920, died null) ──────────────────────────────────
  'nambi-narayanan': "India's cryogenic rocket-engine programme and Vikas engine development",
  'tessy-thomas': "India's AGNI missile guidance systems and indigenised warhead design",
  'jayant-narlikar': 'quasi-steady-state cosmology and science popularisation in India',
  'k-kasturirangan': "India's space programme leadership and the National Education Policy 2020",
  'g-madhavan-nair': "India's PSLV programme and Chandrayaan-1 lunar-orbiter mission",
  'a-s-kiran-kumar': "India's remote-sensing satellites and Mars Orbiter Mission payloads",
  'k-sivan': "India's GSLV launch-vehicle programme and Chandrayaan-2 mission",
  's-r-s-varadhan':
    'large-deviation theory — the mathematical framework for rare-event probability',
  'neena-gupta': 'solution to the Zariski cancellation problem in algebraic geometry',
  'k-r-parthasarathy': 'quantum probability and non-commutative stochastic calculus',
  'e-sreedharan': 'metro-rail project management and urban-transit engineering in India',
  'raj-reddy': 'speech recognition, AI and human-computer interaction pioneer',
  'v-c-kulkarni': "India's radar and electronic-warfare systems development",
  's-varadarajan': 'infinite-dimensional Lie-group representations and geometric quantisation',
  'r-c-mehrotra': 'metal alkoxide chemistry and sol–gel process foundations',
  'k-c-malhotra': 'tribal population genetics and community-biodiversity conservation in India',
  'c-n-r-rao': 'solid-state chemistry, transition-metal oxides and two-dimensional nanomaterials',
  'n-s-ramaswamy': 'renewable-energy technology, biogas systems and rural electrification',
  'k-s-rajan': "India's scientific instrument development and measurement standards",
  'a-j-m-salam': "India's atmospheric chemistry, ozone monitoring and climate-science research",
  's-p-k-gupta': "India's meteorological research and upper-atmosphere measurement instruments",
}

/** Infer era from born/died years */
function inferEra(born, died) {
  if (born === null || born === undefined) return null
  if (born <= 1200) return 'ancient'
  if (born <= 1700) return 'medieval'
  if (born <= 1920) return 'colonial'
  // born > 1920
  return died === null || died === undefined ? 'living' : 'modern'
}

const raw = JSON.parse(readFileSync(dataPath, 'utf8'))
const figures = raw.figures

let patched = 0
let skipped = 0
const warnings = []

for (const fig of figures) {
  const needsPatch = !fig.era || fig.enduring === undefined || !fig.stillUsed
  if (!needsPatch) {
    skipped++
    continue
  }

  // era
  if (!fig.era) {
    const era = inferEra(fig.born, fig.died)
    if (!era) {
      warnings.push(`[WARN] ${fig.slug}: cannot infer era (no born date)`)
    } else {
      fig.era = era
    }
  }

  // enduring
  if (fig.enduring === undefined) {
    fig.enduring = true
  }

  // stillUsed
  if (!fig.stillUsed) {
    const val = STILL_USED[fig.slug]
    if (val) {
      fig.stillUsed = val
    } else {
      warnings.push(`[WARN] ${fig.slug}: no stillUsed entry in STILL_USED map`)
    }
  }

  patched++
}

writeFileSync(dataPath, JSON.stringify(raw, null, 2) + '\n', 'utf8')

console.log(`Patched: ${patched}, Skipped (already complete): ${skipped}`)
if (warnings.length) {
  console.warn('\nWarnings:')
  warnings.forEach((w) => console.warn(w))
} else {
  console.log('No warnings — all figures fully patched.')
}
