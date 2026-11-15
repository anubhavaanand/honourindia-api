import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SUBMISSIONS_FILE = path.resolve(__dirname, '../../../../data/submissions.json')

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
}

export interface SubmissionsFile {
  submissions: FigureSubmission[]
}

export function loadSubmissions(): FigureSubmission[] {
  if (!existsSync(SUBMISSIONS_FILE)) return []
  try {
    const raw = JSON.parse(readFileSync(SUBMISSIONS_FILE, 'utf8')) as SubmissionsFile
    return Array.isArray(raw.submissions) ? raw.submissions : []
  } catch {
    return []
  }
}

export function saveSubmissions(list: FigureSubmission[]): void {
  writeFileSync(SUBMISSIONS_FILE, JSON.stringify({ submissions: list }, null, 2) + '\n', 'utf8')
}

export function createSubmission(
  input: Omit<FigureSubmission, 'id' | 'status' | 'submittedAt' | 'reviewedAt' | 'reviewNote'>,
): FigureSubmission {
  const id = `sub_${Date.now()}_${randomBytes(4).toString('hex')}`
  const submission: FigureSubmission = {
    ...input,
    id,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewNote: null,
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
): FigureSubmission | null {
  const current = loadSubmissions()
  const idx = current.findIndex((s) => s.id === id)
  if (idx === -1) return null

  const updated: FigureSubmission = {
    ...current[idx]!,
    status,
    reviewedAt: new Date().toISOString(),
    reviewNote: reviewNote ?? current[idx]!.reviewNote ?? null,
  }
  current[idx] = updated
  saveSubmissions(current)
  return updated
}
