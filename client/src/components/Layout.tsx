import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, FileText } from "lucide-react";
import logoUrl from "@assets/626986E9-B8B4-462B-8F52-CB974B10376C_1772499495236.png";

const navLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/sample-report", label: "Sample Report" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const [lastReportToken, setLastReportToken] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('quitready_reports') || '[]') as string[];
      if (stored.length > 0) setLastReportToken(stored[0]);
    } catch {}
  }, []);

  const isResultsPage = location.startsWith('/results/');
  const showBanner = lastReportToken && !isResultsPage && !bannerDismissed;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Return-to-report recovery banner */}
      {showBanner && (
        <div className="bg-muted border-b border-border px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground truncate">
              You have a saved report from a previous session.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href={`/results/${lastReportToken}`}>
              <span
                className="text-xs font-semibold text-foreground underline underline-offset-2 cursor-pointer whitespace-nowrap"
                data-testid="link-return-to-report"
              >
                Return to report →
              </span>
            </Link>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
              data-testid="button-dismiss-banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="hover:opacity-75 transition-opacity shrink-0">
            <img src={logoUrl} alt="QuitReady" className="h-8 w-auto object-contain" />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(({ href, label }) => (
              <Link key={href} href={href}>
                <span className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  location === href
                    ? "text-foreground bg-muted"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}>
                  {label}
                </span>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/app">
              <button
                className="text-xs font-semibold text-background bg-foreground border border-foreground rounded-md px-4 py-1.5 hover:opacity-90 transition-opacity whitespace-nowrap"
                data-testid="button-nav-simulate"
              >
                Get Report
              </button>
            </Link>
            <button
              className="md:hidden p-1 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Toggle navigation"
              data-testid="button-mobile-menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-card px-4 py-3 flex flex-col gap-1">
            {navLinks.map(({ href, label }) => (
              <Link key={href} href={href}>
                <span
                  className={`block text-sm font-medium px-3 py-2 rounded-md cursor-pointer transition-colors ${
                    location === href
                      ? "text-foreground bg-muted"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </span>
              </Link>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2 md:col-span-1">
              <img src={logoUrl} alt="QuitReady" className="h-6 w-auto grayscale opacity-40 mb-3" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Conservative financial stress analysis for U.S. professionals modeling an employment exit.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Product</p>
              <ul className="space-y-2">
                {[
                  { href: "/app", label: "Generate Report" },
                  { href: "/how-it-works", label: "How It Works" },
                  { href: "/sample-report", label: "Sample Report" },
                  { href: "/pricing", label: "Pricing" },
                ].map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href}>
                      <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Resources</p>
              <ul className="space-y-2">
                {[
                  { href: "/blog", label: "Blog" },
                  { href: "/blog/can-i-afford-to-quit-my-job", label: "Can I Afford to Quit?" },
                  { href: "/blog/when-to-quit-your-day-job-for-entrepreneurship", label: "When to Quit Your Job" },
                  { href: "/blog/quit-job-become-creator-financial-guide", label: "Creator Financial Guide" },
                ].map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href}>
                      <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Legal</p>
              <ul className="space-y-2 mb-3">
                <li>
                  <Link href="/terms">
                    <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-footer-terms">Terms of Use</span>
                  </Link>
                </li>
                <li>
                  <Link href="/contact">
                    <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="link-footer-contact">Contact</span>
                  </Link>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This tool is an educational financial simulation. It is not financial, tax, or legal advice. Consult a qualified professional before making any major financial decisions.
              </p>
            </div>
          </div>
          <div className="border-t border-border pt-6 flex flex-col sm:flex-row justify-between items-start gap-3">
            <p className="text-xs text-muted-foreground">© 2026 QuitReady. For educational use only.</p>
            <p className="text-xs text-muted-foreground">U.S.-only. ACA and self-employment tax calculations based on 2024 guidelines.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
