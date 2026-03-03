import { Link } from "wouter";
import Layout from "../components/Layout";
import { ArrowRight, AlertTriangle, TrendingDown, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "@assets/626986E9-B8B4-462B-8F52-CB974B10376C_1772499495236.png";

export default function Home() {
  return (
    <Layout>
      <div className="flex-1 flex flex-col">

        {/* Hero */}
        <section className="border-b border-border bg-card">
          <div className="max-w-5xl mx-auto px-6 lg:px-8 py-24 md:py-32">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-6">
                Structural Breakpoint Simulator
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-[3.25rem] font-bold font-serif text-foreground leading-[1.1] mb-8">
                If you quit your job,<br />what breaks first — and when?
              </h1>
              <p className="text-lg text-muted-foreground mb-10 leading-relaxed max-w-2xl">
                QuitReady is a conservative, deterministic financial stress engine for professionals modeling an employment exit. It does not measure your potential. It measures your runway.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 items-start flex-wrap">
                <Link href="/simulator">
                  <Button size="lg" className="gap-2 group" data-testid="button-start-simulation">
                    Begin Simulation
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </Link>
                <div className="flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-md px-4 py-2 bg-background">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"></span>
                  Approx. 5 minutes
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What this is */}
        <section className="py-20 bg-background border-b border-border">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <div className="grid md:grid-cols-3 gap-12">

              <div>
                <div className="w-8 h-8 flex items-center justify-center mb-5">
                  <TrendingDown className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="text-lg font-bold font-serif text-foreground mb-3">Liquidity Defense Map</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Conservative haircuts are applied to each asset class. Cash counts at 100%. Retirement accounts at 50%. Real estate at 30%. Your accessible capital is calculated honestly.
                </p>
              </div>

              <div>
                <div className="w-8 h-8 flex items-center justify-center mb-5">
                  <AlertTriangle className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="text-lg font-bold font-serif text-foreground mb-3">Revenue Shock Scenarios</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Your model is automatically stress-tested at base case, -15%, -30% revenue, and delayed ramp. You do not select these — they are built into every simulation.
                </p>
              </div>

              <div>
                <div className="w-8 h-8 flex items-center justify-center mb-5">
                  <Shield className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="text-lg font-bold font-serif text-foreground mb-3">Structural Breakpoint</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The output is a specific month, a specific scenario, and a specific failure cause. Not a motivational score. A structural analysis.
                </p>
              </div>

            </div>
          </div>
        </section>

        {/* What this isn't */}
        <section className="py-16 bg-card border-b border-border">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-12 items-start">
              <div>
                <h2 className="text-2xl font-bold font-serif text-foreground mb-6">This is not financial advice.</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  QuitReady is a deterministic simulation engine. It applies fixed mathematical formulas to your inputs and returns a structural analysis.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  It does not assess your business quality, your talent, your motivation, or your likelihood of success. It measures whether your financial structure can sustain the transition period.
                </p>
              </div>
              <div className="space-y-3">
                {[
                  'Not financial advice',
                  'Not tax advice',
                  'Not a business coach',
                  'Not a budgeting app',
                  'Not a motivational tool',
                ].map(item => (
                  <div key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-foreground">
          <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
            <img src={logoUrl} alt="QuitReady" className="h-8 w-auto mx-auto mb-8 brightness-0 invert opacity-70" />
            <h2 className="text-3xl font-bold font-serif text-background mb-4">
              Run your structural model.
            </h2>
            <p className="text-muted mb-8 text-sm max-w-md mx-auto text-background/60">
              Based on your selected assumptions, when does your plan break — and what breaks it first?
            </p>
            <Link href="/simulator">
              <Button variant="outline" size="lg" className="gap-2 bg-transparent border-background/30 text-background" data-testid="button-start-simulation-cta">
                Begin Simulation
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </section>

      </div>
    </Layout>
  );
}
