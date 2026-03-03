import { useParams, Link } from "wouter";
import { Download, AlertTriangle, AlertCircle, ChevronRight } from "lucide-react";
import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { useSimulation, useDownloadSimulationPdf } from "../hooks/use-simulations";
import { useToast } from "@/hooks/use-toast";

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const fmtRunway = (n: number) => n >= 999 ? '24+ months' : `${n} months`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

function StatBlock({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: 'red' | 'amber' | 'green' }) {
  const colorClass = accent === 'red' ? 'text-red-700' : accent === 'amber' ? 'text-amber-700' : accent === 'green' ? 'text-green-700' : 'text-foreground';
  return (
    <div className="py-4 border-b border-border last:border-0" data-testid="stat-block">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold font-serif ${colorClass}`}>{value}</p>
      {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-4">{children}</h2>
  );
}

export default function Results() {
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : null;
  const { data: sim, isLoading, isError } = useSimulation(id);
  const downloadPdf = useDownloadSimulationPdf();
  const { toast } = useToast();

  const handleDownload = () => {
    if (!id) return;
    downloadPdf.mutate(id, {
      onError: (err) => toast({ title: "PDF failed", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-muted border-t-foreground rounded-full animate-spin mb-6" />
          <p className="text-sm text-muted-foreground">Running structural models...</p>
        </div>
      </Layout>
    );
  }

  if (isError || !sim) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold font-serif text-foreground mb-2">Report not found</h2>
          <p className="text-sm text-muted-foreground mb-8">This simulation may have expired or been removed.</p>
          <Link href="/simulator"><Button>Start new simulation</Button></Link>
        </div>
      </Layout>
    );
  }

  const score = sim.structuralBreakpointScore;
  const scoreLabel = score >= 66 ? 'Structurally Stable' : score >= 41 ? 'Elevated Caution' : 'High Structural Risk';
  const scoreColor = score >= 66 ? 'text-green-700 border-green-200 bg-green-50' : score >= 41 ? 'text-amber-700 border-amber-200 bg-amber-50' : 'text-red-700 border-red-200 bg-red-50';
  const worstRunway = Math.min(sim.runway15Down, sim.runway30Down, sim.runwayRampDelay);
  const debtFlagged = sim.debtExposureRatio > 0.70;
  const reportDate = new Date(sim.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Narrative
  let narrative = '';
  if (sim.breakpointMonth >= 999) {
    narrative = 'Based on your selected assumptions, your capital position sustains the transition through all modeled stress scenarios. No structural breakpoint identified within the 24-month modeling horizon.';
  } else {
    let failureCause = 'capital depletion';
    if (debtFlagged) failureCause = 'debt stress compounded by capital depletion';
    else if (sim.tmib > sim.accessibleCapital * 0.12) failureCause = 'burn rate exceeding accessible capital reserves';
    narrative = `Based on your selected assumptions, your plan reaches a structural breakpoint in Month ${sim.breakpointMonth} under the ${sim.breakpointScenario} scenario. The primary failure mechanism is ${failureCause}. Base-case runway extends to ${fmtRunway(sim.baseRunway)}.`;
  }

  const ASSET_ROWS = [
    { label: 'Cash & HYSA', raw: sim.cash, haircut: 1.00, note: '×1.00' },
    { label: 'Brokerage (Taxable)', raw: sim.brokerage, haircut: 0.80, note: '×0.80' },
    { label: 'Roth IRA (Contributions)', raw: sim.roth, haircut: 1.00, note: '×1.00' },
    { label: 'Traditional IRA / 401(k)', raw: sim.traditional, haircut: 0.50, note: '×0.50' },
    { label: 'Real Estate Equity', raw: sim.realEstate, haircut: 0.30, note: '×0.30' },
  ];

  const SCENARIOS = [
    { label: 'Base Case', runway: sim.baseRunway },
    { label: '-15% Revenue', runway: sim.runway15Down },
    { label: '-30% Revenue', runway: sim.runway30Down },
    { label: 'Ramp Delay (+3 months)', runway: sim.runwayRampDelay },
  ];

  return (
    <Layout>
      <div className="flex-1 bg-background py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Structural Breakpoint Report</p>
              <h1 className="text-2xl font-bold font-serif text-foreground">Simulation #{sim.id}</h1>
              <p className="text-sm text-muted-foreground">{reportDate}</p>
            </div>
            <Button onClick={handleDownload} disabled={downloadPdf.isPending} className="gap-2 shrink-0" data-testid="button-download-pdf">
              <Download className="w-4 h-4" />
              {downloadPdf.isPending ? 'Generating PDF...' : 'Download Full Report'}
            </Button>
          </div>

          {/* Executive Summary */}
          <div className="border border-border rounded-md mb-6">
            <div className="px-6 py-4 border-b border-border">
              <SectionTitle>Executive Summary</SectionTitle>
            </div>
            <div className="p-6">
              <div className="grid sm:grid-cols-3 gap-6 mb-6">
                {/* Score */}
                <div className={`rounded-md border p-5 text-center ${scoreColor}`}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-70">Structural Breakpoint Score</p>
                  <p className="text-4xl font-bold font-serif mb-1" data-testid="text-score">{score}</p>
                  <p className="text-xs font-semibold">{scoreLabel}</p>
                </div>

                {/* Breakpoint */}
                <div className="sm:col-span-2 flex flex-col justify-between gap-4">
                  <div className={`rounded-md border p-4 ${sim.breakpointMonth >= 999 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1 text-muted-foreground">Structural Breakpoint</p>
                    {sim.breakpointMonth >= 999 ? (
                      <p className="text-sm font-semibold text-green-700">No breakpoint identified — 24+ month horizon is stable</p>
                    ) : (
                      <p className="text-sm font-semibold text-red-700" data-testid="text-breakpoint">Month {sim.breakpointMonth} — {sim.breakpointScenario}</p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-narrative">{narrative}</p>
                </div>
              </div>

              {/* Key metrics */}
              <div className="grid sm:grid-cols-4 gap-4">
                <div className="bg-muted/30 rounded-md p-4" data-testid="metric-tmib">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">True Monthly Burn</p>
                  <p className="text-lg font-bold font-serif text-foreground">{fmt(sim.tmib)}</p>
                </div>
                <div className="bg-muted/30 rounded-md p-4" data-testid="metric-capital">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Accessible Capital</p>
                  <p className="text-lg font-bold font-serif text-foreground">{fmt(sim.accessibleCapital)}</p>
                </div>
                <div className="bg-muted/30 rounded-md p-4" data-testid="metric-base-runway">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Base-Case Runway</p>
                  <p className="text-lg font-bold font-serif text-foreground">{fmtRunway(sim.baseRunway)}</p>
                </div>
                <div className="bg-muted/30 rounded-md p-4" data-testid="metric-worst-runway">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Worst-Case Runway</p>
                  <p className="text-lg font-bold font-serif text-foreground">{fmtRunway(worstRunway)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">

            {/* Structural Exposure */}
            <div className="border border-border rounded-md">
              <div className="px-6 py-4 border-b border-border">
                <SectionTitle>Structural Exposure</SectionTitle>
              </div>
              <div className="px-6 py-2">
                <StatBlock label="Total Outstanding Debt" value={fmt(sim.totalDebt)} />
                <StatBlock label="Monthly Debt Service" value={fmt(sim.monthlyDebtPayments)} />
                <StatBlock
                  label="Debt-to-Capital Ratio"
                  value={fmtPct(sim.debtExposureRatio)}
                  note={debtFlagged ? 'Elevated structural risk — exceeds 70% threshold' : 'Within manageable parameters'}
                  accent={debtFlagged ? 'red' : 'green'}
                />
                <StatBlock
                  label="Healthcare Coverage"
                  value={sim.healthcareMonthlyCost === 0 ? 'No additional cost' : `${fmt(sim.healthcareMonthlyCost)}/month`}
                  note={sim.healthcareRisk}
                />
              </div>
              {debtFlagged && (
                <div className="mx-6 mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">Debt exceeds 70% of accessible capital. This represents an elevated structural risk.</p>
                </div>
              )}
            </div>

            {/* TMIB Breakdown */}
            <div className="border border-border rounded-md">
              <div className="px-6 py-4 border-b border-border">
                <SectionTitle>True Monthly Independence Burn</SectionTitle>
              </div>
              <div className="px-6 py-2">
                {[
                  { label: 'Living Expenses', val: sim.livingExpenses },
                  { label: 'Healthcare (Estimated)', val: sim.healthcareMonthlyCost },
                  { label: 'Monthly Debt Payments', val: sim.monthlyDebtPayments },
                  { label: 'Self-Employment Tax (28%)', val: sim.selfEmploymentTax },
                  { label: 'Business Operating Cost', val: sim.businessCostBaseline },
                  { label: 'Less: Partner Income', val: -sim.partnerIncome, subtract: true },
                ].filter(r => r.val !== 0).map(row => (
                  <div key={row.label} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className={`text-sm font-semibold ${row.subtract ? 'text-green-700' : 'text-foreground'}`}>
                      {row.subtract ? `(${fmt(Math.abs(row.val))})` : fmt(row.val)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-3 pt-4">
                  <span className="text-sm font-bold text-foreground uppercase tracking-wider">Total TMIB</span>
                  <span className="text-lg font-bold font-serif text-foreground" data-testid="text-tmib-total">{fmt(sim.tmib)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Revenue Shock Simulation */}
          <div className="border border-border rounded-md mb-6">
            <div className="px-6 py-4 border-b border-border">
              <SectionTitle>Revenue Shock Simulation</SectionTitle>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-scenarios">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scenario</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Runway</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Breakpoint</th>
                  </tr>
                </thead>
                <tbody>
                  {SCENARIOS.map((s, i) => {
                    const bp = s.runway >= 999 ? 'None identified' : `Month ${s.runway}`;
                    const color = s.runway >= 999 ? 'text-green-700' : s.runway < 12 ? 'text-red-700' : 'text-amber-700';
                    return (
                      <tr key={s.label} className={`border-t border-border ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                        <td className="px-6 py-4 text-sm text-foreground font-medium">{s.label}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">{fmtRunway(s.runway)}</td>
                        <td className={`px-6 py-4 text-sm font-semibold ${color}`}>{bp}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Liquidity Defense Map */}
          <div className="border border-border rounded-md mb-6">
            <div className="px-6 py-4 border-b border-border">
              <SectionTitle>Liquidity Defense Map</SectionTitle>
            </div>
            <div className="px-6 py-2">
              {ASSET_ROWS.map(row => {
                const counted = Math.round(row.raw * row.haircut);
                const pct = (row.haircut * 100).toFixed(0);
                return (
                  <div key={row.label} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div>
                      <span className="text-sm font-medium text-foreground">{row.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{row.note} — counted at {pct}%</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">{fmt(row.raw)} declared</div>
                      <div className="text-sm font-bold text-foreground">{fmt(counted)} counted</div>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between py-4 mt-1 bg-muted/30 px-3 rounded-md">
                <span className="text-sm font-bold uppercase tracking-wider text-foreground">Total Accessible Capital</span>
                <span className="text-lg font-bold font-serif text-foreground" data-testid="text-accessible-capital">{fmt(sim.accessibleCapital)}</span>
              </div>
            </div>
          </div>

          {/* Download */}
          <div className="border border-border rounded-md p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Full PDF Report Available</p>
              <p className="text-xs text-muted-foreground">5-page structured memo including controlled exit conditions and deterministic recommendations.</p>
            </div>
            <Button onClick={handleDownload} disabled={downloadPdf.isPending} className="gap-2 shrink-0" variant="outline" data-testid="button-download-pdf-bottom">
              <Download className="w-4 h-4" />
              {downloadPdf.isPending ? 'Generating...' : 'Download PDF Report'}
            </Button>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground text-center mt-8 leading-relaxed max-w-2xl mx-auto">
            This report is an educational financial simulation based on user-provided inputs and estimated U.S. averages. It is not financial, tax, or legal advice. Consult a qualified professional before making any major financial decisions.
          </p>

        </div>
      </div>
    </Layout>
  );
}
