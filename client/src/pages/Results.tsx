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
  if (months >= 999) return '24+ years';
  const yrs = (months / 12).toFixed(1);
  return `${yrs} years (${months} months)`;
}

// ─── Client-side runway calculator ────────────────────────────────────────
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

// ─── Shared UI ────────────────────────────────────────────────────────────
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

// ─── Plain-English executive bullets ─────────────────────────────────────
function buildAdvisorBullets(sim: SimulationResult): string[] {
  const score = sim.structuralBreakpointScore;
  const hc = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
  const tier1 = sim.cash;
  const tier2 = Math.round(sim.brokerage * 0.80);
  const tier3 = Math.round(sim.roth + sim.traditional * 0.50 + sim.realEstate * 0.30);
  const monthlyDrain = Math.max(0, sim.tmib - sim.expectedRevenue * (1 - sim.volatilityPercent / 100));
  const tier1Months = monthlyDrain > 0 ? Math.min(999, Math.round(tier1 / monthlyDrain)) : 999;
  const reliesOnRetirement = tier3 > 0 && tier1 + tier2 < sim.tmib * 12;

  let b1: string;
  if (score >= 70) b1 = `Based on your inputs, your finances can support this move under expected conditions. You have meaningful breathing room before things become structurally tight.`;
  else if (score >= 50) b1 = `Your finances can support this transition under expected conditions, but there's meaningful risk if revenue takes a significant hit in the first year.`;
  else b1 = `Your finances face real pressure here. You have some runway, but less margin for error than is comfortable — small problems could compound quickly.`;

  const b2 = sim.baseRunway >= 999
    ? `If revenue comes in as expected, your savings would last well beyond the model's horizon. Capital is not your constraint — execution is.`
    : `If revenue comes in as expected, your savings would cover roughly ${fmtYearsLong(sim.baseRunway)} of expenses before running out.`;

  const b3 = sim.runway30Down >= 999
    ? `Even if income dropped by 30%, your savings would remain sufficient. The model found no depletion point within its range.`
    : `If income dropped by 30% from your expected level, your savings would run out in about ${fmtYearsLong(sim.runway30Down)}.`;

  let b4: string;
  if (reliesOnRetirement && tier1Months < 12) {
    b4 = `Your liquid savings alone (cash and brokerage) cover roughly ${fmtYears(tier1 + tier2 > 0 ? Math.round((tier1 + tier2) / (monthlyDrain || 1)) : 0)} under stress. Without retirement assets, this move would be financially premature.`;
  } else if (hc > sim.tmib * 0.18) {
    b4 = `Healthcare cost is a notable pressure point — it represents ${Math.round((hc / sim.tmib) * 100)}% of your monthly burn. Subsidized ACA or partner coverage could materially improve your position.`;
  } else if (sim.debtExposureRatio > 0.70) {
    b4 = `Outstanding loan obligations represent ${fmtPct(sim.debtExposureRatio)} of your accessible capital. This is the highest-leverage structural risk in your profile.`;
  } else {
    b4 = `Your ramp timeline and revenue reliability are the variables most likely to shift your outcome — a slower start or higher income variance extends the time capital must cover the gap.`;
  }

  return [b1, b2, b3, b4];
}

// ─── Score helpers ─────────────────────────────────────────────────────────
function getScoreLabel(score: number): string {
  if (score >= 86) return 'Strong buffer position';
  if (score >= 70) return 'Structurally stable';
  if (score >= 50) return 'Moderately exposed';
  return 'Structurally fragile';
}
function getScoreColors(score: number) {
  if (score >= 70) return { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' };
  if (score >= 50) return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
  return { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' };
}

// ─── Runway bar ────────────────────────────────────────────────────────────
function RunwayBar({ label, months, maxMonths }: { label: string; months: number; maxMonths: number }) {
  const pct = months >= 999 ? 100 : Math.min((months / maxMonths) * 100, 100);
  const barClass = months >= 24 ? 'bg-foreground/80' : months >= 12 ? 'bg-foreground/50' : 'bg-foreground/25';
  return (
    <div className="py-3.5 border-b border-border last:border-0">
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <span className="text-sm text-muted-foreground flex-1">{label}</span>
        <div className="text-right shrink-0">
          <span className="text-sm font-bold text-foreground">{fmtYears(months)}</span>
          <span className="text-xs text-muted-foreground ml-1.5">{months >= 999 ? '' : `(${months} months)`}</span>
        </div>
      </div>
      <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Burn composition visual ───────────────────────────────────────────────
function BurnCompositionBar({ sim }: { sim: SimulationResult }) {
  const hc = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
  const segments = [
    { label: 'Loan payments', val: sim.monthlyDebtPayments, opacity: 'opacity-100' },
    { label: 'Living costs', val: sim.livingExpenses, opacity: 'opacity-70' },
    { label: 'Healthcare', val: hc, opacity: 'opacity-50' },
    { label: 'Tax reserve', val: sim.selfEmploymentTax, opacity: 'opacity-30' },
    { label: 'Business', val: sim.businessCostBaseline, opacity: 'opacity-20' },
  ].filter(s => s.val > 0);
  const total = segments.reduce((a, s) => a + s.val, 0);
  return (
    <div className="mt-4">
      <div className="flex h-3.5 rounded-full overflow-hidden gap-px">
        {segments.map(s => (
          <div key={s.label} style={{ width: `${(s.val / total) * 100}%` }}
            className={`bg-foreground ${s.opacity} first:rounded-l-full last:rounded-r-full`}
            title={`${s.label}: ${fmt(s.val)}`} />
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

// ─── Main component ────────────────────────────────────────────────────────
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
          <p className="text-sm text-muted-foreground">Running structural stress analysis...</p>
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
          <p className="text-sm text-muted-foreground max-w-xs">This simulation may have expired. Start a new one.</p>
          <Link href="/simulator"><Button>Start new simulation</Button></Link>
        </div>
      </Layout>
    );
  }

  // ─── Derived values ────────────────────────────────────────────────────
  const score = sim.structuralBreakpointScore;
  const sc = getScoreColors(score);
  const worstRunway = Math.min(sim.runway15Down, sim.runway30Down, sim.runwayRampDelay);
  const debtFlagged = sim.debtExposureRatio > 0.70;
  const hc = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
  const reportDate = new Date(sim.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bullets = buildAdvisorBullets(sim);

  // Liquidity tiers
  const tier1 = sim.cash;
  const tier2 = Math.round(sim.brokerage * 0.80);
  const tier3Roth = Math.round(sim.roth * 1.00);
  const tier3Trad = Math.round(sim.traditional * 0.50);
  const tier3RE   = Math.round(sim.realEstate * 0.30);
  const tier3Total = tier3Roth + tier3Trad + tier3RE;
  const tier1And2 = tier1 + tier2;
  const reliesOnRetirement = tier3Total > 0 && tier1And2 < sim.tmib * 12;

  // Runway chart scale
  const runways = [sim.baseRunway, sim.runway15Down, sim.runway30Down, sim.runwayRampDelay].filter(r => r < 999);
  const maxScale = Math.max(Math.min(Math.max(...runways, 36) * 1.2, 288), 36);

  // Burn interpretation
  const fixedBurnTotal = (sim.monthlyDebtPayments ?? 0) + hc;
  const fixedPct = sim.tmib > 0 ? Math.round((fixedBurnTotal / sim.tmib) * 100) : 0;
  const sePct = sim.tmib > 0 ? Math.round((sim.selfEmploymentTax / sim.tmib) * 100) : 0;

  // Sensitivity
  const severeBase = sim.runway30Down;
  const burnMinus1k = calcRunwayClient(sim.accessibleCapital, Math.max(0, sim.tmib - 1000), sim.expectedRevenue * 0.70, sim.rampDuration, sim.volatilityPercent);
  const revPlus1k = calcRunwayClient(sim.accessibleCapital, sim.tmib, (sim.expectedRevenue + 1000) * 0.70, sim.rampDuration, sim.volatilityPercent);
  const burnDeltaMonths = burnMinus1k >= 999 ? null : severeBase >= 999 ? null : burnMinus1k - severeBase;
  const revDeltaMonths = revPlus1k >= 999 ? null : severeBase >= 999 ? null : revPlus1k - severeBase;
  const hcBurnPct = sim.tmib > 0 ? Math.round((hc / sim.tmib) * 100) : 0;

  // Advisor "what this means" section
  const isStable = score >= 70;
  const advisorSummary = isStable
    ? `You have meaningful flexibility. Your savings, when combined with expected revenue, create a defensible runway that doesn't require tapping retirement accounts under base-case conditions.`
    : score >= 50
    ? `Your position is workable but not comfortable. A slower-than-expected ramp or an early income dip could push you toward retirement assets sooner than planned.`
    : `Your savings alone are unlikely to carry this transition through the ramp period without putting pressure on retirement funds. The numbers suggest this move would benefit from more preparation time or lower burn before exit.`;

  const advisorRetirementNote = reliesOnRetirement && tier3Total > 0
    ? `Based on your Tier 1 and Tier 2 capital (${fmt(tier1And2)}), you would likely need to access retirement accounts to sustain beyond ${fmtYears(tier1And2 > 0 && sim.tmib > 0 ? Math.round(tier1And2 / Math.max(1, sim.tmib - sim.expectedRevenue * 0.7)) : 0)} under a stressed scenario. Accessing retirement early reduces long-term compounding significantly — treat it as emergency capital, not a plan.`
    : null;

  const advisorBestMove = (() => {
    if (fixedPct > 60) return `Reducing fixed obligations (loan payments and healthcare) would have the highest impact on runway. Fixed costs leave no flexibility during income shortfalls.`;
    if (hcBurnPct >= 15) return `Healthcare cost is your highest single lever — partner coverage or income-based ACA subsidies could free up ${fmt(hc)}/month immediately.`;
    if (sim.rampDuration > 6) return `Shortening your ramp timeline or entering with a client contract already in hand would significantly reduce the capital your savings need to cover.`;
    return `Increasing stable revenue by even $1,000/month would extend your worst-case runway by ${revDeltaMonths ? `${revDeltaMonths} months` : 'a meaningful amount'}.`;
  })();

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
                Here's what the numbers show — and what they mean.
              </h1>
            </div>
            <Button onClick={handleDownload} disabled={downloadPdf.isPending} variant="outline" className="gap-2 shrink-0" data-testid="button-download-pdf">
              <Download className="w-4 h-4" />
              {downloadPdf.isPending ? 'Generating...' : 'Download full report'}
            </Button>
          </div>

          {/* ── SECTION 1: Executive Summary ──────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader>Executive Summary</SectionHeader>
            <div className="p-6 space-y-3.5">
              {bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-foreground/10 text-xs font-bold flex items-center justify-center shrink-0 text-foreground">{i + 1}</span>
                  <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-narrative">{b}</p>
                </div>
              ))}
            </div>
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

          {/* ── SECTION 2: Breakpoint Score ────────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader>Structural Breakpoint Score</SectionHeader>
            <div className="p-6">
              <div className="flex items-start gap-6 mb-6">
                <div className={`rounded-md border ${sc.border} ${sc.bg} px-6 py-5 text-center shrink-0`}>
                  <p className={`text-5xl font-bold font-serif ${sc.text}`} data-testid="text-score">{score}</p>
                  <p className="text-xs text-muted-foreground mt-1">out of 100</p>
                </div>
                <div>
                  <p className={`text-base font-semibold ${sc.text} mb-1.5`}>{getScoreLabel(score)}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {sim.breakpointMonth >= 999
                      ? 'No structural breakpoint found within the model range. Capital and revenue projections remain solvent across all scenarios.'
                      : `The earliest pressure point appears at ${fmtYearsLong(sim.breakpointMonth)} — under the ${sim.breakpointScenario} scenario.`}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { range: '0 – 49', label: 'Structurally fragile', active: score < 50 },
                  { range: '50 – 69', label: 'Moderately exposed', active: score >= 50 && score < 70 },
                  { range: '70 – 85', label: 'Structurally stable', active: score >= 70 && score <= 85 },
                  { range: '86 – 100', label: 'Strong buffer position', active: score > 85 },
                ].map(l => (
                  <div key={l.range} className={`p-3 rounded-md border text-center ${l.active ? 'border-foreground bg-foreground/5' : 'border-border opacity-40'}`}>
                    <p className="text-xs font-bold text-foreground mb-0.5">{l.range}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{l.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* ── SECTION 3: Runway Comparison ───────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader sub="How long your savings would last before running out, in each scenario. Revenue stress reduces income — your burn stays constant.">
              Liquidity Runway Under Stress Scenarios
            </SectionHeader>
            <div className="px-6 py-2">
              <RunwayBar label="Expected conditions — revenue at target" months={sim.baseRunway} maxMonths={maxScale} />
              <RunwayBar label="Moderate income contraction (−15%)" months={sim.runway15Down} maxMonths={maxScale} />
              <RunwayBar label="Severe income contraction (−30%)" months={sim.runway30Down} maxMonths={maxScale} />
              <RunwayBar label="Ramp takes 3 months longer than planned" months={sim.runwayRampDelay} maxMonths={maxScale} />
            </div>
            <div className="border-t border-border px-6 pb-4 pt-4">
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
                      { label: 'Expected conditions', runway: sim.baseRunway },
                      { label: 'Moderate income contraction (−15%)', runway: sim.runway15Down },
                      { label: 'Severe income contraction (−30%)', runway: sim.runway30Down },
                      { label: 'Ramp delayed +3 months', runway: sim.runwayRampDelay },
                    ].map(s => {
                      const color = s.runway >= 999 ? 'text-green-700' : s.runway < 12 ? 'text-red-700' : 'text-amber-700';
                      const exhausted = s.runway >= 999 ? 'Not within horizon' : `${fmtYears(s.runway)} (month ${s.runway})`;
                      return (
                        <tr key={s.label} className="border-b border-border last:border-0">
                          <td className="py-3 text-sm text-muted-foreground">{s.label}</td>
                          <td className="py-3 text-sm font-semibold text-foreground text-right">{fmtYears(s.runway)}</td>
                          <td className={`py-3 text-sm font-semibold text-right ${color}`}>{exhausted}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>

          {/* ── SECTION 4: Structural Burn Breakdown ───────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader>Monthly Burn Breakdown</SectionHeader>
            <div className="px-6 py-4">
              {/* Group 1: Fixed */}
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Required Fixed Obligations</p>
                {[
                  { label: 'Required loan payments', val: sim.monthlyDebtPayments },
                  { label: 'Household living costs', val: sim.livingExpenses },
                ].filter(r => r.val > 0).map(r => (
                  <div key={r.label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{r.label}</span>
                    <span className="text-sm font-semibold text-foreground">{fmt(r.val)}</span>
                  </div>
                ))}
              </div>

              {/* Group 2: Transition */}
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Transition Adjustments</p>
                {hc > 0 && (
                  <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">Healthcare cost change</span>
                    <span className="text-sm font-semibold text-foreground">{fmt(hc)}</span>
                  </div>
                )}
                {sim.isDualIncome && sim.partnerIncome > 0 && (
                  <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">Partner income offset</span>
                    <span className="text-sm font-semibold text-green-700">({fmt(sim.partnerIncome)})</span>
                  </div>
                )}
              </div>

              {/* Group 3: Income plan costs */}
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Income Plan Costs</p>
                {[
                  { label: 'Self-employment tax reserve (28%)', val: sim.selfEmploymentTax },
                  { label: 'Business operating cost', val: sim.businessCostBaseline },
                ].filter(r => r.val > 0).map(r => (
                  <div key={r.label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{r.label}</span>
                    <span className="text-sm font-semibold text-foreground">{fmt(r.val)}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between py-4 border-t-2 border-border">
                <span className="text-sm font-bold text-foreground">True Monthly Burn</span>
                <span className="text-xl font-bold font-serif text-foreground" data-testid="text-tmib-total">{fmt(sim.tmib)}</span>
              </div>

              <BurnCompositionBar sim={sim} />

              {sim.tmib > 0 && (
                <div className="mt-5 pt-5 border-t border-border space-y-1.5">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">{fixedPct}% of your burn is fixed</strong> — loan payments and healthcare costs that won't decrease if revenue slows down. These are the hardest costs to cut under pressure.
                  </p>
                  {sePct > 0 && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      The <strong className="text-foreground">{sePct}% tax reserve</strong> does ease naturally in lower-revenue months, giving your burn some flexibility tied to income.
                    </p>
                  )}
                </div>
              )}

              {debtFlagged && (
                <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">Outstanding loan balances represent {fmtPct(sim.debtExposureRatio)} of your accessible capital — above the 70% elevated risk threshold.</p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── SECTION 5: Liquidity Defense Map ───────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader sub="Your savings are layered by how easily you can reach them. When your burn exceeds income, money comes from here — in this order.">
              Liquidity Defense Map
            </SectionHeader>
            <div className="px-6 py-4">

              {/* Tier 1 */}
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Tier 1 — Fully Liquid <span className="normal-case font-normal">(Primary Runway)</span>
                </p>
                {tier1 > 0 ? (
                  <div className="flex items-center justify-between py-3 border border-border rounded-md px-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Cash & HYSA</p>
                      <p className="text-xs text-muted-foreground">No penalty, no tax, no delay</p>
                    </div>
                    <p className="text-sm font-bold text-foreground">{fmt(tier1)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No Tier 1 capital entered.</p>
                )}
              </div>

              {/* Tier 2 */}
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Tier 2 — Semi-Liquid <span className="normal-case font-normal">(Access with trade-offs)</span>
                </p>
                {tier2 > 0 ? (
                  <div className="flex items-center justify-between py-3 border border-border rounded-md px-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Brokerage accounts</p>
                      <p className="text-xs text-muted-foreground">Selling may trigger capital gains taxes</p>
                    </div>
                    <p className="text-sm font-bold text-foreground">{fmt(tier2)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No Tier 2 capital entered.</p>
                )}
              </div>

              {/* Tier 3 */}
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Tier 3 — Restricted <span className="normal-case font-normal">(Last resort — not primary runway)</span>
                </p>
                <p className="text-xs text-muted-foreground mb-3">These are not considered primary runway. Accessing them early may trigger penalties and long-term damage to retirement security.</p>
                {tier3Total > 0 ? (
                  <div className="border border-border rounded-md overflow-hidden">
                    {tier3Roth > 0 && (
                      <div className="flex items-center justify-between py-3 px-4 border-b border-border">
                        <div>
                          <p className="text-sm font-medium text-foreground">Roth IRA contributions</p>
                          <p className="text-xs text-muted-foreground">Penalty-free contributions (100%)</p>
                        </div>
                        <p className="text-sm font-bold text-foreground">{fmt(tier3Roth)}</p>
                      </div>
                    )}
                    {tier3Trad > 0 && (
                      <div className="flex items-center justify-between py-3 px-4 border-b border-border">
                        <div>
                          <p className="text-sm font-medium text-foreground">Traditional IRA / 401(k)</p>
                          <p className="text-xs text-muted-foreground">Counted at 50% — income tax + 10% penalty</p>
                        </div>
                        <p className="text-sm font-bold text-foreground">{fmt(tier3Trad)}</p>
                      </div>
                    )}
                    {tier3RE > 0 && (
                      <div className="flex items-center justify-between py-3 px-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">Home equity</p>
                          <p className="text-xs text-muted-foreground">Counted at 30% — illiquid, costly to access</p>
                        </div>
                        <p className="text-sm font-bold text-foreground">{fmt(tier3RE)}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No Tier 3 capital entered.</p>
                )}
                {reliesOnRetirement && (
                  <div className="mt-3 flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-md">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      You are not currently liquid enough to sustain this transition without accessing retirement funds. Tier 1 + Tier 2 capital ({fmt(tier1And2)}) covers less than 12 months of burn under stress.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between py-4 border-t border-border bg-muted/10 -mx-6 px-6 rounded-b-md">
                <span className="text-sm font-bold text-foreground">Total accessible capital</span>
                <span className="text-xl font-bold font-serif text-foreground" data-testid="text-accessible-capital">{fmt(sim.accessibleCapital)}</span>
              </div>
            </div>
          </SectionCard>

          {/* ── SECTION 6: What Moves the Needle ──────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader sub="The specific changes that would improve your position most based on your inputs.">
              What Moves the Needle
            </SectionHeader>
            <div className="px-6 py-4 space-y-3">
              {burnDeltaMonths !== null && burnDeltaMonths > 0 && (
                <div className="p-4 rounded-md border border-border bg-muted/20">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Reducing burn by $1,000/month</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    Cutting monthly expenses by $1,000 would extend your worst-case runway by approximately {burnDeltaMonths} months — roughly {fmtYears(burnDeltaMonths)} of additional protection under a severe income contraction.
                  </p>
                </div>
              )}
              {revDeltaMonths !== null && revDeltaMonths > 0 && (
                <div className="p-4 rounded-md border border-border bg-muted/20">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Increasing stable revenue by $1,000/month</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    Adding $1,000/month to your stable revenue target extends worst-case runway by approximately {revDeltaMonths} months. Even modest revenue increases have outsized structural impact.
                  </p>
                </div>
              )}
              {hcBurnPct >= 12 && (
                <div className="p-4 rounded-md border border-border bg-muted/20">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Healthcare cost ({hcBurnPct}% of total burn)</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    Healthcare transition represents {hcBurnPct}% of your monthly burn — {fmt(hc)}/month. Partner coverage, a lower-cost plan, or income-based ACA subsidies could eliminate a significant portion of this cost.
                  </p>
                </div>
              )}
              {debtFlagged && (
                <div className="p-4 rounded-md border border-border bg-muted/20">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Loan balance relative to capital</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    Outstanding loans represent {fmtPct(sim.debtExposureRatio)} of accessible capital. Reducing total loan balances before exit would lower your structural risk score and free up burn capacity.
                  </p>
                </div>
              )}
              {(burnDeltaMonths === null || burnDeltaMonths <= 0) && (revDeltaMonths === null || revDeltaMonths <= 0) && hcBurnPct < 12 && !debtFlagged && (
                <div className="p-4 rounded-md border border-border bg-muted/20">
                  <p className="text-sm text-foreground leading-relaxed">
                    Your position is strong enough that marginal changes have limited impact on the stressed runway. The biggest variable at this point is execution — particularly how quickly revenue stabilizes after the ramp.
                  </p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── ADVISOR SECTION: What This Means For You ──────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader>What This Means For You</SectionHeader>
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">{advisorSummary}</p>
              {advisorRetirementNote && (
                <p className="text-sm text-foreground leading-relaxed">{advisorRetirementNote}</p>
              )}
              <div className="pt-3 border-t border-border">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">The single change that most improves your position</p>
                <p className="text-sm text-foreground leading-relaxed">{advisorBestMove}</p>
              </div>
            </div>
          </SectionCard>

          {/* Download CTA */}
          <div className="border border-border rounded-md p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-sm font-semibold text-foreground">Full PDF report</p>
              <p className="text-xs text-muted-foreground mt-0.5">All sections, branded, with scenario tables and advisor commentary.</p>
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
