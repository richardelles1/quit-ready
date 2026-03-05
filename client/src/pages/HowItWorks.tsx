import Layout from "../components/Layout";
import { useSEO } from "@/hooks/use-seo";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, ArrowRight, Shield, Zap, BarChart3, Calculator } from "lucide-react";

export default function HowItWorks() {
  useSEO({
    title: "How QuitReady Works — Financial Runway Simulator | QuitReady",
    description: "Learn how the QuitReady engine stress-tests your financial model across 4 scenarios to determine your structural readiness to quit your job.",
  });

  const phases = [
    {
      title: "Phase 1 — Structural Burn",
      icon: <Zap className="w-5 h-5 text-primary" />,
      description: "We audit your non-negotiable monthly outflow.",
      items: [
        "Baseline household living expenses",
        "Contractual debt obligations (mortgage, loans)",
        "Healthcare transition delta (COBRA vs ACA)",
        "Partner income offsets (if applicable)"
      ]
    },
    {
      title: "Phase 2 — Liquidity Layers",
      icon: <Shield className="w-5 h-5 text-primary" />,
      description: "We categorize and 'haircut' your capital based on accessibility.",
      items: [
        "Tier 1: Cash and fully liquid savings (100% value)",
        "Tier 2: Brokerage and taxable investments (80% value)",
        "Tier 3: Retirement accounts (50% value due to penalties)",
        "Tier 3: Home equity and illiquid assets (30% value)"
      ]
    },
    {
      title: "Phase 3 — Income Plan",
      icon: <BarChart3 className="w-5 h-5 text-primary" />,
      description: "We model your business revenue and ramp timeline.",
      items: [
        "Business operating costs (Solo vs Agency vs SaaS)",
        "Expected steady-state revenue targets",
        "Conservative ramp duration (assumes 50% during ramp)",
        "Income volatility and reliability scoring"
      ]
    }
  ];

  return (
    <Layout>
      <div className="flex-1 bg-background">
        {/* Hero Section */}
        <section className="py-16 px-4 border-b border-border bg-muted/20">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground mb-6">
              The Engine Behind the Analysis
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              QuitReady doesn't just subtract expenses from savings. We stress-test your survival across three phases of financial structure.
            </p>
          </div>
        </section>

        {/* Phase Cards */}
        <section className="py-16 px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {phases.map((phase, idx) => (
                <Card key={idx} className="flex flex-col">
                  <CardHeader className="gap-1">
                    <div className="flex items-center gap-2 mb-2">
                      {phase.icon}
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Phase {idx + 1}</span>
                    </div>
                    <CardTitle className="text-xl">{phase.title.split('—')[1].trim()}</CardTitle>
                    <CardDescription>{phase.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-3">
                      {phase.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* What the Engine Calculates */}
        <section className="py-16 px-4 bg-muted/30 border-y border-border">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold font-serif text-foreground mb-8 text-center">What the Engine Calculates</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">TMIB</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Total Monthly Income Burden. The exact dollar amount your business must generate after-tax to keep your household at its current standard of living.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">Scenario Stress Tests</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We run your model through four scenarios: Base Case, Volatility Hit (-15%), Structural Stress (-30%), and the Delayed Ramp (3-month delay).
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">ACA Subsidy Math</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The simulator estimates your marketplace subsidies based on projected MAGI (Modified Adjusted Gross Income) to reflect real healthcare costs.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">Structural Breakpoint Score</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A 0–100 proprietary score weighting Liquidity, Leverage, Burn Stability, Revenue Ramp, and Scenario Sensitivity.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Report Content */}
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold font-serif text-foreground mb-8 text-center">What the 17-Page Report Contains</h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <div className="p-6 border-b sm:border-b-0 sm:border-r border-border">
                  <ul className="space-y-3">
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Executive Snapshot</li>
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Structural Breakpoint Score</li>
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Savings Runway Summary</li>
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Monthly Burn Breakdown</li>
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Healthcare Transition Delta</li>
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Revenue Growth Trajectory</li>
                  </ul>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Stress Scenario Modeling</li>
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Sensitivity Analysis</li>
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Liquidity Layer Audit</li>
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Structural Assessment</li>
                    <li className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Decision Interpretation</li>
                    <li className="text-sm flex items-center gap-2 font-bold text-primary"><CheckCircle2 className="w-4 h-4" /> Full 17-page PDF Layout</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who This Is For */}
        <section className="py-16 px-4 bg-foreground text-background">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold font-serif mb-6">Who This Is For</h2>
            <p className="text-lg opacity-80 mb-8 leading-relaxed">
              QuitReady is built for W-2 employees considering a transition to freelance, consulting, or starting a services-based business. 
              Our logic is tuned specifically for U.S. tax codes, ACA healthcare subsidies, and the specific structural risks of the American professional exit.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm font-semibold opacity-70">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> U.S. Tax Logic</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> ACA-Aware</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Service-Business Focused</span>
            </div>
          </div>
        </section>

        {/* Timeline and CTA */}
        <section className="py-20 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold font-serif text-foreground mb-4">Ready to Run Your Model?</h2>
            <p className="text-muted-foreground mb-10">
              It takes approximately 5 minutes to complete the simulation. You'll get instant results on screen, and can unlock the full 17-page report for $19.99.
            </p>
            <Link href="/app">
              <Button size="lg" className="px-8 h-12 text-lg gap-2" data-testid="button-cta-howitworks">
                Start Your Simulation <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
