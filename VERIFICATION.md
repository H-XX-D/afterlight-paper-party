# Verified folded paper desktop release

Verified on 2026-10-03 (America/Los_Angeles). This record applies to the committed [AFTERLIGHT.html](AFTERLIGHT.html). Desktop is the current target; the mobile check was explicitly skipped.

| Artifact | Value |
| --- | --- |
| SHA-256 | `de1b302c52ac543002b8003b0ea7960fc37c4b4fc604038e3bbeee3ef77f9a92` |
| File size | 28,953,110 bytes |
| Embedded runtime images / font subsets | 44 / 4 |
| Travelers / prepared poses / minigames | 8 / 72 / 26 |
| Source unit tests | 535 passed, 0 failed |
| Exact-file desktop browser checks | 52 passed, 0 failed, 1 mobile check skipped |
| Additional exact-file art / personality / folded-world checks | 12 / 15 / 14 passed |

Vite and portable builds passed. Browser suites copied only the exported HTML into a temporary folder and loaded it through `file://` in Chrome 154.0.8037.95. All five reports above identify this same SHA-256. The final comparison matched all 152 recorded source, runtime asset and verification-script hashes. Reports, screenshots, native transport receipts and source hashes remain local under ignored `verification/`.

## Paper art and dimensional presentation

The corrected prop, paper-object, environmental and effect atlases retain smooth inked outlines, restrained printed pigment and visible folded cardstock faces. Effects use folded impact stars, scalloped paper puffs, separated confetti and paper shield fragments. The legacy internal `pixel-fx` key resolves to the new smooth `folded-paper-fx.webp`; it does not select pixel artwork.

All 72 prepared character poses use their idle reference for body scale, feet and paper exposure. Eight protected cloth palettes distinguish the cast without tinting faces, tools or deep outline ink. Shared atlas ownership recovers handles, supports and overshooting pose parts without importing neighboring fragments. The Briar follow-through crop uses its original 288-pixel source window. The art audit checks source crops, geometry, exposure and costumes, all 26 default-Medium UI launches, explicit Easy/Hard selection, and fullscreen rendering at DPR 1 and DPR 2. These measurable checks support consistency; they do not substitute for visual judgment.

Actual gameplay diagnostics confirm five depth layers, image-derived relief, four printed folded environmental models, four closed support tabs and 76 crease facets. The checked world has 22 textured meshes and zero untextured visible meshes. Paper platforms preserve their illustrated source; temporary static-bake GPU resources are released. Animated environment objects and four near-camera wings join the actors' and props' lighting pass before the HUD. Surgery cavities use shaded original gear rims and paper channel lips. Viewport margins use the current scene's artwork.

Final board, Rift Rumble, Shadow Play, Surgery and Tower images were visually inspected for original-art continuity, whole silhouettes, fold shading, readable central action and unobscured HUD. A dark board capture was traced to the CSS reveal starting after the JavaScript transition became idle; screenshot readiness now waits for rendered shell opacity. The game reached normal brightness without a runtime change. This review covers the observed compositions, not every possible animation frame.

## Gameplay, difficulty and real WebRTC

The exact-file suite exercised every embedded image/font offline; all 26 minigames through UI launch, keyboard controls and results; attacks, guards and specials; seven-card deals, matching cards, chains, stacked draw debt, private buffs and shuffled turn order; board forks, stories, contact reactions, follow camera, lap rewards and final scoring. The two new games are Clockwork Surgery and Tottering Tower. Difficulty choices reach the production simulator. Initial network profiles and saved selections recover unsupported traveler indices to character 0 before rendering; the extra portrait-picker regression covers fractional and legacy saved values and a valid numeric string. Separate source tests check seeded imperfect control decisions and preserve human rules.

Four isolated file-browser contexts connected through the public PeerJS service and real WebRTC DataChannels. All three guests opened two direct input mesh links. Own-character lobby edits, roster locking, private hands/buffs, card actions, story choices, lap rewards, attacks, specials, seeded surprises, both new challenges and final standings synchronized. A finisher with 40 points received 10 bonus points and ended with 50; the rival with 80 remained the winner on all four clients.

The old end-of-round disconnect was causally reproduced through the installed PeerJS codec: its JSON channel rejects UTF-8 packets at 16,300 bytes; that connection error previously caused host removal of all guests. The canonical channel now carries exact JSON text inside PeerJS binary chunks, with bounded parsing and existing packet validation. Direct BinaryPack object encoding was rejected after a native floating-point round-trip changed a value. The 49 network unit tests exercise actual library encoding, full/delta/resync equality, sender binding and recipient privacy, including all 26 native game states.

The real-browser regression clusters four unprotected fighters for one ordinary production attack tick. Native strikes fill the existing 100-effect cap, producing private recipient views of 29,265–29,593 bytes, without padding or fabricated effects. The largest observed outgoing packet was 30,365 bytes. All four canonical connections remained open through results; no connection errors or close events were recorded. Separate randomly seeded rounds can produce smaller packets, so packet-limit coverage uses this deterministic native fixture.

With 350 ms of canonical input delay plus 350 ms of snapshot callback delay injected, the guest's actual rendered position moved from x=400 to x=419.4629 within 107 ms, while the host remained at x=400. A direct mesh input also reached the observing guest. Final position reconciliation error was approximately 0.000015 pixels. This proves local prediction/reconciliation for that scenario; it is not a universal latency claim.

The full browser run recorded zero page errors, console errors, failed resource requests or offline external requests. All verification browsers were closed.

## Current-file frame-rate sample

One exclusive offline headless Chrome page at 1280×900 and default CPU rate measured 30 warm-up frames followed by 180 animation intervals per scene. Four bots exercised the board and games; later courses were advanced through the production fixed-step simulator. Every sample remained in live gameplay. Warm-up and the first measured second are recorded separately in the local report.

| Scene | Average FPS | 95th-percentile frame | Frames over 25 ms | First measured second FPS |
| --- | --- | --- | --- | --- |
| moving-card-board | 58.38 | 16.8 ms | 5 | 58.03 |
| inkfall | 60.00 | 16.8 ms | 0 | 60.00 |
| rift-rumble | 58.38 | 16.8 ms | 2 | 55.09 |
| hollow-horde | 60.00 | 16.8 ms | 0 | 59.99 |
| bellows-boxing | 59.67 | 16.8 ms | 1 | 59.02 |
| gullet-gala | 60.00 | 16.7 ms | 0 | 60.00 |
| colossus-wake | 60.00 | 16.8 ms | 0 | 60.00 |
| clockwork-surgery | 59.67 | 16.8 ms | 1 | 59.02 |
| tottering-tower | 60.00 | 16.8 ms | 0 | 60.00 |

All nine samples stayed in live gameplay and recorded no page errors. Eight scenes recorded zero measured Long Tasks over 50 ms; Rift recorded 2, totaling 107 ms with a 55 ms maximum. Warm-up samples recorded no Long Tasks. Startup to the ready application took 7.83 seconds. The largest measured animation interval was 66.6 ms. Rift's first measured second ran at 55.09 FPS before its complete sample averaged 58.38 FPS. These short same-machine workloads are not worst-case or sustained performance guarantees for other computers or background tabs.

## Reproduce

```sh
npm ci
npm test
npm run build
npm run build:portable
node scripts/verify-art-consistency.mjs
node scripts/verify-personality.mjs
node scripts/verify-folded-worlds.mjs
DESKTOP_ONLY=1 npm run test:portable
AFTERLIGHT_PERFORMANCE_LABEL=final npm run test:performance
```

The portable verifier prefers installed Google Chrome on macOS and otherwise uses Playwright Chromium (`npx playwright install chromium` if needed). Its public PeerJS phase requires internet. Solo play and offline phases need only the HTML. Everyone in an online room should use the same current export.

## Limits

The peers ran on one computer; separate WANs, restrictive NATs and TURN relays were not tested. Edge cases use deterministic fixtures and accelerated timers, rather than 26 naturally timed full matches. Gameplay remains two-dimensional inside a three-dimensional paper presentation. Geometry, automation and frame rate do not prove balance or long-term enjoyment. [BEHAVIOR-AUDIT.md](BEHAVIOR-AUDIT.md) records remaining behavioral gaps. Earlier exports and measurements are historical and are not evidence for this file.
