# TopoCopter agent notes

- Keep the app mobile-first and Phaser-based.
- Player-facing text is Dutch.
- Main code map:
  - `src/core/` — camera, input, projection, runtime helpers
  - `src/scenes/` — boot, preload, map, helicopter, quiz selection
  - `src/entities/` — helicopter entity and related game objects
  - `src/quiz/` — pure quiz logic, overlap checks, target geometry, HUD helpers
  - `src/audio/` — sound unlock and playback helpers
  - `src/ui/` — shared styles and overlays
  - `src/data/` — targets, levels, quiz sets, and geometry data
  - `scripts/` — one-off asset generators and maintenance helpers
  - `assets/audio/` — generated sound assets used by Phaser
  - `src/__tests__/` — Vitest coverage for the above
- Run `npm run generate:audio` to rebuild the WAV files in `assets/audio/`.
- When changing quiz flow, update selection, URL handling, and `HelicopterScene` together.
- When changing map visuals, update `MapScene`, `MapRenderer`, `styles.js`, and the matching tests.
- When changing audio, keep mobile Safari / iPhone unlock behavior in mind.
- Run `npm test` and `npm run build` before finishing a change.
