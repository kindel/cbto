# CBTO app design

The design for the CBTO app. v1 (the solo wizard) is implemented in this
repo; the Roadmap section tracks what is not. The README stays the truth
about status.

## What the user leaves with

The app is a stack-rank wizard for the CBTO model (Customer, Business,
Technology, Organization). A user who finishes it leaves with three
things, stated in plain language on one results screen:

1. **Their superpower.** The lens at the top of their Current Strengths
   stack, named as such.
2. **Their growth edge.** The lens where Future Energy ranks high but
   Current Strengths ranks low, where intentional growth pays off.
3. **The match, or the mismatch.** Whether their energy is going where
   the role actually needs it, or to what they are already good at.
   The 2025 post's core claim (most leaders default to their existing
   strengths) is the thing the results screen makes undeniable.

Secondary outcomes: an artifact they can bring to a manager, mentor, or
Office Hours conversation, and enough teaching along the way that they
can run the exercise with their own team afterwards.

## Who it serves

- **A leader assessing themselves** (primary): picking a next role,
  writing a growth plan, or preparing for a career conversation.
- **A hiring manager**: rank what the role needs before the loop, then
  hold candidates against that stack instead of against charisma.
- **A team**: find out whether the leadership team is overweight on one
  lens. (v2; see Roadmap.)

## The flow

### 1. Teach

One screen per lens, four screens, skippable. Each card gives the lens
name and all its aliases (shown as "also called Product", "also called
Strategy, Industry"), a one-sentence definition, and three example
activities ("segmenting users", "pricing the offering", "choosing the
architecture", "running calibrations"). The examples matter: they are
what makes the ranking honest, because the user ranks against work they
recognize, not against words they like the sound of.

The rank and joy screens show each lens as "Name / piep" (Customer /
Product, Business / Industry, Technology / Execution, Organization /
People). The `piep` field in `data/lenses.json` picks one synonym per
lens for this card title; hosts who override `window.CBTO.lenses` can
change it. When `piep` is missing, the card falls back to the first
alias.

A user who arrives from the blog already knows the model; the wizard
opens with "Learn the lenses" and "Start the rank" side by side.

### 2. Rank, three times

The three questions from the 2025 post, one screen each:

1. **Current Strengths**: what you are strongest at today. Ranking
   the four cards is the first action. An optional, collapsed field
   can name a person who set the bar for a lens. Names never appear
   as the first focus, never look required, and never block Next.
   They stay in the browser (session only, not in localStorage or
   permalinks).
2. **Future Energy**: the rank screen asks "Where do you want to
   grow the most?" The model name stays on results as a caption
   under Grow the most.
3. **Role Needs**: what the current role, manager, and team actually
   need, ranked by importance to the job. The prompt says explicitly:
   rank the job, not yourself.

Interaction: drag-to-rank four cards on desktop, tap-to-order on
mobile. Each rank screen says which of those to do, so a first-time
user does not need a coach. Back keeps every stack already set.
Going back and then Next restores the previous order. Each screen
restates its question in one line and shows the lens examples so
the user ranks behavior, not vocabulary.

**Forced-pairs mode (optional).** Self-ranking flatters. As an
alternative input mode, the app can ask the six pairwise questions per
stack ("Over the last month, which did you actually spend more of your
best work on: Customer or Technology?") and derive the order. Slower,
more honest. Offered as "Not sure? Answer six quick either/ors
instead." Planned for v1.1.

### 3. Joy or drain (optional, bridge not merge)

One optional screen before results: "For each lens, does this work
bring you joy or drain you?" Four toggles, ten seconds, skippable. The
default five-minute path treats this as skippable: Skip to results is
the primary action, and Skip still reaches results. Answering all four
toggles and clicking Include joy in results is extra. The full
Joy/Drain exercise stays in its own post and future app; CBTO only
surfaces the collision when it exists. The README draws this boundary
("related, not this app") and this design keeps it.

### 4. Results

The reading leads: Superpower and Growth edge first, in plain
language. Then three columns side by side (Strengths today, Grow the
most, Role needs) with the four lenses color-coded so the eye tracks
each lens across the columns. Role needs is the comparison, not the
first thing to decode. Each column has a Change control that returns
to that rank and keeps the other stacks. Share is the primary action
once results exist. Start over is quiet, so editing does not look
like a restart. The reading, generated from rules (see Interpretation):

- **Superpower**: top of Strengths.
- **Growth edge**: high in Energy, low in Strengths.
- **Comfort zone**: Energy tracks Strengths but not Role; you are
  investing in what you are already good at.
- **Blind spot**: top of Role, bottom of Strengths; the job needs most
  what you have least.
- **Alignment**: a plain-language distance between stacks ("Your energy
  matches the role's needs in 1 of 4 positions"), never a bare score.

If the user answered the joy check and the growth edge lands on a lens
marked as drain, the reading says so: "You plan to grow where the work
drains you; read Joy vs Drain before you commit," and links the 2025
Joy vs Drain post.

The reading closes on the post's counterweight: development is not only
patching weakness; it is aligning growth with work that is fun, future
roles, team needs, and market demands.

## Interpretation engine

Rule-based, deterministic, no model calls, no backend. Signals computed
from the three permutations:

| Signal | Rule |
| --- | --- |
| Superpower | Strengths rank 1 |
| Growth edge | max(StrengthsRank − EnergyRank), i.e. ranked much higher in Energy than in Strengths |
| Comfort zone | Energy closer to Strengths than to Role (footrule distance) |
| Blind spot | Role rank 1 with Strengths rank 3–4 |
| Alignment | per-pair footrule distance, rendered as positions-in-common |

Every signal renders through template text in `data/interpretations.json`.
With 24 orderings per stack there are 13,824 combinations; the templates
key on signals, not on raw orderings, so the text stays finite and every
combination resolves. A check enforces that (see Checks).

**Archetype names are out for v1.** Naming orderings ("the Builder",
"the Operator") makes results shareable and makes them horoscopes.
The signals above say the true thing without flattening 24 orderings
into 4 nouns. Revisit only if users ask for it.

## What it will not do

- No accounts, no server, no analytics on answers. Results exist in the
  user's browser and in links the user chooses to create.
- No scoring of people against each other. Hiring mode ranks the role;
  the comparison against a candidate happens in the hiring manager's
  head, on purpose.
- No LLM in the loop. The reading is rules and templates; it must say
  the same thing to the same stacks every time, and it must work as a
  static page.
- No fifth lens, no half-positions, no ties. The forced rank is the
  exercise. "They're all important" is the answer the wizard exists to
  refuse.

## Architecture

Same shape as biq: a static vanilla-JS app, no build step, data loaded
with `fetch`, hosted by kindelwww at `/cbto/` and runnable locally with
`python3 -m http.server`.

```
index.html            the wizard and results
css/cbto.css
js/cbto.js
data/lenses.json      lens names, aliases, piep (card synonym), definitions, examples
data/interpretations.json   signal-keyed reading templates
scripts/check_reading.js    the checks (see below)
card.json             already present; status flips to "live" at ship
icon.png              already present
```

- **State and sharing.** The three stacks (plus the optional joy
  toggles) encode into the URL as human-readable query parameters:
  `?s=CBTO&e=TOBC&n=BCOT&j=CT`. Each stack is four letters in rank
  order; `j` holds the letters marked as joy (omitted when skipped).
  A permalink reproduces the results screen exactly. Copy-as-Markdown
  gives the three stacks and the reading as text for a doc or a 1:1
  agenda. `localStorage` keeps past runs so a user can retake in six
  months and see the diff ("your Strengths stack moved; your Energy
  stack did not").
- **Host override.** `window.CBTO = { lenses: "...", interpretations:
  "..." }` before `js/cbto.js` loads, mirroring `window.BIQ`.
- **Attribution.** A visible link to https://kindel.com on the page,
  per AGENTS.md, not only in LICENSE.
- **Principles alignment.** CBTO carries no company sets, so the core
  model it must not fork is the CBTO model itself: the lens
  definitions and the exercise live in `data/`, the wizard renders
  them, and nothing about a lens is hardcoded in `js/`. The app owns
  the experience; the data owns the words.

## Checks

Per the tenets, each rule ships with the check that fails on it, in
`scripts/check_reading.js`, run by CI:

1. Every one of the 13,824 stack combinations produces a complete
   reading; no signal resolves to a missing template.
2. Permalinks round-trip: encode(decode(x)) is identity across all
   combinations.
3. The signal functions are lifted from `js/cbto.js`, not restated, so
   the check cannot fall out of step with what the page runs (biq's
   `check_search.js` pattern).
4. `data/lenses.json` has exactly four lenses, each with aliases,
   definition, and at least three example activities.

## Roadmap

- **v1 (the solo wizard).** Teach, three ranks, results, joy check,
  permalink, copy-as-Markdown, localStorage history. This is the app
  card's promise and nothing more.
- **v1.1 (hiring mode).** Same wizard, one stack: "Rank what this role
  needs." Produces a shareable role card to hold a loop against.
  Mostly reuses v1; earns its keep in the card.json summary's "hiring
  a leader" case.
- **v1.2 (forced-pairs input).**
- **v2 (team view).** A facilitator pastes team members' permalinks;
  the app renders the team's stacks as a grid and flags the overweight
  lens and the uncovered one. Still no backend: the permalinks are the
  data transport.
- **Teaching page.** https://kindel.com/cbto/ hosts the app; the teach
  cards double as the standing explanation of the model, so the page
  is useful even to someone who never clicks Start.

## Open questions

1. Does the joy check belong in v1, or does even four toggles blur the
   line the README draws against the Joy/Drain post?
2. Forced-pairs: worth the extra screen real estate in v1, or is
   drag-to-rank plus good example activities honest enough?
3. Team view assumes people will share permalinks with a facilitator.
   Is that the real workflow, or does team mode want a printed/live
   workshop format instead?
