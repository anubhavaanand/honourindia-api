// Submissions Moderation Dashboard Client
;(function () {
  const STORAGE_KEY = 'honourindia_admin_key'

  // Resolve the API base from the site root so the dashboard also works when
  // the site is served under a subpath (for example a GitHub Pages project).
  const pathname = location.pathname || ''
  const adminIdx = pathname.lastIndexOf('/')
  const rootPath = adminIdx >= 0 ? pathname.slice(0, adminIdx) + '/' : '/'
  const API_BASE = new URL('api/v1/', new URL(rootPath, location.href))

  let adminKey = localStorage.getItem(STORAGE_KEY) || ''
  let currentFilter = ''
  let allSubmissions = []

  const keyInput = document.getElementById('adminKeyInput')
  const saveKeyBtn = document.getElementById('saveKeyBtn')
  const submissionsList = document.getElementById('submissionsList')
  const statusMessage = document.getElementById('statusMessage')
  const refreshBtn = document.getElementById('refreshBtn')
  const filterBtns = document.querySelectorAll('.filter-btn[data-status]')

  if (keyInput) {
    keyInput.value = adminKey
  }

  function showMessage(text, isError = false) {
    if (!statusMessage) return
    statusMessage.textContent = text
    statusMessage.style.display = 'block'
    statusMessage.style.background = isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(53, 181, 98, 0.2)'
    statusMessage.style.color = isError ? '#f87171' : '#5ce68b'
    statusMessage.style.border = isError
      ? '1px solid rgba(239, 68, 68, 0.4)'
      : '1px solid rgba(53, 181, 98, 0.4)'
    setTimeout(() => {
      statusMessage.style.display = 'none'
    }, 4000)
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return ''
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  async function fetchSubmissions() {
    submissionsList.innerHTML = '<div class="empty-state">Loading submissions…</div>'
    try {
      const headers = {}
      if (adminKey) {
        headers['x-admin-key'] = adminKey
      }
      const res = await fetch(new URL('admin/submissions', API_BASE).toString(), { headers })
      if (!res.ok) {
        if (res.status === 401) {
          submissionsList.innerHTML =
            '<div class="empty-state" style="color: #f87171;">Unauthorized. Please enter a valid Admin Key above.</div>'
          return
        }
        throw new Error(`Failed to load: HTTP ${res.status}`)
      }
      const data = await res.json()
      allSubmissions = data.submissions || []
      updateCounts()
      render()
    } catch (err) {
      submissionsList.innerHTML = `<div class="empty-state" style="color: #f87171;">Error: ${escapeHtml(
        err.message,
      )}</div>`
    }
  }

  function updateCounts() {
    const total = allSubmissions.length
    const pending = allSubmissions.filter((s) => s.status === 'pending').length
    const approved = allSubmissions.filter((s) => s.status === 'approved').length
    const rejected = allSubmissions.filter((s) => s.status === 'rejected').length

    const cAll = document.getElementById('countAll')
    const cPen = document.getElementById('countPending')
    const cApp = document.getElementById('countApproved')
    const cRej = document.getElementById('countRejected')

    if (cAll) cAll.textContent = total
    if (cPen) cPen.textContent = pending
    if (cApp) cApp.textContent = approved
    if (cRej) cRej.textContent = rejected
  }

  function render() {
    const filtered = currentFilter
      ? allSubmissions.filter((s) => s.status === currentFilter)
      : allSubmissions

    if (filtered.length === 0) {
      submissionsList.innerHTML =
        '<div class="empty-state">No submissions found in this state.</div>'
      return
    }

    submissionsList.innerHTML = filtered
      .map((sub) => {
        const years = sub.died ? `${sub.born}–${sub.died}` : `b. ${sub.born}`
        const statusClass = `status-${sub.status}`
        const submittedDate = new Date(sub.submittedAt).toLocaleString()
        const reviewedDate = sub.reviewedAt ? new Date(sub.reviewedAt).toLocaleString() : null

        return `
        <article class="submission-card" id="card-${escapeHtml(sub.id)}">
          <div class="card-head">
            <div>
              <h2 class="card-title">${escapeHtml(sub.name)}</h2>
              <div class="card-meta">
                <span>${escapeHtml(years)}</span> · <span>${escapeHtml(sub.field)}</span>
              </div>
            </div>
            <span class="status-badge ${statusClass}">${escapeHtml(sub.status)}</span>
          </div>

          <div class="card-body">
            <div class="card-tagline">“${escapeHtml(sub.tagline)}”</div>
            <p>${escapeHtml(sub.summary)}</p>
            ${
              sub.quote
                ? `<div class="card-quote">“${escapeHtml(sub.quote.text)}”${
                    sub.quote.source ? ` — ${escapeHtml(sub.quote.source)}` : ''
                  }</div>`
                : ''
            }
            <div>
              <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(
                sub.wiki.replace(/ /g, '_'),
              )}" target="_blank" rel="noopener noreferrer" style="color: var(--saffron);">
                Wikipedia: ${escapeHtml(sub.wiki)} ↗
              </a>
            </div>
          </div>

          <div class="card-footer">
            <div>
              Submitted: ${escapeHtml(submittedDate)}
              ${sub.submitterName ? `by ${escapeHtml(sub.submitterName)}` : ''}
              ${sub.submitterEmail ? `(${escapeHtml(sub.submitterEmail)})` : ''}
            </div>
            ${
              sub.reviewedAt
                ? `<div>Reviewed: ${escapeHtml(reviewedDate)}${
                    sub.reviewNote ? ` · Note: "${escapeHtml(sub.reviewNote)}"` : ''
                  }</div>`
                : ''
            }
          </div>

          <div class="review-form">
            <input type="text" class="review-note-input" id="note-${escapeHtml(
              sub.id,
            )}" placeholder="Review notes (optional)" value="${escapeHtml(sub.reviewNote || '')}" />
            <button type="button" class="action-btn btn-approve" data-id="${escapeHtml(
              sub.id,
            )}" data-action="approved">✓ Approve</button>
            <button type="button" class="action-btn btn-reject" data-id="${escapeHtml(
              sub.id,
            )}" data-action="rejected">✗ Reject</button>
            <button type="button" class="action-btn btn-reset" data-id="${escapeHtml(
              sub.id,
            )}" data-action="pending">↺ Reset</button>
          </div>
        </article>
      `
      })
      .join('')

    // Attach action listeners
    submissionsList.querySelectorAll('.action-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id')
        const action = btn.getAttribute('data-action')
        const noteInput = document.getElementById(`note-${id}`)
        const reviewNote = noteInput ? noteInput.value.trim() : ''

        try {
          const res = await fetch(
            new URL(`admin/submissions/${encodeURIComponent(id)}`, API_BASE).toString(),
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey,
              },
              body: JSON.stringify({
                status: action,
                reviewNote: reviewNote || null,
                reviewer: 'admin-dashboard',
              }),
            },
          )
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            throw new Error(errData.error || `HTTP ${res.status}`)
          }
          const result = await res.json()
          showMessage(`Submission "${result.submission.name}" marked as ${action}`)
          // Update local record
          const idx = allSubmissions.findIndex((s) => s.id === id)
          if (idx !== -1) {
            allSubmissions[idx] = result.submission
          }
          updateCounts()
          render()
        } catch (err) {
          showMessage(`Failed to update: ${err.message}`, true)
        }
      })
    })
  }

  // Event handlers
  if (saveKeyBtn) {
    saveKeyBtn.addEventListener('click', () => {
      adminKey = keyInput ? keyInput.value.trim() : ''
      localStorage.setItem(STORAGE_KEY, adminKey)
      showMessage('Admin key saved')
      fetchSubmissions()
    })
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchSubmissions()
    })
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      currentFilter = btn.getAttribute('data-status') || ''
      render()
    })
  })

  // Initial load
  fetchSubmissions()
})()
