# QuitReady — Structural Breakpoint Simulator

A deterministic, conservative financial stress engine for U.S. professionals modeling an employment exit. Answers the question: *If I quit my job, what breaks first — and when?*

## Tech Stack

- **Frontend**: React + TypeScript, Wouter routing, TanStack Query, React Hook Form + Zod, Framer Motion, shadcn/ui, Tailwind CSS
- **Backend**: Express.js + TypeScript, Drizzle ORM, PostgreSQL
- **PDF**: PDFKit (server-side, 5-page structured report)

## Architecture

- `shared/schema.ts` — Drizzle table schema + Zod validation schemas
- `shared/routes.ts` — API contract definitions
- `server/services/simulator.ts` — Deterministic math engine (TMIB, accessible capital, runway, breakpoint score)
- `server/routes.ts` — API routes + PDF generation
- `server/storage.ts` — Database storage layer
- `client/src/pages/Home.tsx` — Landing page
- `client/src/pages/Simulator.tsx` — 3-section intake form
- `client/src/pages/Results.tsx` — Full results display
- `client/src/hooks/use-simulations.ts` — API hooks

## Calculation Engine (V2)

### 1. Healthcare Cost Estimates (monthly)
- Employer retained: $0 | COBRA: $850 | ACA: $600 | Partner: $0 | None: $250

### 2. Business Cost Baselines (monthly)
- Solo bootstrap: $500 | Contractor-heavy: $2,000 | Agency: $3,000 | Inventory: $4,500 | SaaS: $2,500

### 3. TMIB Formula
`TMIB = Living Expenses + Healthcare Est. + Debt Payments + SE Tax (28% of revenue) + Business Costs − Partner Income`

### 4. Liquidity Haircuts
`Cash ×1.00 | Brokerage ×0.80 | Roth ×1.00 | Retirement ×0.50 | Real Estate ×0.30`

### 5. Stress Scenarios (auto-applied)
- Base case | -15% revenue | -30% revenue | Ramp delayed +3 months

### 6. Structural Breakpoint Score (0–100)
- 40% Runway strength | 25% Revenue fragility | 20% Debt exposure | 10% Healthcare risk | 5% Business cost density

## API Endpoints

- `POST /api/simulations` — Run simulation, store results
- `GET /api/simulations/:id` — Retrieve simulation
- `GET /api/simulations/:id/pdf` — Download 5-page PDF report

## PDF Report Structure (5 pages)
1. Cover page
2. Executive Summary (narrative + key metrics)
3. Structural Exposure (debt, healthcare)
4. Liquidity Defense Map (haircuts)
5. Revenue Shock Simulation (scenario table + TMIB breakdown)
6. Controlled Exit Conditions (deterministic recommendations)

## Design Principles
- Institutional minimalism — navy/charcoal/slate palette
- Serif headings (Playfair Display), sans-serif body (Inter)
- No motivational tone, no gamification
- Conservative bias in all calculations
- U.S.-only (healthcare and tax assumptions)
