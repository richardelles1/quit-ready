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
  return <div className={`border border-border rounded-lg shadow-sm bg-white dark:bg-card overflow-hidden ${className}`}>{children}</div>;
}

function SectionHeader({ children, sub, n }: { children: React.ReactNode; sub?: string; n?: number }) {
  return (
    <div className="px-7 py-5 border-b border-border bg-muted/10">
      {n !== undefined && (
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 mb-1.5">
          Section {n}
        </p>
      )}
      <h2 className="text-base font-bold font-serif text-foreground leading-snug">{children}</h2>
      {sub && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">{sub}</p>}
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

// Income-based structural margin label (per spec)
function getMarginLabel(surplus: number, income: number): string {
  if (income <= 0) return 'No income basis';
  const pct = surplus / income;
  if (pct > 0.10) return 'Strong structural margin';
  if (pct >= 0) return 'Moderate structural margin';
  if (pct >= -0.05) return 'Thin structural margin';
  return 'Negative structural margin';
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

// ─── Revenue vs. Savings curve (premium SVG) ────────────────────────────────
function SavingsCurve({ sim, pas: pasCap }: { sim: SimulationResult; pas: number; hc: number }) {
  const SVG_W = 520, SVG_H = 150, months = 36;
  const PAD_L = 54, PAD_B = 24;
  const chartW = SVG_W - PAD_L - 8;
  const chartH = SVG_H - PAD_B;
  const vol = 1 - sim.volatilityPercent / 100;

  function series(revMult: number): number[] {
    let cap = pasCap;
    const pts: number[] = [cap];
    for (let m = 1; m <= months; m++) {
      const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
      cap = Math.max(0, cap - (sim.tmib - sim.expectedRevenue * revMult * rf * vol));
      pts.push(cap);
    }
    return pts;
  }

  function pressureMonthIdx(pts: number[]): number | null {
    const drain = Math.max(0, sim.tmib - sim.expectedRevenue * 0.70 * vol);
    if (drain <= 0) return null;
    const threshold = drain * 6;
    const idx = pts.findIndex(v => v <= threshold && v > 0);
    return idx > 0 ? idx : null;
  }

  const base = series(1.00);
  const severe = series(0.70);
  const maxV = pasCap || 1;
  const pm = pressureMonthIdx(severe);

  const toX = (m: number) => PAD_L + (m / months) * chartW;
  const toY = (v: number) => chartH - Math.max(0, (v / maxV)) * chartH;

  function toPath(pts: number[]): string {
    return pts.slice(0, months + 1).map((v, i) => {
      return `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`;
    }).join(' ');
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
  const fmtTick = (v: number) => {
    const n = pasCap * v;
    return n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ height: 180 }}>
        {yTicks.map(p => (
          <g key={p}>
            <line x1={PAD_L} y1={toY(pasCap * p)} x2={SVG_W - 8} y2={toY(pasCap * p)}
              stroke={p === 0 ? '#cbd5e1' : '#f1f5f9'} strokeWidth={p === 0 ? 1.5 : 1} />
            <text x={PAD_L - 4} y={toY(pasCap * p) + 3} textAnchor="end" fontSize="8" fill="#94a3b8"
              fontFamily="system-ui">{fmtTick(p)}</text>
          </g>
        ))}
        {[0, 6, 12, 18, 24, 30, 36].map(m => (
          <g key={m}>
            <line x1={toX(m)} y1={0} x2={toX(m)} y2={chartH} stroke="#f1f5f9" strokeWidth="1" />
            <text x={toX(m)} y={SVG_H - 6} textAnchor="middle" fontSize="8" fill="#94a3b8"
              fontFamily="system-ui">{m}</text>
          </g>
        ))}
        {pm !== null && pm <= months && (
          <>
            <line x1={toX(pm)} y1={0} x2={toX(pm)} y2={chartH}
              stroke="#ef4444" strokeWidth="1" strokeDasharray="4 3" />
            <circle cx={toX(pm)} cy={toY(severe[pm] ?? 0)} r="4" fill="#ef4444" />
            <text x={pm > 24 ? toX(pm) - 6 : toX(pm) + 6} y={toY(severe[pm] ?? 0) - 14}
              textAnchor={pm > 24 ? 'end' : 'start'} fontSize="7.5" fill="#ef4444"
              fontFamily="system-ui" fontWeight="bold">T1 depletion</text>
            <text x={pm > 24 ? toX(pm) - 6 : toX(pm) + 6} y={toY(severe[pm] ?? 0) - 4}
              textAnchor={pm > 24 ? 'end' : 'start'} fontSize="7.5" fill="#ef4444"
              fontFamily="system-ui">~month {pm}</text>
          </>
        )}
        <path d={toPath(base)} fill="none" stroke="#1e293b" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
        {base[months] > 0 && <circle cx={toX(months)} cy={toY(base[months])} r="3.5" fill="#1e293b" />}
        <path d={toPath(severe)} fill="none" stroke="#94a3b8" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 3" />
        {severe.findIndex(v => v === 0) > 0 && severe.findIndex(v => v === 0) <= months && (
          <circle cx={toX(severe.findIndex(v => v === 0))} cy={toY(0)} r="3.5" fill="#94a3b8" />
        )}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-0.5 bg-foreground rounded" />
          <span>Base case</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-px" style={{ borderTop: '1.5px dashed #94a3b8' }} />
          <span>Severe (−30%)</span>
        </div>
        {pm !== null && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>Tier 1 depletion point (−30% scenario)</span>
          </div>
        )}
        <span className="text-muted-foreground/40 ml-auto">X: months · Y: Tier 1 Liquid Capital</span>
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
  const pas = tier1 + tier2; // Tier 1 Liquid Capital
  const t3Roth = Math.round(sim.roth);
  const t3Trad = Math.round(sim.traditional * 0.50);
  const t3RE   = Math.round(sim.realEstate * 0.30);
  const t3Total = t3Roth + t3Trad + t3RE;
  const reliesOnRestricted = t3Total > 0 && pas < sim.tmib * 12;

  // Tier 1 Runway (when PAS exhausted)
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

  // Structural margin label, income-based (not score-based)
  const marginLabel = getMarginLabel(grossSurplus, totalIncome);

  // Pre-render validation (console warnings only, does not block screen)
  if (process.env.NODE_ENV !== 'production') {
    const pctSum = pcts.reduce((a, b) => a + b, 0);
    if (pctSum !== 100) console.warn(`[QR Validation] Outflow pcts sum to ${pctSum}, expected 100`);
    if (grossSurplus < 0 && marginLabel.includes('Strong')) console.warn('[QR Validation] Deficit but Strong margin label. check income inputs');
    if (pas < 0) console.warn('[QR Validation] Negative Tier 1 Liquid Capital');
  }

  // Advisor paragraph, narrative-consistent (no strong language when deficit exists)
  const advisorSummary = grossSurplus < 0
    ? `Your current household outflow exceeds total income by ${fmt(Math.abs(grossSurplus))}/month. Any transition would begin drawing from savings on day one, before accounting for ramp delays or revenue shortfalls. The capital position requires careful review before committing to a timeline.`
    : score >= 70
    ? `Your financial structure is defensible under expected conditions. Tier 1 Liquid Capital of ${fmt(pas)} provides ${fmtRunway(psrBase)} of Tier 1 Runway at base case. The transition is viable as modeled. The primary variable is execution speed.`
    : score >= 50
    ? `Your position is workable but carries meaningful exposure. A slower-than-expected ramp or early income shortfall could exhaust Tier 1 Liquid Capital sooner than planned, pushing toward Tier 2 Contingent Capital.`
    : `Your Tier 1 Liquid Capital may not sustain this transition through a standard ramp period under revenue underperformance. The margin between a viable outcome and a distressed one is narrow under the modeled inputs.`;

  // Tier 2 assets clarification sentence (per spec)
  const restrictedClarification = reliesOnRestricted
    ? `While Tier 1 Liquid Capital depletes in ${psr30 >= 999 ? '24+ years' : fmtRunway(psr30)} under severe stress, total capital depth extends runway to ${fmtRunway(sim.runway30Down)} if Tier 2 Contingent Capital is accessed. This is emergency capital. Not a planned source of transition funding.`
    : null;

  const hcPct = grossOutflow > 0 ? Math.round((hc / grossOutflow) * 100) : 0;
  const advisorBestMove = hcPct >= 15
    ? `Healthcare cost (${hcPct}% of gross outflow) is the highest-leverage controllable cost. Partner coverage or income-based ACA subsidies could shift the position materially.`
    : sim.rampDuration > 6
    ? `Shortening your ramp timeline or entering with a signed client commitment would reduce the capital gap significantly. each month of earlier revenue eliminates one month of full-burden drawdown.`
    : `Increasing stable revenue by ${fmt(1000)}/month would extend your Tier 1 Runway by approximately ${revDelta ? `${revDelta} months` : 'a meaningful amount'} under severe stress.`;

  return (
    <Layout>
      <div className="flex-1 bg-muted/20 py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {/* Report header */}
          <div className="mb-10">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
                  QuitReady · Financial Position Report
                </p>
                <h1 className="text-3xl sm:text-4xl font-bold font-serif text-foreground leading-tight mb-1">
                  Structural Breakpoint Analysis
                </h1>
                <p className="text-sm text-muted-foreground">
                  Prepared {reportDate} · {marginLabel}
                </p>
              </div>
              <Button onClick={handleDownload} disabled={downloadPdf.isPending}
                className="gap-2 shrink-0 mt-1" data-testid="button-download-pdf">
                <Download className="w-4 h-4" />
                {downloadPdf.isPending ? 'Generating PDF...' : 'Download Full Report'}
              </Button>
            </div>
            <div className="mt-5 h-px bg-border" />
          </div>

          {/* ── 1. Executive Snapshot ─────────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={1}>Executive Snapshot: Your Financial Position Today</SectionHeader>
            {/* Top 3 income/outflow tiles */}
            <div className="grid grid-cols-3 border-b border-border">
              {[
                {
                  label: 'Total Monthly Income',
                  val: fmt(totalIncome),
                  testid: 'metric-income',
                  sub: sim.isDualIncome && partnerOff > 0 ? `${fmt(sim.currentSalary ?? 0)} primary + ${fmt(partnerOff)} partner` : 'Current household income',
                },
                {
                  label: 'Total Monthly Outflow',
                  val: fmt(grossOutflow),
                  testid: 'metric-tmib',
                  sub: 'All expense components, before partner offset',
                },
                {
                  label: 'Monthly Surplus / Deficit',
                  val: (grossSurplus >= 0 ? '+' : '') + fmt(grossSurplus),
                  testid: 'metric-surplus',
                  color: grossSurplus >= 0 ? 'text-green-700' : 'text-red-700',
                  sub: grossSurplus >= 0 ? 'Household income exceeds total outflow' : 'Total outflow exceeds household income',
                },
              ].map((m, i) => (
                <div key={m.label} className={`px-7 py-6 ${i < 2 ? 'border-r border-border' : ''}`} data-testid={m.testid}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">{m.label}</p>
                  <p className={`text-2xl font-bold font-serif ${m.color ?? 'text-foreground'}`}>{m.val}</p>
                  {m.sub && <p className="text-xs text-muted-foreground/60 mt-1 leading-tight">{m.sub}</p>}
                </div>
              ))}
            </div>

            {/* Net savings gap clarification for dual-income */}
            {sim.isDualIncome && partnerOff > 0 && (
              <div className="mx-7 mt-4 mb-1 px-5 py-3 bg-muted/30 border border-border rounded-md flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Net savings gap (TMIB):</span>{' '}
                  {fmt(grossOutflow)} outflow − {fmt(partnerOff)} partner income ={' '}
                  <span className="font-semibold text-foreground">{fmt(sim.tmib)}/month</span> that new business revenue and savings must cover post-quit.
                </p>
                <span className="text-sm font-bold text-foreground shrink-0 font-serif" data-testid="metric-tmib-net">{fmt(sim.tmib)}</span>
              </div>
            )}

            {/* Tier 1 Runway: visual anchor */}
            <div className={`mx-7 my-5 px-5 py-4 rounded-lg border-2 ${psrStatusBg}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">
                    Tier 1 Runway, Severe Stress (−30% Revenue)
                  </p>
                  <p className="text-2xl font-bold font-serif text-foreground" data-testid="text-ll-status">
                    {psr30 >= 999 ? '24+ years' : fmtRunway(psr30)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tier 1 Liquid Capital: {fmt(pas)} (Cash + Brokerage)
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Typical ranges</p>
                  <p className="text-[9px] leading-snug text-muted-foreground"><span className="font-semibold text-red-600">Fragile:</span> 6 months or less</p>
                  <p className="text-[9px] leading-snug text-muted-foreground"><span className="font-semibold text-amber-600">Workable:</span> 12 months</p>
                  <p className="text-[9px] leading-snug text-muted-foreground"><span className="font-semibold text-green-600">Strong buffer:</span> 18–24 months</p>
                </div>
              </div>
              {psr30 >= 999 && (
                <p className="text-xs text-muted-foreground leading-relaxed mt-3 pt-3 border-t border-border/40">
                  This result is very long because the model assumes revenue reaches its target during the ramp period. Once revenue covers the monthly gap, savings stop declining. This does not mean savings alone could fund the transition for 24 years.
                </p>
              )}
            </div>

            {/* Second row: capital and runway metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border">
              {[
                { label: 'Tier 1 Liquid Capital', val: fmt(pas), testid: 'metric-capital' },
                { label: 'Full Capital Depth', val: fmt(sim.accessibleCapital), testid: 'metric-total-capital' },
                { label: 'Tier 1 Runway, Base', val: fmtRunway(psrBase), testid: 'metric-base-runway' },
                { label: 'Risk Position Score', val: `${score} / 100`, testid: 'metric-worst-runway' },
              ].map((m, i) => (
                <div key={m.label} className={`px-7 py-5 ${i < 3 ? 'border-r border-border' : ''}`} data-testid={m.testid}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 mb-1.5">{m.label}</p>
                  <p className="text-xl font-bold font-serif text-foreground">{m.val}</p>
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
                  {sim.breakpointMonth >= 999 ? (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      No breakpoint was found within the model range. Tier 1 Liquid Capital remains solvent across all modeled scenarios.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pressure Window</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Under severe revenue contraction (−30%), Tier 1 Liquid Capital would be exhausted in <strong className="text-foreground">{fmtRunway(psr30)}</strong>.
                      </p>
                      {t3Total > 0 && sim.runway30Down > psr30 && (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          At that point, the transition could only continue by accessing retirement accounts or home equity. Those assets extend the total theoretical runway to <strong className="text-foreground">{fmtRunway(sim.runway30Down)}</strong>, but they represent emergency capital rather than primary transition funding.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
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
              <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-4">
                {score >= 86
                  ? `A score of ${score} reflects a structurally strong position. Tier 1 Liquid Capital covers the gap for a meaningful duration, the severe stress scenario does not produce a critical breakpoint, and the debt load is within a manageable range relative to capital. The primary risk to this position is a prolonged revenue delay.`
                  : score >= 70
                  ? `A score of ${score} reflects a stable but not insulated position. The base case and moderate contraction scenarios are manageable. The severe contraction scenario reveals meaningful exposure. The structure works if execution is close to plan.`
                  : score >= 50
                  ? `A score of ${score} reflects moderate exposure. The position is not immediately fragile, but revenue underperformance or a delayed ramp would accelerate capital drawdown. There is limited structural cushion for execution variability.`
                  : `A score of ${score} reflects a structurally fragile position. Capital depth, revenue trajectory, and/or debt exposure are in a range that leaves little margin for error. Strengthening Tier 1 Liquid Capital or compressing outflow before the transition would materially change this reading.`}
              </p>
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
                    <strong className="text-foreground">{pcts[0] + (pcts[1] ?? 0)}% is fixed obligations</strong>. living expenses and debt payments that will not decrease if revenue underperforms. These are the hardest costs to reduce under pressure.
                  </p>
                  {sim.selfEmploymentTax > 0 && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      The <strong className="text-foreground">tax reserve</strong> ({pcts[outflowComponents.findIndex(c => c.val === sim.selfEmploymentTax)]}% of gross outflow) eases naturally in lower-revenue months. giving the outflow structure some flexibility tied to income.
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

          {/* ── 4. Tier 1 Runway Scenarios ──────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={4}
              sub="How long Tier 1 Liquid Capital (cash + brokerage) would last before running out, in each scenario. Revenue stress reduces income; outflow stays constant.">
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
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tier 1 Runway</th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Capital Depth</th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tier 2 Required?</th>
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
              {t3Total > 0 && (
                <p className="text-xs text-muted-foreground leading-relaxed mt-3 pt-3 border-t border-border">
                  <strong className="text-foreground">Tier 2 Required:</strong> When "Yes" appears, the modeled runway requires drawing from retirement accounts or home equity. These assets extend the total timeline but are typically considered emergency capital rather than planned transition funding.
                </p>
              )}
            </div>
          </SectionCard>

          {/* ── 5. Revenue vs. Savings Curve ──────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={5}
              sub="How Tier 1 Liquid Capital depletes over 36 months under base and severe scenarios.">
              Revenue vs. Savings Curve
            </SectionHeader>
            <div className="px-6 pt-5 pb-2">
              <SavingsCurve sim={sim} pas={pas} hc={hc} />
            </div>
            <div className="px-6 pb-5 space-y-2">
              <div className="pt-3 border-t border-border">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Break-even Revenue</p>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">{fmt(sim.tmib)}/month</strong> is the revenue level needed to fully cover the net monthly gap. When revenue reaches this amount, savings stop declining.
                </p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This chart shows how quickly Tier 1 Liquid Capital declines during the early months of the transition. Under expected conditions, revenue ramps toward its target, which stabilizes savings. Under severe underperformance (−30%), savings continue declining until Tier 1 capital is exhausted{psr30 < 999 ? ` around month ${Math.round(psr30)}` : ''}.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The difference between these two paths is not savings size. It is revenue timing and reliability.
              </p>
            </div>
          </SectionCard>

          {/* ── 6. Savings Tier Structure ─────────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={6}
              sub="Your savings are layered by accessibility. Under stress, depletion follows this order. Tier 2 Contingent Capital is emergency capital. Not primary runway.">
              Savings Tier Structure
            </SectionHeader>
            <div className="px-6 py-4">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Tier 1 Liquid Capital <span className="normal-case font-normal text-muted-foreground">(Cash + Brokerage, Stage 1)</span>
                </p>
                <div className="space-y-2">
                  {tier1 > 0 && (
                    <div className="flex items-center justify-between py-3 border border-border rounded-md px-4">
                      <div><p className="text-sm font-medium text-foreground">Cash & HYSA</p><p className="text-xs text-muted-foreground">Counted at 100%. no penalty, no tax, no delay</p></div>
                      <p className="text-sm font-bold text-foreground">{fmt(tier1)}</p>
                    </div>
                  )}
                  {tier2 > 0 && (
                    <div className="flex items-center justify-between py-3 border border-border rounded-md px-4">
                      <div><p className="text-sm font-medium text-foreground">Brokerage accounts</p><p className="text-xs text-muted-foreground">Counted at 80%. selling may trigger capital gains taxes</p></div>
                      <p className="text-sm font-bold text-foreground">{fmt(tier2)}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-3 bg-blue-50 border border-blue-200 rounded-md px-4">
                    <span className="text-sm font-bold text-blue-800">Tier 1 Liquid Capital total</span>
                    <span className="text-base font-bold font-serif text-blue-800" data-testid="text-accessible-capital">{fmt(pas)}</span>
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">
                  Tier 2 Contingent Capital <span className="normal-case font-normal">(Retirement + Home Equity, Stage 2, if needed)</span>
                </p>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  Not considered primary runway. Early access to retirement accounts typically triggers income taxes plus a 10% penalty, permanently reducing long-term compounding. Only used when Stage 1 is exhausted.
                </p>
                {t3Total > 0 ? (
                  <div className="border border-amber-200 rounded-md overflow-hidden">
                    {t3Roth > 0 && (
                      <div className="flex items-center justify-between py-3 px-4 border-b border-amber-100">
                        <div><p className="text-sm font-medium text-foreground">Roth IRA contributions</p><p className="text-xs text-muted-foreground">Counted at 100% (contributions only. still retirement capital)</p></div>
                        <p className="text-sm font-bold text-foreground">{fmt(t3Roth)}</p>
                      </div>
                    )}
                    {t3Trad > 0 && (
                      <div className="flex items-center justify-between py-3 px-4 border-b border-amber-100">
                        <div><p className="text-sm font-medium text-foreground">Traditional IRA / 401(k)</p><p className="text-xs text-muted-foreground">Counted at 50%. income taxes + 10% early withdrawal penalty</p></div>
                        <p className="text-sm font-bold text-foreground">{fmt(t3Trad)}</p>
                      </div>
                    )}
                    {t3RE > 0 && (
                      <div className="flex items-center justify-between py-3 px-4">
                        <div><p className="text-sm font-medium text-foreground">Home equity</p><p className="text-xs text-muted-foreground">Counted at 30%. illiquid, costly to access, market-dependent</p></div>
                        <p className="text-sm font-bold text-foreground">{fmt(t3RE)}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No Tier 2 Contingent Capital entered.</p>
                )}
                {reliesOnRestricted && (
                  <div className="mt-3 flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-md">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Tier 1 Liquid Capital ({fmt(pas)}) covers less than 12 months of net outflow under stress. You are not liquid enough to sustain this transition without entering Tier 2 asset territory. treat that as emergency capital, not a plan.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between py-4 border-t border-border bg-muted/10 -mx-6 px-6 rounded-b-md">
                <span className="text-sm font-bold text-foreground">Full Capital Depth (all tiers)</span>
                <span className="text-xl font-bold font-serif text-foreground">{fmt(sim.accessibleCapital)}</span>
              </div>
            </div>
          </SectionCard>

          {/* ── 7. How to Widen the Runway ───────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={7}
              sub="Four categories of structural options. Each affects Tier 1 Runway under stress. Sensitivity calculations only. No prescriptions.">
              How to Widen the Runway
            </SectionHeader>
            <div className="px-6 py-4">
              {/* Top sensitivity results */}
              {(burnDelta !== null && burnDelta > 0) || (revDelta !== null && revDelta > 0) || hcPct >= 15 ? (
                <div className="mb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3">Your Top Sensitivity Results</p>
                  <div className="space-y-2.5">
                    {burnDelta !== null && burnDelta > 0 && (
                      <div className="flex items-start justify-between gap-4 p-3.5 rounded-md border border-border bg-muted/10">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-foreground mb-0.5">Reduce outflow by $1,000/month</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Outflow drops to <strong className="text-foreground">{fmt(sim.tmib - 1000)}/month</strong>. Tier 1 Runway extends from {fmtRunway(sev30)} to {fmtRunway(burnMinus1k)} under severe stress.
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-1 leading-relaxed">
                            Examples: consolidating subscriptions, refinancing a loan, or eliminating one recurring fixed obligation.
                          </p>
                        </div>
                        <span className="text-sm font-bold text-green-700 shrink-0">+{burnDelta} mo</span>
                      </div>
                    )}
                    {revDelta !== null && revDelta > 0 && (
                      <div className="flex items-start justify-between gap-4 p-3.5 rounded-md border border-border bg-muted/10">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-foreground mb-0.5">Increase revenue target by $1,000/month</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Revenue target rises to <strong className="text-foreground">{fmt(sim.expectedRevenue + 1000)}/month</strong>. Tier 1 Runway extends from {fmtRunway(sev30)} to {fmtRunway(revPlus1k)} under severe stress.
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-1 leading-relaxed">
                            Examples: one small consulting client, two monthly retainer agreements, or one recurring service contract.
                          </p>
                        </div>
                        <span className="text-sm font-bold text-green-700 shrink-0">+{revDelta} mo</span>
                      </div>
                    )}
                    {hcPct >= 15 && (
                      <div className="flex items-start justify-between gap-4 p-3.5 rounded-md border border-border bg-muted/10">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-foreground mb-0.5">Healthcare: {hcPct}% of gross outflow</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            At {fmt(hc)}/month, healthcare is a material outflow component. Partner coverage or income-based ACA subsidies could shift the structure significantly.
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">High leverage</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Four advisory categories */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    title: 'Cash Flow Levers',
                    color: 'border-l-foreground',
                    items: [
                      'Reduce fixed obligations before your transition date.',
                      'Refinance high-interest debt to lower required minimums.',
                      'Trim discretionary spending to increase monthly surplus.',
                      'Convert fixed costs to variable where possible.',
                    ],
                  },
                  {
                    title: 'Revenue De-Risking Levers',
                    color: 'border-l-blue-600',
                    items: [
                      'Secure pre-transition contracts or retainer agreements.',
                      'Maintain part-time or consulting income during the ramp.',
                      'Enter with a client pipeline already in progress.',
                      'Delay the leap to shorten ramp exposure and reduce capital needed.',
                    ],
                  },
                  {
                    title: 'Structural Cushion Levers',
                    color: 'border-l-green-600',
                    items: [
                      'Increase Tier 1 Liquid Capital before making the transition.',
                      'Reduce outstanding leverage before the leap date.',
                      'Shift brokerage holdings to cash to reduce haircut exposure.',
                    ],
                  },
                  {
                    title: 'Risk Compression Tactics',
                    color: 'border-l-amber-600',
                    items: [
                      'Set a 6-month checkpoint with defined revenue thresholds.',
                      'Define a minimum monthly revenue floor before drawing from savings.',
                      'Establish a re-entry trigger: the point at which you return to employment.',
                      'Create a fallback income floor through part-time or contract work.',
                    ],
                  },
                ].map(cat => (
                  <div key={cat.title} className={`p-4 rounded-md border border-border bg-muted/5 border-l-4 ${cat.color}`}>
                    <p className="text-xs font-bold uppercase tracking-wider text-foreground mb-2.5">{cat.title}</p>
                    <ul className="space-y-1.5">
                      {cat.items.map(item => (
                        <li key={item} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                          <span className="text-foreground/30 shrink-0 mt-0.5">&#8226;</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60 italic mt-4 pt-4 border-t border-border">
                These are structural options, not instructions. Each lever has tradeoffs not captured in this model. Consult a qualified professional before making significant financial or career decisions.
              </p>
            </div>
          </SectionCard>

          {/* ── 8. Scenario Comparison Grid ──────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={8}
              sub="All scenarios side by side. Tier 1 Runway = when cash + brokerage runs out. Full Capital Depth uses all accessible savings including restricted assets.">
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
                    { label: 'Tier 1 Runway', vals: [fmtRunway(psrBase), fmtRunway(psr15), fmtRunway(psr30), fmtRunway(psrRampDelay)] },
                    { label: 'Full Capital Depth', vals: [fmtRunway(sim.baseRunway), fmtRunway(sim.runway15Down), fmtRunway(sim.runway30Down), fmtRunway(sim.runwayRampDelay)] },
                    { label: 'Tier 2 Required?', vals: [psrBase, psr15, psr30, psrRampDelay].map((p, i) => {
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

          {/* ── 9. Decision Interpretation ───────────────────────────── */}
          <SectionCard className="mb-6">
            <SectionHeader n={9}>Decision Interpretation</SectionHeader>
            <div className="px-7 py-6 space-y-5">

              {/* Block 1: Structural Stability */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">Structural Stability</p>
                <div className={`flex gap-4 p-5 rounded-lg border ${sc.border} ${sc.bg}`}>
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${sc.border} ${sc.bg} ${sc.text}`}>
                    {score}
                  </div>
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-1.5 ${sc.text}`}>{getScoreLabel(score)}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{advisorSummary}</p>
                  </div>
                </div>
              </div>

              {/* Block 2: Primary Risk Drivers */}
              <div className="pt-4 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">Primary Risk Drivers</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{advisorBestMove}</p>
              </div>

              {/* Block 3: Where Pressure Appears */}
              <div className="pt-4 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">Where Pressure Appears</p>
                {psr30 >= 999 ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    No pressure point was identified within the model range. Under all tested scenarios, Tier 1 Liquid Capital remains solvent.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Under severe revenue contraction (−30%), Tier 1 Liquid Capital would be exhausted in <strong className="text-foreground">{fmtRunway(psr30)}</strong>.{t3Total > 0 && sim.runway30Down > psr30 ? ` Total capital depth extends to ${fmtRunway(sim.runway30Down)} if Tier 2 assets are accessed, but those carry taxes and penalties and should be treated as a last resort.` : ''}
                  </p>
                )}
                {restrictedClarification && (
                  <div className="flex items-start gap-3 mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800 leading-relaxed">{restrictedClarification}</p>
                  </div>
                )}
              </div>

              {/* Block 4: What Would Improve the Position */}
              <div className="pt-4 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">What Would Improve the Position</p>
                <ul className="space-y-1.5">
                  {[
                    'Reduce fixed monthly obligations before the transition date.',
                    'Enter with at least one signed client or confirmed revenue source.',
                    `Increase Tier 1 Liquid Capital before leaving${pas < sim.tmib * 12 ? ' — current level covers less than 12 months of net gap' : ''}.`,
                    'Shorten the revenue ramp by building a client pipeline in advance.',
                    'Ensure partner income is stable and will not be interrupted.',
                  ].map(item => (
                    <li key={item} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="text-foreground/30 shrink-0 mt-0.5">&#8226;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-[10px] text-muted-foreground/60 italic border-t border-border pt-4">
                This report is a financial simulation based on your inputs. It is not financial, tax, or legal advice. All sensitivity calculations show directional impact only. Actual outcomes depend on factors not captured in this model. Consult a qualified professional before making any significant financial decision.
              </p>
            </div>
          </SectionCard>

        </div>
      </div>
    </Layout>
  );
}
