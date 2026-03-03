import { ReactNode } from "react";
import { Link } from "wouter";
import logoUrl from "@assets/626986E9-B8B4-462B-8F52-CB974B10376C_1772499495236.png";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="hover:opacity-75 transition-opacity">
            <img src={logoUrl} alt="QuitReady" className="h-8 w-auto object-contain" />
          </Link>
          <span className="text-xs font-semibold tracking-[0.15em] uppercase text-muted-foreground hidden sm:block">
            Structural Breakpoint Simulator
          </span>
          <Link href="/simulator">
            <button
              className="text-xs font-semibold text-foreground border border-border rounded-md px-4 py-1.5 hover:bg-muted transition-colors"
              data-testid="button-nav-simulate"
            >
              Start Simulation
            </button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start gap-6">
            <img src={logoUrl} alt="QuitReady" className="h-6 w-auto grayscale opacity-40" />
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              This tool is an educational financial simulation based on user-provided inputs and estimated U.S. averages. It is not financial, tax, or legal advice. Consult a qualified professional before making any major financial decisions.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
