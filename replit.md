# QuitReady — Structural Breakpoint Simulator

A deterministic, conservative financial stress engine for U.S. professionals modeling an employment exit. Answers: *If I quit my job, what breaks first — and when?*

## Tech Stack

- **Frontend**: React + TypeScript, Wouter routing, TanStack Query, React Hook Form + Zod, Framer Motion, shadcn/ui, Tailwind CSS
- **Backend**: Express.js + TypeScript, Drizzle ORM, PostgreSQL
- **PDF**: PDFKit (server-side, 6-page branded report)

## Architecture

- `shared/schema.ts` — Drizzle table + Zod validation schemas
- `shared/routes.ts` — API contract definitions
- `server/services/simulator.ts` — Deterministic math engine (TMIB, ACA subsidy, accessible capital, runway, score)
- `server/routes.ts` — API routes + 6-page PDF generation
- `server/storage.ts` — Database storage layer
- `client/src/pages/Home.tsx` — Landing page
- `client/src/pages/Simulator.tsx` — 16-screen 3-phase wizard
- `client/src/pages/Results.tsx` — 7-section advisor-voice results report
- `client/src/hooks/use-simulations.ts` — API hooks + SimulationResult type

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

## Extended Scenario Engine (PDF only, server-computed)
- Ramp timing: ±1/2/3 months (7 variants) — shows LL shift for each
- Partner job loss: 3/6/12 month duration (only if isDualIncome) — burn + partnerIncome for N months
- New child: $3,000 one-time + $1,500/month delta
- Levers: burn -$500/-$1K/-$2K, revenue +$500/+$1K — all show LL delta
- Stability thresholds: min T1+T2 / min revenue / max burn for 12-month T1+T2 under -30% stress
- Cash coverage ladder: milestone months (1, 3, 6, 12, 18, 24) — Revenue/Burn/Gap/Remaining-T1+T2/Status

## PDF Report (12 pages)
1. Cover — navy, QuitReady wordmark, 6 stat tiles, LL status pill
2. Plain English Explainer — burn, runway, liquidity, tier system, why retirement ≠ runway, debt vs expenses
3. Burn Breakdown — 3 groups, composition bar, fixed% callout, SE tax note
4. Liquidity Defense Map — tier table with haircuts, LL subtotal row, T3 emergency warning
5. Liquidity Line headline — 4-scenario bars + table, LL warning callout
6. Revenue Stress — 3-scenario table + cash coverage ladder (milestone months)
7. Ramp Timing — ±1/2/3 month delta table + interpretation block
8. Household Shocks — partner job loss table (if dual income) + new child impact
9. What Moves the Needle — burn/revenue lever tables + sensitivity note
10. Stability Thresholds — 3 threshold cards (T1+T2 required, min revenue, max burn)
11. Advisor Commentary — score card, overall assessment, retirement dependency, best single move
12. Appendix — all inputs listed by group

## Design Principles
- Institutional minimalism — navy/charcoal/slate palette, Inter + Times-Bold
- No motivational tone, no emoji, no alarmist language
- Plain English co-pilot voice ("your savings would cover about X years")
- "Income contraction" not "shock" | "Liquidity exhausted" not "fails/breaks"
- Conservative bias in all calculations
- U.S.-only (healthcare/tax assumptions)

## API Endpoints
- `POST /api/simulations` — Run simulation, store results
- `GET /api/simulations/:id` — Retrieve simulation
- `GET /api/simulations/:id/pdf` — Download 6-page branded PDF
