import { useParams, Link } from "wouter";
import { Download, AlertTriangle, AlertCircle } from "lucide-react";
import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { useSimulation, useDownloadSimulationPdf } from "../hooks/use-simulations";
import { useToast } from "@/hooks/use-toast";

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const fmtRunway = (n: number) => n >= 999 ? '24+ months' : `${n} month${n === 1 ? '' : 's'}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

// ─── Small shared components ──────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">{children}</p>;
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-border rounded-md ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-b border-border">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</p>
    </div>
  );
}

function MetricRow({ label, value, note, highlight }: { label: string; value: string; note?: string; highlight?: 'red' | 'amber' | 'green' | null }) {
  const valueColor = highlight === 'red' ? 'text-red-700' : highlight === 'amber' ? 'text-amber-700' : highlight === 'green' ? 'text-green-700' : 'text-foreground';
  return (
    <div className="flex items-start justify-between py-4 border-b border-border last:border-0 gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        {note && <p className="text-xs text-muted-foreground/70 mt-0.5 leading-snug">{note}</p>}
      </div>
      <p className={`text-base font-bold font-serif shrink-0 ${valueColor}`}>{value}</p>
    </div>
  );
}

// ─── Narrative generator (deterministic) ─────────────────────────────────
function buildNarrative(sim: {
  tmib: number; accessibleCapital: number; baseRunway: number;
  runway30Down: number; breakpointMonth: number; breakpointScenario: string;
  debtExposureRatio: number; structuralBreakpointScore: number;
}): string {
  const { tmib, accessibleCapital, baseRunway, runway30Down, breakpointMonth, breakpointScenario, debtExposureRatio } = sim;

  if (breakpointMonth >= 999) {
    return `Your capital position of ${fmt(accessibleCapital)} sustains a monthly burn of ${fmt(tmib)} across all modeled stress scenarios. No structural breakpoint was identified within the 24-month horizon. Base-case runway extends beyond tracking — your primary remaining variable is revenue execution.`;
  }

  let primaryConstraint = 'capital depletion against burn rate';
  if (debtExposureRatio > 0.70) primaryConstraint = 'debt service compounding against depleting capital';
  else if (tmib > accessibleCapital * 0.12) primaryConstraint = 'monthly burn rate relative to accessible reserves';

  const worstCaseStr = runway30Down >= 999 ? '24+ months' : `Month ${runway30Down}`;

  return `With a monthly independence burn of ${fmt(tmib)} and accessible capital of ${fmt(accessibleCapital)}, your base-case runway extends to ${fmtRunway(baseRunway)}. Under a -30% revenue reduction, the plan structurally fails at ${worstCaseStr}. The primary constraint is ${primaryConstraint}. The earliest breakpoint occurs in Month ${breakpointMonth} under the ${breakpointScenario} scenario.`;
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
          <p className="text-sm text-muted-foreground max-w-xs">This simulation may have expired. Start a new one to generate a fresh report.</p>
          <Link href="/simulator"><Button>Start new simulation</Button></Link>
        </div>
      </Layout>
    );
  }

  // Derived values
  const worstRunway = Math.min(sim.runway15Down, sim.runway30Down, sim.runwayRampDelay);
  const debtFlagged = sim.debtExposureRatio > 0.70;
  const score = sim.structuralBreakpointScore;
  const scoreLabel = score >= 66 ? 'Structurally stable' : score >= 41 ? 'Elevated caution' : 'High structural risk';
  const scoreColor = score >= 66 ? 'text-green-700' : score >= 41 ? 'text-amber-700' : 'text-red-700';
  const scoreBg = score >= 66 ? 'border-green-200 bg-green-50' : score >= 41 ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50';
  const reportDate = new Date(sim.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const narrative = buildNarrative(sim);

  const ASSET_ROWS = [
    { label: 'Cash & HYSA',               raw: sim.cash,       haircut: 1.00, tag: 'Full value' },
    { label: 'Brokerage (Taxable)',        raw: sim.brokerage,  haircut: 0.80, tag: '×0.80' },
    { label: 'Roth IRA (Contributions)',   raw: sim.roth,       haircut: 1.00, tag: 'Full value' },
    { label: 'Traditional IRA / 401(k)',   raw: sim.traditional,haircut: 0.50, tag: '×0.50' },
    { label: 'Real Estate Equity',         raw: sim.realEstate, haircut: 0.30, tag: '×0.30' },
  ];

  const SCENARIOS = [
    { label: 'Base case',              runway: sim.baseRunway },
    { label: '-15% revenue shock',     runway: sim.runway15Down },
    { label: '-30% revenue shock',     runway: sim.runway30Down },
    { label: 'Ramp delayed +3 months', runway: sim.runwayRampDelay },
  ];

  const TMIB_ROWS = [
    { label: 'Living expenses',                  val: sim.livingExpenses },
    { label: 'Healthcare coverage (estimated)',   val: sim.healthcareMonthlyCost },
    { label: 'Monthly debt payments',             val: sim.monthlyDebtPayments },
    { label: 'Self-employment tax reserve (28%)', val: sim.selfEmploymentTax },
    { label: 'Business operating cost',           val: sim.businessCostBaseline },
    { label: 'Less: partner income',              val: -sim.partnerIncome, subtract: true },
  ].filter(r => r.val !== 0);

  return (
    <Layout>
      <div className="flex-1 bg-background py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {/* Page header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Structural Breakpoint Report · {reportDate}</p>
              <h1 className="text-3xl font-bold font-serif text-foreground leading-tight">
                Here's what would break first — and when.
              </h1>
            </div>
            <Button onClick={handleDownload} disabled={downloadPdf.isPending} variant="outline" className="gap-2 shrink-0" data-testid="button-download-pdf">
              <Download className="w-4 h-4" />
              {downloadPdf.isPending ? 'Generating...' : 'Download full report'}
            </Button>
          </div>

          {/* Hero summary */}
          <SectionCard className="mb-6">
            <div className="p-6 sm:p-8">
              <div className="grid sm:grid-cols-3 gap-6 mb-6">

                {/* Score */}
                <div className={`rounded-md border p-5 ${scoreBg}`}>
                  <Label>Breakpoint score</Label>
                  <p className={`text-4xl font-bold font-serif mb-1.5 ${scoreColor}`} data-testid="text-score">
                    {score}<span className="text-lg font-normal">/100</span>
                  </p>
                  <p className={`text-xs font-semibold ${scoreColor}`}>{scoreLabel}</p>
                </div>

                {/* Primary constraint + margin */}
                <div className="sm:col-span-2 flex flex-col gap-3">
                  <div>
                    <Label>Primary constraint</Label>
                    {sim.breakpointMonth >= 999 ? (
                      <p className="text-sm font-semibold text-green-700">No structural breakpoint identified — 24+ month horizon is clear</p>
                    ) : (
                      <p className="text-sm font-semibold text-foreground" data-testid="text-breakpoint">
                        Month {sim.breakpointMonth} — {sim.breakpointScenario}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Margin for error</Label>
                    <p className="text-sm font-semibold text-foreground">
                      {worstRunway >= 999 ? 'Stable across all scenarios' : `Worst-case runway: ${fmtRunway(worstRunway)}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Narrative */}
              <div className="border-t border-border pt-5">
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-narrative">{narrative}</p>
              </div>

              {/* Key numbers */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                {[
                  { label: 'Monthly burn', val: fmt(sim.tmib), testid: 'metric-tmib' },
                  { label: 'Accessible capital', val: fmt(sim.accessibleCapital), testid: 'metric-capital' },
                  { label: 'Base runway', val: fmtRunway(sim.baseRunway), testid: 'metric-base-runway' },
                  { label: 'Worst-case runway', val: fmtRunway(worstRunway), testid: 'metric-worst-runway' },
                ].map(m => (
                  <div key={m.label} className="bg-muted/30 rounded-md p-4" data-testid={m.testid}>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{m.label}</p>
                    <p className="text-base font-bold font-serif text-foreground">{m.val}</p>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">

            {/* Structural exposure */}
            <SectionCard>
              <SectionHeader>Structural exposure</SectionHeader>
              <div className="px-6 py-2">
                <MetricRow label="Total outstanding debt" value={fmt(sim.totalDebt)} />
                <MetricRow label="Monthly debt service" value={fmt(sim.monthlyDebtPayments)} />
                <MetricRow
                  label="Debt-to-capital ratio"
                  value={fmtPct(sim.debtExposureRatio)}
                  note={debtFlagged ? 'Exceeds 70% threshold — elevated structural risk' : 'Within manageable range'}
                  highlight={debtFlagged ? 'red' : 'green'}
                />
                <MetricRow
                  label="Healthcare coverage"
                  value={sim.healthcareMonthlyCost === 0 ? 'No cost' : `${fmt(sim.healthcareMonthlyCost)}/mo`}
                  note={sim.healthcareRisk}
                />
              </div>
              {debtFlagged && (
                <div className="mx-4 mb-4 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">Debt exceeds 70% of accessible capital. This is a primary structural risk factor.</p>
                </div>
              )}
            </SectionCard>

            {/* TMIB breakdown */}
            <SectionCard>
              <SectionHeader>Monthly burn breakdown</SectionHeader>
              <div className="px-6 py-2">
                {TMIB_ROWS.map(row => (
                  <div key={row.label} className="flex items-center justify-between py-3.5 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className={`text-sm font-semibold ${(row as { subtract?: boolean }).subtract ? 'text-green-700' : 'text-foreground'}`}>
                      {(row as { subtract?: boolean }).subtract ? `(${fmt(Math.abs(row.val))})` : fmt(row.val)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-4">
                  <span className="text-sm font-bold text-foreground">True monthly burn</span>
                  <span className="text-lg font-bold font-serif text-foreground" data-testid="text-tmib-total">{fmt(sim.tmib)}</span>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Revenue shock table */}
          <SectionCard className="mb-6">
            <SectionHeader>Revenue shock simulation</SectionHeader>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-scenarios">
                <thead>
                  <tr className="bg-muted/30">
                    {['Scenario', 'Runway', 'Breaks at'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SCENARIOS.map((s, i) => {
                    const bp = s.runway >= 999 ? 'No breakpoint' : `Month ${s.runway}`;
                    const color = s.runway >= 999 ? 'text-green-700' : s.runway < 12 ? 'text-red-700' : 'text-amber-700';
                    return (
                      <tr key={s.label} className={`border-t border-border ${i % 2 !== 0 ? 'bg-muted/10' : ''}`}>
                        <td className="px-6 py-4 text-sm font-medium text-foreground">{s.label}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{fmtRunway(s.runway)}</td>
                        <td className={`px-6 py-4 text-sm font-bold ${color}`}>{bp}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Liquidity defense map */}
          <SectionCard className="mb-6">
            <SectionHeader>Liquidity defense map</SectionHeader>
            <div className="px-6 py-2">
              {ASSET_ROWS.filter(r => r.raw > 0).map(row => {
                const counted = Math.round(row.raw * row.haircut);
                const pct = (row.haircut * 100).toFixed(0);
                const barWidth = Math.round(row.haircut * 100);
                return (
                  <div key={row.label} className="py-4 border-b border-border last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-medium text-foreground">{row.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">counted at {pct}%</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground block">{fmt(row.raw)} declared</span>
                        <span className="text-sm font-bold text-foreground">{fmt(counted)} accessible</span>
                      </div>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-foreground/60 rounded-full" style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>
                );
              })}
              {ASSET_ROWS.every(r => r.raw === 0) && (
                <p className="py-4 text-sm text-muted-foreground">No asset values recorded.</p>
              )}
              <div className="flex items-center justify-between py-4 mt-1 bg-muted/20 -mx-6 px-6 rounded-b-md">
                <span className="text-sm font-bold text-foreground">Total accessible capital</span>
                <span className="text-lg font-bold font-serif text-foreground" data-testid="text-accessible-capital">{fmt(sim.accessibleCapital)}</span>
              </div>
            </div>
          </SectionCard>

          {/* Download CTA */}
          <div className="border border-border rounded-md p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-sm font-semibold text-foreground">Full PDF report — 5 pages</p>
              <p className="text-xs text-muted-foreground mt-0.5">Includes controlled exit conditions and deterministic scenario analysis.</p>
            </div>
            <Button onClick={handleDownload} disabled={downloadPdf.isPending} className="gap-2 shrink-0" data-testid="button-download-pdf-bottom">
              <Download className="w-4 h-4" />
              {downloadPdf.isPending ? 'Generating...' : 'Download PDF'}
            </Button>
          </div>

          {/* New simulation */}
          <div className="text-center mb-4">
            <Link href="/simulator">
              <button className="text-sm text-muted-foreground underline underline-offset-2">
                Run a new simulation with different assumptions
              </button>
            </Link>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-2xl mx-auto">
            This report is an educational financial simulation based on user-provided inputs and estimated U.S. averages. It is not financial, tax, or legal advice. Consult a qualified professional before making any major financial decisions.
          </p>

        </div>
      </div>
    </Layout>
  );
}
