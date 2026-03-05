import Layout from "../components/Layout";
import { useSEO } from "../hooks/use-seo";

export default function Terms() {
  useSEO({
    title: "Terms of Use & Disclaimer | QuitReady",
    description: "QuitReady is a mathematical financial simulation tool for educational purposes only. Read our full terms of use and liability disclaimer.",
    canonical: "https://quitready.app/terms",
  });

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Legal</p>
          <h1 className="text-3xl font-bold font-serif text-foreground mb-3">Terms of Use & Disclaimer</h1>
          <p className="text-sm text-muted-foreground">Last updated: March 2025</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">1. What This Tool Is</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              QuitReady is a deterministic financial simulation tool. It applies mathematical formulas to user-provided inputs to model financial runway scenarios for individuals considering a career transition. It is designed for educational and illustrative purposes only.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              QuitReady is not financial advice, investment advice, tax advice, or legal advice of any kind. It is not a substitute for consultation with a licensed financial planner, certified public accountant, or attorney.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">2. No Professional Review</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No licensed financial professional, CPA, or attorney has reviewed your specific inputs or outputs. The simulation applies fixed, predetermined mathematical formulas uniformly to all users. Nothing in the output constitutes personalized professional guidance.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">3. Input Accuracy</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The accuracy of your results depends entirely on the accuracy of the numbers you provide. Errors, estimates, or omissions in your input data will produce materially incorrect simulation outputs. QuitReady has no way to verify the accuracy of user-supplied information.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">4. Limitation of Liability</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              QuitReady, its founders, owners, employees, and affiliates are not liable — directly or indirectly — for any financial loss, career outcome, legal consequence, or other harm resulting from decisions made in reliance on this simulation or any output it generates.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              By using this tool, you acknowledge that you are solely responsible for any decisions you make, and that the simulation is one informational input among many that should inform — but never solely drive — any major financial or career decision.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">5. Healthcare & Tax Estimates</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              ACA marketplace cost estimates are based on general national assumptions and may not reflect the actual premiums available in your state, county, or for your specific household configuration. Self-employment tax calculations are illustrative and based on standard federal rates. Actual tax liability varies by income level, deductions, state law, and other individual factors.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              Consult a tax professional for accurate tax planning.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">6. No Guarantee of Outcomes</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The simulation models mathematical scenarios based on inputs you provide. It does not — and cannot — account for future market conditions, economic changes, legislative changes, personal life events, employer negotiations, or any other real-world variable that may affect your actual financial outcome. All outputs are projections, not predictions.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">7. U.S. Only</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              QuitReady is designed exclusively for U.S.-based users operating under U.S. federal tax law and the U.S. Affordable Care Act. The calculations are not valid or appropriate for use in any other jurisdiction. Users outside the United States should not rely on this tool.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">8. Report Access & Purchase</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The $19.99 purchase provides one-time access to a single generated report for the simulation session you completed. The PDF report is yours to download and keep permanently. Web-based interactive report access is available as long as the QuitReady service remains active. We do not guarantee indefinite availability of the web interface.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              Because the report is a digital product delivered immediately upon purchase, refunds are generally not available. If you experience a technical error that prevents PDF delivery, contact us and we will work to resolve it.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">9. Acceptance of Terms</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              By generating a simulation and/or purchasing a report, you confirm that you have read, understood, and agree to these terms. If you do not agree, do not use this tool.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground mb-2">10. Contact</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Questions about these terms? Reply to any QuitReady email you receive, or reach us through the contact information in your purchase confirmation.
            </p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground">
            QuitReady is an independent educational software product. It is not affiliated with, endorsed by, or connected to the U.S. government, the IRS, the ACA marketplace, or any financial institution.
          </p>
        </div>
      </div>
    </Layout>
  );
}
