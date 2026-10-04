# AFTERLIGHT — Paper Party

A desktop browser party game for one to four players with eight original paper travelers, a 48-space realm board, color-matching card turns, and **26 minigames**. Its art direction combines the inked industrial atmosphere of [Lorn’s “Anvil,” featured by METALOCUS](https://www.metalocus.es/en/news/anvil-lorn), dimensional paper cutouts and floating dioramas. Characters, scenery and generated game artwork are original. [RESEARCH-DESIGN.md](RESEARCH-DESIGN.md) records the design references and distinguishes their documented features from Afterlight’s own implementation.

**Open and share one file**



Open **[AFTERLIGHT.html](AFTERLIGHT.html)** directly in a current browser. Send that file to friends: it embeds the game code, PeerJS, styling, fonts, scenery and sprites. Solo party and arcade play work offline. Online rooms need internet access for signaling and WebRTC.

The title screen offers **Play solo** for a solo party, **Play with friends** to host or join, and **Minigames** to select a minigame. Choose one of eight travelers in the large portrait picker; the selected traveler’s special is described beside the cast. Solo and arcade practice offer **Easy / Medium / Hard** computer rivals, with **Medium** as the default. For an online party, every friend opens their own copy, chooses Play with friends, and enters the host’s six-character room code. The lobby displays four large paper travelers. Click your own portrait to change your traveler or name, then apply the choice; every participant receives the host’s updated roster. The host chooses the rival difficulty and starts the party; empty seats become computer rivals. Character edits stop when the party starts. Keep the host’s tab open and visible. A static HTTPS website is also an option for sharing a URL.

The interface fills the viewport without a permanent game header. Compact corner buttons open the overview, fullscreen and pause menu. Detailed instructions live under **Controls & rules** in the pause menu and in a collapsed section before each minigame. On the board, your portrait stays on the left and the active rival appears on the right; plates show points, cards and the leader, while a fanned hand dock holds your cards. Played cards spin into the physical center of the board ring, slap the discard and scatter paper stars. During minigames, the illustrated game HUD supplies scores, a timer and objective status. Platform fights also show damage, lives, shields and special cooldowns. The board camera eases toward a moving traveler after the card flight; its overview button returns to the full route. The current layout and visual tuning target desktop displays.

Rebuild the shareable file after source changes:

```sh
npm ci
npm run build:portable
```

The first portable build may download interface fonts; subsequent builds use cached font files, refreshing them when the font import changes. The single HTML embeds Alegreya for body text and Alegreya SC for titles, menus and the canvas HUD. The output is `AFTERLIGHT.html`; `verification/portable-manifest.json` records its size and SHA-256. See [VERIFICATION.md](VERIFICATION.md) for the committed artifact and its test scope. The generated manifest and browser reports stay local and are excluded from Git.

**Points decide the winner; the last card decides when**

Each traveler starts with **seven cards** and an umbrella item. Four seats are always present, filled by people and bots. These are **custom UNO-inspired party rules**, including number chains and penalty stacking. Match the discard’s **active color or face value/action symbol**, or play a legal Wild. Colors also have distinct symbols: Ivory ☼, Jade ♧, Violet ☾ and Ember ♨.

Playing your final card ends the party immediately and adds **25% of your current points, rounded up**. The traveler with the **highest final points** wins, even if someone else emptied their hand. For example, a finisher with 41 points receives 11, ending on 52; a rival already on 53 still wins. Equal points favor the finisher, then more minigame wins, fewer remaining cards, and lower seat order. The one-card hand display shows a projected finish so you can weigh ending now against drawing to keep the journey going. Bots use the same projection and delay a losing finish.

The final card applies its printed bonus and order effects before scoring: Ink Gleam adds three points before calculating the finishing bonus, and Reverse or Clockwork Fold updates turn order. It then closes the party and clears any unresolved draw debt. **No rival is forced to draw after closure, and the final card grants no movement, landing or lap reward.** “Sparks” in the simulation and some art text are the same points shown in the scoreboard.

| Card | Card effect | Movement for a nonfinal play |
| --- | --- | --- |
| Number 1–9 | Match its color or number. | Its number of steps. |
| Zero | Match its color or zero. | One step. |
| Skip | The next player loses their turn. | Four steps. |
| Reverse | Reverse card-turn order. | Four steps. |
| Draw Two | Add two to the next player’s draw debt. They must stack another Draw Two or take the full debt and end their turn. | Four steps. |
| Wild | Choose the next active color. | Five steps. |
| Wild Draw Four | Choose a color and add four to the next player’s debt. They must stack another Draw Four or take the full debt and end their turn. An ordinary play is legal only if you hold no card of the active color. | Five steps. |

After a nonfinal **number card**, you may play another card with that same number, even in another color, or choose **Travel**. Each chained card adds its movement and changes the active color. Travel begins one combined journey; the chain still counts as one completed card turn. Action cards and Wilds cannot join a number chain. A final card closes the party immediately, including during a chain.

For draw debt, **only the same penalty symbol stacks**: +2 on +2 or +4 on +4, regardless of color. A stacked +4 may be played even if you hold the active color; this exception applies only while responding to +4 debt. The debt follows the actual next player in the current turn order. **Take +N** draws the accumulated amount and completes your turn without movement. Passing is unavailable while debt is unresolved. Ordinary Draw Four plays retain the active-color restriction.

On an ordinary turn, you can draw one card even when you have a legal play. After drawing, only that new card may be played, if legal; otherwise choose Pass. You cannot draw again that turn. When the draw pile runs out, older discards are shuffled back while the top discard stays visible.

Some cards receive one of three printed buffs. The owner can see the buff before playing; other travelers learn it when the card is played. Buffs also come from matching board pads.

| Card buff | Effect when played |
| --- | --- |
| Comet Fold | Add **two movement steps** to a nonfinal play. |
| Ink Gleam | Gain **three points**, including before a final card’s finishing bonus. |
| Clockwork Fold | Shuffle future **turn order** using the host’s seeded rules. Traveler IDs, physical seats, board positions and host ownership stay fixed. |

With two cards, press **LAST LIGHT** before playing down to one, including between chained cards. Missing the call automatically adds two cards. This deterministic house rule avoids an online reaction race. The call resets after drawing or completing a play.

After **four completed card turns**, everyone plays a minigame. Skipped seats do not count as extra completed turns. The host starts after the instructions. Results award **20 / 12 / 8 / 4 party points**; tied scores share their placement and reward. First place also counts as a minigame win and grants an umbrella item if the item pocket is empty. Minigames do not change hands. Card turns resume in the correct seat and direction; there is no round limit.

**The circular realm board**

The **48 unnumbered stepping stones** travel through Whispering Grove, Clockwork City, Mushroom Marsh, Frosthollow, Ember Wastes and the Eternal Tree. Every pad has an illustrated symbol, subtle color and animated paper prop. Three rings hold 16 spaces each. The middle circuit reverses direction so the short radial bridges fit without crossing; the return bridge closes the loop. Rope ladders, stone chutes and secret footbridges link neighboring rings. Travelers follow the same curves as the artwork; numeric indices remain internal to the simulation.

| Feature | Effect |
| --- | --- |
| Completed lap | A normal forward step across the loop’s return seam awards **25 points** and increments your lap count. Each completed crossing awards once. |
| Secret bridge forks | Choose the main route or marked shortcut. A shortcut consumes one step. You can preselect your next route before playing. |
| Moon ladders | Landing at a base climbs to its linked space. |
| Shadow chutes | Landing slides back to the linked space unless an active umbrella is consumed to block it. |
| Cache | Find a boost or umbrella; if the item pocket is occupied, gain three points. |
| Boost item | Add three steps to your next nonfinal played card. |
| Lantern shrine | Light a realm lantern and gain four points. |
| Story platform | Choose between two outcomes from the nine encounters below. |
| Ordinary pad | Apply its illustrated reward, risk or card buff from the twelve kinds below. |
| Passing another traveler | A paper high-five grants **+2 to the mover and +1 to that traveler**. |
| Landing on another traveler | Gain **+3 per unprotected traveler** and bump them back **two spaces**. Their active umbrella blocks the bump and its points, then is consumed. |

Each other traveler can interact with the mover at most once per combined card journey, so repeated loops cannot farm the same contact. The initial departure from a shared start grants nothing. Bumps do not trigger another landing chain. Shortcut, ladder, chute, door and bump movement award no lap bonus. Ladders and chutes activate on landing, not on passing. Activate an umbrella item before danger; it then protects against one chute or bump.

The twelve ordinary pad kinds are assigned deterministically around the loop. Their symbol and prop identify their effect; animation itself never grants a reward.

| Pad | Landing effect |
| --- | --- |
| Moon Mint | Gain four points. |
| Thorn Toll | Lose up to three points; points cannot fall below zero. |
| Spring Fold | Add two steps to your next played card. |
| Umbrella Roost | Gain protection from one chute or bump. |
| Lantern Flare | Gain a lantern and three points. |
| Sly Mimic | Take up to three points from the richest other traveler. |
| Comet Gift | Give one unbuffed card in your private hand Comet Fold. |
| Ink Prize | Give one unbuffed card in your private hand Ink Gleam. |
| Clockwork Switch | Give one unbuffed card in your private hand Clockwork Fold. |
| Twin Moons | Every traveler gains two points. |
| Hungry Cache | Gain seven points and draw one card. |
| Quiet Bank | Gain two points and add one step to your next played card. |

If a buff pad finds every card already enchanted, it awards two points instead. Public effects report the kind and number of buffs granted; they never identify the selected private card.

**Nine story encounters, eighteen choices**

Three story-emblem platforms draw from a seeded encounter deck that offers every story once before shuffling again. A human decision waits for that player; bots choose deterministically. Choices affect points, the next card’s movement, turn order, location or the next minigame while the host keeps card identities private.

| Encounter | First choice | Second choice |
| --- | --- | --- |
| Moon Carnival | **Claim the moon prize:** +8 points. | **Join the parade:** +4 points and +1 step on your next card. |
| Paper Moth Procession | **Follow the moths:** +3 steps on your next card. | **Keep their lantern:** +5 points. |
| The Polite Mimic | **Borrow a rival’s treasure:** Take up to 5 points from the richest other player. | **Accept a small gift:** +3 points, without taking from anyone. |
| Midnight Bargain | **Take the midnight deal:** +12 points and draw 1 card. | **Take the safe gift:** +4 points, no card. |
| The Folded Door | **Step through the door:** Move to the marked nearby platform. No lap reward or second landing event. | **Stay for a paper picnic:** +4 points. |
| Clockwork Tea Party | **Reverse the turn order:** Players take their next turns in the opposite order. | **Wind your own boots:** +2 steps on your next card. |
| Umbrella Rain | **Catch a protective umbrella:** +3 points and protection from the next chute. | **Collect the silver raindrops:** +7 points. |
| The Clockwork Clinic | **Open the clinic:** Queue Clockwork Surgery as the next party challenge. | **Donate a spare gear:** +4 points. |
| The Tottering Workshop | **Challenge the tower:** Queue Tottering Tower as the next party challenge. | **Brace the bridge:** +2 steps on your next card. |

The Folded Door leads to a nearby marked pad. It grants no lap or second landing reward/event, although arrival can make a bounded traveler contact. Umbrella Rain’s protection can also block a bump. Accepting a clinic or tower challenge queues it for the next four-turn minigame boundary and removes its duplicate from the remaining game deck. A later accepted challenge replaces the queue; taking points or a boost instead preserves an existing queue. Story rewards and encounter animations are replicated to everyone; extra drawn card faces remain visible only to their owner.

**Controls and travelers**

| Where | Controls |
| --- | --- |
| Card turns | Click a highlighted legal card. Choose a Wild color. Chain a matching number or choose Travel; stack a matching penalty or Take +N. Draw, Pass, LAST LIGHT, item and route buttons appear as appropriate. |
| Forks and stories | Choose one of the two offered options. |
| Minigames | Arrows or WASD move/select. Space or Enter performs the action. Follow that game’s instruction card. |
| Platform fights | Left/right move; Up jumps, then double-jumps. Space attacks: slash on ground, spin in air; Up + Space uppercuts; airborne Down + Space dives. Hold Down to guard; a fresh press can parry. **X or Shift** uses your character special. |
| Gullet Gala | Left/right aim; tap Space for a bite or hold/release for a long gulp. Up toggles GULP/SIP. Down burps pellets and nearby rival jaws away. |
| Clockwork Surgery | Arrows guide tweezers. Hold Space to lift and carry; follow the channel to the tray, then release. X briefly steadies the tool. |
| Tottering Tower | Arrows choose a block; hold Space to pull. Left/right counterbalance, Down inches and Up rushes. Release, aim with left/right, then tap Space to stack. Hold X to brace. |
| Touch | Direction pad, Action and Special buttons, plus card, route and story controls. |
| Menu | Escape or the menu button opens/closes the menu. Solo pauses; an online match continues. |
| Display and sound | Fullscreen fills the display where supported. The note button enables/mutes synthesized effects. |

Traveler selection changes the special move in **all 13 platform games**. The other games keep their own objective-specific controls. Specials have distinct windup, active and recovery stages and cooldowns; rivals can interrupt a windup. Names, traveler choice and the selected difficulty persist in local browser storage; matches do not.

| Traveler | Special | What it does | Cooldown |
| --- | --- | --- | --- |
| Pip — The courier | DASH CUT | Wind up, then rush forward with a courier dash-cut. | 5 s |
| Moth — The dreamer | WING GUST | Lift nearby rivals into the air with a rising wing gust. | 5.8 s |
| Bolt — The tinkerer | MAGNET | Pull rivals toward your magnet, then burst them away. | 6.5 s |
| Wisp — The keeper | LANTERN | Send a traveling lantern bolt through the fight. | 5.5 s |
| Rook — The raven knight | STONE SLAM | A heavy slam clears both sides. Land it from solid ground. | 6.4 s |
| Briar — The thorn doll | THORN GRASP | Catch a distant rival in a reaching thorn grasp. | 6 s |
| Vellum — The ink jester | INK BLINK | Blink through danger and slash the path you leave behind. | 6.5 s |
| Nix — The winter owl | FROST FAN | Spread a fan of frost and slow your rivals. | 6.3 s |

**Computer rival difficulty**

Easy, Medium and Hard change the computer-controlled inputs in **all 26 minigames**. Rivals have delayed reactions, intermittent decisions, imperfect aim/timing, missed actions and occasional movement or planning mistakes. Hard reduces those errors while retaining them. Precision tools, grid navigation and rhythm games adjust the baseline delays to their own controls. Human physics, attack strength, scores, objectives and starting resources do not change with the setting.

The host’s choice is stored in the party and in each minigame’s public `botDifficulty` state so peers replay the same seeded computer decisions. The selector does not change the card-board bot policy, card legality or points economy; those bots continue to consider the projected final-card score. There is no adaptive difficulty or guarantee of a particular win rate. [Difficulty implementation](src/bot-difficulty.js), [production game setup](src/minigames.js).

**The 26 minigames**

The ordinary party deck shuffles all 26 and plays each once before repeating. A story-queued challenge takes the next slot and is removed from the remaining cycle; a deliberate story choice can repeat a challenge already played. Arcade selects any game directly. Ending the card journey can finish a party before every game appears. The table below mirrors the production `MINIGAMES` definitions in menu order.

| # | Game | Objective | Controls | Duration |
| --- | --- | --- | --- | --- |
| 1 | INKFALL | Dodge changing gear waves; chain daring phases through the teeth to recharge your dash. | ← → move · Space phase-dash · gear waves change every 7s · close phases recharge | 36 s |
| 2 | MOTH LIGHT | Flutter between rare moths, risk a heavy cargo, then bank quickly before the wisp steals it. | Arrows move · Space banks at the nest / flutters outside it · rare cargo earns more | 36 s |
| 3 | LAST TRAIN | Read low and high ghost trains; build streaks and risk close clears through express passes. | Space jumps LOW trains · hold ↓ under HIGH trains · close low clears earn more | 34 s |
| 4 | PAPER PULSE | Read changing moon/sun phrases, switch instruments, and finish clean phrases for an encore. | ← moon / → sun instrument · Space hits matching notes · clean 8-note phrases earn encores | 36 s |
| 5 | BACK ALLEYS | Hunt shifting runes, chain phases through shelves, and turn each key into a fast escape. | Arrows move · Space phases 2 tiles · key then exit · new runes recharge phase chains | 40 s |
| 6 | BELL BREAKERS | Shatter moving bells across the balconies. Chain breaks within 3 seconds for a rising combo; gilded bells take two light hits or one heavy strike and pay double. | ↑ double jump · Space / directional strike · X special · ↓ parry · chase bells and chain breaks | 45 s |
| 7 | WATCHMAN | Sprint through green windows, slip into moving cover, and chain clean deliveries past the patrol. | ↑ advance · ← → cover lane · ↓ crouch in lit cover · Space sprints · clean cover slips chain bonuses | 36 s |
| 8 | RELIC LAUNCH | Four simultaneous 11-second trials: batter your own relic for 7 seconds, then launch it before the bell. Damage and your finishing move determine its real flight distance. | ← → approach your relic · Space charge hits · ↑+Space high launch · X special · launch during the 3-second bell | 44 s |
| 9 | SINKING CITY | Chain landings between shifting islands, brace against gusts, and risk a detour for sky shards. | ← → move · Space jumps · ↓ braces · long safe landings chain · gold shards +12 | 36 s |
| 10 | PAPER SNIPER | Thread shots past blue couriers, break rotating armor, and charge for marked sentinels. | ← → aim · ↓ steady · tap Space fires · hold/release pierces armor · spare BLUE | 36 s |
| 11 | HOLLOW HORDE | Compete for paper-foe knockouts through six escalating waves. Foes warn before lunging; parry their strike to turn it back. Stay alive and steal the finishing blow. | ↑ double jump · Space / directional strike · X special · ↓ timed parry · finish the paper horde | 48 s |
| 12 | RIFT BALL | Strike the heavy moon into either gate. The last striker earns the goal; uppercuts lob and dives spike. A timed guard reflects the ball. Final 12 seconds score double. | ↑ double jump · Space kick · ↑+Space lob · air ↓+Space spike · X special · ↓ reflect | 45 s |
| 13 | SPARK HEIST | Collect loose sparks and bank them at the moving altar. Clean hits spill a rival’s cargo. Carry four for a bulk bonus, but a fall drops everything. | ↑ double jump · Space steal cargo · X special · ↓ guard · touch sparks, then stand by the active altar | 45 s |
| 14 | FUSE FESTIVAL | Catch the cursed lantern, then strike to throw or pass it. The fuse keeps burning through every hand. Escape its blast or time a perfect guard; later fuses burn faster. | ↑ double jump · Space throw / pass · X special · ↓ timed blast parry · leave the blast before zero | 44 s |
| 15 | CONSTELLATION | Race drifting stars for quick-link bonuses that refill focus, then shield through crossing comets. | Arrows move · hold Space slows / shields / extends reach · quick links refill focus | 38 s |
| 16 | GULLET GALA | Four hungry paper creatures share one moon bowl. Sweep up pearls, dodge blackthorns, and burp a rival’s feast away. | ← → swivel · tap Space to bite · hold/release for a long gulp · ↑ switches GULP / SIP · ↓ burps pellets and rival jaws | 44 s |
| 17 | TOWER RELAY | Race your personal sequence of moving seals: left, summit, right, ground. Each circuit gives a bonus. Knock rivals off their route as the balconies accelerate. | ↑ double jump · ← → reach your numbered seal · Space disrupt rivals · X special · ↓ guard | 45 s |
| 18 | BELLOWS BOXING | Wind up punches in a tightening toy ring (solo uses a sparring automaton). Clean hits build spring pressure; at 75 the rival’s head pops for 35 points. Guard drains stamina, while precise parries punish windups. | ← → footwork · hold Space wind-up punch · ↑+Space rising hook · X special · ↓ guard / timed parry | 45 s |
| 19 | COLOSSUS WAKE | A folded giant reveals a new weakpoint after every warned attack. Compete for damage and clean dodges. Jump its marked floor slam or parry; break its core for a contribution bonus. | ↑ jump the marked slam · Space / directional strike at open core · X special · ↓ timed parry | 48 s |
| 20 | SHADOW PLAY | Risk a full relic cargo for a large altar bonus, then lure the keeper with a close decoy. | Arrows move · Space dash · ↓ at altar banks · ↓ + Space decoy · full cargo bonus | 38 s |
| 21 | RIFT RUMBLE | Two lives in a fractured moon arena. Rising damage launches you farther. Ride the drifting ledge and brace for announced rift gusts. | ↑ double jump · Space slash / air spin · ↑+Space uppercut · air ↓+Space dive · ↓ guard; tap to parry · X special | 40 s |
| 22 | CROWN CLASH | Ride the rising balconies and steal the crown. Clean hits knock it loose; the final 12 seconds award DOUBLE crown points. | ↑ double jump · Space strike · ↑+Space uppercut · air ↓+Space dive · ↓ guard / timed parry · hold the crown · X special | 45 s |
| 23 | METEOR MELEE | Dodge warned meteor storms and knock rivals into the void. Impact embers heal 14 damage and score 5 points; a perfect guard can reflect a meteor. | ↑ double jump · Space strike · ↑+Space uppercut · air ↓+Space dive · ↓ guard / timed parry · gather fallen embers · X special | 42 s |
| 24 | SPIRE KINGS | Control the glowing balcony alone. Its seal moves every 10 seconds with advance warning. Win space with uppercuts, aerial spins, and dives. | ↑ double jump · Space strike · ↑+Space uppercut · air ↓+Space dive · ↓ guard / timed parry · follow the seal · X special | 45 s |
| 25 | CLOCKWORK SURGERY | Lift clockwork organs through folded channels. Every slipped tool rings the shared alarm; clean chains and the changing bounty reward steady hands. | Arrows guide tweezers · hold Space to lift an organ · follow its channel to the lower tray, then release · X steadies the tool briefly | 48 s |
| 26 | TOTTERING TOWER | Claim real blocks from a shared tower, ease them out, and place them on top. Removed supports and off-center stacks change its balance. The traveler who topples it pays. | Arrows choose a block · hold Space to pull · ← → counterbalance while pulling, ↓ inches, ↑ rushes · release, aim ← →, then tap Space to stack · hold X braces | 52 s |

Thirteen games share the platform-fighter foundation of double jumps, directional attacks, shields, timed parries, damage-based knockback, ring-outs, recovery and character specials. Their goals differ: bells, relic distance, enemy waves, goals, stolen sparks, a cursed fuse, moving checkpoints, a spring boxer, a giant boss, stock survival, a crown, meteors and a control seal. Their challenge scores convert into the same party-point rewards.

**Gullet Gala** is a separate four-sided feeding contest around a shared moon bowl. Swivel paper creature jaws to contest physical pellets; swept catches award a pellet to only one mouth. Quick bites recover sooner, charged gulps reach farther, SIP pulls nearby food, and burps displace pellets and interrupt rival jaws. Gold pearls score more; blackthorns deduct points and delay the jaw. Four courses change the bowl’s motion, feeding rush and final dessert values across 44 seconds.

**Clockwork Surgery** gives each traveler a folded patient and channels for three organs. Carrying a piece requires following its physical route to the tray; a wall contact drops the tool, breaks the clean-extraction chain and rings a shared alarm that raises pressure at every workstation. Bounties rotate among organs, later phases tighten the challenge, and a brief steady-hand action trades speed for control. Completing a patient refills the table with mirrored routes.

**Tottering Tower** uses one shared block stack. Travelers claim available blocks, gradually pull against resistance, counterbalance and choose where to place them on top. Missing supports, pull speed and off-center placement affect stability. Bracing spends a reserve that recharges when released. Toppling penalizes the responsible traveler and rebuilds the shared tower; scores remain individual.

All 26 games also receive **seeded, announced surprises**. A 1.2-second warning precedes effects such as bonus moons, relic rain, physical gusts or a game-specific opportunity: faster trains, echo phrases, quicker maze phases, surgery lulls or tower counterweights. Each game uses effects suited to its controls. Surprise state is part of the authoritative simulation; drawing the warning or scenery never rolls a new outcome.

**How multiplayer works**

PeerJS handles connection setup; WebRTC data channels carry gameplay. By default, the game uses PeerJS’s public signaling service with Google and Cloudflare STUN. The host browser runs the authoritative simulation. Guests send bounded card actions, route and story choices, and six-button control inputs. The host validates turn order, hand ownership, matching rules, penalties, and the current story’s offered choices. It owns lap rewards, encounters, final bonuses, scores and results.

The canonical host connection carries bounded JSON text inside PeerJS’s chunked binary channel. This lets larger full and results snapshots cross the library’s 16,300-byte JSON channel limit while preserving the simulation’s exact JSON numbers. Small direct-input mesh packets use JSON objects. Everyone in a room should use the same current HTML.

**Each guest receives a personalized snapshot containing only their own card faces and card buffs.** Opponents’ hands are card backs/counts; the draw pile and its order, story/game decks, and the board’s random state stay on the host. Played cards and their buffs, accumulated draw debt, landing effects and shuffled traveler-ID turn order are public. A buff gift announces its kind and count without identifying the private card. The host necessarily knows every hand because it runs the match. This is a friends’ party game, without a separate trusted competitive server. The transport retains the per-recipient filter for subsequent and late-join snapshots, and never falls back to raw cards if filtering fails.

Guests connect to the host for authoritative state and also establish direct peer input channels with the other admitted guests. Minigame snapshots are sent at 8 Hz with lossless per-recipient deltas. Actual input changes send immediately; unchanged held controls refresh at 10 Hz. Idle board snapshots coalesce to 1 Hz, with card actions and stage changes sent immediately. Guest browsers predict the same fixed 60 Hz simulation immediately. Sequence-numbered input changes travel directly among admitted peers and through a host relay fallback. Host acknowledgements reconcile pending inputs; only remote render corrections are smoothed. Card validation, hand privacy, scores, and results remain host-owned. The host must keep its tab open and visible; browser background throttling can slow the simulation.

The version-1 transport also accepts `PartyNetwork.updateProfile({name, character})` for the calling player while the lobby is unlocked and the party has not started. The host applies its own edits directly. Guests send a bounded request; the host derives ownership from the admitted connection, accepts only name/character fields, sanitizes names to 18 characters, and validates traveler IDs 0–7. Guests display the authoritative roster broadcast rather than an optimistic local roster. Locking or starting the session rejects further edits, and unlocking after play starts cannot reopen profile changes.

Room codes identify rooms; they are not passwords or accounts. Joins are refused after a party starts or all four human slots are occupied. A disconnected guest becomes a bot and cannot reclaim the seat. If the host leaves or becomes unreachable, the room ends and the guest returns to the title with a disconnect reason. There is no host migration or saved-match recovery. Heartbeats normally expire a connection after about 20 seconds of silence, using a monotonic clock when available. If a heartbeat callback resumes unusually late, it sends a probe and grants at most one additional 2.5-second traffic-processing window for that silence episode. Further late callbacks cannot renew that window; continued silence still disconnects. This bounds delayed-timer recovery without establishing the cause of any earlier disconnect. [Transport and heartbeat behavior](src/network.js).

Direct connectivity depends on network NAT/firewalls. The default configuration has STUN but no TURN relay, so some network pairs may need a separately configured relay. Website hosting, signaling and TURN are separate services. The [official PeerJS guide](https://peerjs.com/client/getting-started) explains its connection setup.

**Custom signaling and TURN configuration**

Set `window.AFTERLIGHT_NETWORK` in a normal script in `index.html`, before the existing module script that loads `src/main.js`. Every participant must use compatible signaling settings. The object is passed directly into the PeerJS options; there is no special URL flag or hidden configuration route.

For a local PeerServer, keep `npm run dev` running and start a second terminal in this project:

```sh
npx peerjs --port 9000 --key peerjs --path /afterlight
```

Then add this script before the existing module script:

```html
<script>
  window.AFTERLIGHT_NETWORK = {
    host: location.hostname,
    port: 9000,
    path: '/afterlight',
    key: 'peerjs',
    secure: false
  };
</script>
<script type="module" src="/src/main.js"></script>
```

Keep just one copy of the module script. With a LAN address, `location.hostname` points to the same computer serving the page; port 9000 must also be reachable. Use the non-TLS example for local HTTP development. A public HTTPS website needs reachable secure signaling, usually `secure: true` on port 443 with TLS/WebSocket proxying configured. The project includes the `peer` development dependency. The server command and options follow the [official PeerServer documentation](https://github.com/peers/peerjs-server).

For a relay, add an ICE configuration to the same object. Replace every example address and credential with values from a TURN service you operate or are authorized to use:

```html
<script>
  window.AFTERLIGHT_NETWORK = {
    // Leave host/port/path unset to retain the default signaling service.
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: [
            'turn:turn.example.com:3478?transport=udp',
            'turns:turn.example.com:5349?transport=tcp'
          ],
          username: 'SHORT_LIVED_USERNAME',
          credential: 'SHORT_LIVED_CREDENTIAL'
        }
      ]
    }
  };
</script>
```

Supplying `config.iceServers` replaces the built-in server list. For a relay-only connectivity test, set `config.iceTransportPolicy` to `'relay'` alongside `iceServers`; a working TURN server is then required. Browser-delivered credentials are visible to clients, so use short-lived TURN credentials where your service supports them. No relay service or credentials are bundled.

**Artwork and animation**

Prompt records named `ASSET-PROMPTS*.json`, [folded asset briefs](FOLDED-ART-PROMPTS.md) and runtime sprites are included; raw generated masters are excluded from the public repository. Filename-only provenance and `source-art/` paths identify omitted local masters, while runtime paths point to committed assets. `assets-manifest.json` is the authoritative embedded-image inventory. The portable builder embeds that inventory. It includes realm and minigame scenery, eight traveler designs and action art, clean outlined paper props/objects, paper platforms, creature mouths, card/board pieces, illustrated HUD frames and folded-paper effect art. The legacy runtime key `pixel-fx` now points to `folded-paper-fx.webp`, the clean folded-paper effect atlas. Avoid relying on an old report’s asset count after a rebuild.

The general prop atlas (`props-paper-v2.webp`, twelve pieces in a 4×3 grid) and folded-object atlas (`paper-objects-v2.webp`, nine pieces in a 3×3 grid) are newly generated replacements with clean ink outlines, subtle printed color and transparent cutout edges. Their existing runtime names and cell layouts preserve gameplay placement. Connected-source recovery includes artwork belonging to a cell that extends beyond its grid edge, excludes neighboring pieces, and retains the original cell's placement when drawing the expanded crop. Material recording follows the same destination rectangle. Surface normal/roughness/occlusion maps are derived from the current printed artwork and cached; they are material data, not separate newly generated character designs. [Atlas ownership and placement](src/paper-atlas.js), [sprite preparation](src/art.js).

The eight existing original traveler designs and motion atlases are harmonized during cached sprite preparation; they were **not all regenerated** for this pass. Each pose’s light paper is matched to its traveler’s idle reference, and a soft body mask dyes clothing while protecting the head, outside weapons/wings, feet, alpha silhouette and darkest printed ink. The same prepared cutouts supply the title, picker, lobby, board and minigames. Their outfit identities are Pip **Copper red**, Moth **Moon teal**, Bolt **Clockwork amber**, Wisp **Dusk violet**, Rook **Steel blue**, Briar **Thorn sage**, Vellum **Ink berry** and Nix **Frost blue**. Character outfit colors are independent of the current realm’s lighting. [Cloth preparation](src/paper-pigment.js), [sprite preparation](src/art.js).

Briar's follow-through branch extends beyond its nominal motion-atlas cell. That pose's source rectangle includes an extra 32 pixels on the right; the general connected-source recovery margin stays 48 pixels. This recovers existing artwork rather than generating a replacement pose. Pixels outside the original sheet cannot be recovered. [Pose source rectangles](src/paper-animation.js).

`src/art.js` and `src/paper-animation.js` animate **72 cached poses across eight travelers**. Each has idle, anticipation, strike, follow-through, special windup, special impact, special recovery, running contact and running passing poses. The latest two generated motion sheets contribute 48 of these poses. Foot anchors and body measurements keep cutouts stable. Ordinary transitions blend over **85 ms** and attack-impact transitions over **28 ms**; interrupted transitions preserve their current pose weights. Continuous gait, eased turning, breathing, squash/stretch, elastic landings and recoil connect the poses without changing gameplay hit windows. Hitstop freezes the current world strike visually while the simulation advances. Reduced motion preserves readable action poses while disabling procedural movement and blending.

Each traveler’s silhouette carries cached folded-face light, crease shadows and inward paper thickness while retaining the original alpha, dark ink and foot anchor. The title cast faces left; Pip, Moth, Bolt and Wisp perform distinct brief celebrations when a primary menu option is selected. Board dialogue contains **704 original lines: 88 per traveler**, selected from public events such as good/bad landings, card buffs, number chains, debt stacks, passing, bumps, laps and finishing. Rival replies use separate lines; the interface shows transient reactions rather than a permanent dialogue list.

Board paths, ladders, chutes and the follow camera use simulation positions. Paper neck extensions animate Gullet’s mouths; card flights, discard impacts and paper stars make card actions visible. Shared paper-chip effect sprites signal hits, shielding, dust and rewards. Reward stars appear briefly beside the feet after a discrete score gain. Fractional objective score does not restart the reaction; magic effects use separated paper chips instead of a looping head spiral. These are runtime animations of original generated artwork. The current [verification record](VERIFICATION.md) identifies the standalone build actually tested. Generated screenshots and recordings remain local test artifacts.

The board and all 26 levels use deeper image-derived relief and four closed, folded scene wings, with perspective parallax between printed layers. Portal and scenery silhouettes are extruded from their original alpha contours, retaining openings and printed faces. Generated environmental cutouts add crease faces, paper thickness and folded support tabs. Four illustrated foreground pieces render around the playfield edges after actors and before the HUD, giving the scene a near layer. The 48 board stops, route stones, ladders and chutes are textured paper solids with cut rims and cast shadows; their fixed view is baked once and reused during camera movement to avoid an extra GPU pass every frame. The four gameplay-platform illustrations are also baked from alpha-cut solids, retaining their printed fronts and collision alignment. The game is a **2.5D paper theater**, with two-dimensional authoritative mechanics. Canvas/CSS supplies card labels, controls and HUD text; audio is synthesized by `src/audio.js`. If WebGL is unavailable, the illustrated canvas remains playable.

The main gameplay canvas retains logical 960×540 coordinates while its backing store scales with display size and device pixel ratio, capped at **1920×1080**. The scene renderer and foreground material buffers follow that backing scale. High-quality image smoothing and larger cached source crops retain the clean printed outline; physics and card coordinates remain unchanged. Fixed visual fixtures keep their 960×540 export size. On taller minigame viewports, a subdued matte uses the current scene artwork to fill the surrounding bands while keeping the full gameplay canvas, edge objects and HUD visible. [Scene selection](src/main.js), [viewport framing](src/style.css).

Five muted palettes—ivory, sage, violet, copper and frost—coordinate paper rims, reflected light and paper effects. Effect sprites are dyed once in a cache capped at 80 variants; dark ink and alpha silhouettes remain intact. Three.js materials use normal relief, ambient occlusion, roughness and selective metalness so worn foil responds differently from matte paper. The sprite-material pass caches derived surface maps and lights the composed gameplay art on the GPU. Environmental accordion pleats and the illustrated foreground enter this same material pass; foreground art is drawn after actors and before the material flush, so these layers receive the scene lighting together. The world and sprites share deterministic profiles from `src/scene-lighting.js`; lights respond to gameplay such as carried moths, train lamps, rhythm strikes, warnings, fighter specials and feast activity. HUD text renders after scene lighting. Surgery's organ sockets use illustrated gear rims and inset shadows; the extraction channels use paper lips, recessed shading and printed creases that follow the existing collision routes. These are rendering changes, with the extraction rules unchanged. The [verification record](VERIFICATION.md) distinguishes current release checks from historical material/performance measurements.

**Develop or host the source build**

Use Node.js 20.19+ in the 20.x series, or 22.12+, and npm:

```sh
npm ci
npm run dev
```

The development server runs at `http://localhost:5187`. It listens on all interfaces, so a device on the same network can use the computer’s LAN address, subject to its firewall. `localhost` reaches only the device where the browser is running.

```sh
npm run build
npm run preview
```

The static site build goes to `dist/`; the production preview uses port 5188. Upload the built files to an HTTPS static host to share a public address. Hosting does not require Node.js. For a site under a subdirectory, set Vite’s base when building, for example `npm run build -- --base=/afterlight/`. The source `index.html` expects a development/build server; use the generated **`AFTERLIGHT.html`** for direct file opening.

**Code and verification**

- `src/main.js` and `src/style.css`: menus, card dock, fullscreen presentation and input.
- `src/board.js`, `src/board-mischief.js` and `src/board-camera.js`: custom cards, points, laps, story choices, pad effects, encounters, route and camera.
- `src/board-presentation.js` and `src/character-banter.js`: public-event portraits, finish projections and character-specific dialogue.
- `src/minigames.js`: production registry and the original arcade mechanics still in the slate.
- `src/brawlers.js` and `src/brawl-objectives.js`: thirteen platform objectives and eight specials.
- `src/gullet-gala.js`: shared-pellet feeding simulation and drawing.
- `src/boardgame-challenges.js`: Clockwork Surgery and Tottering Tower.
- `src/minigame-surprises.js`: seeded, warned events adapted to each game’s controls.
- `src/game-hud.js`: illustrated minigame HUD and shared Alegreya SC canvas typography.
- `src/bot-difficulty.js`: seeded reaction delays, control decisions, imperfect aim/timing and difficulty profiles.
- `src/network.js` and `src/realtime.js`: PeerJS transport, recipient privacy, fixed-step prediction and reconciliation.
- `src/art.js`, `src/paper-world.js`, `src/paper-board.js`, `src/paper-geometry.js`, `src/paper-environment.js`: original artwork, illustrated relief, folded layers, foreground scenery and solid paper surfaces.
- `src/paper-animation.js` and `src/title-cast.js`: cached pose blending, gait, reactions and title celebrations.
- `src/paper-palette.js`, `src/paper-pigment.js`, `src/sprite-materials.js`, `src/scene-lighting.js`: cached pigments and material/light rendering.

Simulation state is seeded and JSON-serializable. Run:

```sh
npm test
npm run build
npm run build:portable
```

Tests cover card legality and conservation, point ranking and finish projection, exact-once lap rewards, story choices, bounded encounters, current minigame mechanics, character specials, determinism, input edges and privacy. Network tests use controlled peers and the installed PeerJS serializers to check oversized native snapshots, full/delta/resync equality and private hands. They do not prove connectivity across every network or TURN provider. Browser scripts under `scripts/` save screenshots, connection evidence and reports under `verification/`.

**[VERIFICATION.md](VERIFICATION.md) records the committed artifact hash, current validation and limits.** [BEHAVIOR-AUDIT.md](BEHAVIOR-AUDIT.md) compares implemented mechanics with the design references and records remaining gaps. Browser evidence uses local peers with public signaling; it does not establish connectivity across every WAN or NAT.

**Delivery files**

- **`AFTERLIGHT.html`**: the complete single file to open and share.
- `dist/`: multi-file website generated by `npm run build`.
- Source files, runtime assets and prompt records are included in this repository. Raw masters, recordings, ZIP archives and generated reports are excluded.

The portable HTML and website use the same game implementation. Share the newly built HTML or website matching [VERIFICATION.md](VERIFICATION.md). Runtime dependency and font notices are preserved in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
