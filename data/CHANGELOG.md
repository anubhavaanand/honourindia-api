# Data Changelog: `figures.json`

All notable changes to the Honour India figures dataset (`data/figures.json`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-11-15
### Added
- Structured Wikipedia source attribution (`attribution` object containing `source`, `url`, and `license: CC BY-SA 4.0`) across all 135 figures (Issue #63).
- Data versioning metadata (`dataVersion: 1.2.0`, `updatedAt: 2026-11-15`) and this changelog (Issue #64).

### Changed
- Backfilled `era`, `enduring`, and `stillUsed` for all 87 previously unannotated figures (Issue #29).
- Added runtime schema validation on server startup to guarantee data integrity (Issue #30).
- Enhanced automated cleanup of orphan image entries when figures are deleted (Issue #31).
- Added heuristic and CLI flags in `import-candidates.mjs` to auto-mark enduring figures (Issue #34).

## [1.1.0] - 2026-11-10
### Added
- Expanded catalogue from initial seed of 28 figures to 135 figures covering mathematics, physics, chemistry, astronomy, aerospace, biology, engineering, and medicine.
- Added `era` classification ('ancient' | 'medieval' | 'colonial' | 'modern' | 'living'), `enduring` flag, and `stillUsed` contribution notes.

## [1.0.1] - 2026-11-05
### Added
- `images.json` metadata mapping with Wikimedia Commons credits, licenses, and local portrait files.
- Initials monogram fallback for figures without open-access portraits.

## [1.0.0] - 2026-11-01
### Added
- Initial release of the Honour India dataset with 28 core figures.
- Base schema: `slug`, `name`, `born`, `died`, `field`, `tagline`, `summary`, `quote`, `wiki`.
