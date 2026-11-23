import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SUBMISSIONS_FILE = path.resolve(__dirname, '../../../../data/submissions.json')

let submissionsFile = DEFAULT_SUBMISSIONS_FILE

/** Point the store at another file — used by the tests to stay out of the way. */
export function setSubmissionsFile(filePath: string): void {
  submissionsFile = filePath
}

export function resetSubmissionsFile(): void {
  submissionsFile = DEFAULT_SUBMISSIONS_FILE
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface FigureSubmission {
  id: string
  name: string
  born: number
  died?: number | null
  field: string
  tagline: string
  summary: string
  wiki: string
  quote?: { text: string; source?: string } | null
  submitterName?: string | null
  submitterEmail?: string | null
  status: SubmissionStatus
  submittedAt: string
  reviewedAt?: string | null
  reviewNote?: string | null
  reviewedBy?: string | null
}

export interface SubmissionsFile {
  submissions: FigureSubmission[]
}

export function loadSubmissions(): FigureSubmission[] {
  if (!existsSync(submissionsFile)) return []
  try {
    const raw = JSON.parse(readFileSync(submissionsFile, 'utf8')) as SubmissionsFile
    return Array.isArray(raw.submissions) ? raw.submissions : []
  } catch {
    return []
  }
}

export function saveSubmissions(list: FigureSubmission[]): void {
  // Write to a sibling temp file then rename, so a crash mid-write cannot
  // leave a truncated/corrupt submissions file behind. rename() is atomic on
  // the same filesystem.
  const tmp = `${submissionsFile}.${randomBytes(6).toString('hex')}.tmp`
  writeFileSync(tmp, JSON.stringify({ submissions: list }, null, 2) + '\n', 'utf8')
  renameSync(tmp, submissionsFile)
}

export function listSubmissions(options?: { status?: SubmissionStatus }): FigureSubmission[] {
  const all = loadSubmissions()
  if (options?.status) {
    return all.filter((s) => s.status === options.status)
  }
  return all
}

export function createSubmission(
  input: Omit<
    FigureSubmission,
    'id' | 'status' | 'submittedAt' | 'reviewedAt' | 'reviewNote' | 'reviewedBy'
  >,
): FigureSubmission {
  const id = `sub_${Date.now()}_${randomBytes(4).toString('hex')}`
  const submission: FigureSubmission = {
    ...input,
    id,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewNote: null,
    reviewedBy: null,
  }
  const current = loadSubmissions()
  current.push(submission)
  saveSubmissions(current)
  return submission
}

export function getSubmissionById(id: string): FigureSubmission | undefined {
  return loadSubmissions().find((s) => s.id === id)
}

export function updateSubmissionStatus(
  id: string,
  status: SubmissionStatus,
  reviewNote?: string | null,
  reviewedBy?: string | null,
): FigureSubmission | null {
  const current = loadSubmissions()
  const idx = current.findIndex((s) => s.id === id)
  if (idx === -1) return null

  const updated: FigureSubmission = {
    ...current[idx]!,
    status,
    reviewedAt: new Date().toISOString(),
    reviewNote: reviewNote !== undefined ? reviewNote : (current[idx]!.reviewNote ?? null),
    reviewedBy: reviewedBy !== undefined ? reviewedBy : (current[idx]!.reviewedBy ?? null),
  }
  current[idx] = updated
  saveSubmissions(current)
  return updated
}
