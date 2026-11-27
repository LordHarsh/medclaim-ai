# MedClaim AI: interface

The interface shows what happened to a claim. It does not describe it. A person should get the answer from shapes and numbers, and reach the wording only if they go looking.

## Who it is for

| Person | Has | Wants |
| --- | --- | --- |
| Reviewer | A minute | To see five agents really decide a claim |
| Member | A bill | To file it, and know what happened to the money |
| Operations | A queue | To see why the pipeline decided, and whether to trust it |

## One need per screen

| Screen | Route | The one thing it must answer |
| --- | --- | --- |
| Landing | `/` | What is this? A recorded claim runs by itself. |
| Samples | `/demo` | Can I watch a claim get decided? Pick one, press Run. |
| Sign in | `/auth/*` | Let me in. |
| My claims | `/dashboard` | What happened to each of my claims? |
| New claim | `/claims/new` | What do I need to hand over? |
| Claim | `/claims/[id]` | What happened to my money, and why? |
| Operations | `/admin` | What did the pipeline decide lately? |
| Claim (ops) | `/admin/claims/[id]` | Why this decision, and how sure is it? |
| Test runner | `/admin/eval` | Does the live pipeline still give the right answers? |

## Rules

- A label of two or three words beats a sentence. No subtitle under a heading.
- Colour means claim state and nothing else. Buttons and chrome are ink on paper.
- Detail is one click away (a step in the track, or a "more" disclosure), never on the first view.
- The same claim is drawn the same way everywhere, by the same components.
- Every state colour is paired with an icon or a word, so it does not rely on colour alone.

## Tokens

Defined once in `web/src/app/globals.css` under `@theme`, and used as Tailwind classes.

| Group | Tokens |
| --- | --- |
| Surfaces | `canvas`, `surface`, `sunken`, `line`, `line-strong` |
| Text | `ink`, `ink-2`, `ink-3` |
| Claim states | `ok` approved, `part` partly approved, `bad` rejected or failed, `review` with a person, `wait` in progress, `stop` re-upload needed. Each has a `-soft` background. |
| Shape | `rounded-card` 14px, `rounded-ctl` 9px |
| Type | Inter 400, 500, 600. Numbers are tabular. Sizes: 11 label, 13 small, 15 body, 18 and 22 headings, 40 for the verdict amount. |

## Parts

`web/src/components/ui.tsx` holds the frame and controls: `TopBar`, `Page`, `Button`, `LinkButton`, `Card`, `Label`, `Stat`, `Empty`, `Notice`, `More`, `Skeleton`.

`web/src/components/claim/` holds how a claim is read and drawn:

| Part | Answers |
| --- | --- |
| `PipelineTrack`, `MiniTrack` | Where is it? Five steps that fill in from the left. |
| Verdict (in `ClaimResult`) | What happened? One state, one amount. |
| `MoneySplit` | Where did the money go? Claimed, covered, you pay, as one bar. |
| `RuleGrid` | Which policy rules held? Ten marks; a failed one shows its reason. |
| `FraudMeter` | How suspicious is it? A score against the review line, with the signals. |
| `Confidence` | How sure is the system? A bar, with what was deducted. |
| `DocThumbs` | What was uploaded, and what was it read as? |
| `ClaimResult` | All of the above for one claim, for a member or for operations. |

`model.ts` turns a claim row or a recorded run into what those parts need, so the public replay, the member's page, the operations pages and the test runner all read a claim the same way.

## Checking screens without signing in

`/gallery` draws every signed-in screen and state from fixtures built from the recorded runs. It is available in development and on preview deployments, and returns 404 on the production deployment.
