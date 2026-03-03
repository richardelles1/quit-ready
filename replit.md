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

## Wizard Flow (16 screens, 0–15)

### Phase 1 — Structural Burn (screens 0–5)
- Screen 0: Income Overview (currentSalary — context only)
- Screen 1: Required Loan Payments (monthlyDebtPayments, totalDebt)
- Screen 2: Household Living Costs (livingExpenses — non-debt, non-healthcare)
- Screen 3: Healthcare Transition (type, household size, payroll deduction, override)
- Screen 4: Household Structure (isDualIncome, partnerIncome)
- Screen 5: Burn Summary — shows "Required Fixed Obligations" + "Transition Adjustments"

### Phase 2 — Liquidity Layers (screens 6–10)
- Screen 6: Tier 1 — Fully Liquid (cash)
- Screen 7: Tier 2 — Semi-Liquid (brokerage, 80% haircut)
- Screen 8: Tier 3 — Retirement Accounts (roth, traditional)
- Screen 9: Tier 3 — Illiquid Assets (realEstate)
- Screen 10: Capital Summary — tier breakdown + retirement dependency warning

### Phase 3 — Income Plan (screens 11–15)
- Screen 11: Business Structure (4 model choices)
- Screen 12: Expected Steady Revenue (expectedRevenue)
- Screen 13: Ramp Timeline (rampDuration)
- Screen 14: Income Reliability (volatilityPercent — 4 presets)
- Screen 15: Review + Submit

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

## PDF Report (6 pages)
1. Cover — branded, navy, score callout + stat row
2. Executive Summary + Breakpoint Score — 4 bullets + metric boxes + score card + 4-band legend
3. Runway Comparison — bar chart + scenario table
4. Burn Breakdown — grouped rows + composition bar + interpretation text
5. Liquidity Defense Map — Tier 1/2/3 + retirement warning
6. What Moves the Needle + Advisor Commentary — insight cards + summary + disclaimer

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
