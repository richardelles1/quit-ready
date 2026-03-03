import { ReactNode } from "react";
import { Link } from "wouter";
import logoUrl from "@assets/626986E9-B8B4-462B-8F52-CB974B10376C_1772499495236.png";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <img 
              src={logoUrl} 
              alt="QuitReady" 
              className="h-10 w-auto object-contain" 
            />
          </Link>
          <nav className="hidden md:flex space-x-8">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
              Financial Independence Simulator
            </span>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-border bg-card mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
              <img 
                src={logoUrl} 
                alt="QuitReady" 
                className="h-6 w-auto grayscale opacity-50" 
              />
            </div>
            <p className="text-xs text-muted-foreground text-center md:text-right max-w-2xl leading-relaxed">
              <strong>Disclaimer:</strong> This report is an educational financial simulation based on user inputs and estimated U.S. averages. It is not financial, tax, or legal advice. A professional advisor should be consulted before making any major financial decisions.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
