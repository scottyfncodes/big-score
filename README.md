# The Big Score

A free, browser-based heist strategy game. You are the mastermind: you pick the
job, buy what you can afford to know about it, decide who is in the room, and
then live with all of that for six stages of a night that will not go the way
you drew it.

No backend, no accounts, no build-time services. React + TypeScript + Vite,
hand-written CSS, two runtime dependencies (`react`, `react-dom`), and a save
in `localStorage`.

```bash
npm install
npm run dev        # play it
npm test           # engine + balance + content suites
npm run sim        # print the balance distribution table
npm run build      # static output in dist/
```

## The design the code is built around

**Success is not one number.** The thing that kills a game like this is
collapsing every system into a single success percentage, because then the
optimal play is "buy +% until the number is green" and crew, kit and intel are
just shops. Instead each of the six stages tests a *different* attribute
against a *different* part of the building — Entry tests stealth against access
control, Security tests technical against cameras, Escape tests driving against
the response time — so a crew that is excellent at one thing is visibly exposed
somewhere else. The percentage on the planning board is derived from that, not
the other way round.

**Failure changes the state of the run; it does not end it.** A blown stage
starts an alarm, rattles the person who blew it, costs part of the take, or
separates somebody from the crew. The run continues into the next stage in a
worse position. Only the escape decides who is actually in the van.

**Time is scarce, but only once somebody is counting.** The response window
does not start when the crew arrive; it starts when the alarm goes or the noise
crosses a threshold. Before that, minutes cost only a slow accumulation of
noise. This is what makes "has anyone noticed" the real question of a stealth
run, and what makes the aggressive approach — which starts exposed at t=0 — a
genuine race rather than a coin flip.

**Estimates read what the player believes; resolution reads what is true.**
`calc.ts` computes the planning board from held intel at face value.
`resolve.ts` computes the night from whether that intel was actually correct.
False intel therefore *moves the number on the board*, which is the only way a
lie can be a lie rather than a dead purchase.

**Nothing is a hard gate.** Approaches lean on roles, they do not require them.
Running the Inside Job without an inside man is a bad idea you are allowed to
have. "Can I make this work anyway" has to remain answerable.

**The city is the progression, not the target.** A building you have robbed is
worth a fraction of what it was and has better locks than it did; what is left
grows back over weeks. Intel does not survive the job it was bought for — the
rotation changes and the inside man does not stay inside. Together those mean
the correct play is always to move on, which is what the districts and the tier
ladder are for.

## Layout

```
src/
  game/        the engine — pure, DOM-free, fully tested
    types.ts       the vocabulary; imports nothing
    rng.ts         counter-based seeded randomness
    stages.ts      what each of the six stages tests
    calc.ts        every number the player is shown
    resolve.ts     the night itself
    campaign.ts    everything between jobs
    intel.ts       buying information, and being lied to
    generation.ts  crew
    news.ts        the paper
    sim.ts         headless balance harness
  data/        content as plain objects: targets, crew, equipment,
               approaches, traits, events, narration, districts
  state/       React store + versioned localStorage persistence
  ui/          screens and CSS. Calculates nothing.
```

The engine has no React import anywhere, which is why the whole game can be
balanced from a terminal before any of it is drawn.

## Randomness and reproducibility

`Math.random()` is banned in `src/game`. The stream is a pure function of
`(seed, cursor)`: the run holds an integer, every draw increments it, and the
seed is derived from `campaign seed + target + day`. The same campaign, target
and decisions replay the same night — through a save, a reload, and a decision
made an hour later. A bug report is a seed.

## Balance is asserted, not eyeballed


`src/game/balance.test.ts` simulates hundreds of runs per configuration and
fails if the shape of the game changes. `npm run sim` prints the table:

```
argent_vine / stealth / thin crew     est 16%  P 0% C15% M49% B28% C 8%  cops 23%
argent_vine / stealth / prepared      est 98%  P32% C49% M19% B 1% C 0%  cops  7%
kestrel_gallery / stealth / 4-hander  est 61%  P 4% C45% M34% B18% C 0%  cops 18%
port_argent_savings / aggressive      est  1%  P 0% C 0% M19% B78% C 2%  cops 98%
```

That last row is not a bug. Going through the front door of a bank two hundred
metres from a police station is supposed to be close to suicide; the aggressive
approach earns its keep on soft targets with long response times, where it
returns a reliable score and an enormous Heat bill.

`campaignSim.ts` plays whole campaigns headlessly under a policy, which is the
only way to see the problems that take a dozen jobs to appear. Its first run
produced a campaign that robbed the same jeweller eight times in a row at a
reported 99%, then the same gallery seven times, finishing on $2.6M with Heat
pinned at 96 and no consequence attached to either. Everything in
`progression.test.ts` exists because that run, or the over-corrected version
that followed it, went wrong in a specific way:

| Question | Answer, measured over ~600 simulated jobs |
| --- | --- |
| Does covering the plan's weak stage matter? | Yes — about 39% more bankroll than hiring the cheapest body |
| Is a bigger crew simply better? | No. Four is the peak; three and five are both worse, six is much worse |
| Does buying intel pay? | Yes, at a modest budget — it beats buying none on both money and outcomes, and over-buying costs |
| Does managing Heat pay? | Yes — laying low above 40 roughly doubles the bankroll of never laying low |

The crew-size and intel answers were both *no* the first time they were asked.
The cut was a tax the player simply paid rather than a decision they made, and
intel bought cleaner jobs while losing money overall — a system the optimal
player skips is a trap, not a choice. Both were repriced until the curve had a
peak in the middle.

## Content

7 targets across 6 districts · 8 crew archetypes generated from 24 first names
· 8 traits, each named by at least two events · 10 pieces of equipment ·
19 conditioned events · 60 lines of stage narration · 8 headline templates.

Two content rules are enforced by `content.test.ts`: every event names a
specific member of the crew, and every event is conditioned on something the
player did — a trait they hired, kit they skipped, intel they did not buy,
noise they already made. An event that could fire on any run with any crew is a
slot machine, and gets deleted rather than balanced.

## Mobile

Built for iPhone Safari first. Tap-to-assign rather than drag-and-drop — HTML5
drag does not work on iOS and a pointer-events reimplementation is a fight on a
phone — bottom sheets, 46px minimum targets, `dvh` units, safe-area insets, no
hover-only interactions, and no horizontal overflow at any width. Desktop gets
a two-column planning board at 900px.

## Not built yet

Rival crews, persistent police investigation, the black market, multiple
cities, multi-stage operations, crew betrayal, leaderboards, daily heists.
None of these should be started until the loop above is genuinely fun.
