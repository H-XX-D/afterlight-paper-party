/** Original, public-event dialogue. Selection is pure so host and guests agree. */
export const BANTER_CATEGORIES = Object.freeze([
 'play','draw','skip','reverse','draw-penalty','ladder','chute','shortcut',
 'pass','bump-hit','bump-blocked','lap','finish-good','finish-bad','reply-good','reply-bad',
 'pad-good','pad-bad','pad-buff','chain','stack','shuffle'
]);

const voices = [
 {name:'Pip', lines:{
  play:[
   'Priority delivery. Please sign the center of the moon.',
   'One less parcel between me and my payday.',
   'The stamp matches. This little trouble is officially delivered.',
   'I packed that play carefully. Mind the sharp corners.'
  ],
  draw:[
   'Another parcel? My satchel is developing its own weather.',
   'Fine. Return mail sometimes contains something rather useful.',
   'That delivery came backward. I shall inspect the wrapping.',
   'One extra envelope. My route can survive the weight.'
  ],
  skip:[
   'Your departure is delayed. Mine has excellent postage.',
   'Hold that platform. Your next delivery is tomorrow.',
   'Express service has temporarily misplaced your next turn.',
   'I filed your move beneath please wait politely.'
  ],
  reverse:[
   'New route. The return address has become the destination.',
   'Everyone turn around. I forgot a very important stamp.',
   'The mail runs both ways when I say so.',
   'Round we go backward. Nobody lose their forwarding address.'
  ],
  'draw-penalty':[
   'Who ordered these? My pockets were already a sorting office.',
   'Extra postage again. I should charge by the nuisance.',
   'A bundle of trouble, addressed directly to my face.',
   'I accept the parcels. I dispute the delivery fee.'
  ],
  ladder:[
   'Upstairs delivery. The moon has finally installed proper access.',
   'A climbing route? My boots have been expecting this.',
   'Higher address, shorter journey. That is beautiful postal planning.',
   'I shall leave this advantage on the upper doorstep.'
  ],
  chute:[
   'This is a delivery chute with deeply questionable management.',
   'Wrong floor. My satchel has lodged a formal complaint.',
   'The express route appears to have eaten the destination.',
   'Please redirect me upward after this unfortunate postal slide.'
  ],
  shortcut:[
   'A secret lane. Couriers know which doors stay unlocked.',
   'I trimmed the route without trimming my excellent manners.',
   'Local knowledge beats a very expensive official map.',
   'Through the side gate. The long queue can wait.'
  ],
  pass:[
   'Passing delivery. I tucked a little luck beside you.',
   'Excuse the breeze. My next address is just ahead.',
   'A quick greeting, then back to the priority route.',
   'Keep walking. The post appreciates a friendly neighbor.'
  ],
  'bump-hit':[
   'Parcel delivered. You appear to be the doorstep.',
   'Sorry about the landing. Express post has rather firm boots.',
   'That address was occupied. I have adjusted the furniture.',
   'A special delivery, with complimentary backward travel included.'
  ],
  'bump-blocked':[
   'Your shield refused my parcel. How very bureaucratic.',
   'Delivery attempted. Apparently this doorstep has teeth today.',
   'That signature requires more force than I had budgeted.',
   'Returned to sender. I shall rethink the postage.'
  ],
  lap:[
   'Route complete. The post pays for a full circuit.',
   'Every doorstep visited, every boot thoroughly tested tonight.',
   'One round of deliveries earns a delightful little bonus.',
   'Back at the depot, with points in my satchel.'
  ],
  'finish-good':[
   'Last parcel delivered. My score signed for the victory.',
   'Empty satchel, excellent earnings. That is a proper route.',
   'The final stamp seals a very profitable evening.',
   'Delivery complete. I believe the trophy belongs at my address.'
  ],
  'finish-bad':[
   'All delivered, but somebody else collected the better wages.',
   'I emptied my satchel before checking the accounts.',
   'Closing the depot early did not improve my earnings.',
   'The last stamp was lovely. The invoice was disappointing.'
  ],
  'reply-good':[
   'Neatly delivered. I shall remember that particular address.',
   'Good route work. My next parcel may answer it.',
   'That deserved a stamp. Enjoy your brief express advantage.',
   'You made that look easy. I am revising my route.'
  ],
  'reply-bad':[
   'Perhaps check the address before sending the next disaster.',
   'Your timing needs postage. Shall I fetch a stamp?',
   'A small detour for you, an opportunity for me.',
   'I would mark that fragile and handle it differently.'
  ]
 }},
 {name:'Moth', lines:{
  play:[
   'A little folded moon finds its place at last.',
   'This card woke up inside a rather promising dream.',
   'I let the wind choose the gentlest sharp edge.',
   'One quiet flutter can change the entire evening.'
  ],
  draw:[
   'Another dream to carry beneath my tired wings.',
   'The deck whispers. I shall hear this one out.',
   'A new moon scrap, still warm from somebody sleeping.',
   'More paper in my wings, more possibilities in the dark.'
  ],
  skip:[
   'Rest your wings. Your next moment can sleep awhile.',
   'A tiny lullaby has borrowed your next turn.',
   'Close your eyes. The procession will carry on quietly.',
   'Your move is dreaming somewhere just beyond the lantern.'
  ],
  reverse:[
   'The dream turns around when the moon looks away.',
   'A backward breeze still knows where the lantern shines.',
   'We flutter the other way through this sleepy spiral.',
   'I folded the wind. It remembers a different direction.'
  ],
  'draw-penalty':[
   'These extra dreams are rather heavy for paper wings.',
   'Somebody tucked a nightmare into my growing little bundle.',
   'I asked for moonlight, and received several folded worries.',
   'More dreams to sort before I can sleep.'
  ],
  ladder:[
   'Closer to the moon, one gentle rung at a time.',
   'The ladder remembers how my wings wanted to climb.',
   'Upward feels like waking inside a better dream.',
   'I found a quiet staircase through the evening air.'
  ],
  chute:[
   'Falling dreams never mention the very practical landing.',
   'The moon moved upward while I slipped away.',
   'I should have asked this slide where it was dreaming.',
   'A downward flutter. My pride will need another lantern.'
  ],
  shortcut:[
   'A hidden breeze slipped between the ordinary stepping stones.',
   'Dream paths rarely bother with the official long route.',
   'Through the fold, before the sleeping world notices.',
   'The lantern showed me a small gap in distance.'
  ],
  pass:[
   'A wingbeat of luck for your next little journey.',
   'Passing softly. I would hate to wake your shadow.',
   'Our paths touched like two moths circling one lantern.',
   'May the breeze stay kind after I flutter onward.'
  ],
  'bump-hit':[
   'Oh dear. That flutter contained rather more force.',
   'My landing borrowed your place in the moonlight.',
   'A soft wing can still move a stubborn shadow.',
   'The dream needed this stone. Please drift a little.'
  ],
  'bump-blocked':[
   'Your guard is awake. My landing plan was dreaming.',
   'That shield caught every flutter I had prepared.',
   'I bounced off the edge of your stubborn little dream.',
   'The breeze politely requests that you lower the wall.'
  ],
  lap:[
   'A whole moon circle, and my wings still remember.',
   'The lantern greeted me twice. That must earn something.',
   'One dream completed, with points sewn into the waking.',
   'I circled every shadow and returned a little richer.'
  ],
  'finish-good':[
   'The final flutter lands inside a winning dream.',
   'No cards beneath my wings, only a bright little crown.',
   'I woke at the top of the moonlit score.',
   'An empty hand, and the sweetest possible waking.'
  ],
  'finish-bad':[
   'The dream ended before my points could catch it.',
   'I woke too early and left the crown behind.',
   'An empty wingful does not always mean a brighter morning.',
   'The last flutter closed a rather unfinished little dream.'
  ],
  'reply-good':[
   'That was a lovely flutter. I felt the wind change.',
   'Your dream has teeth. I shall stay more awake.',
   'Beautifully timed. Even my lantern leaned toward your move.',
   'Enjoy the moonlight. Shadows have a way of returning.'
  ],
  'reply-bad':[
   'Perhaps that idea needed one more night of sleep.',
   'Your wings wandered somewhere your points could not follow.',
   'A curious dream. The landing seems less convincing.',
   'The moon saw that. Fortunately, it keeps many secrets.'
  ]
 }},
 {name:'Bolt', lines:{
  play:[
   'Correct fit. The whole table just clicked into place.',
   'One component installed, several exciting problems still available.',
   'That card has excellent tolerances and questionable intentions.',
   'I calibrated this play with a fairly honest wrench.'
  ],
  draw:[
   'New parts. I shall pretend that was the plan.',
   'Another component for my increasingly impractical little machine.',
   'The deck supplied a spare. Something probably needs fixing.',
   'Excellent, more parts than the instructions ever mentioned.'
  ],
  skip:[
   'Your next turn is undergoing a brief mechanical inspection.',
   'I removed one gear from your immediate schedule.',
   'Please remain stationary while my advantage finishes installing.',
   'Your mechanism pauses here. Mine has already been serviced.'
  ],
  reverse:[
   'Reverse polarity. Please enjoy the new direction of trouble.',
   'I turned the gear over. Everything runs backward now.',
   'The wiring disagreed with our previous travel arrangement.',
   'A quick adjustment, and the whole machine changes direction.'
  ],
  'draw-penalty':[
   'Extra parts again. This is becoming a storage issue.',
   'You overloaded my tray. I hope these fit something.',
   'That penalty exceeded the recommended capacity of my pockets.',
   'More cards, less bench space. Very inefficient engineering.'
  ],
  ladder:[
   'Vertical travel achieved without any suspicious rocket fuel.',
   'A perfectly serviceable lift with wonderfully few moving parts.',
   'Up we go. This shortcut passed my boot inspection.',
   'The ladder improves elevation and my entire profit forecast.'
  ],
  chute:[
   'Gravity is working. The rest of this design is not.',
   'That descent was neither calibrated nor especially appreciated.',
   'Somebody fitted the exit beneath the entire useful route.',
   'I found the design flaw with both of my boots.'
  ],
  shortcut:[
   'I removed the unnecessary distance from this route.',
   'A service hatch beats climbing through the whole machine.',
   'Efficiency improved. Please disregard the missing safety paperwork.',
   'This narrow passage is exactly the size of ingenuity.'
  ],
  pass:[
   'A friendly tune up as I roll past.',
   'Keep your gears turning. Mine happen to turn faster.',
   'Passing clearance confirmed. Your luck received a minor adjustment.',
   'We shared a spark without shorting the entire board.'
  ],
  'bump-hit':[
   'Impact test complete. Your position was the loose component.',
   'I tightened this platform by relocating your boots.',
   'A firm adjustment improves the spacing between rivals.',
   'That collision demonstrated my excellent forward momentum calculations.'
  ],
  'bump-blocked':[
   'Your shield has exceeded my estimated load rating.',
   'Unexpected resistance. I shall require a larger wrench.',
   'The impact returned. My calculations omitted your stubbornness.',
   'That defense is annoyingly well assembled for this party.'
  ],
  lap:[
   'One full rotation. The machine pays out beautifully.',
   'Circuit complete, points collected, bolts mostly still attached.',
   'Every gear engaged. Another profitable cycle is finished.',
   'The lap counter works. I built that part correctly.'
  ],
  'finish-good':[
   'Final component installed. The victory machine runs perfectly.',
   'Empty tray, highest output. That is efficient little engineering.',
   'The last card passed inspection and brought the crown.',
   'Shut it down. My points already did the heavy lifting.'
  ],
  'finish-bad':[
   'I closed the machine before it produced enough points.',
   'Empty tray, insufficient output. That requires a design review.',
   'The final switch worked. My profit calculations did not.',
   'I forgot to measure success before declaring the job finished.'
  ],
  'reply-good':[
   'Solid engineering. I shall inspect that advantage for weaknesses.',
   'A clean mechanism. My wrench is already considering a response.',
   'You found the right gear at the right moment.',
   'That worked. Annoyingly, I cannot argue with the measurements.'
  ],
  'reply-bad':[
   'Have you tried tightening the decision before using it?',
   'That plan made a concerning noise near the end.',
   'Your calculations appear to have misplaced the useful part.',
   'I would file that under educational mechanical failures.'
  ]
 }},
 {name:'Wisp', lines:{
  play:[
   'A small light, placed exactly where trouble gathers.',
   'The lantern approves this particular little offering tonight.',
   'One card falls away, and my flame burns clearer.',
   'I keep the light steady while the table changes.'
  ],
  draw:[
   'Another shadow to carry beside my faithful lantern.',
   'A new card waits in the warm edge of light.',
   'The deck has left something beneath my doorstep flame.',
   'I shall keep this paper safe until its moment.'
  ],
  skip:[
   'Your turn rests outside the lantern circle for now.',
   'Wait in the shade while my flame passes onward.',
   'I dimmed your next moment, very carefully indeed.',
   'The light moves on. Your footsteps may follow later.'
  ],
  reverse:[
   'The lantern turns, and every shadow follows backward.',
   'Let the flame show us the road we missed.',
   'A new direction changes which darkness waits ahead.',
   'I carried the light around to the other side.'
  ],
  'draw-penalty':[
   'More shadows arrived than my lantern was prepared to hold.',
   'Those extra cards have crowded the little circle of light.',
   'I can carry this burden, though the flame protests.',
   'A heavier hand makes the lantern feel rather distant.'
  ],
  ladder:[
   'My light reaches farther from this higher little perch.',
   'Upward, where the dark has fewer places to hide.',
   'Each rung lifts the flame above another waiting shadow.',
   'A brighter landing, and a welcome change of height.'
  ],
  chute:[
   'The light survives. My position is less fortunate.',
   'Down into the shade, lantern held stubbornly upward.',
   'That slide has rather poor regard for careful flamekeeping.',
   'My lantern found the bottom before my dignity did.'
  ],
  shortcut:[
   'A thin beam revealed a door behind the darkness.',
   'I followed the glow through a fold in distance.',
   'The smallest light can uncover a very useful passage.',
   'Through here. The shadows forgot to hide this opening.'
  ],
  pass:[
   'A little warmth for the road beneath your feet.',
   'Let my lantern share your shadow for a moment.',
   'Passing with the light. Keep a spark for later.',
   'May your next step find something kinder in the dark.'
  ],
  'bump-hit':[
   'The lantern needed room. Your shadow stood too close.',
   'A bright landing can scatter a rather stubborn neighbor.',
   'My light arrived firmly. Please mind the backward step.',
   'I cleared this little circle with more warmth than intended.'
  ],
  'bump-blocked':[
   'Your guard casts a remarkably solid little shadow.',
   'My light met a wall that refused to move.',
   'That shield kept its darkness very neatly in place.',
   'The lantern bounced. Its keeper is reconsidering the approach.'
  ],
  lap:[
   'Every corner lit, and the lantern still burns.',
   'A full round of keeping earns a welcome glow.',
   'The road remembers my light all the way around.',
   'Back where I began, with brighter points beside me.'
  ],
  'finish-good':[
   'The last card falls, and my lantern crowns the night.',
   'Empty hands leave room for a wonderfully bright victory.',
   'The flame stayed steady until my score found the summit.',
   'I kept the light, and the light kept the crown.'
  ],
  'finish-bad':[
   'I put the cards down before my light reached far enough.',
   'The flame remains, though another shadow holds the crown.',
   'Closing the night early left my points in darkness.',
   'An empty hand cannot warm a score left behind.'
  ],
  'reply-good':[
   'That move cast a long and rather clever shadow.',
   'Well placed. I shall bring my lantern a little closer.',
   'Your advantage shines. I can see its edges clearly.',
   'A bright moment for you. The night is still wide.'
  ],
  'reply-bad':[
   'Perhaps bring a lantern before choosing that particular path.',
   'Your plan wandered beyond the useful edge of light.',
   'I saw that shadow coming. It seems you did not.',
   'A dim decision, but the next flame may be kinder.'
  ]
 }},
 {name:'Rook', lines:{
  play:[
   'A firm card, set down with a knightly purpose.',
   'My banner advances one careful play across the table.',
   'The raven chose this moment to spread its wings.',
   'I commit this card and stand behind its consequences.'
  ],
  draw:[
   'Another burden for the shield arm. I remain ready.',
   'The deck offers reinforcements in an inconvenient little shape.',
   'One more card joins my already crowded watch.',
   'A knight carries what arrives, then chooses what matters.'
  ],
  skip:[
   'Your advance pauses here by order of the raven.',
   'Hold your ground. My banner takes the next moment.',
   'A brief truce for you, a useful march for me.',
   'The gate closes before your next step can begin.'
  ],
  reverse:[
   'About face. The raven commands the other road.',
   'Our banners turn toward the enemy we left behind.',
   'A disciplined retreat can become a rather fine advance.',
   'The march reverses. Keep your shield facing the trouble.'
  ],
  'draw-penalty':[
   'These reinforcements weigh rather more than their paper suggests.',
   'A heavy hand will not break my watch.',
   'You loaded my shield arm with unnecessary little duties.',
   'I accept the burden. I reserve judgment on its sender.'
  ],
  ladder:[
   'The high ground welcomes a properly armored visitor.',
   'Up the rungs, where my raven can see farther.',
   'A higher station suits this very determined little banner.',
   'I climb with purpose and a surprisingly cooperative shield.'
  ],
  chute:[
   'The armor is sound. The route has betrayed us.',
   'A knightly descent, conducted with deeply unknightly dignity.',
   'My banner went down before I could order otherwise.',
   'I shall reclaim the ground this slide has borrowed.'
  ],
  shortcut:[
   'A hidden flank brings my banner forward rather neatly.',
   'The raven spotted a gate beyond the common march.',
   'A wise knight leaves the longest road to someone else.',
   'Through the side passage, shields polished and intentions clear.'
  ],
  pass:[
   'A salute as I march beyond your position.',
   'Keep your banner high. Mine has business farther onward.',
   'Two travelers may share honor without sharing the lead.',
   'A friendly raven nod, then back to the advance.'
  ],
  'bump-hit':[
   'This ground is claimed. Please adjust your station accordingly.',
   'A firm landing settles our little territorial discussion.',
   'My shield brought an argument your boots could not answer.',
   'The raven advances, and your position requires a retreat.'
  ],
  'bump-blocked':[
   'Your guard held. I acknowledge a properly defended position.',
   'That shield deserves respect and a different approach.',
   'A sturdy defense has interrupted my rather elegant landing.',
   'The ground remains yours until my next considered challenge.'
  ],
  lap:[
   'A full patrol completed, with the banner still high.',
   'Every station visited. The raven has earned its reward.',
   'One circuit of duty strengthens my claim to victory.',
   'The watch returns richer and entirely ready to march.'
  ],
  'finish-good':[
   'The final card seals a victory worthy of the banner.',
   'My hand is clear, and my claim stands highest.',
   'Duty completed. The raven may rest beside its crown.',
   'I laid down the last card upon well earned ground.'
  ],
  'finish-bad':[
   'I ended the march before securing sufficient ground.',
   'The last card cannot defend a score left behind.',
   'An early dismissal of the watch has cost the crown.',
   'My hand is clear. My campaign required another advance.'
  ],
  'reply-good':[
   'A worthy maneuver. My shield shall remember its shape.',
   'You claimed that moment fairly. Keep your guard raised.',
   'The raven respects a rival who chooses their ground well.',
   'Well struck. I have yet to lower my banner.'
  ],
  'reply-bad':[
   'Your banner advanced farther than your judgment could defend.',
   'A knight would inspect that ground before committing.',
   'The raven noticed the opening your plan kindly supplied.',
   'An ambitious charge, followed by a rather useful retreat.'
  ]
 }},
 {name:'Briar', lines:{
  play:[
   'A pretty little card with a thorn underneath.',
   'I stitched this play tightly. Please mind the seam.',
   'One petal falls, and something sharper takes its place.',
   'The garden likes a hand that knows when to prune.'
  ],
  draw:[
   'Another scrap to sew inside my already crowded sleeve.',
   'The deck planted something unexpected in my little garden.',
   'New thread, new trouble. I shall untangle it carefully.',
   'More petals to carry before the final pruning.'
  ],
  skip:[
   'A small thorn has caught your next little step.',
   'Stay still. Your turn is snagged upon my stitching.',
   'The garden gate holds you for one more moment.',
   'I sewed a pause into your immediate plans.'
  ],
  reverse:[
   'The vine curls back toward where we began.',
   'I pulled the thread. The whole pattern turned around.',
   'Roots remember another direction beneath this tidy little route.',
   'A backward stitch can make the neatest sort of trouble.'
  ],
  'draw-penalty':[
   'These extra scraps have tangled every useful little seam.',
   'You planted weeds where I had planned a bloom.',
   'More cards to prune, and a rather strained sleeve.',
   'My basket is full of somebody else’s thorny decisions.'
  ],
  ladder:[
   'Up the trellis, where the clever little flowers bloom.',
   'A climbing vine always knows the better sunlight.',
   'Each rung brings my thorns closer to the crown.',
   'The garden has kindly raised my station tonight.'
  ],
  chute:[
   'My roots would prefer a much less sudden return.',
   'The slide dragged my lovely stitching through the dirt.',
   'Down again. Even the weeds look rather sympathetic.',
   'A tangled descent, with absolutely no useful pruning involved.'
  ],
  shortcut:[
   'Between the leaves, a path for smaller sharper travelers.',
   'I slipped through a seam the map forgot to sew.',
   'The brambles parted for someone who knows their manners.',
   'A little pruning removed the least convenient stretch of road.'
  ],
  pass:[
   'A flower for your pocket as I slip past.',
   'Mind the friendly thorns. They only snag poor manners.',
   'Our sleeves brushed, and the garden shared a little luck.',
   'Keep growing. My roots have somewhere farther to reach.'
  ],
  'bump-hit':[
   'This patch needed room for one particularly determined flower.',
   'A thorny landing trimmed your place on the path.',
   'I planted my boots where yours were growing.',
   'The garden shifted. You appear to be the loose petal.'
  ],
  'bump-blocked':[
   'Your shield refused the garden a very small pruning.',
   'That seam held tighter than my thorns expected.',
   'I snagged my own sleeve on your stubborn guard.',
   'Some weeds have remarkably well defended little roots.'
  ],
  lap:[
   'A whole growing season around this lovely crooked garden.',
   'The vine returns with points blooming along every stitch.',
   'One full circle, and my basket holds a richer harvest.',
   'The garden rewards a doll who visits every root.'
  ],
  'finish-good':[
   'The last petal falls upon a very thorny victory.',
   'A neatly pruned hand leaves the tallest bloom standing.',
   'My stitching is finished, and the crown fits beautifully.',
   'Empty sleeves, richest garden. I call that careful cultivation.'
  ],
  'finish-bad':[
   'I pruned the hand before the score could blossom.',
   'An empty basket cannot compete with somebody else’s harvest.',
   'The last stitch closed a pattern still lacking points.',
   'I cut the vine too soon to reach the crown.'
  ],
  'reply-good':[
   'A sharp little play. My thorns appreciate good craftsmanship.',
   'That grew quickly. I shall inspect the roots next.',
   'Lovely stitching. Leave room for my next little snag.',
   'You found the sunlight. Gardens also have interesting shadows.'
  ],
  'reply-bad':[
   'That idea could use some fairly urgent pruning.',
   'You stitched the trap directly into your own sleeve.',
   'A curious little bloom. It seems to grow backward.',
   'My thorns did nothing. Your plan supplied the snag.'
  ]
 }},
 {name:'Vellum', lines:{
  play:[
   'A perfect little ink blot upon your lovely plans.',
   'The punchline lands precisely in the middle of the table.',
   'One card vanishes. The audience should watch the other hand.',
   'I wrote this move in rather permanent mischievous ink.'
  ],
  draw:[
   'Another page for a joke that is becoming enormous.',
   'The deck insists my act needs additional material.',
   'Fresh paper. The ink is already considering something improper.',
   'A new card joins the footnotes of my performance.'
  ],
  skip:[
   'Your next line has been edited out for pacing.',
   'A dramatic pause, kindly assigned to your entire turn.',
   'The audience asked for less of your immediate movement.',
   'I crossed out your cue with a particularly cheerful flourish.'
  ],
  reverse:[
   'Read the script backward. The jokes improve considerably.',
   'A plot twist sends the entire cast the other way.',
   'I turned the page and reversed the stage directions.',
   'Back to front. Even the footnotes have changed sides.'
  ],
  'draw-penalty':[
   'Extra material? Somebody has mistaken me for the entire library.',
   'My sleeve contains more pages than this joke requires.',
   'That penalty was written with very unnecessary enthusiasm.',
   'Another stack of footnotes obscures my excellent punchline.'
  ],
  ladder:[
   'An elevated performance, now with genuinely elevated boots.',
   'Upward, where the audience looks pleasantly smaller tonight.',
   'The ladder gave my act a very useful second story.',
   'Higher billing, shorter journey. My agent would approve.'
  ],
  chute:[
   'A pratfall. I assure you the timing was intentional.',
   'The floor has edited my position rather aggressively.',
   'My act descended before the audience requested an encore.',
   'That slide stole the punchline and most of my dignity.'
  ],
  shortcut:[
   'Through the margin, where sensible characters rarely bother looking.',
   'I skipped a chapter with particularly excellent comic timing.',
   'A secret entrance saves the show from excessive walking.',
   'The script had a loophole. I supplied the boots.'
  ],
  pass:[
   'A friendly aside as I steal the next spotlight.',
   'Keep your place. I am only borrowing the foreground.',
   'We shared a joke without sharing my excellent destination.',
   'Passing applause costs nothing and makes my exit prettier.'
  ],
  'bump-hit':[
   'Your blocking was excellent until I changed the stage.',
   'A little physical comedy moves the supporting cast backward.',
   'I landed the punchline directly upon your occupied platform.',
   'Please take two steps back for the next scene.'
  ],
  'bump-blocked':[
   'Your shield declined a perfectly rehearsed bit of slapstick.',
   'That wall has absolutely no appreciation for comic timing.',
   'My punchline bounced. The audience may laugh at me now.',
   'A strong defense against the arts. How regrettably effective.'
  ],
  lap:[
   'A complete tour, and every audience paid in points.',
   'Curtain call number one. The encore remains delightfully profitable.',
   'I circled the stage without losing the plot entirely.',
   'Back at my entrance, with much better billing.'
  ],
  'finish-good':[
   'Final line delivered. The crown applauds my excellent ending.',
   'Empty sleeves, full applause. A beautifully scored little finale.',
   'I close the book upon a winning punchline.',
   'The last card vanished, and the trophy stayed with me.'
  ],
  'finish-bad':[
   'I delivered the finale before earning the proper applause.',
   'An empty sleeve cannot rewrite that unfortunate final score.',
   'The curtain fell upon someone else receiving the crown.',
   'I cut the best chapter before the points arrived.'
  ],
  'reply-good':[
   'Excellent timing. I resent how well the audience liked it.',
   'A sharp plot twist. My next page is already curling.',
   'You stole that scene. Expect some very lively editing.',
   'Well played. I shall pretend this was my rehearsal.'
  ],
  'reply-bad':[
   'A bold performance of the wrong idea at the wrong time.',
   'That punchline seems to have landed upon its author.',
   'Shall we file that under comedy or cautionary footnotes?',
   'I could not have written a finer exit for you.'
  ]
 }},
 {name:'Nix', lines:{
  play:[
   'A cool decision placed beneath a very watchful moon.',
   'This card settles like frost upon your warm intentions.',
   'One feather lighter, with the evening still under observation.',
   'I waited for the right hush before releasing this.'
  ],
  draw:[
   'Another cold little possibility beneath my folded wing.',
   'The deck offers fresh snow for my existing drifts.',
   'I shall watch this card until its moment thaws.',
   'More paper in the nest, more patience required tonight.'
  ],
  skip:[
   'Your next turn has entered a short winter sleep.',
   'A little frost keeps your boots where they belong.',
   'The owl calls for silence during your next departure.',
   'Stay warm. Movement has been postponed by the weather.'
  ],
  reverse:[
   'The winter wind has changed its mind about direction.',
   'Turn back. I heard something useful behind us.',
   'A cold front sends the whole flock the other way.',
   'The moon remains still while our footprints reverse.'
  ],
  'draw-penalty':[
   'Those extra cards have snowed beneath my folded wing.',
   'A larger drift than this little nest was expecting.',
   'You added weight where I had planned a clean flight.',
   'I shall endure the snowfall and remember who summoned it.'
  ],
  ladder:[
   'Higher branches offer a much clearer view of victory.',
   'Up toward the cold moon and a better position.',
   'The ladder suits an owl with carefully folded wings.',
   'A quiet climb puts the whole route beneath me.'
  ],
  chute:[
   'An icy descent without the dignity of actual flight.',
   'My feathers are composed. My position is decidedly lower.',
   'The snow slid farther than my plans could follow.',
   'This chute mistakes an owl for a falling snowflake.'
  ],
  shortcut:[
   'I spotted the narrow path beneath the winter branches.',
   'A quiet route rewards eyes that stay properly open.',
   'Through the frost, where hurried travelers missed the opening.',
   'The shortest flight begins with a patient little observation.'
  ],
  pass:[
   'A soft feather of luck as I glide past.',
   'Keep your footing. The next breeze belongs to me.',
   'Our paths crossed without disturbing the whole snowy evening.',
   'A quiet greeting carries farther in this cold air.'
  ],
  'bump-hit':[
   'This perch now belongs to the more decisive owl.',
   'A winter landing sends your warm little boots backward.',
   'I arrived firmly. The branch had room for one.',
   'The snow shifted beneath a rather well aimed arrival.'
  ],
  'bump-blocked':[
   'Your shield has survived a surprisingly determined winter landing.',
   'That guard is colder and sturdier than I expected.',
   'My arrival found no crack in your little ice wall.',
   'The perch stays occupied. I shall study another approach.'
  ],
  lap:[
   'One full winter circuit, with every footprint accounted for.',
   'The moon watched my whole route and paid accordingly.',
   'A patient owl returns with a richer little nest.',
   'I circled the night without surrendering my steady watch.'
  ],
  'finish-good':[
   'The final feather falls upon the highest winter score.',
   'My hand is empty, and my patience earned the crown.',
   'A quiet ending leaves this owl above the field.',
   'The last card settles where victory has been waiting.'
  ],
  'finish-bad':[
   'I closed the nest before gathering enough winter points.',
   'The last feather fell while another owl held higher ground.',
   'An empty wing cannot lift a score left beneath others.',
   'My patience thawed before the winning moment had arrived.'
  ],
  'reply-good':[
   'A sharp observation. My eyes shall remain on you.',
   'That landed cleanly. Winter remembers a rival with patience.',
   'You chose the moment well. I heard the branch shift.',
   'Enjoy the higher perch while the weather stays kind.'
  ],
  'reply-bad':[
   'A hurried flight often finds the least forgiving branch.',
   'Your plan thawed before it could support your weight.',
   'The owl noticed that opening before your boots did.',
   'Perhaps wait for the snow to settle next time.'
  ]
 }}
];

// Every entry is authored for this traveler's new board encounters. Keeping
// these separate preserves the original sixteen categories word for word.
const boardVoices=[
 {
  'pad-good':[
   'This doorstep tips generously. I shall remember the address.',
   'The little moon mint paid my delivery fee twice.',
   'A reward beneath my boots beats another unsigned parcel.',
   'Excellent stop. My satchel accepts points without extra postage.'
  ],
  'pad-bad':[
   'That doorstep charged a toll before signing my receipt.',
   'A hungry mailbox has made my route considerably heavier.',
   'The thorns tore my invoice. Accounts will hear about this.',
   'I marked this address friendly. The address disagreed sharply.'
  ],
  'pad-buff':[
   'An enchanted stamp. This envelope now travels with attitude.',
   'My private parcel just received a very unusual upgrade.',
   'Something bright is tucked inside the folded return address.',
   'This card has express markings nobody else may inspect.'
  ],
  chain:[
   'Matching postage. I can send these parcels together tonight.',
   'Same number, new address. The express bundle grows again.',
   'Another matching stamp keeps my delivery boots moving farther.',
   'I chained the envelopes. Please clear a longer route.'
  ],
  stack:[
   'Return to sender, with the whole growing parcel pile.',
   'Your postage bill just inherited my additional delivery fees.',
   'I forwarded the stack. Kindly sign for every envelope.',
   'A matching surcharge sends this bundle down your route.'
  ],
  shuffle:[
   'Forwarding addresses changed. Please consult the new delivery order.',
   'I shook the sorting tray. Everyone has fresh appointments.',
   'Same couriers, different queue. My stamps approve the confusion.',
   'The depot rearranged our routes without moving our doorsteps.'
  ]
 },
 {
  'pad-good':[
   'This little stone dreamed up a gift for my wings.',
   'The moon left something kind beneath these sleepy feet.',
   'A gentle reward fluttered out of the folded ground.',
   'The lantern path remembers which dreams need a little warmth.'
  ],
  'pad-bad':[
   'That stone woke up on the thorny side of dreaming.',
   'The path tucked an unpleasant little weight beneath my wings.',
   'A hungry dream has borrowed more paper than I planned.',
   'The moon blinked, and my reward wandered into shadow.'
  ],
  'pad-buff':[
   'A quiet spell has settled inside this folded moon.',
   'My card is dreaming of something brighter than before.',
   'The lantern dust made one secret corner rather lively.',
   'I shall keep this enchanted dream beneath my wings.'
  ],
  chain:[
   'Two matching dreams flutter farther when their corners meet.',
   'The same little number has remembered another pair of wings.',
   'I fold one moon into the next sleepy motion.',
   'Another matching dream lengthens the breeze beneath my journey.'
  ],
  stack:[
   'I folded your nightmare into a larger passing cloud.',
   'These heavy dreams can sleep in somebody else’s wings.',
   'One matching worry sends the whole bundle onward tonight.',
   'The nightmare grows. I am letting another lantern hold it.'
  ],
  shuffle:[
   'The wind changed our places in the sleeping procession.',
   'Our turns fluttered loose, then settled in different dreams.',
   'The moon shuffled the breeze without disturbing our footprints.',
   'A wandering dream has rearranged who wakes up next.'
  ]
 },
 {
  'pad-good':[
   'This platform pays dividends. I should patent its little gears.',
   'The floor supplied a bonus without stripping a single cog.',
   'Useful output. My boots activated the correct folded mechanism.',
   'A working reward circuit beneath my feet at last.'
  ],
  'pad-bad':[
   'That toll mechanism needs several strongly worded replacement parts.',
   'The floor swallowed my profit. Definitely a manufacturing defect.',
   'A hungry gear just increased the load on my pockets.',
   'My calculations omitted this particularly expensive little platform fault.'
  ],
  'pad-buff':[
   'One card upgraded. I tightened its extraordinary little corners.',
   'The enchantment fits perfectly inside my patented paper mechanism.',
   'A secret improvement makes this card hum rather promisingly.',
   'Do not touch that fold. Its bonus is freshly calibrated.'
  ],
  chain:[
   'Matching cogs mesh beautifully. Watch the travel output increase.',
   'Same number, extra rotation. That is excellent mechanical efficiency.',
   'I fitted another matching gear into this moving card train.',
   'The chain holds. My boots appreciate the additional torque.'
  ],
  stack:[
   'Your overloaded mechanism now includes my matching spare parts.',
   'I added another cog. The entire debt rotates onward.',
   'Pressure transferred. Somebody else may service this growing stack.',
   'Matching surcharge installed. Please inspect your suddenly heavier machinery.'
  ],
  shuffle:[
   'The scheduling gears turned loose. Everyone gets new tolerances.',
   'I recalibrated the queue without dismantling any actual traveler.',
   'A clockwork shuffle changes which cog engages the turn next.',
   'Same machine, rearranged teeth. The new order is perfectly functional.'
  ]
 },
 {
  'pad-good':[
   'This stone kept a little light for my collection.',
   'A kind reward belongs beside the lanterns I guard.',
   'The path offered warmth without asking another flame to fade.',
   'One more gift to keep this wandering evening bright.'
  ],
  'pad-bad':[
   'The toll dimmed my lantern, though its flame remains.',
   'A hungry shadow has added paper to my careful keeping.',
   'This stone took more warmth than its markings promised.',
   'I shall guard my remaining light from that costly corner.'
  ],
  'pad-buff':[
   'A small blessing rests inside this carefully guarded card.',
   'The fold holds a light I shall reveal when needed.',
   'One secret corner now glows beneath my watchful lantern.',
   'I will keep this enchantment safe until its proper moment.'
  ],
  chain:[
   'Matching flames carry our careful procession a little farther.',
   'I joined another numbered light to this gentle trail.',
   'The next matching card keeps my lantern journey burning.',
   'One folded light answers another, and the path lengthens.'
  ],
  stack:[
   'This burden passes onward with one matching folded warning.',
   'I cannot shelter every debt beneath my little lantern.',
   'Another matching weight leaves my care for yours tonight.',
   'The growing stack belongs beside somebody else’s flame now.'
  ],
  shuffle:[
   'The lantern procession has changed its careful order again.',
   'I shall keep each flame through this shuffled watch.',
   'Different guardians move next. The shared light still belongs here.',
   'Our turns changed places while my lantern kept its vigil.'
  ]
 },
 {
  'pad-good':[
   'A worthy tribute. The raven accepts this guarded platform.',
   'This stone honors a knight who keeps the long watch.',
   'A reward beneath my talons strengthens the evening’s campaign.',
   'The heraldic path has paid its debt to my advance.'
  ],
  'pad-bad':[
   'That treacherous platform levied a toll upon my armor.',
   'A hungry stone has challenged the discipline of my march.',
   'The raven records this insult beside its lost tribute.',
   'My shield met the ground. The ground charged for meeting.'
  ],
  'pad-buff':[
   'This card bears a blessing worthy of the raven’s seal.',
   'A secret enchantment now serves beneath my folded banner.',
   'I shall wield this strengthened card when duty calls.',
   'One guarded fold has earned a sharper heraldic purpose.'
  ],
  chain:[
   'Matching standards advance together beneath the raven’s steady command.',
   'Another numbered banner joins this increasingly decisive little march.',
   'The same seal grants my boots a longer campaign.',
   'I link these cards as firmly as my sworn armor.'
  ],
  stack:[
   'Your siege debt returns with reinforcements beneath my banner.',
   'A matching levy sends this burden toward your battlements.',
   'The raven adds its seal to your growing obligation.',
   'I counter the stack. Let another shield bear its weight.'
  ],
  shuffle:[
   'Ranks reform. The raven commands a newly ordered advance.',
   'Our banners change sequence while each knight holds their ground.',
   'The battle roster shifts beneath the same sworn watch.',
   'A heraldic shuffle has appointed the next marching standard.'
  ]
 },
 {
  'pad-good':[
   'A sweet little reward beneath my very thorny hem.',
   'The path stitched a present into my waiting pocket.',
   'This lovely stone knows how to treat a prickly doll.',
   'One bright petal of profit for my carefully sewn basket.'
  ],
  'pad-bad':[
   'That toll pulled a thread from my precious little purse.',
   'A hungry seam has stuffed another worry into my basket.',
   'The thorns took payment from their own well dressed cousin.',
   'This platform smiled sweetly before snagging my valuable stitches.'
  ],
  'pad-buff':[
   'A little enchantment is sewn beneath this card’s hem.',
   'My secret fold has grown a rather interesting thorn.',
   'I stitched the bonus tightly. Nobody else gets a peek.',
   'One charmed card blooms quietly inside my buttoned basket.'
  ],
  chain:[
   'Matching numbers stitch a longer path for my pretty boots.',
   'I linked another card with one extremely tidy thorn.',
   'The same little pattern keeps this paper garland growing.',
   'One matching seam joins the next delightful stretch of trouble.'
  ],
  stack:[
   'I sewed another surcharge onto your charming little burden.',
   'The matching thorn sends this whole prickly basket onward.',
   'Your debt has blossomed. Please mind its newly added stitches.',
   'A small additional snag makes the stack somebody else’s problem.'
  ],
  shuffle:[
   'I pulled the queue’s thread. Everyone has different little stitches.',
   'Our turns were a garland. I rearranged its petals.',
   'The seating pattern changed without disturbing a single button.',
   'A thorny little shuffle has resewn who comes after whom.'
  ]
 },
 {
  'pad-good':[
   'The floor tipped its author. A wonderfully enlightened reader.',
   'This platform wrote a profitable little footnote beneath my shoes.',
   'A reward appears. I approve this unusually generous plot twist.',
   'The ink has found a happy ending in my pockets.'
  ],
  'pad-bad':[
   'The floor revised my profit into a rather rude footnote.',
   'A hungry paragraph just expanded the weight of my hand.',
   'That toll was written in suspiciously tiny theatrical print.',
   'The plot took my points without requesting an editorial opinion.'
  ],
  'pad-buff':[
   'One secret card just acquired a deliciously unreliable footnote.',
   'The ink inside this fold is planning a special entrance.',
   'I annotated a card. Its corners now promise extra mischief.',
   'This private little enchantment deserves its own dramatic punctuation.'
  ],
  chain:[
   'A matching number extends this excellent sentence of trouble.',
   'Another card joins the plot without changing its clever numeral.',
   'I linked the pages. The journey now has extra chapters.',
   'The same number returns for a highly profitable encore.'
  ],
  stack:[
   'Your debt needed a sequel. I supplied matching punctuation.',
   'I edited the surcharge upward and forwarded the manuscript.',
   'Another matching bill thickens this increasingly unfortunate little plot.',
   'The stack grows. Your next chapter looks unusually expensive.'
  ],
  shuffle:[
   'I shuffled the cast. The script will catch up eventually.',
   'Your cue moved elsewhere. Please applaud the revised confusion.',
   'Same players, rearranged chapters. My ink enjoys an unreliable narrator.',
   'The queue suffered a plot twist with excellent comic timing.'
  ]
 },
 {
  'pad-good':[
   'This perch left a winter gift beneath my patient feet.',
   'A useful reward glints where the owl expected bare stone.',
   'The cold path recognizes a traveler who watches carefully.',
   'One more bright treasure warms my quiet little nest.'
  ],
  'pad-bad':[
   'That icy perch charged a toll upon my landing.',
   'A hungry drift has added weight beneath my winter wings.',
   'The owl saw the trap after its purse grew colder.',
   'This stone concealed a costly crack beneath its polite snow.'
  ],
  'pad-buff':[
   'A secret blessing gleams inside this carefully sheltered card.',
   'The owl keeps an enchanted fold beneath its winter feathers.',
   'One quiet card holds more warmth than its corners reveal.',
   'I shall watch for the proper moment to open this charm.'
  ],
  chain:[
   'Matching numbers carry my winter flight beyond the nearer perch.',
   'Another matching feather extends this patient little card journey.',
   'The same numeral opens a longer trail across the snow.',
   'I link these folds without surrendering my careful winter watch.'
  ],
  stack:[
   'Your cold debt travels onward with another matching feather.',
   'The owl has found a perch beyond this growing burden.',
   'One matching surcharge sends the whole snowdrift toward you.',
   'I add the weight, then let another branch support it.'
  ],
  shuffle:[
   'The winter flight order changed while every perch stayed still.',
   'My watch continues through this freshly shuffled little migration.',
   'Different wings take the next turn beneath the same moon.',
   'The owl noticed whose footprints now approach the queue first.'
  ]
 }
];

export const CHARACTER_BANTER = Object.freeze(voices.map(({name,lines:original},character)=>{
 const lines={...original,...boardVoices[character]};return Object.freeze({
 character,name,lines:Object.freeze(Object.fromEntries(BANTER_CATEGORIES.map(category=>[category,Object.freeze(lines[category])]))),
 lineCount:BANTER_CATEGORIES.reduce((count,category)=>count+lines[category].length,0)
});}));

const aliases=Object.freeze({penalty:'draw-penalty',bump:'bump-hit',blocked:'bump-blocked',finish:'finish-good',good:'reply-good',bad:'reply-bad'});
function characterId(value){
 if(Number.isInteger(value)&&value>=0&&value<CHARACTER_BANTER.length)return value;
 if(typeof value==='string')return CHARACTER_BANTER.findIndex(voice=>voice.name.toLowerCase()===value.toLowerCase());
 return -1;
}
function eventHash(value){
 let result=2166136261;
 for(const code of String(value||''))result=Math.imul(result^code.codePointAt(0),16777619);
 return result>>>0;
}

/**
 * category names describe the affected speaker's public event: draw-penalty is
 * receiving extra cards; bump-hit is the successful landing player's line;
 * bump-blocked is the blocked landing player's line; finish-good/bad describe
 * whether clearing the hand secured the points lead. pad-good/bad describe
 * landing rewards/risks; pad-buff announces an enchantment without identifying
 * its private card; chain is an extra same-number play; stack passes growing
 * draw debt onward; shuffle reacts to a changed public turn order.
 * A rival gets a separate
 * good/bad snapback. No hidden hands or evolving simulation are consulted.
 *
 * afterOrdinal rejects an already shown event. previousKey prevents adjacent
 * duplicates without mutable module state. Omit eventOrdinal only for an
 * event-ID-only fixture; supplying ordinals gives explicit stale-event checks.
 */
export function selectCharacterBanter({character,category,eventId='',eventOrdinal,role='actor',tone='neutral',afterOrdinal,previousKey}={}){
 const id=characterId(character);if(id<0)return null;
 if(role!=='actor'&&role!=='rival')return null;
 const ordinal=Number.isSafeInteger(eventOrdinal)&&eventOrdinal>=0?eventOrdinal:null;
 if(eventOrdinal!==undefined&&ordinal===null)return null;
 if(Number.isSafeInteger(afterOrdinal)&&ordinal!==null&&ordinal<=afterOrdinal)return null;
 let selected=aliases[category]||category;
 if(role==='rival'){
  if(tone!=='good'&&tone!=='bad')return null;
  selected=`reply-${tone}`;
 }
 if(!BANTER_CATEGORIES.includes(selected))return null;
 const lines=CHARACTER_BANTER[id].lines[selected];
 let variant=(eventHash(`${id}:${selected}`)%lines.length+(ordinal??eventHash(eventId))%lines.length)%lines.length;
 if(previousKey===`${id}:${selected}:${variant}`)variant=(variant+1)%lines.length;
 return Object.freeze({key:`${id}:${selected}:${variant}`,text:lines[variant],character:id,category:selected,ordinal,eventId:String(eventId),role});
}

/** Convenience for small surfaces which only need a safely selected string. */
export function characterBanterLine(metadata){return selectCharacterBanter(metadata)?.text??'';}
