# Unseen Studio

A customer types one line. We design a t-shirt, check it, print it, and post it.
They see it for the first time when they open the box.

That premise is the whole engineering problem. Because the customer never
approves the design, two things have to be true at once, and neither is
optional:

- **The design has to be genuinely good.** There is no "regenerate" button to
  paper over a mediocre first attempt. Whatever comes out is what someone wears.
- **The design has to be safe without anyone looking at it.** There is no
  customer between the model and the printer to catch a slur, a swastika-ish
  rosette, or a misspelled word.

So this repo is mostly prompts and gates, and only a little bit of web app.

## The four stages

| Stage | File | What it does |
|---|---|---|
| 0. Pre-screen | `lib/policy/blocklist.ts` | Free, offline, deterministic. Catches the blatant before we spend a token, and makes an API outage fail closed. |
| 1. Intake | `lib/prompts/intake-screen.ts` | Reads the customer's words. Approves, constrains, escalates, or declines. Extracts the exact text they want printed. |
| 2. Art direction | `lib/prompts/art-direction.ts` | Turns one line into a committed design brief. This is where the shirt gets good. |
| 3. Render brief | `lib/prompts/render-brief.ts` | Deterministic assembly of the image prompt plus the production constraints that apply to every order. No model call. |
| 4. Print review | `lib/prompts/print-review.ts` | Two independent reviewers look at the finished pixels. The only stage that can catch what the renderer did rather than what it was told. |

`lib/policy/policy.ts` holds the one policy document that stages 1 and 4 both
receive, so a rule can never be enforced at one end and forgotten at the other.

## How the art direction prompt pushes for a good design

Telling a model to "be creative" produces clipart. The prompt in
`art-direction.ts` instead forces a method, and the output schema makes every
step of it a required field so it cannot be skipped:

1. **Read the request twice** — the subject, then the reason underneath it.
2. **Name the obvious version and kill it.** The model writes down the design
   eight of ten studios would return, in its own words. It is then forbidden
   from submitting it. Naming the cliché is what makes it recognisable when it
   tries to come back in a new colourway.
3. **Diverge on four different axes** — treatment, moment, scale, metaphor,
   system. No two concepts may share an axis. A recolour is not a new idea.
4. **Judge with two vetoes**: is the customer's literal subject still
   recognisable, and would they have predicted this? Fail either and the
   concept is dead.
5. **Commit to one.** No blending, no "we could also".
6. **Specify it** down to named inks, focal order and printed width, because
   every decision left open is one the renderer fills with the most average
   option available.
7. **Predict the failure** and write the counter-instruction.

The rule that overrides everything else: **push the treatment as far as you
like, never push the subject.** Creativity that loses the customer's corgi is
not creativity, it is a returned parcel.

There is also an explicit ban list for what renderers reach for when nobody
directs them — the circular badge with the ribbon banner, the vintage sunset
stripe, mandala symmetry standing in for an idea, render-speak like "8k,
hyperdetailed, octane".

## What it takes to print unseen

All of these must hold, and they are enforced in `lib/pipeline/pipeline.ts` —
in code, not in a prompt. A model decides what it sees; code decides what that
means for the order.

- The pre-screen found nothing.
- Intake approved it, and did not mark it amber.
- **Both** reviewers returned `pass`. One dissent holds the order.
- Both reported confidence at or above 0.9.
- Neither found an accidental resemblance.
- The artwork contains no text at all.

Anything else routes to `needs_human`. A policy breach in the finished artwork
routes to `declined` and is **never re-rendered** — re-rolling the same brief
tends to reproduce it, and "it passed on the fourth try" is not a record you
want to have to explain.

Three decisions worth calling out because they are opinions, not defaults:

**Any lettering at all goes to a human, always** — even when the text is exactly
what the customer asked for. Misspellings and letterforms that assemble into
something unintended are the most common way a print goes wrong, and the
customer cannot catch it for you.

**No QR codes or scannable codes, ever.** A generated code points somewhere
nobody has checked. That is an unvetted link printed on a garment.

**Failures fail closed.** An unreachable model or a renderer outage produces
`needs_human`, never a design that quietly proceeds to print.

## Running it

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

```bash
npm test        # 29 tests, no network needed
npm run typecheck
npm run lint
```

The tests fake the model and the renderer, so they exercise every gate — the
retry-on-craft-failure path, the never-retry-on-safety path, the fail-closed
path — in about a third of a second.

## The one thing not wired up

**There is no image renderer.** Claude writes the brief and reviews the result;
it does not draw. `lib/pipeline/renderer.ts` defines the interface and ships a
`NotConfiguredRenderer` that throws — deliberately, rather than returning a
placeholder, because a silently fake render would sail through the review
stages and reach a printer.

Plug in your image model:

```ts
class MyRenderer implements Renderer {
  async render({ positive, negative, aspect }) {
    const image = await myImageModel.generate({ prompt: positive, negative, aspect });
    return { data: image.bytes, mediaType: "image/png", model: "my-model-v2" };
  }
}
```

Then swap it in at `app/api/orders/route.ts`. Until you do, every order ends at
`needs_human` with the renderer error recorded — which is the correct behaviour
for a studio that cannot currently draw.

## What this is not, yet

Honest list of what a real deployment needs that is not here:

- **Storage.** `lib/store.ts` is an in-memory `Map`. It does not survive a
  restart and does not span processes. The audit trail it holds — every verdict,
  flag and policy version — is the part you actually need to keep, because it is
  what answers "why did this end up on a garment?" months later.
- **A job queue.** Orders are processed with a fire-and-forget promise in the
  API route. An order lost to a deploy is one nobody ever reviews.
- **The human review queue itself.** `needs_human` is a status with no screen
  behind it yet.
- **A real blocked-terms list.** `lib/policy/blocked-terms.ts` ships the coded
  extremist phrases only. Slurs need a maintained multilingual source, loaded
  via `BLOCKED_TERMS_PATH` so trust & safety can update it without a deploy.
- **Rate limiting that holds.** `lib/rate-limit.ts` is per-process and in-memory:
  a speed bump, not a wall.
- **Payments, auth, and the refund path** that a decline implies.
