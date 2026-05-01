# INSIGHTS.md — Three Things I Learned About LILA BLACK

---

## Insight 1: The Center of AmbroseValley is a Death Trap — But Players Keep Going There

### What caught my eye
When viewing all matches on AmbroseValley with kill and death markers enabled,
a dense cluster of red and orange dots dominates the central area of the map.
The concentration is 3–4x higher than any other zone. Meanwhile, the northern
and eastern edges of the map show almost no combat events.

### The data backing it
- Filtering to Kill + Killed + BotKill + BotKilled events on AmbroseValley
  and enabling heatmap mode shows a clear hotspot in the map center
- Player path lines (Position events) converge from all quadrants toward this
  central zone — it is not just a transit corridor, players actively route into it
- Storm deaths (KilledByStorm) cluster at the map edges, confirming the storm
  pushes inward, which funnels players toward the same central chokepoint

### What a level designer should do
The center is overloaded because it likely contains the highest-value loot or
extraction points AND sits at the natural geometric midpoint all storm survivors
converge on. This creates a single dominant strategy: rush center, camp, win.

**Actionable items:**
- Add 2–3 alternative high-value loot rooms in underused northern/eastern zones
  to split player routing
- Introduce a physical barrier or elevation change in the central hotspot to
  break line-of-sight and reduce one-shot ambush potential
- Consider relocating one extraction point to the eastern edge to pull player
  traffic away from the center funnel

**Metrics to watch:** Kill/death ratio in the central zone (target: reduce by
30%), percentage of matches where final circle lands center vs edge, average
match duration (longer = more distributed routing)

---

## Insight 2: Bots Die to the Storm Far More Than Human Players

### What caught my eye
Filtering to KilledByStorm events and toggling "Show bots" on/off reveals a
striking pattern: storm deaths are heavily concentrated among bot players.
Human storm death markers appear sparsely near the map edges, while bot storm
deaths scatter across a much wider area including mid-map positions.

### The data backing it
- With bots visible: KilledByStorm markers spread broadly, including positions
  well inside the expected safe zone boundary
- With bots hidden: Human storm deaths drop sharply and cluster tightly at the
  map perimeter — consistent with players who pushed the storm timer too long
- Bot paths (BotPosition lines) show straighter, less adaptive movement — bots
  travel in direct lines rather than routing around obstacles or toward the safe
  zone efficiently

### What a level designer should do
Bot pathfinding does not appear to account for storm direction adequately.
Bots dying mid-map to storm is a realism and immersion problem — human players
notice when bots behave obviously differently. It also skews storm death
placement data, making it hard to identify genuine map design issues (bad escape
routes, terrain that traps players) vs bot AI failures.

**Actionable items:**
- Flag this finding to the AI/bot team: bot storm awareness needs tuning so
  bots begin routing to safe zone earlier
- Separate bot and human KilledByStorm data in analytics pipelines to avoid
  contaminating level design signal
- Use human-only storm death clusters to identify terrain pinch points where
  map geometry traps players trying to outrun the storm — these are genuine
  design bugs worth fixing

**Metrics to watch:** Bot storm death rate vs human storm death rate (current
gap appears >2x), bot survival time as a percentage of match duration, number
of bots alive at final circle (proxy for how competitive bots feel)

---

## Insight 3: Loot Events Reveal Ignored Areas That Represent Wasted Design Investment

### What caught my eye
Filtering to Loot events only and comparing across all matches shows that loot
pickups cluster in the same 4–5 locations on AmbroseValley repeatedly. Large
portions of the map — visually detailed areas with clear design investment —
show zero or near-zero loot interaction across all 5 days of data.

### The data backing it
- Loot markers on AmbroseValley concentrate near spawn-adjacent buildings and
  the central combat zone
- The map's southwestern quadrant and several structures in the northeast show
  almost no loot interaction despite player paths occasionally passing through
- Cross-referencing with Position events confirms players do travel near these
  areas — they are not unreachable, they are simply not being looted
- This pattern holds across multiple days (Feb 10–14), ruling out a single
  unusual match as the cause

### What a level designer should do
Areas with high player traffic but low loot interaction indicate one of two
problems: either the loot spawns in those areas are too weak to be worth
picking up, or the areas themselves feel unsafe to slow down in (typically
because they are too exposed). Either way, the design investment in those
areas is not converting into gameplay value.

**Actionable items:**
- Audit loot table quality in the southwestern quadrant — if spawn rates or
  item tiers are lower than central zones, rebalance upward
- Add cover geometry (walls, crates, rooftops) to exposed low-loot areas to
  make players feel safe enough to stop and loot
- Consider placing a mid-tier guaranteed spawn (always-present chest) in the
  two most underused structures to anchor player routing toward them
- Run an A/B test: increase loot quality in one ignored zone for one week and
  measure whether player traffic redistributes

**Metrics to watch:** Loot pickup distribution entropy (are pickups evenly
spread or concentrated?), average number of unique loot zones visited per
match, correlation between loot zone visits and player survival time