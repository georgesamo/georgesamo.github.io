---
name: deep-test
description: Deep QA pass over Samuka's Arcade (this Jekyll site + PWA) on desktop AND phone — a full smoke test of every page plus intricate checks of seamless nav, music, themes/skins, auth roles, the four games, modals, keyboard/touch, offline and layout. Use when asked to test, QA, smoke test, bug-hunt, "check everything works", or verify the web or mobile app before/after a change. Also covers visual bugs — icons not centred in their circle buttons, colour emoji mixed with flat glyphs, clipped text, broken looks per skin. Args (optional): `smoke` (fast pass only), `full` (default), an area name (nav, music, themes, auth, games, mobile, pwa, profile, a11y, visual), free-text focus like "visual music dock on phone", or `live` to run the read-only checks against the deployed site.
---

# Deep test — Samuka's Arcade

Goal: find real bugs a player (Nino, a guest, a phone user) would hit, and prove each one with evidence. You are a tester here, not a fixer: **do not edit source files** during the run. Collect findings, report them, then offer to fix.

## 0. Ground rules

- Use the **built-in browser** (`mcp__Claude_Browser__*`) — everything runs on localhost. Read pages as text (`read_page`, `get_page_text`, `javascript_tool`); screenshot only to evidence a visual bug.
- The pane must be visible with a real size (`tabs_context`). A 0×0 hidden pane breaks visibility and layout checks — ask the user to show it.
- **No outward side effects.** Never submit the contact form, post to the visitors wall/chat, save scores or change accounts against real Supabase. Mock sessions (`?as=…`) are fine for UI; before any submit/save button, check whether it would hit the network (`read_network_requests` after a dry look at the code) and skip it if so. On `live`, the run is strictly read-only (no `?as=`, it doesn't work there anyway).
- Music: start it only where the plan says; turn it off at the end (`SamukaLofi.stop()`).
- Reset state you created: `?as=out` to end the mock session, and remove localStorage keys you set (`samuka-konami`, `samuka-theme`, `samuka-volume`, `samuka-st-repeat`, …) unless the user wants them kept. Note the starting values first.
- Track every step on the task list (`update_plan`): one step per section below that's in scope.

## 1. Setup

1. `preview_start {name: "tests"}` (127.0.0.1:4100, no-cache) → open `/tests/` → wait, then read `window.__testResults` with `javascript_tool`. Any failure is a finding (quote the test name + message). This server is plain static — it does not run Jekyll, so use it only for the unit tests.
2. `preview_start {name: "jekyll"}` (127.0.0.1:4000) — the real site. If it fails, read `preview_logs` and report; don't try to fix the toolchain silently.
3. Read [tests/probes/page.js](../../../tests/probes/page.js) once. For every "probe" below, pass its full text to `javascript_tool`; it returns JSON (overflow, broken links/images, missing modules, unnamed controls, duplicate ids, small touch targets, duplicated singletons, theme/role/music state).
4. Before each page check, clear the console baseline: note the count from `read_console_messages`, and after the step read only new entries (`onlyErrors: true`). Also check `read_network_requests` for 4xx/5xx on same-origin URLs.

## 2. Smoke matrix (always runs, also the whole of `smoke`)

Pages: `/`, `/games/`, `/leaderboards/`, `/events/`, `/samuka/`, `/blog/`, the newest post under `/blog/` (from the sidebar), `/u/`, `/nino/`, `/soundtrack/`, `/offline/`, `/404.html`, plus a junk URL like `/does-not-exist/` (expect the 404 page).

Also run [tests/probes/visual.js](../../../tests/probes/visual.js) on each page × viewport and report its `misaligned` and `mixedIconStyles` (cheap, no screenshots — the looking pass is in the visual section).

Viewports: **desktop** (`resize_window preset: desktop`, pane size) and **phone** (`preset: mobile`, 375×812 — emulates touch + Android UA; **reload after switching** so load-time device gates re-run). Also run each page once in `colorScheme: light` vs `dark` on one viewport.

For each page × viewport, with a **hard load** (`navigate` to the URL, not a click):
- HTTP ok, no uncaught errors / console errors, no failed same-origin requests.
- Probe: `missingModules` empty, `pageOverflowPx <= 0`, no `brokenLinks`, `brokenImages`, `deadAnchors`, `duplicateIds`, `duplicatedSingletons`; exactly one visible h1 where the page has a title.
- Phone: `.mnav` bottom bar visible, desktop sidebar/tabs not covering content, the "more" button opens `#msheet` and the backdrop closes it; `smallTouchTargets` reviewed (report clusters, not every icon).
- Desktop: tabs bar marks the right tab `aria-current="page"`, sidebar tree highlights the current file.

Smoke ends here for `smoke`: report and stop.

## 3. Intricate checks (`full`, or the named area)

### nav — seamless navigation (`assets/js/nav.js`)
- Click through sidebar links, top tabs, phone `.mnav` and the "more" sheet. After each click: URL changed, `#main` swapped (not a full reload — check `performance.getEntriesByType("navigation")` count / a marker you set on `window` survives), title updated, tab + tree + mnav `is-here`/`aria-current` updated, scroll reset to top, focus not lost to `<body>` in a weird spot.
- Browser back/forward across 4+ pages (`navigate "back"`): content, tabs and title follow. Hash links on `/samuka/` (`#experience`, `#skills`, `#contact`…) scroll without a page swap; deep link `/samuka/#contact` from another page lands on the section.
- Re-init: after 10 rapid navigations, probe `duplicatedSingletons` is empty and things that bind on `samuka:page` (arcade best scores, hub stats, corner, projects, player) still work once — not twice (e.g. one click = one modal, one toast).
- `/soundtrack/` opens in a new tab from the sidebar (`target=_blank`), not inside `#main`.
- External links have `rel="noopener"`.

### music (`lofi.js`, `musicdock.js`)
- ♪ header button: starts music, opens the dock; play/pause, next, prev, seek, volume. Volume survives reload (`samuka-volume`).
- Music **keeps playing across seamless navigation** (check `SamukaLofi.isOn()` and that the AudioContext time keeps advancing across 3 page swaps) — a user requirement.
- Hidden tab: music must keep playing (user requirement). You can't truly hide the pane; check the code path (`document.hidden` lookahead) and say it's unverified live.
- Audio glitches: with music on, read `SamukaLofi.analyser().context.playbackStats?.underrunEvents`, wait ~20 s, read again — growth means audible crackle (a finding). If `playbackStats` is undefined in this Chromium, say it's unverified.
- Main shuffle = the 5 songs only (+ unlocked bonus tracks); the director's cut (track 6) only when picked. Check via the dock's track list / `SamukaLofi` info, don't listen through.
- Stop music at the end of this section.

### themes — mode × skin (`app.js`, `konami.js`)
- Dark/light toggle (`[data-toggle-theme]`): `data-theme` flips, `meta[name=theme-color]` updates, persists across reload and seamless nav, labels update.
- Skins by role: guest → phthalo only; `?as=samuka` → knight available; `?as=nino` → golden; konami (↑↑↓↓←→←→BA via `computer key`) → CRT for anyone. Each skin in dark AND light: probe + one screenshot of `/` per combo only if something looks off (unreadable text, invisible buttons, logo wrong — `theme-logo.html`).
- A skin the role can't use must not stick after `?as=out`.

### auth — roles via local mock (`auth.js`, `me.js`, `account-core.js`)
For each of `?as=guest`, `?as=user`, `?as=samuka`, `?as=nino`, then `?as=out`:
- `data-role` on `<html>` matches; `[data-team-only]` links (Nino's corner, soundtrack) visible only for samuka/nino.
- Avatar menu opens/closes (click, Esc, click outside); account window opens, every tab renders, closing returns focus to the opener. Phone: account lives in the phone sheet — check it there too.
- Sidebar `me` folder and leaderboard "jump to me" behave; `/u/` player card for the mock user renders without errors.
- Fresh sign-in starts in dark mode (documented behaviour).

### games — `SamukaArcade` (ids: `gems`, `sidekiq`, `schema`, `pitwall`)
For each game, on desktop and phone:
- Open from its card (`[data-play]`) and from the command palette. Modal is `aria-modal`, focus moves inside, background previews stop animating, page doesn't scroll behind it.
- Play: start, a few real inputs (keyboard on desktop: arrow keys / 1-2-3 for Sidekiq; taps on phone via `computer left_click` on the stage), pause if available. `SamukaArcade._debug()` exposes state for automated playtests — use it to drive to **game over** quickly rather than playing minutes.
- Game over fires `samuka:game` `{name:"over"}` (listen with a `window.addEventListener` you add before), a best score is stored and shown on the card after close, the matching bonus track unlocks (`samuka-suite.bonus`).
- Close with Esc, the × button and the backdrop; `samuka:game` "closed" fires; focus returns to the card; reopening starts clean (no doubled timers — score not ticking 2× speed).
- Phone: the stage fits 375×812 with no overflow and controls are tappable; also rotate to landscape (`resize_window 812×375`) mid-game — it must re-fit, not break.
- Daily mode (`install.js` handles `/?daily=1`, the PWA shortcut): as a guest it must ask to sign in instead of opening (`arcade.js` gates daily + race); with `?as=user` it opens Daily Gem Match with the seeded board, same board on reload.
- Live 1v1 (`race.js`): only open the dialog and check it renders + closes; don't start a real match.
- Resize the window mid-game and navigate (back button) mid-game: game closes or survives cleanly, no errors.

### palette, terminal, misc
- Command palette: Ctrl+P and `[data-open-palette]`; typing filters, ↑/↓ + Enter navigates (seamless), Esc closes and restores focus; game entries open games.
- Terminal (`terminal.js`), visitors wall, testimonials, events page, leaderboards tabs/filters, projects grid, patch bay (only check it renders; don't brute-force the puzzle), achievements toasts.
- Contact form on `/samuka/#contact`: client-side validation (empty, bad email, very long text) — **do not submit**.

### mobile — phone-specific
- Everything in smoke at 375×812, plus 320×640 (small Android) and 768×1024 (tablet; layout switches cleanly at the breakpoint — no half-desktop state).
- Bottom bar never covers the last content or game controls; sheets/modals scroll internally on short screens; no double-tap zoom traps on game buttons (`touch-action`); inputs ≥16px font (no iOS zoom-on-focus).
- Landscape phone (812×375) on `/` and inside one game.

### pwa — installable + offline (`sw.js`, manifest)
- `/assets/manifest.webmanifest` loads, icons resolve (fetch each), `start_url`/shortcut URLs load.
- `install.js` deliberately does **not** register `sw.js` on localhost, so locally only check that `/sw.js` is served with its precache list resolving (fetch each `PRECACHE` URL) and that `/offline/` renders. Registration, caching and the install button are only testable in `live` (`navigator.serviceWorker.getRegistration()`, `caches.keys()`). True offline can't be toggled from these tools — say it's unverified rather than guessing.
- Built-asset hashing (`scripts/optimize.mjs`) and `tests/smoke.mjs` only run in CI; mention that the local run doesn't cover minified bundles.

### a11y — keyboard and semantics
- Tab through `/` and one game from the top: visible focus ring everywhere, logical order, no traps except inside open modals (where Tab must cycle and Esc must exit).
- Probe `unnamedControls`, `imgsWithoutAlt`. `prefers-reduced-motion`: glitch effects (`glitch.js`, `loadglitch.js`, `textglitch.js`) should calm down — check the code honours it and say whether you could verify it live.
- Spot-check contrast on light mode + golden/knight skins where text sits on coloured panels.

### visual — alignment, icon style, clipping, per-skin looks
Text reading can't see these, so this section measures and then looks.

**How to look.** Screenshots need the pane visible (`tabs_context` says "displayed"). If it's hidden, the screenshot only captures the top-left part of the viewport at 2×. Ask the user to show the pane. If they're away, temporarily shift the element into the top-left for inspection only (`el.style.translate = "-400px -100px"`), screenshot, then clear the style. `computer zoom` takes screenshot-frame coordinates, so convert from CSS px with the factor the screenshot reports.

**1. Measure** — read [tests/probes/visual.js](../../../tests/probes/visual.js) and pass it to `javascript_tool`. Set `window.__vtRoot = ".mdock"` first to scope it to one area, and `window.__vtAll = true` to get every measurement. It finds small square/round icon buttons and compares the icon's **ink** (canvas `measureText` bounds for glyphs on the real baseline, shape bounds for SVG) with the button's centre. It returns:
- `misaligned`: icons more than 1.5px (or 6% of the button) off centre, or spilling outside the button, with `offPx` (+x = right, +y = low) and a `zoom` box.
- `mixedIconStyles`: a toolbar mixing colour emoji (⏪ 🔁 🔊 as blue/yellow tiles) with flat glyphs (⏮ ⏸ ⏹), or icons of very different visual size in same-size buttons.
- `unmeasuredCssIcons`: icons drawn with CSS (`<i class="fi">`, `::before`, the eq bars on the ♪ button while playing, the theme toggle). These need the screenshot check.
- `clippedText`: text cut off with no ellipsis.

**2. Look** — zoom screenshot every flagged item, every `unmeasuredCssIcons` entry, and this fixed set, which is always checked even when the probe is clean:
- the header: ♪ music button (stopped AND playing), theme toggle, avatar/sign-in, command-palette button
- the music dock open and playing: the SVG transport row (shuffle, prev, play/pause, next), the list/min buttons, volume and seek thumbs, the track list's current-track marker, and the secret-track progress marks
- a game modal: × close, score/HUD, the game-over overlay and its buttons
- the phone bottom bar (`.mnav`) and the "more" sheet, the account window tabs
- arcade cards on `/`, leaderboard rows with a long name, the 404 page

Run the set in each skin × mode: phthalo, knight (`?as=samuka`), golden (`?as=nino`), CRT (konami), dark and light. Do it at desktop and at 375×812. While looking, check:
- the icon is centred in its circle, the same size and weight as its neighbours, and the same style
- hover / focus-visible / active / pressed (`aria-pressed`) states don't shift the icon or the layout
- no clipped glyph tops or descenders, no text overlapping, the border-radius is truly round (not an oval)
- the icon is legible against the skin's colours

**3. Report** each visual finding with the measured offset (if any), skin/mode/viewport and the zoomed screenshot. Glyph rendering depends on the OS font: this pane is Chromium on Windows, so a symbol like ⏮ may look centred here but sit low on iOS/Android, where it renders as an emoji with different metrics. When the icons are Unicode glyphs, always list "real-phone glyph rendering" under *Not verified*. The usual fix to suggest is inline SVG icons.

### edge cases worth one try each
- localStorage throwing (run `Object.defineProperty(window, 'localStorage', {get(){throw new Error('blocked')}})` is not possible after load — instead read the modules' `store` wrappers and confirm every access is in try/catch; flag any bare `localStorage.` call).
- Double-click on every "play" / "open" button → one modal. Rapid Esc spam. Very long display names in the mock account.
- `?as=bogus` → treated as no mock. Unknown query params and trailing-slash-less URLs (`/games`) resolve.

## 4. `live` mode
Run section 2 (smoke) against `https://georgesamo.github.io` in the built-in browser, read-only, plus the pwa checks — this covers the minified CI build. No mock roles, no music autoplay, no form or score writes.

## 5. Report
Finish with `wrap_up`, then a report in chat:
- **Summary line**: pages × viewports covered, unit tests passed/failed, number of findings by severity.
- **Findings table**, most severe first: severity (blocker / major / minor / polish), area, page + viewport + role/theme, what happens vs what should, minimal repro steps, evidence (console text, probe field, screenshot).
- **Not verified** list: anything the tools couldn't exercise (hidden-tab audio, true offline, real Supabase writes, iOS Safari specifics — the pane is Chromium).
- If findings exist, ask which to fix (wrap_up question). Don't fix or commit during the test run.
- For a long report, offer once to publish it as a private Artifact page.

## In CI
`tests/deep.mjs` is the automated half of this skill. It uses the same probes (`tests/probes/`) on every page × desktop/phone, plus the nav, theme, games, music, palette, more-sheet and mock-role flows. It runs in `.github/workflows/pages.yml` after the unit tests and the smoke test, against the exact built artifact that gets deployed, and blocks the deploy on errors. Visual and a11y findings are warnings there; they show in the run's job summary, with screenshots in the `deep-report` artifact. When asked to look into a failed or warning-heavy deploy, start from that report: `gh run download <run-id> -n deep-report`. Then reproduce locally with this skill. The judgment parts — looking at screenshots per skin, real interactions, edge cases — stay with the skill.
