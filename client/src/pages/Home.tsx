import { Link } from "wouter";
import Layout from "../components/Layout";
import { Button } from "../components/Button";
import { ArrowRight, ShieldCheck, Target, LineChart } from "lucide-react";

export default function Home() {
  return (
    <Layout>
      <div className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="relative pt-24 pb-32 overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-slate-50/50 -z-10"></div>
          <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-slate-100/80 to-transparent -z-10"></div>
          
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="max-w-3xl">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-[1.1] mb-6 font-serif">
                Calculate Your True Readiness for Independence.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed max-w-2xl">
                A conservative, data-driven framework to model your transition from employment to entrepreneurship. Stress-test your liquidity, map your fixed costs, and measure your execution stability.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/simulator" className="inline-block">
                  <Button size="lg" className="w-full sm:w-auto gap-2 group">
                    Start Simulation
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <div className="flex items-center text-sm text-muted-foreground px-4 py-2 border border-border rounded-md bg-card structural-shadow">
                  <span className="w-2 h-2 rounded-full bg-slate-400 mr-2"></span>
                  Takes approx. 5 minutes
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Pillars */}
        <section className="py-24 bg-card">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl font-bold text-foreground mb-4">The QuitReady Framework</h2>
              <p className="text-muted-foreground">
                Our proprietary model evaluates your position across structural vulnerabilities to provide a conservative baseline for your leap.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 border border-border rounded-xl bg-background hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3 font-serif">Liquidity Defense</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  We don't just count cash. We apply conservative haircuts to your brokerage and retirement accounts to calculate your True Monthly Independence Burn.
                </p>
              </div>

              <div className="p-8 border border-border rounded-xl bg-background hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3 font-serif">Revenue Stress Testing</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Factoring in volatility percentages, ramp duration, and revenue classification to ensure your projections survive contact with reality.
                </p>
              </div>

              <div className="p-8 border border-border rounded-xl bg-background hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <LineChart className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3 font-serif">Execution Stability</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  A comprehensive breakdown of your healthcare exposure, tax reserve discipline, and baseline risk factors categorized into actionable intelligence.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
