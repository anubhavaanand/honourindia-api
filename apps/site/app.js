/* Honour India — demo site glue: origin placeholders, snippet playground, figures grid. */
(function () {
  'use strict'

  // Work relative to the page URL so the bundle works at a domain root
  // (local server, Render) AND under a subpath (GitHub Pages project site).
  var PAGE_DIR = new URL('.', location.href)
  var EMBED_ORIGIN = PAGE_DIR.toString().replace(/\/$/, '')
  var API_BASE = new URL('api/v1/', PAGE_DIR)

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
  var copyBtn = required('copySnippet')

  function currentConfig() {
    return {
      theme: optTheme.value,
      size: optSize.value,
      interval: Number(optInterval.value),
    }
  }

  function snippetFor(cfg) {
    var attrs = ''
    if (cfg.theme !== 'dark') attrs += ' data-theme="' + cfg.theme + '"'
    if (cfg.size !== 'rectangle') attrs += ' data-size="' + cfg.size + '"'
    if (cfg.interval !== 8) attrs += ' data-interval="' + cfg.interval + '"'
    return (
      '<div data-honourindia' + attrs + '></div>\n' +
      '<script src="' + EMBED_ORIGIN + '/embed.js" async><' + '/script>'
    )
  }

  var previewHandle = null

  function renderPreview() {
    var cfg = currentConfig()
    optIntervalOut.textContent = cfg.interval + 's'

    snippetEl.querySelector('code').innerHTML = snippetFor(cfg)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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
    var el = embedScript()
    if (!el) return
    var ready = el.readyState === 'loaded' || el.readyState === 'complete'
    el.addEventListener('load', function () {
  attachEmbedListeners()
  renderPreview()
    })
    el.addEventListener('error', function () {
      previewMount.innerHTML = ''
      var msg = document.createElement('div')
      msg.textContent = 'Could not load the Honour India widget (embed.js). Check your connection or host.'
      msg.style.color = '#b00020'
      previewMount.appendChild(msg)
    })
    if (ready) renderPreview()
  }

  optTheme.addEventListener('change', renderPreview)
  optSize.addEventListener('change', renderPreview)
  optInterval.addEventListener('input', renderPreview)

  copyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(snippetFor(currentConfig())).then(function () {
      copyBtn.textContent = 'Copied!'
      setTimeout(function () { copyBtn.textContent = 'Copy' }, 1500)
    })
  })

  renderPreview()

  /* ---------- figures grid ---------- */

  fetch(new URL('figures', API_BASE))
    .then(function (r) { return r.json() })
    .then(function (data) {
      var count = document.getElementById('figuresCount')
      count.textContent =
        'The seed catalogue — ' + data.count + ' minds from Raman\'s generation to ISRO\'s. ' +
        'Suggest more via the repository.'

      var grid = document.getElementById('figureGrid')
      data.figures.forEach(function (f) {
        var a = document.createElement('a')
        a.className = 'figure-card'
        a.href = f.link
        a.target = '_blank'
        a.rel = 'noopener noreferrer'

        var thumb = document.createElement('div')
        thumb.className = 'figure-thumb'
        if (f.image) thumb.style.backgroundImage = 'url("' + new URL(f.image.url, API_BASE) + '")'

        var body = document.createElement('div')
        body.className = 'figure-body'
        var field = document.createElement('div')
        field.className = 'figure-field'
        field.textContent = f.field
        var name = document.createElement('h3')
        name.className = 'figure-name'
        name.textContent = f.name
        var years = document.createElement('div')
        years.className = 'figure-years'
        years.textContent = f.years || ''

        body.append(field, name, years)
        a.append(thumb, body)
        grid.appendChild(a)
      })
    })
    .catch(function () {
      document.getElementById('figuresCount').textContent =
        'Could not load the catalogue — is the API running?'
    })
})()
