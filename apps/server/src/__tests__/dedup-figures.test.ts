import { beforeAll, describe, expect, it } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

type Figure = Record<string, unknown>
type DedupModule = {
  slugify: (name: string) => string
  findDuplicateGroups: (figures: Figure[]) => {
    duplicateSlugs: Array<{ key: string; name: string; firstSeenAs: string }>
    duplicateWikiTitles: Array<{ key: string; name: string; firstSeenAs: string }>
    duplicateNameAndBirthYear: Array<{ key: string; name: string; firstSeenAs: string }>
  }
  mergeDuplicates: (
    figures: Figure[],
    options?: { includeNameBorn?: boolean },
  ) => {
    figures: Figure[]
    merged: Array<{
      slug: string
      name: string
      reason: string
      kept: string
      fieldsMerged: boolean
    }>
  }
}

let dedup: DedupModule

beforeAll(async () => {
  dedup = (await import(path.join(ROOT, 'scripts/dedup-figures.mjs'))) as DedupModule
})

describe('dedup-figures (issue #36)', () => {
  it('slugifies names into stable ids', () => {
    expect(dedup.slugify('C. V. Raman')).toBe('c-v-raman')
    expect(dedup.slugify('  Srinivasa   Ramanujan ')).toBe('srinivasa-ramanujan')
  })

  it('reports duplicate slugs, wiki titles, and name + birth year groups', () => {
    const figures: Figure[] = [
      { slug: 'cv-raman', name: 'C. V. Raman', wiki: 'C. V. Raman', born: 1888 },
      { slug: 'cv-raman', name: 'C. V. Raman', wiki: 'C. V. Raman', born: 1888 },
      { slug: 'ramanujan', name: 'Srinivasa Ramanujan', wiki: 'Srinivasa Ramanujan', born: 1887 },
      { slug: 'other', name: 'Other Person', wiki: 'Other Person', born: 1900 },
    ]

    const groups = dedup.findDuplicateGroups(figures)

    expect(groups.duplicateSlugs).toHaveLength(1)
    expect(groups.duplicateSlugs[0]).toMatchObject({ key: 'cv-raman', name: 'C. V. Raman' })
    expect(groups.duplicateWikiTitles).toHaveLength(1)
    expect(groups.duplicateWikiTitles[0]).toMatchObject({ key: 'C. V. Raman' })
    expect(groups.duplicateNameAndBirthYear).toHaveLength(1)
    expect(groups.duplicateNameAndBirthYear[0]).toMatchObject({ key: 'c. v. raman|1888' })
  })

  it('merges exact wiki duplicates into the first record and fills missing fields', () => {
    const figures: Figure[] = [
      {
        slug: 'cv-raman',
        name: 'C. V. Raman',
        wiki: 'C. V. Raman',
        born: 1888,
        field: 'Physics',
        summary: null,
      },
      {
        slug: 'cv-raman-2',
        name: 'Chandrasekhara Venkata Raman',
        wiki: 'C. V. Raman',
        born: 1888,
        field: 'Physics',
        summary: 'Discovered the Raman effect.',
        enduring: true,
      },
    ]

    const result = dedup.mergeDuplicates(figures)

    expect(result.merged).toHaveLength(1)
    expect(result.merged[0]).toMatchObject({
      slug: 'cv-raman-2',
      reason: 'same wiki title',
      kept: 'cv-raman',
      fieldsMerged: true,
    })
    expect(result.figures).toHaveLength(1)
    expect(result.figures[0]).toMatchObject({
      slug: 'cv-raman',
      name: 'C. V. Raman',
      summary: 'Discovered the Raman effect.',
      enduring: true,
    })

    // Input is not mutated.
    expect(figures).toHaveLength(2)
    expect(figures[0]?.summary).toBeNull()
  })

  it('merges duplicate slugs even when wiki titles differ', () => {
    const figures: Figure[] = [
      { slug: 'same-slug', name: 'First', wiki: 'First' },
      { slug: 'same-slug', name: 'Second', wiki: 'Second' },
    ]

    const result = dedup.mergeDuplicates(figures)

    expect(result.merged).toHaveLength(1)
    expect(result.merged[0]?.reason).toBe('duplicate slug')
    expect(result.figures).toHaveLength(1)
    expect(result.figures[0]).toMatchObject({ name: 'First', wiki: 'First' })
  })

  it('does not merge same name + birth year unless includeNameBorn is set', () => {
    const figures: Figure[] = [
      { slug: 'one', name: 'A. Person', wiki: 'A. Person', born: 1900 },
      { slug: 'two', name: 'A. Person', wiki: 'A. Person (scientist)', born: 1900 },
    ]

    expect(dedup.mergeDuplicates(figures).merged).toHaveLength(0)

    const result = dedup.mergeDuplicates(figures, { includeNameBorn: true })
    expect(result.merged).toHaveLength(1)
    expect(result.merged[0]?.reason).toBe('same name and birth year')
    expect(result.figures).toHaveLength(1)
  })

  it('keeps an explicit false value from the first record instead of overwriting it', () => {
    const figures: Figure[] = [
      { slug: 'one', name: 'One', wiki: 'One', enduring: false },
      { slug: 'two', name: 'Two', wiki: 'One', enduring: true },
    ]

    const result = dedup.mergeDuplicates(figures)

    expect(result.figures).toHaveLength(1)
    expect(result.figures[0]?.enduring).toBe(false)
  })
})
