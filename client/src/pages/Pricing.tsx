import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { useSEO } from "@/hooks/use-seo";

const features = [
  "Structural Breakpoint Score (0–100)",
  "4 stress scenarios (base / −15% / −30% / delayed ramp)",
  "Financial runway in years and months",
  "Monthly burn breakdown with 5 components",
  "ACA-aware healthcare transition delta",
  "Revenue growth projections (3 trajectories over 36 months)",
  "Savings depletion curve chart",
  "Sensitivity analysis (what moves the needle)",
  "Decision interpretation summary",
  "Structural Summary with closing assessment",
  "17-page branded PDF",
  "U.S. ACA/tax-aware calculations",
];

const faqs = [
  {
    question: "Why $19.99 and not free?",
    answer: "Building a deterministic financial simulation that accurately models U.S. self-employment tax, ACA subsidy cliffs, and multi-scenario stress testing across 36 months requires significant engineering and ongoing research. The $19.99 fee allows us to maintain the tool, keep the calculations updated with the latest tax year guidelines, and remain completely independent — meaning we don't sell your data to lead-gen firms or insurance brokers."
  },
  {
    question: "Can I share my report?",
    answer: "Yes. Once you purchase your report, you'll receive a unique link and a downloadable 17-page PDF. You can share this with your spouse, business partner, or financial advisor. The PDF is yours to keep permanently. Web report access is tied to the service remaining active."
  },
  {
    question: "What if my numbers change?",
    answer: "Your report is a snapshot of the data you provided. If your financial situation changes significantly, you can run a new simulation. Because we prioritize privacy and don't require account creation, each report is generated as a unique, independent session."
  },
  {
    question: "Is there a refund policy?",
    answer: "Since the report is a digital product delivered instantly upon purchase, we generally do not offer refunds. However, if you encounter any technical issues with your PDF generation or believe there was a calculation error, please contact our support and we'll make it right."
  }
];

export default function Pricing() {
  useSEO({
    title: "QuitReady Report Pricing — $19.99 One-Time | QuitReady",
    description: "Get complete financial clarity for $19.99. One-time purchase, no subscription. Includes a 17-page personalized readiness report with stress testing and runway analysis.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "QuitReady Report",
      "description": "A comprehensive 17-page financial readiness report for professionals considering an employment exit.",
      "offers": {
        "@type": "Offer",
        "price": "19.99",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock"
      }
    }
  });

  return (
    <Layout>
      <div className="flex-1 bg-background">
        {/* Hero Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4" data-testid="text-pricing-headline">
            One report. One decision. <br className="hidden sm:block" />
            Complete financial clarity.
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Stop guessing about your financial runway. Get the exact math you need to decide when it's safe to quit.
          </p>
        </section>

        {/* Pricing Card Section */}
        <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
          <Card className="border-2 border-primary shadow-lg overflow-hidden" data-testid="card-pricing">
            <CardHeader className="bg-primary text-primary-foreground text-center py-10">
              <div className="text-5xl font-bold mb-2">$19.99</div>
              <p className="text-lg opacity-90">One-time purchase · No subscription · Instant PDF download</p>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                {features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-1 bg-primary/10 rounded-full p-0.5">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm text-foreground leading-snug">{feature}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-center">
                <Link href="/app">
                  <Button size="lg" className="w-full sm:w-auto min-w-[240px] text-lg font-bold h-12" data-testid="button-pricing-cta">
                    Generate Your Report
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                <p className="mt-4 text-xs text-muted-foreground">
                  Secure payment via Stripe. One-time fee for lifetime access to your report.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Value Framing Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-border">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Structural math, fraction of the cost.</h2>
              <p className="text-lg text-muted-foreground mb-6">
                One hour with a fee-only financial planner can cost anywhere from $250 to $400. Even then, you might not get a multi-scenario stress test of your specific career transition.
              </p>
              <div className="bg-muted p-6 rounded-lg border border-border">
                <p className="font-semibold text-foreground mb-2">The QuitReady Advantage:</p>
                <p className="text-sm text-muted-foreground">
                  QuitReady applies the same structural financial modeling frameworks — burn rate, liquidity tiering, scenario stress testing — that underpin serious transition analysis, encoded into a deterministic engine you can run yourself in minutes.
                </p>
              </div>
            </div>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-primary">1</span>
                </div>
                <div>
                  <h3 className="font-bold mb-1">No SSN or Bank Login</h3>
                  <p className="text-sm text-muted-foreground">We never ask for sensitive credentials. You provide the estimates; we provide the math.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-primary">2</span>
                </div>
                <div>
                  <h3 className="font-bold mb-1">U.S.-Specific Logic</h3>
                  <p className="text-sm text-muted-foreground">Calculations are tuned for U.S. tax brackets, SE taxes, and ACA healthcare subsidy cliffs.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-primary">3</span>
                </div>
                <div>
                  <h3 className="font-bold mb-1">Private & Secure</h3>
                  <p className="text-sm text-muted-foreground">We don't create accounts. Your data exists only within your session until your report is generated.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto border-t border-border">
          <h2 className="text-3xl font-bold text-center mb-10">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left font-semibold">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Final CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-foreground text-background text-center">
          <h2 className="text-3xl font-bold mb-6">Know your number. Move with confidence.</h2>
          <p className="text-lg opacity-80 mb-8 max-w-2xl mx-auto">
            Get the 17-page report that turns your "what ifs" into a structured financial plan.
          </p>
          <Link href="/app">
            <Button size="lg" variant="outline" className="bg-transparent border-background text-background hover:bg-background hover:text-foreground h-12 px-8" data-testid="button-pricing-bottom-cta">
              Generate Your Report
            </Button>
          </Link>
        </section>
      </div>
    </Layout>
  );
}
