import { Link } from "wouter";
import Layout from "../components/Layout";
import { ArrowRight, TrendingDown, AlertTriangle, Shield, Check, Clock, ChevronDown, DollarSign, Calculator, FileText, Activity, Zap, TrendingUp, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useSEO } from "@/hooks/use-seo";
import logoUrl from "@assets/626986E9-B8B4-462B-8F52-CB974B10376C_1772499495236.png";

export default function Home() {
  useSEO({
    title: "QuitReady — Know Your Financial Runway Before You Quit",
    description: "Conservative financial stress analysis for U.S. professionals modeling an employment exit. Run your structural model and know your number.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "QuitReady",
      "url": "https://quitready.com",
      "description": "Financial runway simulator for professionals planning to quit their job.",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://quitready.com/search?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    }
  });

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
              <div className="flex flex-col gap-6 items-start">
                <div className="flex flex-col sm:flex-row gap-4 items-start flex-wrap">
                  <Link href="/app">
                    <Button size="lg" className="gap-2 group h-11" data-testid="button-generate-report-hero">
                      Generate Your Report
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                  </Link>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-md px-4 py-2 bg-background h-11">
                    <Clock className="w-4 h-4 text-muted-foreground/60" />
                    Approx. 5 minutes
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-muted text-muted-foreground font-medium px-2 py-0.5 rounded-sm">
                    $19.99 · One-time
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem Section */}
        <section className="py-24 bg-background border-b border-border">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <h2 className="text-2xl font-bold font-serif text-foreground mb-12">The Structural Challenges</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <Card className="border-border bg-card hover-elevate transition-all duration-200">
                <CardHeader className="pb-3">
                  <Activity className="w-8 h-8 text-primary mb-2" />
                  <CardTitle className="text-lg font-serif">The Healthcare Cliff</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Losing employer-sponsored coverage is often the single biggest shock to a household budget. Transitioning to individual plans can cost <span className="text-foreground font-medium">$800–$1,500/month</span> depending on your state and family size.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card hover-elevate transition-all duration-200">
                <CardHeader className="pb-3">
                  <TrendingUp className="w-8 h-8 text-primary mb-2" />
                  <CardTitle className="text-lg font-serif">The Revenue Ramp</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Optimism is a business requirement, but a financial liability. Most freelancers and consultants take <span className="text-foreground font-medium">3–12 months</span> to reach a stable break-even point. We model the gap.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card hover-elevate transition-all duration-200">
                <CardHeader className="pb-3">
                  <Calculator className="w-8 h-8 text-primary mb-2" />
                  <CardTitle className="text-lg font-serif">The SE Tax Surprise</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Self-employment tax adds an effective <span className="text-foreground font-medium">14.13%</span> to your tax rate by requiring you to pay both the employer and employee portions of FICA. It's the most common "forgotten" expense.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-24 bg-muted/30 border-b border-border">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <h2 className="text-3xl font-bold font-serif text-center mb-16">How QuitReady Works</h2>
            <div className="grid md:grid-cols-3 gap-12 relative">
              {/* Connection line for desktop */}
              <div className="hidden md:block absolute top-12 left-0 w-full h-px bg-border -z-10" />
              
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg mb-6 shadow-sm">1</div>
                <h3 className="text-lg font-bold font-serif mb-3">Enter your financial snapshot</h3>
                <p className="text-sm text-muted-foreground">Input your income, liquid savings, monthly expenses, and projected business ramp. No bank logins required.</p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg mb-6 shadow-sm">2</div>
                <h3 className="text-lg font-bold font-serif mb-3">Engine stress-tests your model</h3>
                <p className="text-sm text-muted-foreground">The simulator runs your numbers across 4 distinct scenarios over 36 months to find where the structure fails.</p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg mb-6 shadow-sm">3</div>
                <h3 className="text-lg font-bold font-serif mb-3">Get your personalized report</h3>
                <p className="text-sm text-muted-foreground">Instantly download your 17-page readiness report with a full breakdown of your runway and structural risks.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Report Preview */}
        <section className="py-24 bg-background border-b border-border">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold font-serif mb-4">What's in the Report?</h2>
              <p className="text-muted-foreground">A comprehensive 17-page analysis of your financial transition.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { title: "Executive Snapshot", icon: Zap, desc: "High-level summary of your core financial metrics and transition viability." },
                { title: "Structural Breakpoint Score", icon: Target, desc: "A deterministic 0-100 score based on your unique risk factors." },
                { title: "Savings Runway Analysis", icon: TrendingDown, desc: "Tiered analysis of your capital and how long it lasts in real-world conditions." },
                { title: "Stress Scenario Modeling", icon: AlertTriangle, desc: "How your plan holds up against revenue shocks and delayed ramps." },
                { title: "Revenue Growth Trajectory", icon: TrendingUp, desc: "Break-even analysis and required growth rates to maintain solvency." },
                { title: "Decision Interpretation", icon: Shield, desc: "Clear, objective assessment of whether your plan is structurally sound." }
              ].map((item, i) => (
                <Card key={i} className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-md bg-muted">
                        <item.icon className="w-4 h-4 text-primary" />
                      </div>
                      <CardTitle className="text-base font-serif">{item.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{item.desc}</p>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold opacity-70">Included in report</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Block */}
        <section className="py-24 bg-muted/30 border-b border-border">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-4xl font-bold font-serif mb-4">$19.99</h2>
            <p className="text-lg text-muted-foreground mb-12">One-time purchase · Instant PDF download · Complete financial clarity</p>
            
            <div className="bg-card border border-border rounded-xl p-8 mb-12 shadow-sm text-left">
              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                {[
                  "17-page Personalized PDF",
                  "Structural Breakpoint Score",
                  "4 Stress Test Scenarios",
                  "ACA Healthcare Math",
                  "Self-Employment Tax Logic",
                  "Revenue Growth Modeling",
                  "No Subscription Required",
                  "Secure & Private"
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm font-medium">{feature}</span>
                  </div>
                ))}
              </div>
              <Link href="/app">
                <Button size="lg" className="w-full h-12 text-base font-bold" data-testid="button-generate-report-pricing">
                  Generate Your Report
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 bg-background border-b border-border">
          <div className="max-w-3xl mx-auto px-6 lg:px-8">
            <h2 className="text-3xl font-bold font-serif mb-12 text-center">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="text-left font-serif text-lg">Is this financial advice?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  No. QuitReady is a deterministic mathematical simulation. It applies fixed formulas to the numbers you provide to show you how those numbers behave under stress. It does not provide recommendations or lifestyle coaching.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger className="text-left font-serif text-lg">What data do I need to enter?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  You'll need estimates for your current income, monthly expenses, liquid savings (cash, brokerage), retirement balances, and your expected business revenue or ramp-up period. We never ask for SSNs or bank logins.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger className="text-left font-serif text-lg">What's in the 17-page report?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  The report includes an Executive Snapshot, your Structural Breakpoint Score, a detailed Savings Runway Analysis, 4 Stress Scenario Models, Revenue Growth Trajectory, and an objective Decision Interpretation summary.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4">
                <AccordionTrigger className="text-left font-serif text-lg">Can I run it more than once?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  Yes. You can return to the simulator and update your numbers as your situation changes. Your personalized report can be generated once per purchase, but the on-screen simulator is available for you to refine your model.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-5">
                <AccordionTrigger className="text-left font-serif text-lg">Is my data stored securely?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  We value your privacy. Your financial inputs are used only to generate your report and are stored securely. We do not sell your data or use it for marketing. Because we don't link to your actual bank accounts, the risk is inherently minimized.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>

        {/* Trust Bar (replacing What this isn't) */}
        <section className="py-16 bg-muted/20 border-b border-border">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <div className="grid md:grid-cols-3 gap-8 items-center">
              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-card group-hover:border-primary/30 transition-colors">
                  <Activity className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm font-medium text-muted-foreground leading-snug">Conservative math, not optimistic projections</p>
              </div>
              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-card group-hover:border-primary/30 transition-colors">
                  <Shield className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm font-medium text-muted-foreground leading-snug">U.S.-specific ACA and self-employment tax logic</p>
              </div>
              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-card group-hover:border-primary/30 transition-colors">
                  <Target className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm font-medium text-muted-foreground leading-snug">No motivational scores, no lifestyle advice</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-foreground relative overflow-hidden">
          <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center relative z-10">
            <img src={logoUrl} alt="QuitReady" className="h-8 w-auto mx-auto mb-10 brightness-0 invert opacity-70" />
            <h2 className="text-4xl font-bold font-serif text-background mb-6">
              Run your structural model. Know your number.
            </h2>
            <p className="text-muted mb-10 text-lg max-w-2xl mx-auto text-background/60">
              Stop guessing. See exactly where your financial structure holds up and where it fails. Get the clarity you need to make the right decision.
            </p>
            <Link href="/app">
              <Button variant="outline" size="lg" className="gap-2 bg-transparent border-background/30 text-background h-12 px-8 hover:bg-background/10 no-default-hover-elevate" data-testid="button-generate-report-bottom">
                Generate Your Report
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          {/* Subtle background decoration */}
          <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none">
            <div className="absolute top-[-50%] left-[-20%] w-[140%] h-[200%] rotate-12 bg-gradient-to-br from-background via-transparent to-transparent" />
          </div>
        </section>

      </div>
    </Layout>
  );
}
