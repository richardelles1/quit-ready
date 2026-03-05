# QuitReady — Structural Breakpoint Simulator

A deterministic, conservative financial stress engine for U.S. professionals modeling an employment exit. Answers: *If I quit my job, what breaks first — and when?*

## Tech Stack

- **Frontend**: React + TypeScript, Wouter routing, TanStack Query, React Hook Form + Zod, Framer Motion, shadcn/ui, Tailwind CSS
- **Backend**: Express.js + TypeScript, Drizzle ORM, PostgreSQL
- **PDF**: PDFKit (server-side, 17-page branded report)
- **Payments**: Stripe Checkout (hosted), webhook-verified unlock, $19.99 one-time

## Architecture

- `shared/schema.ts` — Drizzle table + Zod validation schemas
- `shared/routes.ts` — API contract definitions
- `server/services/simulator.ts` — Deterministic math engine (TMIB, ACA subsidy, accessible capital, runway, score)
- `server/routes.ts` — API routes + 17-page PDF generation + Stripe checkout + webhook
- `server/services/stripeClient.ts` — Stripe SDK lazy-init client
- `server/storage.ts` — Database storage layer
- `client/src/pages/Home.tsx` — Landing page
- `client/src/pages/Simulator.tsx` — 16-screen 3-phase wizard
- `client/src/pages/Results.tsx` — 7-section advisor-voice results report
- `client/src/hooks/use-simulations.ts` — API hooks + SimulationResult type
- `client/src/hooks/use-seo.ts` — SEO hook for meta tags and JSON-LD
- `client/src/data/blog-posts.ts` — Static blog content
- `client/src/pages/Pricing.tsx` — Pricing page
- `client/src/pages/HowItWorks.tsx` — How it works page
- `client/src/pages/SampleReport.tsx` — Sample report preview
- `client/src/pages/BlogIndex.tsx` — Blog listing
- `client/src/pages/BlogPost.tsx` — Individual blog post page

## Wizard Flow (15 screens, 0–14)

### Phase 1 — Structural Burn (4 input + 1 summary = screens 0–4)
- Screen 0: Income Overview — dual income toggle HERE (isDualIncome, currentSalary, partnerIncome)
- Screen 1: Household Living Costs — EXPENSES BEFORE DEBT (livingExpenses, non-debt, non-healthcare)
  - Explicit callout: credit card payment for living expenses goes HERE, minimum payment goes in debt
- Screen 2: Debt Payments — Required Minimums (monthlyDebtPayments, totalDebt)
  - Amber contractual warning + blue mortgage note
- Screen 3: Healthcare Transition (type, household size, payroll deduction, ACA income-aware subsidy)
- Screen 4: Burn Summary — "Required Fixed Obligations" + "Transition Adjustments" groups

### Phase 2 — Liquidity Layers (4 input + 1 summary = screens 5–9)
- Screen 5: Tier 1 — Fully Liquid (cash, 100%)
- Screen 6: Tier 2 — Semi-Liquid (brokerage, 80% haircut)
- Screen 7: Tier 3 — Retirement Accounts (roth, traditional) with penalty warning
- Screen 8: Tier 3 — Illiquid Assets (realEstate, 30%)
- Screen 9: Capital Summary — Liquidity Line (T1+T2) as primary metric, T3 emergency warning

### Phase 3 — Income Plan (4 input + 1 review = screens 10–14)
- Screen 10: Business Structure (4 model choices)
- Screen 11: Expected Steady Revenue (expectedRevenue)
- Screen 12: Ramp Timeline (rampDuration) — note: report shows ±1/2/3 month sensitivity
- Screen 13: Income Reliability (volatilityPercent — 4 presets)
- Screen 14: Review + Submit — Complete Monthly Burn with 3 groups + 3 summary tiles

## Calculation Engine

### ACA Income-Aware Subsidy Math
- Uses `expectedRevenue * 12` as annual post-quit income
- 2024 FPL: $15,060 + $5,380 per additional household member
- <138% FPL: $0 (Medicaid territory) | 138–150%: 2% cap | 150–200%: 4% | 200–250%: 6% | 250–300%: 7% | 300–400%: 8.5% | >400%: full premium

### TMIB Formula
`TMIB = Living Expenses + Healthcare Delta + Loan Payments + SE Tax (28%) + Business Costs − Partner Income`

### Liquidity Tiers
- Tier 1 (fully liquid): Cash ×1.00
- Tier 2 (semi-liquid): Brokerage ×0.80
- Tier 3 (restricted/last resort): Roth ×1.00, Traditional ×0.50, Real Estate ×0.30

### Stress Scenarios
- Base case | −15% income contraction | −30% income contraction | Ramp delayed +3 months

### Breakpoint Score (0–100)
- 40% Runway | 25% Revenue fragility | 20% Debt exposure | 10% Healthcare risk | 5% Business cost density
- Bands: 0–49 Fragile | 50–69 Moderately Exposed | 70–85 Structurally Stable | 86–100 Strong Buffer

## Results Report (7 sections)
1. Executive Summary — 4 plain-English advisor bullets + 4 key metric cards
2. Breakpoint Score — score with 4-band legend
3. Liquidity Runway Under Stress — horizontal bars + scenario table ("income contraction" language)
4. Monthly Burn Breakdown — grouped (Fixed Obligations / Transition Adjustments / Income Plan Costs)
5. Liquidity Defense Map — Tier 1/2/3 with retirement dependency warning
6. What Moves the Needle — sensitivity cards (burn, revenue, healthcare, debt)
7. What This Means For You — advisor summary + best single move

## Report Terminology (canonical — enforced everywhere)
- "Monthly Outflow" (NOT burn): displayed as "Net Monthly Outflow"
- "Primary Accessible Savings" (NOT Tier 1+2): cash + brokerage×0.80
- "Primary Savings Runway" (NOT Liquidity Line): months until PAS exhausted
- "Restricted or Long-Term Assets" (NOT Tier 3): retirement + home equity — emergency only
- Runway format: "X years Y months" (NEVER decimal like "1.5 years")
- Percentages: always exactly 100% using pct100() (floor + fractional-remainder distribution)
- Total Outstanding Debt: context ONLY — never in outflow % breakdown, never in runway math

## Math Integrity
- grossOutflow = livingExpenses + monthlyDebtPayments + healthcareDelta + selfEmploymentTax + businessCostBaseline (BEFORE partner offset)
- tmib = grossOutflow − partnerIncome (net gap savings/new revenue must cover)
- Executive Snapshot: shows totalIncome vs grossOutflow → grossSurplus (no double-counting)
- Partner income offset shown separately as "Net savings gap (TMIB)" note
- Structural margin label: income-based (surplus/income) — NOT score-based
  - >10% surplus → "Strong structural margin"
  - 0–10% → "Moderate structural margin", -5% to 0 → "Thin", <-5% → "Negative"
- Narrative consistency: deficit case triggers override text (no "strong" language when income < outflow)
- Outflow percentages: always exactly 100% via pct100()
- Pre-render validation in Results.tsx (console.warn) + routes.ts (console.error on PDF)
- restrictedClarification sentence appears in Section 9 when reliesOnRestricted = true

## PDF Report (17 pages — current)
1. Executive Snapshot — income/outflow/surplus tiles, PAS status pill, 3-scenario mini grid
2. Income Strength & Stability — income table, vs-outflow bar, narrative
3. Monthly Outflow Breakdown — 5 components, pct100() percentages, composition bar, partner offset
4. Debt Structure & Exposure — outstanding balance, debt/savings ratio, mortgage clarity note
5. Primary Savings Runway Definition — PAS vs Restricted definitions, tier table with haircuts, visual timeline
6. Stress Scenario Modeling — 3 scenarios (mild/moderate/severe) with PSR, full runway, pressure month
7. Revenue Timing Sensitivity — ±3 months delta table + narrative
8. Household Shock Scenarios — partner loss 6mo + new child ($3K+$1.5K/mo) + combined
9. Savings Tier Timeline — Stage 1/2/3 progression under severe stress, visual bar
10. Revenue vs. Liquidity Curve — PDFKit path-based line chart (base + severe, 36-month horizon)
11. What Moves the Needle — top 3 levers ranked by PSR delta impact
12. Scenario Comparison Grid — 5 columns (Base/Mild/Severe/Partner Loss/New Child) × 3 rows
13. Risk Profile Summary — 4 plain-language blocks (position, risk driver, pressure, execution sensitivity)
14. Final Synthesis — 4 paragraphs (stability, risk driver, pressure timeline, two stabilizers)
15. Appendix: Detailed Data Tables
16. Appendix: Methodology & Assumptions
17. Appendix: Legal Disclaimer & Resources

## Design Principles
- Institutional minimalism — navy/charcoal/slate palette, Inter + Times-Bold serif headings
- No motivational tone, no emoji, no alarmist language
- Plain English co-pilot voice ("your savings would cover about X years")
- "Income contraction" not "shock" | "Liquidity exhausted" not "fails/breaks"
- Conservative bias in all calculations
- U.S.-only (healthcare/tax assumptions)

## Screen Report Visual Architecture (Results.tsx)
- SectionCard: border + shadow-sm + rounded-lg (premium card appearance)
- SectionHeader: serif h2 title + "Section N" label in tracking-widest caps
- Metric tiles: text-2xl bold serif for key numbers ($, runway months)
- PSR as visual anchor: prominent border-2 callout box in Executive Snapshot
- Background: bg-muted/20 (light institutional gray, not pure white)
- SavingsCurve SVG: dollar Y-axis labels, pressure point red dot + label, month X-axis
- Structural margin label displayed in header subtitle ("Strong/Moderate/Thin/Negative structural margin")

## API Endpoints
- `POST /api/simulations` — Run simulation, store results
- `GET /api/simulations/:id` — Retrieve simulation
- `GET /api/simulations/:id/pdf` — Download 17-page branded PDF
