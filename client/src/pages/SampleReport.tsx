import { Simulation } from "@shared/schema";
import Layout from "../components/Layout";
import { useState } from "react";
import { useSEO } from "../hooks/use-seo";
import { CheckCircle2, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

// --- Mock Data ---

const scenarios: Record<string, Partial<Simulation>> = {
  "Moderately Exposed": {
    currentSalary: 150000,
    livingExpenses: 6000,
    monthlyDebtPayments: 1500,
    expectedRevenue: 8000,
    cash: 45000,
    brokerage: 20000,
    tmib: 9250,
    accessibleCapital: 61000,
    structuralBreakpointScore: 54,
    baseRunway: 14,
    runway30Down: 8,
  },
  "Structurally Stable": {
    currentSalary: 180000,
    livingExpenses: 5000,
    monthlyDebtPayments: 500,
    expectedRevenue: 12000,
    cash: 85000,
    brokerage: 50000,
    tmib: 7800,
    accessibleCapital: 125000,
    structuralBreakpointScore: 82,
    baseRunway: 36,
    runway30Down: 24,
  },
  "Structurally Fragile": {
    currentSalary: 110000,
    livingExpenses: 7000,
    monthlyDebtPayments: 2500,
    expectedRevenue: 5000,
    cash: 15000,
    brokerage: 5000,
    tmib: 11500,
    accessibleCapital: 19000,
    structuralBreakpointScore: 28,
    baseRunway: 3,
    runway30Down: 1,
  },
};

// --- Shared UI Components (Recreated from Results.tsx patterns) ---

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-border rounded-lg shadow-sm bg-white dark:bg-card overflow-hidden ${className}`}>
      {children}
    </div>
  );
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

function ScoreRing({ score, accent }: { score: number; accent: string }) {
  const R = 44, cx = 60, cy = 60;
  const circ = 2 * Math.PI * R;
  const filled = (score / 100) * circ;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-label={`Score: ${score} out of 100`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={accent} strokeWidth="10"
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="23" fontWeight="700"
        fill="#1e293b" fontFamily="Georgia, serif">{score}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize="7.5" fill="#64748b"
        fontFamily="sans-serif" letterSpacing="0.05em">OUT OF 100</text>
    </svg>
  );
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function fmtRunway(months: number): string {
  if (months >= 999) return 'Sustainable Runway';
  if (months <= 0) return 'Less than 1 month';
  const yrs = Math.floor(months / 12);
  const mo = months % 12;
  if (yrs === 0) return `${mo} month${mo !== 1 ? 's' : ''}`;
  if (mo === 0) return `${yrs} year${yrs !== 1 ? 's' : ''}`;
  return `${yrs} year${yrs !== 1 ? 's' : ''}, ${mo} month${mo !== 1 ? 's' : ''}`;
}

export default function SampleReport() {
  const [activeTab, setActiveTab] = useState("Moderately Exposed");
  const sim = scenarios[activeTab] as Simulation;

  useSEO({
    title: "Sample Report Preview | QuitReady",
    description: "Explore a sample QuitReady report across three different financial scenarios. See how our stress tests and structural math work before you buy.",
  });

  const getScoreColors = (score: number) => {
    if (score >= 70) return { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', accent: '#16a34a' };
    if (score >= 50) return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', accent: '#d97706' };
    return { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', accent: '#dc2626' };
  };

  const scoreColors = getScoreColors(sim.structuralBreakpointScore);

  const lockedSections = [
    "Outflow Composition & Tax Reserves",
    "Healthcare Transition Analysis",
    "Capital Layering & Liquidity Tiers",
    "Revenue Sensitivity Analysis",
    "36-Month Growth Trajectories",
    "Decision Interpretation",
    "Severe Stress Scenario Modeling",
    "Delayed Revenue Ramp Analysis",
    "Final Structural Assessment"
  ];

  return (
    <Layout>
      {/* Top Banner */}
      <div className="bg-primary/5 border-b border-primary/10 py-3 text-center">
        <p className="text-sm font-medium text-primary">
          Sample Report — Demo Data Only. Your report uses your actual financial inputs.
        </p>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12 pb-32">
        <header className="mb-12 text-center">
          <h1 className="text-3xl font-bold font-serif mb-4">Sample Readiness Report</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Toggle between scenarios to see how the engine evaluates different financial positions.
            The first 3 sections are fully visible; sections 4–12 are available in the full 17-page PDF.
          </p>
        </header>

        {/* Tab Selector */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {Object.keys(scenarios).map((name) => (
            <button
              key={name}
              onClick={() => setActiveTab(name)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                activeTab === name
                  ? "bg-foreground text-background shadow-md scale-105"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="space-y-8">
          {/* Section 1: Executive Snapshot */}
          <SectionCard>
            <SectionHeader n={1} sub="A high-level summary of your core financial pillars after exiting employment.">
              Executive Snapshot
            </SectionHeader>
            <div className="p-7 grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Target Revenue</p>
                <p className="text-xl font-bold font-serif">{fmt(sim.expectedRevenue)}<span className="text-xs font-normal text-muted-foreground ml-1">/mo</span></p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Monthly Outflow</p>
                <p className="text-xl font-bold font-serif text-red-600">{fmt(sim.tmib)}<span className="text-xs font-normal text-muted-foreground ml-1">/mo</span></p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Structural Margin</p>
                <p className={`text-xl font-bold font-serif ${sim.expectedRevenue >= sim.tmib ? 'text-green-600' : 'text-red-600'}`}>
                  {fmt(sim.expectedRevenue - sim.tmib)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Liquid Capital</p>
                <p className="text-xl font-bold font-serif text-primary">{fmt(sim.accessibleCapital)}</p>
              </div>
            </div>
          </SectionCard>

          {/* Section 2: Structural Breakpoint Score */}
          <SectionCard>
            <SectionHeader n={2} sub="Our proprietary 0–100 score measuring your financial resilience against revenue volatility and ramp delays.">
              Structural Breakpoint Score
            </SectionHeader>
            <div className="p-7 flex flex-col md:flex-row items-center gap-10">
              <div className="shrink-0">
                <ScoreRing score={sim.structuralBreakpointScore} accent={scoreColors.accent} />
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-3 ${scoreColors.bg} ${scoreColors.text} border ${scoreColors.border}`}>
                  {activeTab}
                </div>
                <h3 className="text-xl font-bold font-serif mb-2">
                  Your score is {sim.structuralBreakpointScore}/100
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Based on your inputs, your transition model is considered <span className="font-semibold text-foreground">{activeTab.toLowerCase()}</span>. 
                  This score accounts for your debt-to-capital ratio, your monthly burn vs. revenue targets, and your Tier 1 liquidity reserves.
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Section 3: Savings Runway Summary */}
          <SectionCard>
            <SectionHeader n={3} sub="How long your capital lasts across different market conditions.">
              Savings Runway Summary
            </SectionHeader>
            <div className="p-7 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Base Case Runway</p>
                  <p className="text-2xl font-bold font-serif">{fmtRunway(sim.baseRunway)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Assuming 100% revenue achievement</p>
                </div>
                <div className="p-4 bg-red-50/50 dark:bg-red-950/10 rounded-lg border border-red-100 dark:border-red-900/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 mb-1">Severe Stress Runway</p>
                  <p className="text-2xl font-bold font-serif text-red-700 dark:text-red-400">{fmtRunway(sim.runway30Down)}</p>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">Assuming -30% revenue volatility</p>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Locked Sections Preview */}
          <div className="space-y-6 pt-8">
            <h3 className="text-lg font-bold font-serif text-center mb-8">Full Report Content (Locked)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lockedSections.map((title, i) => (
                <div key={title} className="relative group overflow-hidden rounded-lg border border-border bg-card">
                  <div className="p-6 flex items-center justify-between opacity-40 grayscale blur-[1px]">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground">0{i + 4}</span>
                      <span className="text-sm font-semibold">{title}</span>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-white dark:bg-card px-3 py-1.5 rounded-md border border-border shadow-sm flex items-center gap-2">
                      <Lock className="w-3 h-3 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Unlocked after purchase</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border z-[100] py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
              <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold">Generate Your Personalized Report</p>
              <p className="text-xs text-muted-foreground">$19.99 · Instant 17-page PDF download</p>
            </div>
          </div>
          <Link href="/app">
            <Button size="lg" className="w-full sm:w-auto font-bold group" data-testid="button-sample-cta">
              Get Started Now
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
