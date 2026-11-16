# Release checklist

Use this when publishing catalogue, widget, or API changes.

## 1. Prepare the change

- [ ] Update `data/figures.json` if the catalogue changed.
- [ ] Bump `dataVersion` and set `updatedAt` in `data/figures.json`.
- [ ] Add an entry to `data/CHANGELOG.md`.
- [ ] Update README or API docs if endpoints, counts, or behavior changed.
- [ ] Rebuild any generated docs (`docs/openapi.json`) from `docs/openapi.yaml`.

## 2. Build and verify

```bash
npm ci
npm run lint
npm run format:check
npm test
npm run test:visual
npm run build
npm run check:sri
npm run check:size
```

- [ ] Every command passes.
- [ ] The widget bundle is within its size budget.
- [ ] `check:sri` confirms every advertised hash matches the built `embed.js`.
- [ ] A local smoke test shows a rotating billboard.

## 3. Tag and publish

- [ ] Commit all generated files that belong in the repo (`docs/openapi.json`,
      `data/CHANGELOG.md`, etc.), but not `dist/` or `dist-pages/`.
- [ ] Tag the release:

  ```bash
  git tag -a vX.Y.Z -m "Release vX.Y.Z"
  git push origin vX.Y.Z
  ```

- [ ] Create GitHub release notes covering data, widget, and API changes.
- [ ] Deploy through the chosen target (Render, Docker, or GitHub Pages).
- [ ] Verify `/healthz`, the demo page, and a third-party embed.

## Versioning

- The API path stays `/api/v1` for additive changes.
- Breaking API changes ship under a new path (for example `/api/v2`).
- `dataVersion` follows semantic versioning for catalogue changes.
- Widget bundle size is checked on every build; update the budget only with a
  deliberate review.
