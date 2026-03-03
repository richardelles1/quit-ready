import { useParams, Link } from "wouter";
import { Download, AlertTriangle, AlertCircle } from "lucide-react";
import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { useSimulation, useDownloadSimulationPdf, SimulationResult } from "../hooks/use-simulations";
import { useToast } from "@/hooks/use-toast";

// ─── Formatting utilities ──────────────────────────────────────────────────

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function fmtRunway(months: number): string {
  if (months >= 999) return '24+ years';
  if (months <= 0) return 'Less than 1 month';
  const yrs = Math.floor(months / 12);
  const mo = months % 12;
  if (yrs === 0) return `${mo} month${mo !== 1 ? 's' : ''}`;
  if (mo === 0) return `${yrs} year${yrs !== 1 ? 's' : ''}`;
  return `${yrs} year${yrs !== 1 ? 's' : ''} ${mo} month${mo !== 1 ? 's' : ''}`;
}

function fmtRunwayShort(months: number): string {
  if (months >= 999) return '24+ yrs';
  if (months <= 0) return '< 1 mo';
  const yrs = Math.floor(months / 12);
  const mo = months % 12;
  if (yrs === 0) return `${mo} mo`;
  if (mo === 0) return `${yrs} yr${yrs !== 1 ? 's' : ''}`;
  return `${yrs} yr ${mo} mo`;
}

// Percentage breakdown that always sums to exactly 100
function pct100(values: number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return values.map(() => 0);
  const raw = values.map(v => (v / sum) * 100);
  const floored = raw.map(Math.floor);
  let rem = 100 - floored.reduce((a, b) => a + b, 0);
  const byFrac = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let j = 0; j < rem; j++) floored[byFrac[j].i]++;
  return floored;
}

// ─── Client-side runway calculations ──────────────────────────────────────
function calcRunwayClient(capital: number, outflow: number, revenue: number, ramp: number, vol: number): number {
  if (outflow <= 0) return 999;
  let cap = capital;
  for (let m = 1; m <= 300; m++) {
    const rf = ramp > 0 && m <= ramp ? 0.50 * (m / ramp) : 1.0;
    cap -= (outflow - revenue * rf * (1 - vol / 100));
    if (cap <= 0) return m;
  }
  return 999;
}

function calcPrimaryRunway(sim: SimulationResult, revMult: number, rampOverride?: number): number {
  const pas = sim.cash + Math.round(sim.brokerage * 0.80);
  if (sim.tmib <= 0) return 999;
  let cap = pas;
  const vol = 1 - sim.volatilityPercent / 100;
  const ramp = rampOverride ?? sim.rampDuration;
  for (let m = 1; m <= 300; m++) {
    const rf = ramp > 0 && m <= ramp ? 0.50 * (m / ramp) : 1.0;
    cap -= (sim.tmib - sim.expectedRevenue * revMult * rf * vol);
    if (cap <= 0) return m;
  }
  return 999;
}

// ─── Shared UI ────────────────────────────────────────────────────────────
function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-border rounded-md ${className}`}>{children}</div>;
}

function SectionHeader({ children, sub, n }: { children: React.ReactNode; sub?: string; n?: number }) {
  return (
    <div className="px-6 py-4 border-b border-border">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {n ? `${n}. ` : ''}{children}
      </p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-1 leading-relaxed">{sub}</p>}
    </div>
  );
}

function OutflowRow({ label, value, credit = false }: { label: string; value: number; credit?: boolean }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${credit ? 'text-green-700' : 'text-foreground'}`}>
        {credit ? `(${fmt(value)})` : fmt(value)}
      </span>
    </div>
  );
}

// ─── Score helpers ────────────────────────────────────────────────────────
function getScoreLabel(score: number): string {
  if (score >= 86) return 'Strong Buffer Position';
  if (score >= 70) return 'Structurally Stable';
  if (score >= 50) return 'Moderately Exposed';
  return 'Structurally Fragile';
}
function getScoreColors(score: number) {
  if (score >= 70) return { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' };
  if (score >= 50) return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
  return { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' };
}

// ─── Outflow composition bar ───────────────────────────────────────────────
function OutflowCompositionBar({ sim, hc }: { sim: SimulationResult; hc: number }) {
  const segments = [
    { label: 'Living Expenses', val: sim.livingExpenses, opacity: 'opacity-100' },
    { label: 'Debt Payments', val: sim.monthlyDebtPayments, opacity: 'opacity-70' },
    { label: 'Healthcare', val: hc, opacity: 'opacity-50' },
    { label: 'Tax Reserve', val: sim.selfEmploymentTax, opacity: 'opacity-30' },
    { label: 'Business Costs', val: sim.businessCostBaseline, opacity: 'opacity-20' },
  ].filter(s => s.val > 0);
  const grossTotal = segments.reduce((a, s) => a + s.val, 0);
  const pcts = pct100(segments.map(s => s.val));
  return (
    <div className="mt-4">
      <div className="flex h-3.5 rounded-full overflow-hidden gap-px">
        {segments.map(s => (
          <div key={s.label} style={{ width: `${(s.val / grossTotal) * 100}%` }}
            className={`bg-foreground ${s.opacity} first:rounded-l-full last:rounded-r-full`}
            title={`${s.label}: ${fmt(s.val)}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {segments.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm bg-foreground ${s.opacity} shrink-0`} />
            <span className="text-xs text-muted-foreground">{s.label} <span className="font-medium text-foreground">{pcts[i]}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Runway bar (for comparison section) ─────────────────────────────────
function RunwayBar({ label, months, maxMonths }: { label: string; months: number; maxMonths: number }) {
  const pct = months >= 999 ? 100 : Math.min((months / maxMonths) * 100, 100);
  const barClass = months >= 24 ? 'bg-foreground/80' : months >= 12 ? 'bg-foreground/50' : 'bg-foreground/25';
  return (
    <div className="py-3.5 border-b border-border last:border-0">
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <span className="text-sm text-muted-foreground flex-1">{label}</span>
        <span className="text-sm font-bold text-foreground shrink-0">{fmtRunway(months)}</span>
      </div>
      <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Revenue vs. Savings curve (simplified SVG) ────────────────────────────
function SavingsCurve({ sim, pas, hc }: { sim: SimulationResult; pas: number; hc: number }) {
  const W = 480, H = 120, months = 36;
  const vol = 1 - sim.volatilityPercent / 100;

  function series(revMult: number): number[] {
    let cap = pas;
    const pts: number[] = [cap];
    for (let m = 1; m <= months; m++) {
      const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
      cap = Math.max(0, cap - (sim.tmib - sim.expectedRevenue * revMult * rf * vol));
      pts.push(cap);
    }
    return pts;
  }

  const base = series(1.00);
  const severe = series(0.70);
  const maxV = pas || 1;

  function toPath(pts: number[]): string {
    return pts.map((v, i) => {
      const x = Math.round((i / months) * W);
      const y = Math.round(H - (v / maxV) * H);
      return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
    }).join(' ');
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" style={{ height: 140 }}>
        {[0.25, 0.5, 0.75, 1].map(p => (
          <line key={p} x1="0" y1={H - p * H} x2={W} y2={H - p * H} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        <path d={toPath(base)} fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={toPath(severe)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 3" />
        {[0, 6, 12, 18, 24, 30, 36].map(m => (
          <text key={m} x={(m / months) * W} y={H + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">{m}</text>
        ))}
      </svg>
      <div className="flex gap-5 mt-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-5 h-0.5 bg-foreground rounded" /> Base case</div>
        <div className="flex items-center gap-1.5"><div className="w-5 h-px bg-muted-foreground rounded border-dashed border-t" /> Severe (−30%)</div>
        <span className="text-muted-foreground/50">X axis: months · Y axis: Primary Accessible Savings</span>
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
      onError: (err) => toast({ title: "Report generation failed", description: err.message, variant: "destructive" }),
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

  // ─── Derived values ─────────────────────────────────────────────────────
  const score = sim.structuralBreakpointScore;
  const sc = getScoreColors(score);
  const hc = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
  const partnerOff = sim.isDualIncome ? (sim.partnerIncome ?? 0) : 0;
  const reportDate = new Date(sim.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Capital tiers
  const tier1 = sim.cash;
  const tier2 = Math.round(sim.brokerage * 0.80);
  const pas = tier1 + tier2; // Primary Accessible Savings
  const t3Roth = Math.round(sim.roth);
  const t3Trad = Math.round(sim.traditional * 0.50);
  const t3RE   = Math.round(sim.realEstate * 0.30);
  const t3Total = t3Roth + t3Trad + t3RE;
  const reliesOnRestricted = t3Total > 0 && pas < sim.tmib * 12;

  // Primary Savings Runway (when PAS exhausted)
  const psrBase = calcPrimaryRunway(sim, 1.00);
  const psr15   = calcPrimaryRunway(sim, 0.85);
  const psr30   = calcPrimaryRunway(sim, 0.70);
  const psrRampDelay = calcPrimaryRunway(sim, 1.00, sim.rampDuration + 3);

  // Status classification
  const psrStatusColor = psr30 < 6 ? 'text-red-700' : psr30 < 12 ? 'text-amber-700' : 'text-green-700';
  const psrStatusBg    = psr30 < 6 ? 'bg-red-50 border-red-200' : psr30 < 12 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200';
  const psrStatusLabel = psr30 < 6 ? 'Critical' : psr30 < 12 ? 'Caution' : 'Adequate';

  // Runway chart scale
  const runways = [sim.baseRunway, sim.runway15Down, sim.runway30Down, sim.runwayRampDelay].filter(r => r < 999);
  const maxScale = Math.max(Math.min(Math.max(...runways, 36) * 1.2, 288), 36);

  // Outflow components
  const outflowComponents = [
    { label: 'Living Expenses', val: sim.livingExpenses },
    { label: 'Debt Payments (required minimums)', val: sim.monthlyDebtPayments },
    { label: 'Healthcare', val: hc },
    { label: 'Tax Reserve (28%)', val: sim.selfEmploymentTax },
    { label: 'Business Costs', val: sim.businessCostBaseline },
  ].filter(c => c.val > 0);
  const grossOutflow = outflowComponents.reduce((a, c) => a + c.val, 0);
  const pcts = pct100(outflowComponents.map(c => c.val));
  const fixedPct = grossOutflow > 0 ? pcts[0] + (pcts[1] ?? 0) : 0;

  // Sensitivity (using primary savings runway under severe)
  const sev30 = psr30;
  const burnMinus1k = calcPrimaryRunway({ ...sim, tmib: Math.max(0, sim.tmib - 1000) } as SimulationResult, 0.70);
  const revPlus1k   = calcPrimaryRunway({ ...sim, expectedRevenue: sim.expectedRevenue + 1000 } as SimulationResult, 0.70);
  const burnDelta = burnMinus1k < 999 && sev30 < 999 ? burnMinus1k - sev30 : null;
  const revDelta  = revPlus1k  < 999 && sev30 < 999 ? revPlus1k  - sev30 : null;

  // Income totals
  // grossOutflow = all expense components before partner income offset
  // tmib = gross - partnerIncome = what savings/business revenue must cover
  // Snapshot must use grossOutflow to avoid double-counting partner income
  const totalIncome = (sim.currentSalary ?? 0) + (sim.isDualIncome ? partnerOff : 0);
  const grossSurplus = totalIncome - grossOutflow; // correct: income vs. all expenses

  // Advisor paragraph
  const advisorSummary = score >= 70
    ? `Your financial structure is defensible under expected conditions. Primary Accessible Savings of ${fmt(pas)} provides ${fmtRunway(psrBase)} of Primary Savings Runway. The transition is viable as modeled — the main variable is execution.`
    : score >= 50
    ? `Your position is workable but not comfortable. A slower-than-expected ramp or an early income shortfall could exhaust Primary Accessible Savings sooner than planned, pushing toward Restricted or Long-Term Assets.`
    : `Your Primary Accessible Savings may not be sufficient to carry this transition through a standard ramp period if revenue underperforms. The window between viable and distressed is narrow under the modeled inputs.`;

  const hcPct = grossOutflow > 0 ? Math.round((hc / grossOutflow) * 100) : 0;
  const advisorBestMove = hcPct >= 15
    ? `Healthcare cost (${hcPct}% of gross outflow) is the highest-leverage controllable cost. Partner coverage or income-based subsidies could shift the position materially.`
    : sim.rampDuration > 6
    ? `Shortening your ramp timeline or entering with a signed client commitment would reduce the capital gap significantly — each month of earlier revenue eliminates one month of full-burden drawdown.`
    : `Increasing stable revenue by even ${fmt(1000)}/month would extend your Primary Savings Runway by approximately ${revDelta ? `${revDelta} months` : 'a meaningful amount'} under severe stress.`;

  return (
    <Layout>
      <div className="flex-1 bg-background py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {/* Report header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                QuitReady Financial Position Report · {reportDate}
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

          {/* ── 1. Executive Snapshot ─────────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={1}>Executive Snapshot — Your Financial Position Today</SectionHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 border-b border-border">
              {[
                { label: 'Total Monthly Income', val: fmt(totalIncome), testid: 'metric-income', sub: sim.isDualIncome && partnerOff > 0 ? `${fmt(sim.currentSalary ?? 0)} + ${fmt(partnerOff)} partner` : undefined },
                { label: 'Total Monthly Outflow', val: fmt(grossOutflow), testid: 'metric-tmib', sub: 'All expenses, before partner income offset' },
                { label: 'Monthly Surplus / Deficit', val: (grossSurplus >= 0 ? '+' : '') + fmt(grossSurplus), testid: 'metric-surplus', color: grossSurplus >= 0 ? 'text-green-700' : 'text-red-700', sub: grossSurplus >= 0 ? 'Household income exceeds total outflow' : 'Total outflow exceeds household income' },
              ].map((m, i) => (
                <div key={m.label} className={`p-5 ${i < 2 ? 'border-r border-border' : ''}`} data-testid={m.testid}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                  <p className={`text-lg font-bold font-serif ${m.color ?? 'text-foreground'}`}>{m.val}</p>
                  {m.sub && <p className="text-xs text-muted-foreground/70 mt-0.5 leading-tight">{m.sub}</p>}
                </div>
              ))}
            </div>
            {/* TMIB clarification — shows what savings must cover */}
            {sim.isDualIncome && partnerOff > 0 && (
              <div className="mx-6 mt-3 mb-1 px-4 py-2.5 bg-muted/20 border border-border rounded-md flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Net savings gap:</span> {fmt(grossOutflow)} outflow − {fmt(partnerOff)} partner income = <span className="font-semibold text-foreground">{fmt(sim.tmib)}/month</span> that new business revenue and savings must cover.
                </p>
                <span className="text-xs text-muted-foreground shrink-0 font-medium" data-testid="metric-tmib-net">{fmt(sim.tmib)}</span>
              </div>
            )}
            {/* Primary Savings Runway callout */}
            <div className={`mx-6 my-4 flex items-center justify-between px-4 py-3 rounded-md border ${psrStatusBg}`}>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Primary Accessible Savings (Cash + Brokerage)</p>
                <p className="text-sm text-muted-foreground">
                  {fmt(pas)} · Primary Savings Runway exhausted in <span className="font-bold text-foreground">{psr30 >= 999 ? '24+ years' : fmtRunwayShort(psr30)}</span> under severe stress (−30%)
                </p>
              </div>
              <div className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${psrStatusColor}`} data-testid="text-ll-status">
                {psrStatusLabel}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border">
              {[
                { label: 'Primary Accessible Savings', val: fmt(pas), testid: 'metric-capital' },
                { label: 'Total Accessible Savings', val: fmt(sim.accessibleCapital), testid: 'metric-total-capital' },
                { label: 'Primary Savings Runway', val: fmtRunway(psrBase), testid: 'metric-base-runway' },
                { label: 'Risk Position Score', val: `${score}/100`, testid: 'metric-worst-runway' },
              ].map((m, i) => (
                <div key={m.label} className={`p-5 ${i < 3 ? 'border-r border-border' : ''}`} data-testid={m.testid}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">{m.label}</p>
                  <p className="text-lg font-bold font-serif text-foreground">{m.val}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ── 2. Risk Position Score ────────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={2}>Risk Position Score</SectionHeader>
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
                      ? 'No structural breakpoint found within the model range. Capital and revenue projections remain solvent across all modeled scenarios.'
                      : `The earliest pressure point appears at ${fmtRunway(sim.breakpointMonth)} — under the ${sim.breakpointScenario} scenario.`}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { range: '0 – 49', label: 'Structurally Fragile', active: score < 50 },
                  { range: '50 – 69', label: 'Moderately Exposed', active: score >= 50 && score < 70 },
                  { range: '70 – 85', label: 'Structurally Stable', active: score >= 70 && score <= 85 },
                  { range: '86 – 100', label: 'Strong Buffer Position', active: score > 85 },
                ].map(l => (
                  <div key={l.range} className={`p-3 rounded-md border text-center ${l.active ? 'border-foreground bg-foreground/5' : 'border-border opacity-40'}`}>
                    <p className="text-xs font-bold text-foreground mb-0.5">{l.range}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{l.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* ── 3. Monthly Outflow Breakdown ─────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={3}
              sub="Gross outflow components before partner income offset. Percentages sum to exactly 100%.">
              Where Your Money Goes Each Month
            </SectionHeader>
            <div className="px-6 py-4">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Required Fixed Obligations</p>
                <OutflowRow label="Living Expenses (day-to-day household)" value={sim.livingExpenses} />
                <OutflowRow label="Debt Payments (required minimums)" value={sim.monthlyDebtPayments} />
              </div>
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Transition Adjustments</p>
                <OutflowRow label="Healthcare cost change" value={hc} />
                {sim.isDualIncome && partnerOff > 0 && <OutflowRow label="Partner income offset" value={partnerOff} credit />}
              </div>
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Income Plan Costs</p>
                <OutflowRow label="Tax Reserve (28% of projected revenue)" value={sim.selfEmploymentTax} />
                <OutflowRow label="Business operating costs" value={sim.businessCostBaseline} />
              </div>
              <div className="flex items-center justify-between py-4 border-t-2 border-border">
                <span className="text-sm font-bold text-foreground">Net Monthly Outflow</span>
                <span className="text-xl font-bold font-serif text-foreground" data-testid="text-tmib-total">{fmt(sim.tmib)}</span>
              </div>
              <OutflowCompositionBar sim={sim} hc={hc} />
              {grossOutflow > 0 && (
                <div className="mt-5 pt-5 border-t border-border space-y-1.5">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">{pcts[0] + (pcts[1] ?? 0)}% is fixed obligations</strong> — living expenses and debt payments that will not decrease if revenue underperforms. These are the hardest costs to reduce under pressure.
                  </p>
                  {sim.selfEmploymentTax > 0 && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      The <strong className="text-foreground">tax reserve</strong> ({pcts[outflowComponents.findIndex(c => c.val === sim.selfEmploymentTax)]}% of gross outflow) eases naturally in lower-revenue months — giving the outflow structure some flexibility tied to income.
                    </p>
                  )}
                  {(sim.totalDebt ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2">
                      <strong className="text-foreground">Note on debt:</strong> The outstanding loan balance of {fmt(sim.totalDebt ?? 0)} is context only. It does not affect monthly outflow. Only the required minimum payment ({fmt(sim.monthlyDebtPayments)}/month) flows through the outflow calculation.
                    </p>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── 4. Primary Savings Runway Scenarios ──────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={4}
              sub="How long Primary Accessible Savings (cash + brokerage) would last before running out — in each scenario. Revenue stress reduces income; outflow stays constant.">
              Stress Scenario Modeling
            </SectionHeader>
            <div className="px-6 py-2">
              <RunwayBar label="Revenue arrives on time and hits target" months={psrBase} maxMonths={maxScale} />
              <RunwayBar label="Revenue underperforms by 15%" months={psr15} maxMonths={maxScale} />
              <RunwayBar label="Revenue materially underperforms by 30%" months={psr30} maxMonths={maxScale} />
              <RunwayBar label="Revenue ramp takes 3 months longer" months={psrRampDelay} maxMonths={maxScale} />
            </div>
            <div className="border-t border-border px-6 pb-4 pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-scenarios">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scenario</th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Primary Savings Runway</th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Runway</th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Restricted Assets?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Expected conditions', psr: psrBase, full: sim.baseRunway },
                      { label: 'Moderate contraction (−15%)', psr: psr15, full: sim.runway15Down },
                      { label: 'Severe contraction (−30%)', psr: psr30, full: sim.runway30Down },
                      { label: 'Ramp delayed +3 months', psr: psrRampDelay, full: sim.runwayRampDelay },
                    ].map(s => {
                      const needsR = t3Total > 0 && s.psr < s.full;
                      return (
                        <tr key={s.label} className="border-b border-border last:border-0">
                          <td className="py-3 text-sm text-muted-foreground">{s.label}</td>
                          <td className="py-3 text-sm font-semibold text-foreground text-right">{fmtRunway(s.psr)}</td>
                          <td className="py-3 text-sm font-semibold text-foreground text-right">{fmtRunway(s.full)}</td>
                          <td className={`py-3 text-sm font-semibold text-right ${needsR ? 'text-red-700' : 'text-green-700'}`}>
                            {needsR ? 'Yes' : 'No'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>

          {/* ── 5. Revenue vs. Savings Curve ──────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={5}
              sub="How Primary Accessible Savings depletes over 36 months under base and severe scenarios.">
              Revenue vs. Savings Curve
            </SectionHeader>
            <div className="px-6 py-5">
              <SavingsCurve sim={sim} pas={pas} hc={hc} />
            </div>
          </SectionCard>

          {/* ── 6. Savings Tier Structure ─────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={6}
              sub="Your savings are layered by accessibility. Under stress, depletion follows this order. Restricted or Long-Term Assets are emergency capital — not primary runway.">
              Savings Tier Structure
            </SectionHeader>
            <div className="px-6 py-4">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Primary Accessible Savings <span className="normal-case font-normal text-muted-foreground">(Cash + Brokerage — Stage 1)</span>
                </p>
                <div className="space-y-2">
                  {tier1 > 0 && (
                    <div className="flex items-center justify-between py-3 border border-border rounded-md px-4">
                      <div><p className="text-sm font-medium text-foreground">Cash & HYSA</p><p className="text-xs text-muted-foreground">Counted at 100% — no penalty, no tax, no delay</p></div>
                      <p className="text-sm font-bold text-foreground">{fmt(tier1)}</p>
                    </div>
                  )}
                  {tier2 > 0 && (
                    <div className="flex items-center justify-between py-3 border border-border rounded-md px-4">
                      <div><p className="text-sm font-medium text-foreground">Brokerage accounts</p><p className="text-xs text-muted-foreground">Counted at 80% — selling may trigger capital gains taxes</p></div>
                      <p className="text-sm font-bold text-foreground">{fmt(tier2)}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-3 bg-blue-50 border border-blue-200 rounded-md px-4">
                    <span className="text-sm font-bold text-blue-800">Primary Accessible Savings total</span>
                    <span className="text-base font-bold font-serif text-blue-800" data-testid="text-accessible-capital">{fmt(pas)}</span>
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">
                  Restricted or Long-Term Assets <span className="normal-case font-normal">(Retirement + Home Equity — Stage 2, if needed)</span>
                </p>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  Not considered primary runway. Early access to retirement accounts typically triggers income taxes plus a 10% penalty — permanently reducing long-term compounding. Only used when Stage 1 is exhausted.
                </p>
                {t3Total > 0 ? (
                  <div className="border border-amber-200 rounded-md overflow-hidden">
                    {t3Roth > 0 && (
                      <div className="flex items-center justify-between py-3 px-4 border-b border-amber-100">
                        <div><p className="text-sm font-medium text-foreground">Roth IRA contributions</p><p className="text-xs text-muted-foreground">Counted at 100% (contributions only — still retirement capital)</p></div>
                        <p className="text-sm font-bold text-foreground">{fmt(t3Roth)}</p>
                      </div>
                    )}
                    {t3Trad > 0 && (
                      <div className="flex items-center justify-between py-3 px-4 border-b border-amber-100">
                        <div><p className="text-sm font-medium text-foreground">Traditional IRA / 401(k)</p><p className="text-xs text-muted-foreground">Counted at 50% — income taxes + 10% early withdrawal penalty</p></div>
                        <p className="text-sm font-bold text-foreground">{fmt(t3Trad)}</p>
                      </div>
                    )}
                    {t3RE > 0 && (
                      <div className="flex items-center justify-between py-3 px-4">
                        <div><p className="text-sm font-medium text-foreground">Home equity</p><p className="text-xs text-muted-foreground">Counted at 30% — illiquid, costly to access, market-dependent</p></div>
                        <p className="text-sm font-bold text-foreground">{fmt(t3RE)}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No Restricted or Long-Term Assets entered.</p>
                )}
                {reliesOnRestricted && (
                  <div className="mt-3 flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-md">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Primary Accessible Savings ({fmt(pas)}) covers less than 12 months of net outflow under stress. You are not liquid enough to sustain this transition without entering Restricted asset territory — treat that as emergency capital, not a plan.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between py-4 border-t border-border bg-muted/10 -mx-6 px-6 rounded-b-md">
                <span className="text-sm font-bold text-foreground">Total Accessible Savings (all tiers)</span>
                <span className="text-xl font-bold font-serif text-foreground">{fmt(sim.accessibleCapital)}</span>
              </div>
            </div>
          </SectionCard>

          {/* ── 7. What Moves the Needle ──────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={7}
              sub="Sensitivity results — how much each change extends Primary Savings Runway under severe stress (−30%). Not prescriptions.">
              What Moves the Needle
            </SectionHeader>
            <div className="px-6 py-4 space-y-3">
              {burnDelta !== null && burnDelta > 0 && (
                <div className="p-4 rounded-md border border-border bg-muted/20">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Reducing outflow by $1,000/month</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    Extends Primary Savings Runway by approximately <strong>{burnDelta} months</strong> under severe stress — from {fmtRunway(sev30)} to {fmtRunway(burnMinus1k)}.
                    <span className="text-muted-foreground ml-2 text-xs">Sensitivity result only — not a recommendation.</span>
                  </p>
                </div>
              )}
              {revDelta !== null && revDelta > 0 && (
                <div className="p-4 rounded-md border border-border bg-muted/20">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Increasing stable revenue by $1,000/month</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    Extends Primary Savings Runway by approximately <strong>{revDelta} months</strong> under severe stress — from {fmtRunway(sev30)} to {fmtRunway(revPlus1k)}.
                    <span className="text-muted-foreground ml-2 text-xs">Sensitivity result only — not a recommendation.</span>
                  </p>
                </div>
              )}
              {hcPct >= 15 && (
                <div className="p-4 rounded-md border border-border bg-muted/20">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Healthcare cost — {hcPct}% of gross outflow</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    At {fmt(hc)}/month, healthcare is a notable outflow component. Partner coverage or income-based ACA subsidies could shift the structure materially.
                    <span className="text-muted-foreground ml-2 text-xs">Sensitivity result only — not a recommendation.</span>
                  </p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── 8. Scenario Comparison Grid ──────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={8}
              sub="All scenarios side by side. Primary Savings Runway = when cash + brokerage runs out. Full Runway uses all accessible savings including restricted assets.">
              Scenario Comparison
            </SectionHeader>
            <div className="px-6 py-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-semibold uppercase tracking-wider text-muted-foreground pr-3">Metric</th>
                    {['Base', '−15%', '−30%', '+3mo Ramp'].map(c => (
                      <th key={c} className="text-center py-2 font-semibold uppercase tracking-wider text-muted-foreground px-2">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Primary Savings Runway', vals: [fmtRunway(psrBase), fmtRunway(psr15), fmtRunway(psr30), fmtRunway(psrRampDelay)] },
                    { label: 'Full Runway', vals: [fmtRunway(sim.baseRunway), fmtRunway(sim.runway15Down), fmtRunway(sim.runway30Down), fmtRunway(sim.runwayRampDelay)] },
                    { label: 'Restricted assets required?', vals: [psrBase, psr15, psr30, psrRampDelay].map((p, i) => {
                      const full = [sim.baseRunway, sim.runway15Down, sim.runway30Down, sim.runwayRampDelay][i];
                      return t3Total > 0 && p < full ? 'Yes' : 'No';
                    }) },
                  ].map((row, ri) => (
                    <tr key={row.label} className={`border-b border-border last:border-0 ${ri % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      <td className="py-3 text-muted-foreground font-medium pr-3">{row.label}</td>
                      {row.vals.map((val, ci) => (
                        <td key={ci} className={`py-3 text-center font-semibold ${val === 'Yes' ? 'text-red-700' : val === 'No' ? 'text-green-700' : 'text-foreground'}`}>
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* ── 9. What This Means For You ───────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={9}>What This Means For You</SectionHeader>
            <div className="p-6 space-y-5">
              <div className="flex items-start gap-3">
                <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border ${sc.border} ${sc.bg} ${sc.text}`}>S</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{advisorSummary}</p>
              </div>
              {reliesOnRestricted && (
                <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Your Primary Accessible Savings ({fmt(pas)}) would likely be exhausted before the full transition completes under stress. At that point, Restricted or Long-Term Assets would be required — carrying significant tax, penalty, and long-term compounding costs.
                  </p>
                </div>
              )}
              <div className="flex items-start gap-3 pt-3 border-t border-border">
                <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border ${sc.border} ${sc.bg} ${sc.text}`}>↑</div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Highest-impact lever</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{advisorBestMove}</p>
                </div>
              </div>
            </div>
          </SectionCard>

        </div>
      </div>
    </Layout>
  );
}
