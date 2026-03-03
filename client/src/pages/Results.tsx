import { useParams, Link } from "wouter";
import { Download, AlertTriangle, AlertCircle } from "lucide-react";
import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { useSimulation, useDownloadSimulationPdf, SimulationResult } from "../hooks/use-simulations";
import { useToast } from "@/hooks/use-toast";

// ─── Formatting helpers ────────────────────────────────────────────────────

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

function fmtYears(months: number): string {
  if (months >= 999) return '24+ years';
  const yrs = (months / 12).toFixed(1);
  return `${yrs} years`;
}

function fmtYearsLong(months: number): string {
  if (months >= 999) return '24+ years (288+ months)';
  const yrs = (months / 12).toFixed(1);
  return `${yrs} years (${months} months)`;
}

// ─── Client-side runway calculator (mirrors server) ────────────────────────

function calcRunwayClient(capital: number, burn: number, revenue: number, ramp: number, vol: number): number {
  if (burn <= 0) return 999;
  let cap = capital;
  for (let m = 1; m <= 240; m++) {
    const rampFactor = m <= ramp ? 0.50 * Math.min(m / ramp, 1) : 1.0;
    const effectiveRev = revenue * rampFactor * (1 - vol / 100);
    cap -= (burn - effectiveRev);
    if (cap <= 0) return m;
  }
  return 999;
}

// ─── Shared UI components ──────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-border rounded-md ${className}`}>{children}</div>;
}

function SectionHeader({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="px-6 py-4 border-b border-border">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-1 leading-relaxed">{sub}</p>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">{children}</p>;
}

// ─── Runway bar chart ──────────────────────────────────────────────────────

function RunwayBar({ label, months, maxMonths, accent = false }: {
  label: string; months: number; maxMonths: number; accent?: boolean;
}) {
  const pct = months >= 999 ? 100 : Math.min((months / maxMonths) * 100, 100);
  const yrs = fmtYears(months);
  const monthStr = months >= 999 ? '24+ months' : `${months} months`;
  const isGood = months >= 24;
  const barClass = isGood ? 'bg-foreground/80' : months >= 12 ? 'bg-foreground/50' : 'bg-foreground/30';

  return (
    <div className="py-3.5 border-b border-border last:border-0">
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <span className="text-sm text-muted-foreground flex-1">{label}</span>
        <div className="text-right shrink-0">
          <span className="text-sm font-bold text-foreground">{yrs}</span>
          <span className="text-xs text-muted-foreground ml-1.5">{monthStr}</span>
        </div>
      </div>
      <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Burn composition bar ──────────────────────────────────────────────────

function BurnCompositionBar({ sim }: { sim: SimulationResult }) {
  const hc = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
  const gross = sim.tmib + (sim.isDualIncome ? sim.partnerIncome : 0);
  const segments = [
    { label: 'Debt', val: sim.monthlyDebtPayments, opacity: 'opacity-100' },
    { label: 'Living', val: sim.livingExpenses, opacity: 'opacity-70' },
    { label: 'Healthcare', val: hc, opacity: 'opacity-50' },
    { label: 'Tax reserve', val: sim.selfEmploymentTax, opacity: 'opacity-30' },
    { label: 'Business', val: sim.businessCostBaseline, opacity: 'opacity-20' },
  ].filter(s => s.val > 0);

  const total = segments.reduce((a, s) => a + s.val, 0);

  return (
    <div className="mt-4">
      <div className="flex h-4 rounded-full overflow-hidden gap-px">
        {segments.map(s => (
          <div key={s.label}
            style={{ width: `${(s.val / total) * 100}%` }}
            className={`bg-foreground ${s.opacity} first:rounded-l-full last:rounded-r-full`}
            title={`${s.label}: ${fmt(s.val)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm bg-foreground ${s.opacity} shrink-0`} />
            <span className="text-xs text-muted-foreground">{s.label} <span className="font-medium text-foreground">{Math.round((s.val / total) * 100)}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Liquidity tier bar ────────────────────────────────────────────────────

function LiquidityTierBar({ sim }: { sim: SimulationResult }) {
  const tiers = [
    { label: 'Cash & HYSA', raw: sim.cash, rate: 1.00, val: Math.round(sim.cash * 1.00) },
    { label: 'Brokerage',   raw: sim.brokerage, rate: 0.80, val: Math.round(sim.brokerage * 0.80) },
    { label: 'Roth',        raw: sim.roth, rate: 1.00, val: Math.round(sim.roth * 1.00) },
    { label: 'Retirement',  raw: sim.traditional, rate: 0.50, val: Math.round(sim.traditional * 0.50) },
    { label: 'Real estate', raw: sim.realEstate, rate: 0.30, val: Math.round(sim.realEstate * 0.30) },
  ].filter(t => t.val > 0);

  const total = tiers.reduce((a, t) => a + t.val, 0);
  const opacities = ['opacity-100', 'opacity-75', 'opacity-55', 'opacity-35', 'opacity-20'];

  if (total === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex h-4 rounded-full overflow-hidden gap-px">
        {tiers.map((t, i) => (
          <div key={t.label}
            style={{ width: `${(t.val / total) * 100}%` }}
            className={`bg-foreground ${opacities[i] ?? 'opacity-20'} first:rounded-l-full last:rounded-r-full`}
            title={`${t.label}: ${fmt(t.val)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {tiers.map((t, i) => (
          <div key={t.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm bg-foreground ${opacities[i] ?? 'opacity-20'} shrink-0`} />
            <span className="text-xs text-muted-foreground">{t.label} <span className="font-medium text-foreground">{fmt(t.val)}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Executive summary bullets ─────────────────────────────────────────────

function buildExecutiveBullets(sim: SimulationResult): string[] {
  const score = sim.structuralBreakpointScore;
  const hc = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
  const debtFlagged = sim.debtExposureRatio > 0.70;
  const highBurn = sim.tmib > sim.accessibleCapital * 0.12;

  // Bullet 1: Overall assessment
  let b1: string;
  if (score >= 70) b1 = `Your finances are structurally stable under expected conditions. The model does not identify a critical breakpoint in the base case.`;
  else if (score >= 50) b1 = `Your finances show moderate structural exposure. Runway is positive in the base case but constrained under stress.`;
  else b1 = `Your finances show meaningful structural fragility. Capital reserves are under pressure across multiple modeled scenarios.`;

  // Bullet 2: Base runway
  const b2 = sim.baseRunway >= 999
    ? `Base-case runway extends beyond 24 years — capital is not a binding constraint under expected conditions.`
    : `Base-case runway extends to ${fmtYearsLong(sim.baseRunway)}. Liquidity is exhausted at that point if revenue and expenses hold.`;

  // Bullet 3: Worst case
  const worst = Math.min(sim.runway15Down, sim.runway30Down, sim.runwayRampDelay);
  const b3 = worst >= 999
    ? `Under a severe income contraction (30% reduction), the plan remains solvent. No depletion identified within the 24-year model horizon.`
    : `Under a severe income contraction (30% reduction), liquidity is exhausted in ${fmtYearsLong(sim.runway30Down)}.`;

  // Bullet 4: Primary vulnerability
  let vuln: string;
  if (debtFlagged) vuln = 'debt load relative to accessible capital — debt-to-capital ratio exceeds 70%.';
  else if (hc > sim.tmib * 0.20) vuln = 'healthcare transition cost — the delta represents a significant portion of monthly burn.';
  else if (highBurn) vuln = 'monthly burn rate relative to accessible capital reserves.';
  else vuln = 'revenue realization during the ramp period — early-stage underperformance is the most likely constraint.';
  const b4 = `Your primary structural vulnerability is ${vuln}`;

  return [b1, b2, b3, b4];
}

// ─── Score helpers ─────────────────────────────────────────────────────────

function scoreLabel(score: number): string {
  if (score >= 86) return 'Strong buffer position';
  if (score >= 70) return 'Structurally stable';
  if (score >= 50) return 'Moderately exposed';
  return 'Structurally fragile';
}

function scoreColors(score: number): { text: string; bg: string; border: string } {
  if (score >= 70) return { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' };
  if (score >= 50) return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
  return { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' };
}

// ─── Main component ───────────────────────────────────────────────────────

export default function Results() {
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : null;
  const { data: sim, isLoading, isError } = useSimulation(id);
  const downloadPdf = useDownloadSimulationPdf();
  const { toast } = useToast();

  const handleDownload = () => {
    if (!id) return;
    downloadPdf.mutate(id, {
      onError: (err) => toast({ title: "PDF generation failed", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-7 h-7 border-2 border-muted border-t-foreground rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Running structural stress models...</p>
        </div>
      </Layout>
    );
  }

  if (isError || !sim) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center gap-4">
          <AlertCircle className="w-9 h-9 text-muted-foreground" />
          <h2 className="text-xl font-bold font-serif text-foreground">Report not found</h2>
          <p className="text-sm text-muted-foreground max-w-xs">This simulation may have expired or the link is invalid.</p>
          <Link href="/simulator"><Button>Start new simulation</Button></Link>
        </div>
      </Layout>
    );
  }

  // ─── Derived values ──────────────────────────────────────────────────────
  const score = sim.structuralBreakpointScore;
  const sc = scoreColors(score);
  const worstRunway = Math.min(sim.runway15Down, sim.runway30Down, sim.runwayRampDelay);
  const debtFlagged = sim.debtExposureRatio > 0.70;
  const hc = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
  const reportDate = new Date(sim.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bullets = buildExecutiveBullets(sim);

  // Runway chart scale
  const runways = [sim.baseRunway, sim.runway15Down, sim.runway30Down, sim.runwayRampDelay].filter(r => r < 999);
  const maxScale = Math.max(Math.min(Math.max(...runways, 36) * 1.15, 288), 36);

  // Burn interpretation
  const fixedBurnTotal = (sim.monthlyDebtPayments ?? 0) + hc;
  const fixedPct = sim.tmib > 0 ? Math.round((fixedBurnTotal / sim.tmib) * 100) : 0;
  const sePct = sim.tmib > 0 ? Math.round((sim.selfEmploymentTax / sim.tmib) * 100) : 0;

  // "What moves the needle" — sensitivity against severe contraction scenario
  const severeBase = sim.runway30Down;
  const burnMinus1k = calcRunwayClient(sim.accessibleCapital, Math.max(0, sim.tmib - 1000), sim.expectedRevenue * 0.70, sim.rampDuration, sim.volatilityPercent);
  const revPlus1k = calcRunwayClient(sim.accessibleCapital, sim.tmib, (sim.expectedRevenue + 1000) * 0.70, sim.rampDuration, sim.volatilityPercent);
  const burnDelta = burnMinus1k >= 999 ? 'eliminates the breakpoint entirely' : severeBase >= 999 ? 'has no effect — already stable' : `extends severe-case runway by ${burnMinus1k - severeBase} months`;
  const revDelta = revPlus1k >= 999 ? 'eliminates the breakpoint entirely' : severeBase >= 999 ? 'has no effect — already stable' : `extends severe-case runway by ${revPlus1k - severeBase} months`;
  const hcBurnPct = sim.tmib > 0 ? Math.round((hc / sim.tmib) * 100) : 0;

  // Asset rows
  const ASSET_ROWS = [
    { label: 'Cash & HYSA',               raw: sim.cash,        rate: 1.00, tag: 'fully liquid' },
    { label: 'Brokerage (taxable)',        raw: sim.brokerage,   rate: 0.80, tag: 'semi-liquid' },
    { label: 'Roth IRA (contributions)',   raw: sim.roth,        rate: 1.00, tag: 'fully liquid' },
    { label: 'Traditional IRA / 401(k)',   raw: sim.traditional, rate: 0.50, tag: 'penalty + tax' },
    { label: 'Real Estate Equity',         raw: sim.realEstate,  rate: 0.30, tag: 'illiquid' },
  ].filter(r => r.raw > 0);

  // Burn rows for breakdown table
  const BURN_ROWS = [
    { label: 'Monthly debt service',                       val: sim.monthlyDebtPayments, subtract: false },
    { label: 'Operating cost of living',                   val: sim.livingExpenses, subtract: false },
    { label: 'Healthcare delta',                           val: hc, subtract: false },
    { label: 'SE tax reserve (28% of stable revenue)',     val: sim.selfEmploymentTax, subtract: false },
    { label: 'Business operating cost',                    val: sim.businessCostBaseline, subtract: false },
    { label: 'Partner income offset',                      val: sim.partnerIncome, subtract: true },
  ].filter(r => r.val !== 0);

  return (
    <Layout>
      <div className="flex-1 bg-background py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {/* Report header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Structural Breakpoint Report · {reportDate}
              </p>
              <h1 className="text-3xl font-bold font-serif text-foreground leading-tight">
                Here's what would break first — and when.
              </h1>
            </div>
            <Button onClick={handleDownload} disabled={downloadPdf.isPending} variant="outline" className="gap-2 shrink-0" data-testid="button-download-pdf">
              <Download className="w-4 h-4" />
              {downloadPdf.isPending ? 'Generating...' : 'Download full report'}
            </Button>
          </div>

          {/* ── SECTION 1: Executive Summary ───────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader>Executive Summary</SectionHeader>
            <div className="p-6 space-y-3">
              {bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-1 w-5 h-5 rounded-full bg-foreground/10 text-foreground text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-narrative">{b}</p>
                </div>
              ))}
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border">
              {[
                { label: 'Monthly burn', val: fmt(sim.tmib), testid: 'metric-tmib' },
                { label: 'Accessible capital', val: fmt(sim.accessibleCapital), testid: 'metric-capital' },
                { label: 'Base runway', val: fmtYears(sim.baseRunway), testid: 'metric-base-runway' },
                { label: 'Worst-case runway', val: fmtYears(worstRunway), testid: 'metric-worst-runway' },
              ].map((m, i) => (
                <div key={m.label} className={`p-5 ${i < 3 ? 'border-r border-border' : ''}`} data-testid={m.testid}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">{m.label}</p>
                  <p className="text-lg font-bold font-serif text-foreground">{m.val}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ── SECTION 2: Breakpoint Score ─────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader>Structural Breakpoint Score</SectionHeader>
            <div className="p-6">
              <div className="flex items-start gap-6 mb-6">
                <div className={`rounded-md border ${sc.border} ${sc.bg} px-6 py-5 text-center shrink-0`}>
                  <p className={`text-5xl font-bold font-serif ${sc.text}`} data-testid="text-score">{score}</p>
                  <p className="text-xs text-muted-foreground mt-1">out of 100</p>
                </div>
                <div>
                  <p className={`text-base font-semibold ${sc.text} mb-1`}>{scoreLabel(score)}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {sim.breakpointMonth >= 999
                      ? 'No structural breakpoint identified within the 24-year model horizon.'
                      : `Earliest structural breakpoint: ${fmtYearsLong(sim.breakpointMonth)} — ${sim.breakpointScenario}.`}
                  </p>
                </div>
              </div>

              {/* Score legend */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { range: '0 – 49', label: 'Structurally fragile', active: score < 50 },
                  { range: '50 – 69', label: 'Moderately exposed', active: score >= 50 && score < 70 },
                  { range: '70 – 85', label: 'Structurally stable', active: score >= 70 && score <= 85 },
                  { range: '86 – 100', label: 'Strong buffer position', active: score > 85 },
                ].map(l => (
                  <div key={l.range} className={`p-3 rounded-md border text-center ${l.active ? 'border-foreground bg-foreground/5' : 'border-border opacity-50'}`}>
                    <p className="text-xs font-bold text-foreground mb-0.5">{l.range}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{l.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* ── SECTION 3: Runway comparison ─────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader sub="Bars show liquidity runway before capital depletion under each scenario. Revenue stress never alters burn.">
              Liquidity Runway Under Stress Scenarios
            </SectionHeader>
            <div className="px-6 py-2">
              <RunwayBar label="Base case — expected conditions" months={sim.baseRunway} maxMonths={maxScale} />
              <RunwayBar label="Moderate income contraction (−15%)" months={sim.runway15Down} maxMonths={maxScale} />
              <RunwayBar label="Severe income contraction (−30%)" months={sim.runway30Down} maxMonths={maxScale} />
              <RunwayBar label="Ramp delayed by 3 months" months={sim.runwayRampDelay} maxMonths={maxScale} />
            </div>
            <div className="px-6 pb-4 pt-2 border-t border-border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-scenarios">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scenario</th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Runway</th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Liquidity exhausted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Base case', runway: sim.baseRunway },
                      { label: 'Moderate income contraction (−15%)', runway: sim.runway15Down },
                      { label: 'Severe income contraction (−30%)', runway: sim.runway30Down },
                      { label: 'Ramp delayed +3 months', runway: sim.runwayRampDelay },
                    ].map(s => {
                      const exhausted = s.runway >= 999 ? 'Not within horizon' : `${fmtYears(s.runway)} (month ${s.runway})`;
                      const color = s.runway >= 999 ? 'text-green-700' : s.runway < 12 ? 'text-red-700' : 'text-amber-700';
                      return (
                        <tr key={s.label} className="border-b border-border last:border-0">
                          <td className="py-3 text-sm text-muted-foreground">{s.label}</td>
                          <td className="py-3 text-sm font-semibold text-right text-foreground">{fmtYears(s.runway)}</td>
                          <td className={`py-3 text-sm font-semibold text-right ${color}`}>{exhausted}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>

          {/* ── SECTION 4: Structural Burn Breakdown ──────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader>Structural Burn Breakdown</SectionHeader>
            <div className="px-6 py-4">
              <div className="divide-y divide-border mb-4">
                {BURN_ROWS.map(row => (
                  <div key={row.label} className="flex items-center justify-between py-3.5">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className={`text-sm font-semibold ${row.subtract ? 'text-green-700' : 'text-foreground'}`}>
                      {row.subtract ? `(${fmt(row.val)})` : fmt(row.val)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-4">
                  <span className="text-sm font-bold text-foreground">True Monthly Burn</span>
                  <span className="text-xl font-bold font-serif text-foreground" data-testid="text-tmib-total">{fmt(sim.tmib)}</span>
                </div>
              </div>

              {/* Composition bar */}
              <BurnCompositionBar sim={sim} />

              {/* Interpretation */}
              {sim.tmib > 0 && (
                <div className="mt-5 pt-5 border-t border-border space-y-1.5">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Fixed obligations (debt service and healthcare delta) represent <strong className="text-foreground">{fixedPct}%</strong> of total burn — these cannot be reduced without structural changes to your debt or coverage situation.
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Revenue-linked components (SE tax reserve) represent <strong className="text-foreground">{sePct}%</strong> of total burn and scale with income — lower revenue periods reduce this component automatically.
                  </p>
                </div>
              )}

              {debtFlagged && (
                <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">Outstanding debt exceeds 70% of accessible capital — an elevated structural risk position.</p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── SECTION 5: Liquidity Defense Map ──────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader sub="Your liquidity stack is layered from fully liquid to illiquid. Under stress, depletion follows this order.">
              Liquidity Defense Map
            </SectionHeader>
            <div className="px-6 py-4">
              {/* Tier visual */}
              <LiquidityTierBar sim={sim} />

              {/* Detail rows */}
              <div className="divide-y divide-border mt-5">
                {ASSET_ROWS.map(row => {
                  const counted = Math.round(row.raw * row.rate);
                  const barWidth = Math.round(row.rate * 100);
                  return (
                    <div key={row.label} className="py-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-sm font-medium text-foreground">{row.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground opacity-60">{row.tag}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground block">{fmt(row.raw)} declared</span>
                          <span className="text-sm font-bold text-foreground">{fmt(counted)} accessible</span>
                        </div>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-foreground/50 rounded-full" style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between py-4 mt-1 border-t border-border bg-muted/10 -mx-6 px-6 rounded-b-md">
                <span className="text-sm font-bold text-foreground">Total accessible capital</span>
                <span className="text-xl font-bold font-serif text-foreground" data-testid="text-accessible-capital">{fmt(sim.accessibleCapital)}</span>
              </div>
            </div>
          </SectionCard>

          {/* ── SECTION 6: What Moves the Needle ─────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader sub="These are the highest-leverage changes available to you based on your inputs.">
              What Moves the Needle
            </SectionHeader>
            <div className="px-6 py-4 space-y-4">
              <div className="p-4 rounded-md border border-border bg-muted/20">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Reducing burn by $1,000/month</p>
                <p className="text-sm text-foreground leading-relaxed">
                  {burnDelta.startsWith('extends')
                    ? `Reducing burn by $1,000/month ${burnDelta} under a severe income contraction.`
                    : `Reducing burn by $1,000/month ${burnDelta}.`}
                </p>
              </div>
              <div className="p-4 rounded-md border border-border bg-muted/20">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Increasing stable revenue by $1,000/month</p>
                <p className="text-sm text-foreground leading-relaxed">
                  {revDelta.startsWith('extends')
                    ? `Increasing stable revenue by $1,000/month ${revDelta} under a severe income contraction.`
                    : `Increasing stable revenue by $1,000/month ${revDelta}.`}
                </p>
              </div>
              {hcBurnPct >= 12 && (
                <div className="p-4 rounded-md border border-border bg-muted/20">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Healthcare transition exposure</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    Healthcare transition represents {hcBurnPct}% of total monthly burn — a significant lever. Partner coverage or income-based ACA subsidies could materially reduce this exposure.
                  </p>
                </div>
              )}
              {debtFlagged && (
                <div className="p-4 rounded-md border border-border bg-muted/20">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Debt-to-capital exposure</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    Debt obligations represent {fmtPct(sim.debtExposureRatio)} of accessible capital. Reducing debt load prior to exit would improve structural runway.
                  </p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Download CTA */}
          <div className="border border-border rounded-md p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-sm font-semibold text-foreground">Full PDF report — 5 pages</p>
              <p className="text-xs text-muted-foreground mt-0.5">Includes all sections and deterministic scenario analysis.</p>
            </div>
            <Button onClick={handleDownload} disabled={downloadPdf.isPending} className="gap-2 shrink-0" data-testid="button-download-pdf-bottom">
              <Download className="w-4 h-4" />
              {downloadPdf.isPending ? 'Generating...' : 'Download PDF'}
            </Button>
          </div>

          <div className="text-center mb-4">
            <Link href="/simulator">
              <button className="text-sm text-muted-foreground underline underline-offset-2">
                Run a new simulation with different assumptions
              </button>
            </Link>
          </div>

          <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-2xl mx-auto">
            This report is an educational financial simulation based on user-provided inputs and estimated U.S. averages. It is not financial, tax, or legal advice. Consult a qualified professional before making any major financial decisions.
          </p>

        </div>
      </div>
    </Layout>
  );
}
