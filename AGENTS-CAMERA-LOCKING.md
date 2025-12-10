# Camera locking + accessibility plan

Goal: allow users to lock the camera onto Sun/Moon/Earth, switch between them, and automatically release on any manual camera input, with accessible controls.

### 0) Assumptions to confirm
- Identify the scene nodes/positions for sun/moon/earth (position + optional lookAt). Decide whether lock should keep a fixed distance or snap to an authored anchor per body.
- Confirm the existing camera controller abstraction (OrbitControls equivalent?) and where pointer deltas are applied.
- Note motion policy: respect `prefers-reduced-motion` by snapping instead of tweening.

### 1) Target table
- Add a single data table: `{ sun: { position, focus }, moon: {...}, earth: {...} }`. Keep it the only source of target metadata; no scattered conditionals.

### 2) Lock state + API
- Add `cameraLock: 'sun' | 'moon' | 'earth' | null` and helpers `setCameraLock(name | null)` and `getCameraLock()`.
- On `setCameraLock(name)`, kick a move-to-target action (see Step 3). On `null`, do nothing beyond clearing the flag.
- Add a small event hook (`onCameraLockChange`) if the UI layer needs to reflect state without polling.

### 3) Motion behavior
- Implement `moveCameraToTarget(target, { smooth: !prefersReducedMotion })` that lerps/tweens camera position and look vector to the target anchor; snap if reduced motion is on.
- While a lock tween is active, skip applying orbit deltas. If lock is cleared, cancel any in-flight tween.

### 4) Manual input release
- In the pointer/scroll handler (the one that feeds orbit deltas), if `cameraLock` is set, clear it before applying the delta. This satisfies “lock released upon any mouse movement.”
- Switching to another body just calls `setCameraLock(newTarget)`; previous lock state is overwritten.

### 5) Input surface (UI + keyboard)
- Add three focusable buttons (Sun/Moon/Earth) plus a “Free” button; use `aria-pressed` to mirror the lock state. Keep labels concise; include `title`/`aria-label` with context (“Lock camera on Sun”).
- Keyboard shortcuts: `1/2/3` (or `S/M/E`) to set the lock; `Esc` (and maybe `F`) to release. Make sure these are reachable without interfering with existing shortcuts.
- Announce state changes via a polite `aria-live` region: “Camera locked on Sun” / “Camera free.”

### 6) Validation
- Manual checks: click-to-lock, switch targets, mouse move to release, keyboard shortcuts behave, reduced-motion users get snap, screen reader reflects `aria-pressed` and live region updates.
- Add a minimal unit test for the controller logic (lock set/clear, release on pointer event) if the controller is testable outside the renderer.

### Future: selectable sound sets
- Define a sound set descriptor (name/id, 5-track URLs, metadata like gain trims) so the current set becomes one entry in a registry.
- Keep layer keys stable across sets (`solar-sun`, `solar-moon`, etc.) so occlusion/mix math stays unchanged; only the assets swap.
- Add a `currentSoundSet` state and `setSoundSet(id)` that preloads/buffers the 5 tracks, then swaps them atomically to avoid gaps; fall back to default on load failure.
- UI: expose a picker (buttons or select) with `aria-pressed`/`aria-label`, plus a live region announcing “Sound set: <name>”; keyboard shortcuts (e.g., cycle with `[` / `]`) optional.
- Persist selection (localStorage) and respect reduced-motion users by keeping transitions non-flashy (no sudden gain spikes).

### Accessibility focus (visually impaired / MUD roots)
- [x] Document camera lock accessibility goals here.
- [x] Keyboard-first lock/release: 1/2/3 (or S/M/E) to lock to Sun/Moon/Earth, Esc/F to free. Ensure focusable buttons mirror these with `aria-pressed`.
- [x] Non-visual feedback on lock changes: short per-body earcons; optional speech (“Locked on Sun”) via `aria-live` and SpeechSynthesis; no overlapping playback with ambience.
- [x] Orientation callouts in text (MUD style): a status line like “Facing NE, altitude 1.8R, target: Moon” updated on lock, unlock, and coarse heading changes. Screen-reader friendly, unobtrusive visually.
- [x] Safe motion modes: respect `prefers-reduced-motion`; allow a “text-first” toggle where lock snaps instantly and announces state without tweening.
- [ ] Sound set integration: earcons belong to the sound set descriptor so alternative sets swap cues without code changes; keep gains/occlusion routed through the existing audio manager.
- [ ] Tests/checks: verify lock/release via keyboard only; earcons/speech fire once per state change; reduced-motion snaps; screen readers read current state; no regression to pointer unlock behavior.
