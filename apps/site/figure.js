/* Honour India — figure detail page renderer.
   Reads the slug from the page URL, fetches the full figure record from the API,
   and renders the detail page. Falls back to a monogram when there's no portrait.
*/
(function () {
  'use strict'

  // Work relative to the site root so this works at a domain root (/figures/:slug)
  // and under a subpath (/repo/figures/:slug).
  var pathname = location.pathname || ''
  var figuresIdx = pathname.indexOf('/figures')
  var rootPath = figuresIdx !== -1 ? pathname.slice(0, figuresIdx) + '/' : '.'
  var SITE_ROOT = new URL(rootPath, location.href)
  var API_BASE = new URL('api/v1/', SITE_ROOT)

  var segments = pathname.split('/').filter(Boolean)
  var lastSegment = segments[segments.length - 1] || ''
  var slug = (new URLSearchParams(location.search).get('slug') || lastSegment).replace(/\.html$/, '')

  var portrait = document.getElementById('figurePortrait')
  var monogram = document.getElementById('figureMonogram')
  var nameEl = document.getElementById('figureName')
  var yearsEl = document.getElementById('figureYears')
  var fieldEl = document.getElementById('figureField')
  var eraEl = document.getElementById('figureEra')
  var taglineEl = document.getElementById('figureTagline')
  var summaryEl = document.getElementById('figureSummary')
  var quoteEl = document.getElementById('figureQuote')
  var stillUsedEl = document.getElementById('figureStillUsed')
  var wikiEl = document.getElementById('figureWiki')
  var creditEl = document.getElementById('figureCredit')
  var notFoundEl = document.getElementById('figureNotFound')
  var detailEl = document.querySelector('.figure-detail')
  var loadingEl = document.getElementById('figureLoading')

  function showNotFound() {
    if (notFoundEl) notFoundEl.hidden = false
    if (detailEl) detailEl.hidden = true
    if (loadingEl) loadingEl.hidden = true
    document.title = 'Figure not found · Honour India'
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function initials(name) {
    return (name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (w) { return w.charAt(0) })
      .join('')
      .toUpperCase() || '?'
  }

  function render(f) {
    document.title = (f.name || 'Figure') + ' · Honour India'
    if (notFoundEl) notFoundEl.hidden = true
    if (detailEl) detailEl.hidden = false
    if (loadingEl) loadingEl.hidden = true

    if (f.image) {
      portrait.hidden = false
      monogram.hidden = true
      portrait.src = f.image.url
      portrait.alt = 'Portrait of ' + f.name
    } else {
      portrait.hidden = true
      monogram.hidden = false
      monogram.textContent = initials(f.name)
    }

    nameEl.textContent = f.name || ''
    yearsEl.textContent = f.years || ''
    fieldEl.textContent = f.field || ''
    eraEl.textContent = f.era ? f.era.charAt(0).toUpperCase() + f.era.slice(1) : ''
    taglineEl.textContent = f.tagline || ''
    summaryEl.textContent = f.summary || ''

    if (f.quote) {
      quoteEl.hidden = false
      quoteEl.innerHTML =
        '<p>' + escapeHtml(f.quote.text) + '</p><cite>' + escapeHtml(f.quote.source || '') + '</cite>'
    } else {
      quoteEl.hidden = true
    }

    if (f.enduring && f.stillUsed) {
      stillUsedEl.hidden = false
      stillUsedEl.textContent = 'Still used today: ' + f.stillUsed
    } else {
      stillUsedEl.hidden = true
    }

    var wiki = f.link || f.wikipedia || ''
    wikiEl.href = wiki
    wikiEl.hidden = !wiki

    if (f.image) {
      creditEl.hidden = false
      creditEl.textContent =
        'Photo: ' + (f.image.credit || 'Unknown credit') + ' · ' + (f.image.license || 'All rights reserved')
    } else {
      creditEl.hidden = true
    }
  }

  if (loadingEl) loadingEl.hidden = false
  if (detailEl) detailEl.hidden = true

  fetch(new URL('figures/' + encodeURIComponent(slug), API_BASE))
    .then(function (r) {
      if (!r.ok) throw new Error('Figure not found')
      return r.json()
    })
    .then(function (f) {
      if (loadingEl) loadingEl.hidden = true
      render(f)
    })
    .catch(showNotFound)
})()
