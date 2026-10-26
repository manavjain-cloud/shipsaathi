# PreFly — shipment booking & pre-flight checker

**Live demo:** https://shipsaathi-mj-3d6b.vercel.app (no login). Try the chat on New Shipment, or upload [the sample workbook with planted mistakes](https://shipsaathi-mj-3d6b.vercel.app/templates/PreFly_Sample_With_Mistakes.xlsx) on Upload Excel.

PreFly helps Indian manufacturers and sellers book pallet shipments from the UK to Germany, France and the Netherlands without the small mistakes that get goods held at customs or turned away at a warehouse.

- **Chat booking**: describe a shipment in plain English. Gemini pulls out the fields, the app asks only for what's missing, and every edit re-runs the checks.
- **Excel upload**: upload the Bookings + Items sheets from the supplied template. Every booking and item goes through the same checks.
- **Ten pre-flight rules** (R-01 … R-10) from the fixed rulebook, each with severity, the field or item affected, actual vs expected, an explanation and a fix.
- **Carrier recommendation** from the fixed rate card, by priority: Cheapest, Fastest, Most reliable or Balanced.
- **Confirm and email**: confirm a *proposed* booking (blocked while Red errors remain) and email a summary or validation report through Resend.

> PreFly does **not** book carriers. There's no carrier integration: a confirmed booking is the seller's confirmed proposal. The ten checks catch common mistakes. They are not a full customs, dangerous-goods or export-compliance review.

## Architecture

```
Seller chat ─┐                         ┌─> Issue report (Red / Amber / review + fixes)
             ├─> one Booking model ─> validation engine ─┤
Excel upload ┘    (src/lib/domain)     (pure TypeScript) └─> Carrier eligibility + priority ranking
                                                              │
                         seller review / edit / confirm  <────┘ ──> optional email (Resend)
                         persisted in Neon Postgres (bookings, items, results, events)
```

| Layer | Where | Notes |
|---|---|---|
| Data model | `src/lib/domain/types.ts` | Both entry paths produce the same `Booking`. `null` = not provided, never a guess. |
| Parsing | `normalize.ts`, `dates.ts`, `excel.ts` | Same parsers for Excel cells, chat values and form edits. |
| Rules | `validation.ts` | One pure function per rule (`ruleR01` … `ruleR10`), plus data-quality checks. |
| Prohibited goods | `hazmat.ts` (+ `server/hazard-ai.ts`) | Deterministic keyword screen. Gemini can only escalate an item to human review. |
| Carriers | `carriers.ts` | Route + pallet-weight filter, priority ranking, ties, balanced score. |
| Chat logic | `conversation.ts` | Applies the model's proposed changes, works out missing fields and next questions. |
| Gemini | `server/llm.ts`, `server/extract.ts` | Structured JSON output. Keys stay on the server. |
| API | `src/app/api/*` | Server re-validates everything. Client results are never trusted. |
| UI | `src/app/*`, `src/components/*` | Next.js 16 App Router, Tailwind v4. |

The rate card and rulebook live in `src/data/rate-card.json` and `src/data/rulebook.json`. They are **generated from the supplied workbook** (`npm run extract:reference`), not typed by hand. If an uploaded workbook includes a Carrier options sheet that differs from the template, its rates are used for that upload and the UI says so.

## The rules and how they're calculated

All numeric checks are deterministic code. None of them use AI judgement.

| Rule | Severity | Formula / logic |
|---|---|---|
| R-01 | Red | HS code digits (ignoring `.`, space, `-`) must be numeric and **≥ 6**. Blank fails. A 5-digit code gets a note that Excel may have dropped a leading zero. |
| R-02 | Red | Let `S = Σ(quantity × unit price)`. Pass when `|declared − S| ≤ 0.01 × S`. Example: S = £5,400 → £5,346.00 to £5,454.00 pass; £5,454.01 fails. If S = 0, declared must be 0. Missing values fail. |
| R-03 | Red | For each item: `units per carton × cartons = quantity` (exact). |
| R-04 | Red | `booking cartons = Σ item cartons` (exact). |
| R-05 | Red | `gross weight ÷ pallets ≤ max kg/pallet` of the **chosen carrier**. Chosen = the seller's selected carrier, otherwise the carrier their priority picks from the route. If it fails, the fix offers the cheapest eligible alternative or the pallet count that would fit. Missing or zero pallets fail. |
| R-06 | Red | Keyword screen for lithium batteries, aerosols and flammable liquids, with negations ("non-flammable", "batteries not included") removed first. Clear hits are **Red**. Ambiguous ones (e.g. "battery", "perfume", "laptop", "spray") and anything Gemini flags become **Needs review**. They block dispatch until the seller confirms the item is safe. A Red hit can't be acknowledged away. |
| R-07 | Amber | `gross weight ≥ Σ(unit weight × quantity)`. |
| R-08 | Amber | Destination type Warehouse ⇒ delivery appointment must be Yes. |
| R-09 | Amber | Every item has a country of origin. |
| R-10 | Amber | Ready date ≥ today, using the calendar date in **Europe/London** (goods are collected in the UK). Today itself passes. |

**Booking status**
- **Blocked**: any Red failure or missing/unreadable required data.
- **Needs review**: a prohibited-goods review is outstanding.
- **Ready with warnings**: only Amber issues. The seller must tick that they've reviewed them before confirming.
- **Dispatch-ready**: everything passes.

The server refuses to confirm anything that is Blocked or Needs review.

## Carrier logic

1. Keep rate-card rows whose origin and destination match the booking.
2. Eligible = `gross ÷ pallets ≤ max weight per pallet`.
3. Cost = `pallets × price per pallet` (GBP, from the rate card).
4. Rank the eligible carriers:
   - **Cheapest**: lowest cost. Ties go to faster transit, then higher on-time rate.
   - **Fastest**: shortest transit. Ties go to lower cost, then higher on-time rate.
   - **Most reliable**: highest on-time rate. Ties go to lower cost, then faster transit.
   - **Balanced**: each dimension is min–max scaled across the eligible carriers (best = 1, and every carrier gets 1 when they're all equal). `score = 0.40·cost + 0.30·speed + 0.30·reliability`. Cost gets the biggest weight because on this rate card the faster services are also the more reliable ones, so equal weights would count that premium twice. For UK → Germany with 3 pallets: A 0.40, **B 0.65**, C 0.60.
5. If no carrier is eligible, the report says so, explains why and gives the pallet count needed.
6. Transit times and on-time rates are shown as historical averages, never as guarantees.

## Chat behaviour

- Gemini returns *proposed* field changes as structured JSON. The server parses every value with the same parsers as the Excel path, so text like "a few pallets" is rejected, not guessed.
- Vague values ("about 600 kg") get a clarifying question instead of being recorded.
- Relative edits ("add a pallet", "two fewer cartons") are applied as deltas, then every rule and the carrier ranking re-run.
- Origin and destination countries are only filled in automatically when the city belongs to exactly one allowed country (e.g. Frankfurt → Germany). The reply says when this happened.
- Computed values (declared value = item total, booking cartons = item cartons, SKU label) are only offered as suggestions. Only a suggestion shown in the last question can be accepted.
- The assistant's reply text is built by code from what actually changed. The model never writes booking facts into the reply.

## Running locally

Requirements: Node 20+ (tested on Node 24), npm.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | saving bookings, reports, history | Neon pooled connection string |
| `GEMINI_API_KEY` *or* `OPENROUTER_API_KEY` | chat, AI hazard review, plain-English summary | A Google AI Studio key calls Gemini directly. An OpenRouter key calls `google/gemini-*` through OpenRouter. |
| `GEMINI_MODEL` | optional | Defaults: `gemini-2.5-flash` (Google) / `google/gemini-3.5-flash` (OpenRouter) |
| `RESEND_API_KEY` | email | Without a verified domain, Resend only delivers to the Resend account owner's address. |
| `RESEND_FROM` | email | Defaults to `PreFly <onboarding@resend.dev>` |

Create the tables (safe to re-run):

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

```bash
psql "$DATABASE_URL" -f db/seed-carriers.sql
```

Start the dev server:

```bash
npm run dev
```

Other scripts:

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run extract:reference
```

`npx tsx scripts/make-sample.ts` rebuilds `public/templates/PreFly_Sample_With_Mistakes.xlsx`, a demo upload with deliberate mistakes for every rule (sample input only, not real bookings).

The app degrades gracefully. Without Gemini, the chat says so and the editable form still works. Without a database, uploads are validated but not saved. Without Resend, email shows a clear "not configured" error.

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project**, import the repo. The framework preset is Next.js and no build settings need changing.
3. Add the environment variables from the table above (Production and Preview).
4. Deploy. `/api/health` reports which integrations are configured, without revealing any values.

The app needs no login. All database access goes through server routes with input validation (zod), size limits and per-IP rate limits. No secrets reach the browser.

## Testing

`npm test` runs 115 unit tests covering:

- every rule, including boundaries (R-02 at exactly ±1% and just over, R-05 at exactly the limit, R-10 today vs yesterday, R-07 equal weights) and missing values
- multiple bookings and multiple items, duplicate Booking IDs, items pointing at unknown bookings, unreadable cells, real Excel date cells, missing columns, non-workbook files, a missing Items sheet, the template example row
- each seller priority, weight-limit exclusion, no eligible carrier, missing priority, ties, the Balanced scores
- prohibited-goods detection: clear hits, ambiguous cases going to review, false positives avoided, acknowledgement rules
- chat edits: relative changes ("add a pallet") re-running the checks, add/update/remove items, only offered suggestions being accepted

Checked by hand in the browser: a full chat booking including a mid-conversation weight change and "add a pallet", saving, confirming (and the server refusing a booking with a Red error), email failure feedback, uploading the sample workbook, and phone-width layout (375px) on every page with no sideways scroll.

## Known limitations

- **No carrier booking integration.** Confirmation records the seller's proposal only.
- **Public demo, no accounts.** Anyone with the URL can see saved bookings. Don't enter real customer data.
- **Rate limits are per server instance** (in memory). They slow abuse down but aren't a hard quota.
- **Prohibited-goods screening is a keyword screen plus an AI second opinion**, not a dangerous-goods classification. Unclear items always go to a person.
- **HS codes are checked for length and format only**, not against the tariff.
- **Email**: without a verified sending domain in Resend, only the account owner's address receives mail.
- Shipment values and rates are GBP only, matching the template. INR isn't used because the case has no explicitly labelled Indian operating costs.

## Credits

- Overview globe: land outlines from Natural Earth (public domain) via [world-atlas](https://github.com/topojson/world-atlas) (ISC), drawn with [d3-geo](https://github.com/d3/d3-geo) and [topojson-client](https://github.com/topojson/topojson-client) (ISC).
