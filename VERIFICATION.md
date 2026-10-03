# Verified desktop release

Verified on 2026-10-03. This record applies to the committed [AFTERLIGHT.html](AFTERLIGHT.html). Desktop is the current target; mobile verification was explicitly skipped for this pass.

| Artifact | Value |
| --- | --- |
| SHA-256 | `027e160ea696ead13471293504d8b8e6c20ffb4a50b652a76b762244a54f4439` |
| File size | 27,255,698 bytes |
| Embedded runtime images / font files | 40 / 8 |
| Travelers / prepared poses / minigames | 8 / 72 / 24 |
| Source unit tests | 338 passed |
| Exact-file desktop browser checks | 46 passed, 0 failed, 1 mobile check skipped |

Vite and portable builds passed. Browser verification copied only the exported HTML into a temporary folder and loaded it through `file://` using Chrome 154.0.8037.95. All 81 frozen source/runtime file hashes remained unchanged through the checks. Reports, screenshots and source hashes remain local under the ignored `verification/` directory.

## Geometry and visual verification

All 24 worlds rendered image-derived relief with 1,421 vertices, four folded contour meshes and five depth layers. Geometry and image caches stayed bounded at five realms. The board reported 48 stops and 358 paper solids with maximum depth 7.36; the four platform styles reported four cached frames and maximum depth 6. These depth values are renderer coordinates, not gameplay units. Both static bakes release temporary GPU resources and add zero WebGL passes per gameplay frame.

Separate source fixtures compared six scenes with depth enabled/disabled at fixed times and checked that drawing did not mutate gameplay state. Final images for the board, Rift Rumble, Gullet Gala and Gallery were visually inspected for printed-art continuity, platform/foot alignment, clear play space and unwanted straight cloud seams. The cloud seams found in the first pass were corrected. This review supports those observed compositions; it does not establish artistic quality in every possible frame.

## Desktop gameplay and online verification

The exact-file checks exercised all embedded images and fonts offline; eight travelers and 72 poses; all 24 games through UI launch, keyboard actions and results; movement, attacks, shields and specials; board cards, forks, follow camera, stories, contacts, lap rewards and final-score ranking. The full-screen stage, framed card dock, card spin/slap effects and help-menu return also passed.

Four file browsers connected through public PeerJS signaling and real WebRTC DataChannels. Guest mesh links, private hands, card play, story selection, lap rewards, final standings, attacks and specials synchronized. With 350 ms of input delay plus 350 ms of snapshot delay injected, a guest's rendered position moved from x=400 to x=412.7024 within 104 ms while the host remained at x=400. Its final reconciliation error was approximately 0.000016 pixels. This establishes prediction and reconciliation in that scenario; it is not a universal network-latency measurement.

The run recorded zero page errors, console errors, failed resource requests or offline external requests. All verification browsers were closed.

## Current-file frame-rate sample

A separate exclusive run measured the same HTML offline in one headless Chrome page at a 1280×900 viewport, default CPU rate: 30 warm-up frames followed by 180 measured animation intervals per scene. Four bots exercised the board and each sampled game; later courses were advanced through the production fixed-step simulator. Every sample remained in live gameplay.

| Scene | Average FPS | 95th-percentile frame | Frames over 25 ms |
| --- | --- | --- | --- |
| moving-card-board | 59.67 | 16.8 ms | 1 |
| inkfall | 60.00 | 16.7 ms | 0 |
| rift-rumble | 60.00 | 16.8 ms | 0 |
| hollow-horde | 60.00 | 16.7 ms | 0 |
| bellows-boxing | 60.00 | 16.8 ms | 0 |
| gullet-gala | 60.00 | 16.8 ms | 0 |
| colossus-wake | 60.00 | 16.8 ms | 0 |

All seven samples recorded zero measured long tasks over 50 ms and no page errors. Startup to the ready application took 4.33 seconds. The moving board had one 33.3 ms measured interval; the other six samples had none over 25 ms. These short same-machine samples are not a worst-case guarantee for other computers, long sessions or background tabs.

## Reproduce

```sh
npm ci
npm test
npm run build
npm run build:portable
DESKTOP_ONLY=1 npm run test:portable
AFTERLIGHT_PERFORMANCE_LABEL=desktop-3d npm run test:performance
```

The portable script prefers installed Google Chrome on macOS and otherwise uses Playwright Chromium (`npx playwright install chromium` if needed). Its public PeerJS phase requires internet. Solo play and the offline phases need only the HTML.

## Limits

The network peers ran on one computer; separate WANs, restrictive NATs and TURN relays were not tested. Edge cases use deterministic fixtures and accelerated timers, rather than 24 naturally timed complete matches. Gameplay remains two-dimensional inside a three-dimensional paper presentation. Geometry, tests and frame rate do not by themselves prove balance or long-term enjoyment. [BEHAVIOR-AUDIT.md](BEHAVIOR-AUDIT.md) records remaining behavioral gaps. Earlier exports and measurements are historical and are not evidence for this file.
