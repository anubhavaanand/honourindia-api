/* Honour India — demo site glue: origin placeholders, snippet playground, figures grid. */
;(function () {
  'use strict'

  // Work relative to the page URL so the bundle works at a domain root
  // (local server, Render) AND under a subpath (GitHub Pages project site).
  var PAGE_DIR = new URL('.', location.href)
  var EMBED_ORIGIN = PAGE_DIR.toString().replace(/\/$/, '')
  var API_BASE = new URL('api/v1/', PAGE_DIR)
  var EMBED_SRI = 'sha384-XTEXrYvun/pWlclCcmXe0PtYbUYPjPy8hZWIbCzsIxDbpyLfi6K7WVKoQW7ql7rK'

  // Fill origin placeholders in the static HTML.
  document.querySelectorAll('.ph-origin').forEach(function (el) {
    el.textContent = EMBED_ORIGIN
  })

  /* ---------- embed snippet playground ---------- */

  function required(id) {
    var el = document.getElementById(id)
    if (!el) throw new Error('[honourindia] missing required element: #' + id)
    return el
  }

  var snippetEl = required('snippet')
  var previewMount = required('previewMount')
  var optTheme = required('optTheme')
  var optSize = required('optSize')
  var optInterval = required('optInterval')
  var optIntervalOut = required('optIntervalOut')
  var optApi = document.getElementById('optApi')
  var optKey = document.getElementById('optKey')
  var copyBtn = required('copySnippet')

  function currentConfig() {
    var cfg = {
      theme: optTheme.value,
      size: optSize.value,
      interval: Number(optInterval.value),
    }
    if (optApi && optApi.value.trim()) {
      cfg.api = optApi.value.trim()
    }
    if (optKey && optKey.value.trim()) {
      cfg.key = optKey.value.trim()
    }
    return cfg
  }

  function snippetFor(cfg) {
    var attrs = ''
    if (cfg.theme !== 'dark') attrs += ' data-theme="' + cfg.theme + '"'
    if (cfg.size !== 'rectangle') attrs += ' data-size="' + cfg.size + '"'
    if (cfg.interval !== 8) attrs += ' data-interval="' + cfg.interval + '"'
    if (cfg.api) attrs += ' data-api="' + cfg.api + '"'
    if (cfg.key) attrs += ' data-key="' + cfg.key + '"'
    return (
      '<div data-honourindia' +
      attrs +
      '></div>\n' +
      '<script src="' +
      EMBED_ORIGIN +
      '/embed.js" integrity="' +
      EMBED_SRI +
      '" crossorigin="anonymous" async><' +
      '/script>'
    )
  }

  var previewHandle = null

  function renderPreview() {
    var cfg = currentConfig()
    optIntervalOut.textContent = cfg.interval + 's'

    snippetEl.querySelector('code').textContent = snippetFor(cfg)

    if (previewHandle) previewHandle.destroy()
    previewMount.innerHTML = ''
    var host = document.createElement('div')
    previewMount.appendChild(host)
    if (window.HonourIndia) {
      previewHandle = window.HonourIndia.mount(host, cfg)
    } else {
      previewMount.appendChild(document.createTextNode('Loading billboard widget…'))
    }
  }

  function embedScript() {
    return document.querySelector('script[src*="embed.js"]')
  }

  function attachEmbedListeners() {
    if (window.HonourIndia) return
    var el = embedScript()
    if (!el) return
    var ready = el.readyState === 'loaded' || el.readyState === 'complete'
    el.addEventListener('load', function () {
      renderPreview()
    })
    el.addEventListener('error', function () {
      previewMount.innerHTML = ''
      var msg = document.createElement('div')
      msg.textContent =
        'Could not load the Honour India widget (embed.js). Check your connection or host.'
      msg.style.color = '#b00020'
      previewMount.appendChild(msg)
    })
    if (ready) renderPreview()
  }

  optTheme.addEventListener('change', renderPreview)
  optSize.addEventListener('change', renderPreview)
  optInterval.addEventListener('input', renderPreview)
  if (optApi) optApi.addEventListener('input', renderPreview)
  if (optKey) optKey.addEventListener('input', renderPreview)

  copyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(snippetFor(currentConfig())).then(function () {
      copyBtn.textContent = 'Copied!'
      setTimeout(function () {
        copyBtn.textContent = 'Copy'
      }, 1500)
    })
  })

  renderPreview()
  attachEmbedListeners()

  /* ---------- figures grid & filters (issue #21, #89) ---------- */

  var figureSearch = document.getElementById('figureSearch')
  var figureField = document.getElementById('figureField')
  var figureEnduring = document.getElementById('figureEnduring')
  var loadMoreBtn = document.getElementById('loadMoreFigures')

  var PAGE_SIZE = 24
  var currentOffset = 0
  var isLoading = false
  var hasMore = false

  var fieldsPopulated = false
  function populateFieldOptions(figures) {
    if (fieldsPopulated || !figureField) return
    var set = {}
    figures.forEach(function (f) {
      if (f.field) set[f.field] = true
    })
    var list = Object.keys(set).sort()
    list.forEach(function (name) {
      var opt = document.createElement('option')
      opt.value = name
      opt.textContent = name
      figureField.appendChild(opt)
    })
    if (list.length > 0) fieldsPopulated = true
  }

  var fetchSeq = 0

  function initials(name) {
    return (
      String(name || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(function (w) {
          return w.charAt(0)
        })
        .join('')
        .toUpperCase() || '?'
    )
  }

  function renderCard(f) {
    var a = document.createElement('a')
    a.className = 'figure-card'
    a.href = new URL('figures/' + encodeURIComponent(f.slug), PAGE_DIR).toString()
    a.rel = 'noopener noreferrer'

    var thumb = document.createElement('div')
    thumb.className = 'figure-thumb'
    if (f.image) {
      var imgUrl = new URL(f.image.url, API_BASE).toString()
      // Escape any characters that would break out of the CSS url("...") value.
      thumb.style.backgroundImage = 'url("' + imgUrl.replace(/["\\]/g, '\\$&') + '")'
      // Fall back to a monogram if the portrait fails to load, matching the
      // detail page instead of leaving an empty grey square.
      var probe = new Image()
      probe.onerror = function () {
        thumb.style.backgroundImage = ''
        thumb.classList.add('figure-thumb--empty')
        thumb.textContent = initials(f.name)
      }
      probe.src = imgUrl
    } else {
      thumb.classList.add('figure-thumb--empty')
      thumb.textContent = initials(f.name)
    }

    var body = document.createElement('div')
    body.className = 'figure-body'
    var fieldRow = document.createElement('div')
    fieldRow.className = 'figure-field-row'
    var fieldEl = document.createElement('div')
    fieldEl.className = 'figure-field'
    fieldEl.textContent = f.field
    fieldRow.appendChild(fieldEl)

    if (f.era) {
      var era = document.createElement('span')
      era.className = 'figure-era-badge'
      era.textContent = f.era.charAt(0).toUpperCase() + f.era.slice(1)
      fieldRow.appendChild(era)
    }

    var name = document.createElement('h3')
    name.className = 'figure-name'
    name.textContent = f.name
    var years = document.createElement('div')
    years.className = 'figure-years'
    years.textContent = f.years || ''

    body.append(fieldRow, name, years)
    a.append(thumb, body)
    return a
  }

  function fetchAndRenderFigures(append) {
    if (isLoading && append) return
    isLoading = true
    if (loadMoreBtn && append) {
      loadMoreBtn.disabled = true
      loadMoreBtn.textContent = 'Loading more…'
    }

    if (!append) {
      currentOffset = 0
    }

    var seq = ++fetchSeq
    var url = new URL('figures', API_BASE)
    var search = figureSearch ? figureSearch.value.trim() : ''
    var field = figureField ? figureField.value : ''
    var enduring = figureEnduring ? figureEnduring.checked : false

    if (search) url.searchParams.set('search', search)
    if (field) url.searchParams.set('field', field)
    if (enduring) url.searchParams.set('enduring', 'true')
    url.searchParams.set('limit', String(PAGE_SIZE))
    url.searchParams.set('offset', String(currentOffset))

    var hasFilters = Boolean(search || field || enduring)

    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      })
      .then(function (data) {
        isLoading = false
        if (seq !== fetchSeq) return
        var count = document.getElementById('figuresCount')
        var grid = document.getElementById('figureGrid')
        if (!grid) return

        if (!append) {
          grid.innerHTML = ''
        }

        var list = data.figures || []

        if (!append && list.length === 0) {
          hasMore = false
          if (loadMoreBtn) loadMoreBtn.hidden = true
          if (hasFilters) {
            if (count) count.textContent = 'No figures found matching your filter criteria.'
            var emptyFilter = document.createElement('p')
            emptyFilter.className = 'figure-empty'
            emptyFilter.textContent =
              'No figures match the selected filters. Try clearing your search.'
            grid.appendChild(emptyFilter)
          } else {
            if (count) count.textContent = 'The seed catalogue — no figures to show yet.'
            var empty = document.createElement('p')
            empty.className = 'figure-empty'
            empty.textContent = 'No figures to show yet. New honoured figures will appear here.'
            grid.appendChild(empty)
          }
          return
        }

        currentOffset += list.length
        hasMore = list.length === PAGE_SIZE

        if (loadMoreBtn) {
          loadMoreBtn.hidden = !hasMore
          loadMoreBtn.disabled = false
          loadMoreBtn.textContent = 'Load more minds'
        }

        if (!hasFilters) {
          if (!append) populateFieldOptions(list)
          if (count) {
            count.textContent =
              'The seed catalogue — ' +
              (data.total || data.count) +
              " minds from Raman's generation to ISRO's. " +
              'Suggest more via the repository.'
          }
        } else {
          if (count) {
            count.textContent =
              'Showing ' +
              currentOffset +
              ' of ' +
              (data.total != null ? data.total : currentOffset) +
              ' minds.'
          }
        }

        list.forEach(function (f) {
          grid.appendChild(renderCard(f))
        })
      })
      .catch(function () {
        isLoading = false
        if (seq !== fetchSeq) return
        if (loadMoreBtn && append) {
          loadMoreBtn.disabled = false
          loadMoreBtn.textContent = 'Load more minds'
        }
        var count = document.getElementById('figuresCount')
        if (count && !append) {
          count.textContent = 'Could not load the catalogue — is the API running?'
        }
      })
  }

  if (figureSearch) {
    figureSearch.addEventListener('input', function () {
      fetchAndRenderFigures(false)
    })
  }
  if (figureField) {
    figureField.addEventListener('change', function () {
      fetchAndRenderFigures(false)
    })
  }
  if (figureEnduring) {
    figureEnduring.addEventListener('change', function () {
      fetchAndRenderFigures(false)
    })
  }
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', function () {
      if (!isLoading && hasMore) fetchAndRenderFigures(true)
    })

    if (typeof IntersectionObserver !== 'undefined') {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting && !isLoading && hasMore && !loadMoreBtn.hidden) {
              fetchAndRenderFigures(true)
            }
          })
        },
        { rootMargin: '200px' },
      )
      observer.observe(loadMoreBtn)
    }
  }

  fetchAndRenderFigures(false)
})()
