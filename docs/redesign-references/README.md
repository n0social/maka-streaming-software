# Studio redesign reference images

Side-by-side targets for the cream/gold studio work (`0.2.3.1-redesign` checkpoint).

| File | Source | Use |
| --- | --- | --- |
| `readme-hero-target.png` | README hero (`docs/readme-hero.png` at tag `0.2.3.1-redesign`) | Marketing mock — layout, copy, and styling to match section by section |
| `studio-at-0.2.3.1-redesign.png` | Electron studio at tag `0.2.3.1-redesign` | Historical baseline before further redesign commits |
| `studio-current.png` | **Latest** built studio (`npm run build` + preview/capture) | Refreshed after **every** UI edit; commit with UI PRs |

`readme-hero-target.png` in this folder should stay byte-identical to `docs/readme-hero.png` unless the hero asset itself changes.

## Screenshot comparison ritual (required for UI edits)

Agents and contributors must compare **hero (target)** vs **studio (current)** after studio-visible changes.

### 1. Build and show the studio

```bash
npm run build
npm run preview
```

Use the default Studio layout. Program preview may be empty; keep cream/gold window chrome.

### 2. Refresh `studio-current.png`

Write a new capture to **`docs/redesign-references/studio-current.png`**.

- **Automated:** `MAKA_CAPTURE_PATH=docs/redesign-references/studio-current.png npm run preview` (implemented in `src/main/index.ts`).
- **Manual:** If `MAKA_CAPTURE_PATH` does not produce a file in your environment, screenshot the preview window and save it to that path (same filename).

### 3. Stage chat embeds (not committed)

```bash
mkdir -p /opt/cursor/artifacts/redesign-references
cp docs/readme-hero.png /opt/cursor/artifacts/redesign-references/readme-hero-target.png
cp docs/redesign-references/studio-current.png /opt/cursor/artifacts/redesign-references/studio-current.png
```

### 4. Post both images in the agent response

Include the hero and `studio-current` from `/opt/cursor/artifacts/redesign-references/` so the user sees target vs current in the same message.

### 5. Git

- **Commit** `studio-current.png` together with renderer/UI code changes.
- **Do not** commit `/opt/cursor/artifacts/` (ephemeral chat attachments).

Handoff context and section-by-section goals: `docs/studio-redesign-handoff.md`.
