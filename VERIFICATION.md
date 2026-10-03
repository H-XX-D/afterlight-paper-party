# Verified release

Verified on 2026-10-03. This record applies to the committed [AFTERLIGHT.html](AFTERLIGHT.html), not to older exports.

| Artifact | Value |
| --- | --- |
| SHA-256 | `16ddbe4e13a91684c98206acfabbd11347690ff38581f2d98985a491b72311e7` |
| File size | 27,235,761 bytes |
| Embedded runtime images | 40 |
| Embedded font files | 8 |
| Travelers and prepared poses | 8 travelers, 72 poses |
| Minigames | 24 |
| Source unit tests | 315 passed |
| Exact-file browser checks | 45 passed, 0 failed |

The source unit suite, Vite build and portable build passed before the browser run. A separate clean folder containing only the public repository files also passed `npm ci`, all 315 unit tests, the Vite build and the portable build; its rebuilt HTML had exactly the same SHA-256. The browser run used Chrome 154.0.8037.95. It copied only the exported HTML into a temporary folder and loaded it through `file://`; production source was unchanged throughout.

## What the browser checks exercise

- All embedded images decode offline. The title displays eight travelers, both motion atlases are loaded, and the renderer reports 72 prepared poses.
- All 24 games launch through the UI, respond to actual keyboard inputs, render their canvas/WebGL scene and reach results. This includes nine new fighter objectives and Gullet Gala's charged bite; all thirteen fighters exercise movement, jumping, attacks, shields and specials.
- Seven-card board turns, legal plays, Wild color selection, draw/pass, Last light penalties, forks, camera following and return to overview, story choices, passing encounters, landing bumps, lap rewards and final-score ranking.
- The board fills its stage above the framed card tray. Controls and rules are available through the pause menu, and dismissing help preserves the current hand.
- Card flight has spin keyframes and produces discard impact, predecessor ejection and paper-star effects.
- A 390×844 emulated touch device renders two-by-two standings, a usable hand, touch movement and reachable results controls.
- Four file browsers use the public PeerJS signaling service and actual WebRTC DataChannels. Guest mesh links open, opponents' hands stay masked, and guest card play, story selection, lap rewards, final standings, attacks and X specials synchronize.

The run recorded **zero uncaught page errors, console errors, failed resource requests or offline external requests**. Test browsers were closed after completion.

## Responsiveness under an injected delay

The guest's authoritative input send and snapshot callback were each delayed by 350 ms, creating a minimum 700 ms host-echo delay. After 102 ms, its rendered actor moved from x=400 to x=409.628, while the host remained at x=400. Another guest received the direct input over the mesh. The final position difference was 0.00002597 pixels. This verifies local prediction and reconciliation for that measured scenario; it is not a general network-latency or frame-rate benchmark.

## Reproduce

```sh
npm ci
npm test
npm run build
npm run build:portable
npm run test:portable
```

Install Playwright's Chromium if a compatible browser is unavailable (`npx playwright install chromium`). The portable browser script prefers an installed Google Chrome on macOS and otherwise uses Playwright Chromium. Internet is required for its public PeerJS phase. Reports, screenshots and the generated portable manifest are written to the ignored `verification/` directory.

## Limits

The four network peers ran on one computer. Separate WANs, restrictive NATs and TURN relays were not covered. Phone tests used browser emulation, not a physical device. Deterministic hand/position fixtures and accelerated game timers cover edge cases; these are not 24 naturally timed full matches. Automated checks do not establish artistic quality, balance or long-term enjoyment. [BEHAVIOR-AUDIT.md](BEHAVIOR-AUDIT.md) documents the implementation's behavioral gaps and design tradeoffs.

Earlier material and performance measurements belong to older artifact hashes, including `ab749583…`; they are historical and are not claimed as measurements of this release.
