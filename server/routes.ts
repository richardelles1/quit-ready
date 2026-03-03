import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { calculateSimulation } from "./services/simulator";
import { z } from "zod";
import PDFDocument from "pdfkit";
import type { Simulation } from "@shared/schema";

// ─── PDF Palette ───────────────────────────────────────────────────────────
const C = {
  navy:    '#1e293b',
  coal:    '#334155',
  muted:   '#64748b',
  mid:     '#f1f5f9',
  light:   '#f8fafc',
  border:  '#e2e8f0',
  white:   '#ffffff',
  green:   '#15803d',
  amber:   '#b45309',
  red:     '#dc2626',
  blue:    '#1d4ed8',
};
const LEFT = 60, W = 492, RIGHT = 552;
const USABLE_H = 700;

// ─── Formatting helpers ────────────────────────────────────────────────────
const fmtM = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const fmtYrs = (m: number) => m >= 999 ? '24+ yrs' : `${(m / 12).toFixed(1)} yrs (${m} mo)`;
const fmtMoShort = (m: number) => m >= 999 ? '24+ yrs' : `${m} mo`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

function scoreLabel(s: number): string {
  if (s >= 86) return 'Strong Buffer Position';
  if (s >= 70) return 'Structurally Stable';
  if (s >= 50) return 'Moderately Exposed';
  return 'Structurally Fragile';
}

// ─── Scenario / liquidity computation helpers ──────────────────────────────
function t1(s: Simulation): number { return s.cash; }
function t2(s: Simulation): number { return Math.round(s.brokerage * 0.80); }
function t3(s: Simulation): number {
  return Math.round(s.roth * 1.00 + s.traditional * 0.50 + s.realEstate * 0.30);
}
function t1t2(s: Simulation): number { return t1(s) + t2(s); }

// When does Tier1+2 run out? (Liquidity Line)
function liquidityLine(
  s: Simulation,
  revMult: number,
  rampMonths: number,
  extraBurnByMonth: (m: number) => number = () => 0,
): number {
  if (s.tmib <= 0) return 999;
  let cap = t1t2(s);
  const vol = 1 - s.volatilityPercent / 100;
  for (let m = 1; m <= 300; m++) {
    const rampFactor = rampMonths > 0 && m <= rampMonths ? 0.50 * (m / rampMonths) : 1.0;
    const rev = s.expectedRevenue * revMult * rampFactor * vol;
    cap -= (s.tmib + extraBurnByMonth(m) - rev);
    if (cap <= 0) return m;
  }
  return 999;
}

// Full runway (all capital)
function fullRunway(
  s: Simulation,
  revMult: number,
  rampMonths: number,
  extraBurnByMonth: (m: number) => number = () => 0,
): number {
  if (s.tmib <= 0) return 999;
  let cap = s.accessibleCapital;
  const vol = 1 - s.volatilityPercent / 100;
  for (let m = 1; m <= 300; m++) {
    const rampFactor = rampMonths > 0 && m <= rampMonths ? 0.50 * (m / rampMonths) : 1.0;
    const rev = s.expectedRevenue * revMult * rampFactor * vol;
    cap -= (s.tmib + extraBurnByMonth(m) - rev);
    if (cap <= 0) return m;
  }
  return 999;
}

// Cash coverage ladder (milestone months)
type LadderRow = {
  month: number; revenue: number; burn: number; gap: number;
  remainingT1T2: number; inTier3Zone: boolean;
};
function coverageLadder(s: Simulation, revMult: number, rampMonths: number): LadderRow[] {
  const milestones = new Set([1, 3, 6, 12, 18, 24]);
  let cap = t1t2(s);
  const vol = 1 - s.volatilityPercent / 100;
  const rows: LadderRow[] = [];
  for (let m = 1; m <= 24; m++) {
    const rampFactor = rampMonths > 0 && m <= rampMonths ? 0.50 * (m / rampMonths) : 1.0;
    const rev = Math.round(s.expectedRevenue * revMult * rampFactor * vol);
    const gap = s.tmib - rev;
    cap -= gap;
    if (milestones.has(m)) {
      rows.push({ month: m, revenue: rev, burn: s.tmib, gap, remainingT1T2: Math.max(0, cap), inTier3Zone: cap < 0 });
    }
  }
  return rows;
}

// ─── PDF rendering helpers ─────────────────────────────────────────────────
function pageHeader(doc: PDFKit.PDFDocument, date: string) {
  doc.rect(0, 0, 612, 34).fill(C.navy);
  doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold')
    .text('QUITREADY · STRUCTURAL BREAKPOINT REPORT', LEFT, 12)
    .text(date, LEFT, 12, { width: W, align: 'right' });
}

function pageFooter(doc: PDFKit.PDFDocument, n: number, total: number) {
  doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
    .text('This is a financial simulation, not advice. Consult a qualified professional before major financial decisions.', LEFT, 760, { width: W - 80 })
    .text(`Page ${n} of ${total}`, LEFT, 760, { width: W, align: 'right' });
}

function sectionHead(doc: PDFKit.PDFDocument, title: string, sub: string | null, y: number): number {
  doc.rect(LEFT, y, W, 1).fill(C.border);
  y += 7;
  doc.fillColor(C.navy).fontSize(15).font('Times-Bold').text(title, LEFT, y, { width: W });
  y += 20;
  if (sub) {
    doc.fillColor(C.muted).fontSize(8.5).font('Helvetica').text(sub, LEFT, y, { width: W, lineGap: 1.5 });
    y += 18;
  }
  return y + 4;
}

function tile(doc: PDFKit.PDFDocument, x: number, y: number, w: number, label: string, value: string, color = C.navy) {
  doc.rect(x, y, w, 48).fill(C.mid);
  doc.fillColor(C.muted).fontSize(7).font('Helvetica').text(label.toUpperCase(), x + 10, y + 8, { width: w - 20 });
  doc.fillColor(color).fontSize(13).font('Times-Bold').text(value, x + 10, y + 22, { width: w - 20 });
}

function burnRow(doc: PDFKit.PDFDocument, label: string, value: number, y: number, even: boolean, negate = false): number {
  if (value === 0) return y;
  doc.rect(LEFT, y, W, 24).fill(even ? C.light : C.mid);
  doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(label, LEFT + 10, y + 7, { width: 330 });
  const vStr = negate ? `(${fmtM(value)})` : fmtM(value);
  doc.fillColor(negate ? C.green : C.navy).fontSize(9).font('Helvetica-Bold')
    .text(vStr, LEFT, y + 7, { width: W - 10, align: 'right' });
  return y + 24;
}

function groupHead(doc: PDFKit.PDFDocument, label: string, y: number): number {
  doc.rect(LEFT, y, W, 18).fill(C.border);
  doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold').text(label.toUpperCase(), LEFT + 10, y + 5);
  return y + 18;
}

function insightBlock(doc: PDFKit.PDFDocument, heading: string, body: string, y: number): number {
  const lineCount = Math.max(2, Math.ceil(body.length / 82));
  const h = lineCount * 10 + 30;
  doc.rect(LEFT, y, W, h).fill(C.light);
  doc.rect(LEFT, y, 3, h).fill(C.navy);
  doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold').text(heading.toUpperCase(), LEFT + 12, y + 8, { width: W - 24 });
  doc.fillColor(C.coal).fontSize(9.5).font('Helvetica').text(body, LEFT + 12, y + 20, { width: W - 24, lineGap: 1.5 });
  return y + h + 7;
}

// ─── Route registration ────────────────────────────────────────────────────
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  app.post(api.simulations.create.path, async (req, res) => {
    try {
      const body = {
        ...req.body,
        currentSalary: Number(req.body.currentSalary || 0),
        livingExpenses: Number(req.body.livingExpenses || 0),
        totalDebt: Number(req.body.totalDebt || 0),
        monthlyDebtPayments: Number(req.body.monthlyDebtPayments || 0),
        partnerIncome: Number(req.body.partnerIncome || 0),
        adultsOnPlan: Number(req.body.adultsOnPlan || 1),
        dependentChildren: Number(req.body.dependentChildren || 0),
        currentPayrollHealthcare: Number(req.body.currentPayrollHealthcare || 0),
        healthcareCostOverride: req.body.healthcareCostOverride ? Number(req.body.healthcareCostOverride) : null,
        cash: Number(req.body.cash || 0),
        brokerage: Number(req.body.brokerage || 0),
        roth: Number(req.body.roth || 0),
        traditional: Number(req.body.traditional || 0),
        realEstate: Number(req.body.realEstate || 0),
        businessCostOverride: req.body.businessCostOverride ? Number(req.body.businessCostOverride) : null,
        expectedRevenue: Number(req.body.expectedRevenue || 0),
        volatilityPercent: Number(req.body.volatilityPercent || 15),
        rampDuration: Number(req.body.rampDuration || 0),
        breakevenMonths: Number(req.body.breakevenMonths || 0),
        isDualIncome: req.body.isDualIncome === true || req.body.isDualIncome === 'true',
      };
      const input = api.simulations.create.input.parse(body);
      const computed = calculateSimulation(input);
      const simulation = await storage.createSimulation({
        ...input,
        tmib: computed.tmib,
        accessibleCapital: computed.accessibleCapital,
        selfEmploymentTax: computed.selfEmploymentTax,
        businessCostBaseline: computed.businessCostBaseline,
        estimatedHealthcarePlanCost: computed.estimatedHealthcarePlanCost,
        healthcareDelta: computed.healthcareDelta,
        healthcareMonthlyCost: computed.healthcareMonthlyCost,
        baseRunway: computed.baseRunway,
        runway15Down: computed.runway15Down,
        runway30Down: computed.runway30Down,
        runwayRampDelay: computed.runwayRampDelay,
        structuralBreakpointScore: computed.structuralBreakpointScore,
        debtExposureRatio: computed.debtExposureRatio,
        healthcareRisk: computed.healthcareRisk,
        breakpointMonth: computed.breakpointMonth,
        breakpointScenario: computed.breakpointScenario,
      });
      res.status(201).json(simulation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get(api.simulations.get.path, async (req, res) => {
    const sim = await storage.getSimulation(Number(req.params.id));
    if (!sim) return res.status(404).json({ message: 'Simulation not found' });
    res.json(sim);
  });

  // ─── PDF GENERATION ────────────────────────────────────────────────────────
  app.get(api.simulations.downloadPdf.path, async (req, res) => {
    const sim = await storage.getSimulation(Number(req.params.id));
    if (!sim) return res.status(404).json({ message: 'Simulation not found' });

    try {
      const doc = new PDFDocument({ margin: 0, size: 'LETTER', autoFirstPage: true });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="QuitReady_Report_${sim.id}.pdf"`);
      doc.pipe(res);

      const reportDate = new Date(sim.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const TOTAL = 12;
      const score = sim.structuralBreakpointScore;
      const hc = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
      const tier1Cap = t1(sim), tier2Cap = t2(sim), tier3Cap = t3(sim), t1t2Cap = t1t2(sim);

      // Pre-compute all scenarios
      const llBase   = liquidityLine(sim, 1.00, sim.rampDuration);
      const ll15     = liquidityLine(sim, 0.85, sim.rampDuration);
      const ll30     = liquidityLine(sim, 0.70, sim.rampDuration);
      const llRamp3  = liquidityLine(sim, 1.00, sim.rampDuration + 3);

      // Ramp timing variants
      const rampVariants = [-3, -2, -1, 0, 1, 2, 3].map(d => {
        const ramp = Math.max(0, sim.rampDuration + d);
        return {
          delta: d, rampMonths: ramp,
          ll: liquidityLine(sim, 1.00, ramp),
          full: fullRunway(sim, 1.00, ramp),
          needsTier3: t1t2Cap < sim.tmib * ramp, // rough heuristic
        };
      });

      // Partner job loss (only if dual income)
      const partnerLoss = sim.isDualIncome && sim.partnerIncome > 0
        ? [3, 6, 12].map(dur => ({
            dur,
            ll: liquidityLine(sim, 1.00, sim.rampDuration, (m) => m <= dur ? sim.partnerIncome : 0),
            full: fullRunway(sim, 1.00, sim.rampDuration, (m) => m <= dur ? sim.partnerIncome : 0),
          }))
        : null;

      // New child scenario
      const CHILD_ONETIME = 3000, CHILD_MONTHLY = 1500;
      const llNewChild = (() => {
        if (sim.tmib <= 0) return 999;
        let cap = t1t2Cap - CHILD_ONETIME;
        const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 300; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          cap -= (sim.tmib + CHILD_MONTHLY - sim.expectedRevenue * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      })();

      // Levers (burn -500/-1000/-2000, rev +500/+1000)
      const calcLLBurnAdj = (adj: number) => {
        if (sim.tmib <= 0) return 999;
        let cap = t1t2Cap;
        const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 300; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          cap -= ((sim.tmib - adj) - sim.expectedRevenue * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      };
      const calcLLRevAdj = (adj: number) => {
        if (sim.tmib <= 0) return 999;
        let cap = t1t2Cap;
        const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 300; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          cap -= (sim.tmib - (sim.expectedRevenue + adj) * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      };

      // Stability thresholds
      const monthlyDrain30 = Math.max(0, sim.tmib - sim.expectedRevenue * 0.70 * (1 - sim.volatilityPercent / 100));
      const minT1T2For12Mo = monthlyDrain30 * 12;
      const minRevFor12Mo = monthlyDrain30 > 0
        ? Math.round((sim.tmib - t1t2Cap / 12) / (0.70 * (1 - sim.volatilityPercent / 100)))
        : 0;
      const maxBurnFor12Mo = Math.round(t1t2Cap / 12 + sim.expectedRevenue * 0.70 * (1 - sim.volatilityPercent / 100));

      // Liquidity line warning level for cover
      const llWarnColor = ll30 < 6 ? C.red : ll30 < 12 ? C.amber : C.green;
      const llWarnLabel = ll30 < 6 ? 'Critical' : ll30 < 12 ? 'Caution' : 'Adequate';

      let y = 0;

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1 — COVER + SNAPSHOT
      // ═══════════════════════════════════════════════════════════════════════
      doc.rect(0, 0, 612, 792).fill(C.navy);
      doc.fillColor(C.white).fontSize(40).font('Times-Bold').text('QuitReady.', LEFT, 90);
      doc.rect(LEFT, 138, 60, 2).fill('#3b82f6');
      doc.fillColor(C.white).fontSize(19).font('Times-Roman').text('Structural Breakpoint Report', LEFT, 148);
      doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text(`${reportDate}  ·  Simulation #${sim.id}`, LEFT, 172);

      // Key tiles (2 per row)
      const coverTiles = [
        { label: 'True Monthly Burn', val: fmtM(sim.tmib) },
        { label: 'Accessible Capital (Total)', val: fmtM(sim.accessibleCapital) },
        { label: 'Liquidity Line Capital (Tier 1+2)', val: fmtM(t1t2Cap) },
        { label: `Liquidity Line — Severe Stress (−30%)`, val: fmtMoShort(ll30), color: llWarnColor },
        { label: 'Structural Breakpoint Score', val: `${score}/100` },
        { label: 'Score Band', val: scoreLabel(score) },
      ];
      let tx = LEFT; let ty = 220;
      coverTiles.forEach((ct, i) => {
        const tw = 236;
        doc.rect(tx, ty, tw, 52).fill('#0f172a');
        doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text(ct.label.toUpperCase(), tx + 10, ty + 8, { width: tw - 20 });
        doc.fillColor(ct.color ?? C.white).fontSize(14).font('Times-Bold').text(ct.val, tx + 10, ty + 24, { width: tw - 20 });
        tx += tw + 10;
        if (i % 2 === 1) { tx = LEFT; ty += 60; }
      });

      // Liquidity line status pill
      ty += 8;
      doc.rect(LEFT, ty, 180, 28).fill(ll30 < 6 ? '#450a0a' : ll30 < 12 ? '#431407' : '#052e16');
      doc.fillColor(llWarnColor).fontSize(9).font('Helvetica-Bold')
        .text(`Liquidity Line Status: ${llWarnLabel}`, LEFT + 12, ty + 9);

      // Opening paragraph
      ty += 50;
      doc.rect(LEFT, ty, W, 1).fill('#334155');
      ty += 14;
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica')
        .text(
          'This is a stress test, not a prediction. It models how your finances behave if income stops or falls short — across a range of scenarios — so you can see your exposure before making a major move.',
          LEFT, ty, { width: W, lineGap: 2 }
        );
      ty += 40;
      doc.rect(LEFT, ty, W, 1).fill('#334155');
      ty += 14;
      doc.fillColor('#475569').fontSize(8).font('Helvetica')
        .text(
          'Not financial, tax, or legal advice. This simulation is educational and based on your inputs plus estimated U.S. averages. Consult a qualified financial professional before major decisions.',
          LEFT, ty, { width: W, lineGap: 2 }
        );

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2 — PLAIN ENGLISH EXPLAINER
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'Understanding This Report', 'What each term means and why it matters.', y);

      const concepts = [
        {
          title: 'Monthly Burn',
          body: 'What your household costs each month when you\'re not receiving employment income. This includes loan payments, living expenses, healthcare, self-employment taxes, and business operating costs — minus any partner income that continues. It does not include your revenue target.'
        },
        {
          title: 'Runway',
          body: 'How many months your saved capital would last if it had to cover the full gap between your burn and your revenue. When burn exactly equals revenue, runway is unlimited. When burn exceeds revenue, your savings are depleted month by month.'
        },
        {
          title: 'Liquidity & the Liquidity Line',
          body: 'Liquidity means how quickly you can access money without penalties. The Liquidity Line is your Tier 1 + Tier 2 capital — cash and brokerage accounts. This is the primary safety buffer. Once it\'s gone, you either become cash-flow positive or enter Tier 3 (restricted) territory.'
        },
        {
          title: 'The Tier System',
          body: 'Tier 1 (fully liquid): Cash, checking, savings, HYSA — no delay, no penalty.\nTier 2 (semi-liquid): Taxable brokerage accounts — accessible but may trigger capital gains taxes.\nTier 3 (restricted/last resort): Retirement accounts and home equity. Early access triggers income taxes plus penalties. This report never frames Tier 3 as a plan — only as an emergency extension.'
        },
        {
          title: 'Why Retirement Assets Are Not Primary Runway',
          body: 'Accessing a 401(k) or Traditional IRA before age 59½ typically costs income taxes (20-40% depending on bracket) plus a 10% early withdrawal penalty. More importantly, every dollar withdrawn loses years of compounding. The model shows you when Tier 3 would be required — not to encourage it, but to name the risk clearly.'
        },
        {
          title: 'Debt Payments vs. Living Expenses',
          body: 'Debt payments are contractual minimums — mortgage payments, car loans, student loans, credit card minimums. Missing them damages credit or triggers default. Living expenses are everything else your household spends — food, utilities, childcare, subscriptions. If you pay living expenses with a credit card, they are still living expenses; the minimum credit card payment is the debt obligation.'
        },
      ];

      concepts.forEach((c, i) => {
        const bodyLines = Math.max(2, Math.ceil(c.body.length / 84));
        const h = bodyLines * 10 + 32;
        doc.rect(LEFT, y, W, h).fill(i % 2 === 0 ? C.light : C.mid);
        doc.fillColor(C.navy).fontSize(10).font('Helvetica-Bold').text(c.title, LEFT + 12, y + 10, { width: W - 24 });
        doc.fillColor(C.coal).fontSize(8.5).font('Helvetica').text(c.body, LEFT + 12, y + 24, { width: W - 24, lineGap: 1.5 });
        y += h + 5;
      });

      pageFooter(doc, 2, TOTAL);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 3 — BURN BREAKDOWN
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'Monthly Burn Breakdown', 'Every component of what your life costs during transition.', y);

      let rowEven = false;
      y = groupHead(doc, 'Required Fixed Obligations', y);
      y = burnRow(doc, 'Debt payments (required minimums)', sim.monthlyDebtPayments, y, rowEven = !rowEven);
      y = burnRow(doc, 'Household living costs', sim.livingExpenses, y, rowEven = !rowEven);
      const fixedSub = (sim.monthlyDebtPayments ?? 0) + (sim.livingExpenses ?? 0);
      doc.rect(LEFT, y, W, 22).fill(C.mid);
      doc.fillColor(C.muted).fontSize(8).font('Helvetica-Bold').text('FIXED SUBTOTAL', LEFT + 10, y + 7);
      doc.fillColor(C.navy).fontSize(10).font('Times-Bold').text(fmtM(fixedSub), LEFT, y + 7, { width: W - 10, align: 'right' });
      y += 22 + 3;

      y = groupHead(doc, 'Transition Adjustments', y);
      y = burnRow(doc, 'Additional healthcare cost', hc, y, rowEven = !rowEven);
      if (sim.isDualIncome && sim.partnerIncome > 0) {
        y = burnRow(doc, 'Partner income offset', sim.partnerIncome, y, rowEven = !rowEven, true);
      }
      y += 3;

      y = groupHead(doc, 'Business + Taxes', y);
      y = burnRow(doc, 'Business operating cost', sim.businessCostBaseline, y, rowEven = !rowEven);
      y = burnRow(doc, 'Self-employment tax reserve (28%)', sim.selfEmploymentTax, y, rowEven = !rowEven);
      y += 3;

      // Total row
      doc.rect(LEFT, y, W, 40).fill(C.navy);
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text('TRUE MONTHLY BURN', LEFT + 12, y + 8);
      doc.fillColor(C.white).fontSize(20).font('Times-Bold').text(fmtM(sim.tmib), LEFT, y + 10, { width: W - 12, align: 'right' });
      y += 52;

      // Composition bar
      const burnParts = [
        { label: 'Loan payments', val: sim.monthlyDebtPayments },
        { label: 'Living costs', val: sim.livingExpenses },
        { label: 'Healthcare', val: hc },
        { label: 'Tax reserve', val: sim.selfEmploymentTax },
        { label: 'Business', val: sim.businessCostBaseline },
      ].filter(p => p.val > 0);
      const totalBurn = burnParts.reduce((a, p) => a + p.val, 0) || 1;
      const opacities = [1, 0.74, 0.54, 0.36, 0.22];
      let bx = LEFT;
      burnParts.forEach((p, i) => {
        const bw = Math.round((p.val / totalBurn) * W);
        doc.save().fillOpacity(opacities[i] ?? 0.2).rect(bx, y, bw, 14).fill(C.navy).restore();
        bx += bw;
      });
      y += 18;
      bx = LEFT;
      burnParts.forEach((p, i) => {
        const pct = Math.round((p.val / totalBurn) * 100);
        doc.save().fillOpacity(opacities[i] ?? 0.2).rect(bx, y, 8, 8).fill(C.navy).restore();
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text(`${p.label} ${pct}%`, bx + 11, y + 1);
        bx += 92;
      });
      y += 20;

      // Interpretation callouts
      const fixedPct = sim.tmib > 0 ? Math.round((fixedSub / sim.tmib) * 100) : 0;
      const sePct = sim.tmib > 0 ? Math.round((sim.selfEmploymentTax / sim.tmib) * 100) : 0;

      doc.rect(LEFT, y, W, 1).fill(C.border); y += 10;
      doc.fillColor(C.coal).fontSize(9).font('Helvetica')
        .text(`Fixed obligations (loan payments + healthcare) make up ${fixedPct}% of burn. These cannot be reduced under stress without structural changes — they are the hardest costs to cut.`, LEFT, y, { width: W, lineGap: 2 });
      y += 26;
      if (sePct > 0) {
        doc.text(`The self-employment tax reserve (${sePct}% of burn) does flex — it scales with revenue and eases naturally in lower-income months. It is not as rigid as debt or insurance.`, LEFT, y, { width: W, lineGap: 2 });
        y += 26;
      }

      pageFooter(doc, 3, TOTAL);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 4 — LIQUIDITY DEFENSE MAP
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'Liquidity Defense Map', 'Capital organized by accessibility. Under stress, depletion follows this order.', y);

      // Tier table
      const tierRows = [
        { tier: 1, tier_label: 'Fully Liquid', label: 'Cash & HYSA', haircut: '100%', raw: sim.cash, counted: tier1Cap, note: 'No penalty, no tax, no delay.' },
        { tier: 2, tier_label: 'Semi-Liquid', label: 'Brokerage accounts', haircut: '80%', raw: sim.brokerage, counted: tier2Cap, note: 'May trigger capital gains taxes when sold.' },
        { tier: 3, tier_label: 'Restricted', label: 'Roth IRA (contributions)', haircut: '100%', raw: sim.roth, counted: Math.round(sim.roth), note: 'Accessible but still retirement — treat as emergency.' },
        { tier: 3, tier_label: 'Restricted', label: 'Traditional IRA / 401(k)', haircut: '50%', raw: sim.traditional, counted: Math.round(sim.traditional * 0.50), note: 'Taxes + 10% early withdrawal penalty. Last Resort.' },
        { tier: 3, tier_label: 'Restricted', label: 'Home equity', haircut: '30%', raw: sim.realEstate, counted: Math.round(sim.realEstate * 0.30), note: 'Illiquid — 6–10% transaction costs, market timing.' },
      ];

      // Header
      doc.rect(LEFT, y, W, 22).fill(C.navy);
      [['Asset', 80], ['Haircut', 50], ['Declared', 80], ['Counted', 80]].forEach(([h, w], i) => {
        const xp = [LEFT + 10, LEFT + 210, RIGHT - 170, RIGHT - 86];
        doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text(h as string, xp[i], y + 7);
      });
      y += 22;

      let lastTier = 0;
      tierRows.forEach((row, i) => {
        if (row.raw === 0 && row.tier === 3) return;
        if (row.tier !== lastTier) {
          const tierColor = row.tier === 3 ? '#fffbeb' : C.mid;
          const tierLabel = row.tier === 1 ? 'TIER 1 — FULLY LIQUID (Primary Runway)' : row.tier === 2 ? 'TIER 2 — SEMI-LIQUID' : 'TIER 3 — RESTRICTED / LAST RESORT';
          doc.rect(LEFT, y, W, 16).fill(tierColor);
          doc.fillColor(row.tier === 3 ? C.amber : C.muted).fontSize(7).font('Helvetica-Bold').text(tierLabel, LEFT + 10, y + 4);
          y += 16;
          lastTier = row.tier;
        }
        const bg = i % 2 === 0 ? C.light : C.mid;
        doc.rect(LEFT, y, W, 36).fill(bg);
        doc.fillColor(C.coal).fontSize(9.5).font('Helvetica-Bold').text(row.label, LEFT + 10, y + 7, { width: 195 });
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text(row.note, LEFT + 10, y + 21, { width: 195 });
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text(row.haircut, LEFT + 210, y + 14);
        doc.fillColor(C.coal).fontSize(9.5).font('Helvetica').text(fmtM(row.raw), RIGHT - 170, y + 14);
        doc.fillColor(C.navy).fontSize(10).font('Helvetica-Bold').text(fmtM(row.counted), RIGHT - 86, y + 14);
        y += 36;
      });

      // Liquidity Line subtotal
      doc.rect(LEFT, y, W, 34).fill('#f0f9ff');
      doc.rect(LEFT, y, 3, 34).fill(C.blue);
      doc.fillColor(C.blue).fontSize(8).font('Helvetica-Bold').text('LIQUIDITY LINE (TIER 1+2) — PRIMARY SAFETY BUFFER', LEFT + 12, y + 8);
      doc.fillColor(C.blue).fontSize(14).font('Times-Bold').text(fmtM(t1t2Cap), LEFT, y + 10, { width: W - 12, align: 'right' });
      y += 34;

      // Total
      doc.rect(LEFT, y, W, 38).fill(C.navy);
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text('TOTAL ACCESSIBLE CAPITAL (ALL TIERS)', LEFT + 12, y + 8);
      doc.fillColor(C.white).fontSize(18).font('Times-Bold').text(fmtM(sim.accessibleCapital), LEFT, y + 10, { width: W - 12, align: 'right' });
      y += 50;

      // Tier 3 warning
      if (tier3Cap > 0) {
        doc.rect(LEFT, y, W, 36).fill('#fffbeb');
        doc.rect(LEFT, y, 3, 36).fill(C.amber);
        doc.fillColor(C.amber).fontSize(9).font('Helvetica-Bold').text('Emergency Zone — Tier 3 Is Not a Plan', LEFT + 12, y + 8, { width: W - 24 });
        doc.fillColor(C.coal).fontSize(8.5).font('Helvetica').text('Tier 3 is not considered primary runway. Accessing retirement early may cause penalties, taxes, and long-term retirement damage. This report shows when Tier 3 would be required — not to encourage it, but to name the risk.', LEFT + 12, y + 20, { width: W - 24 });
        y += 44;
      }

      pageFooter(doc, 4, TOTAL);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 5 — LIQUIDITY LINE RESULT (THE HEADLINE PAGE)
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'Liquidity Line — When Does Tier 1+2 Run Out?',
        'The Liquidity Line is when your cash and brokerage run dry. After this point, you either become cash-flow positive or enter Tier 3 territory.', y);

      // 4-scenario bars
      const llScenarios = [
        { label: 'Expected conditions (revenue at target)', months: llBase },
        { label: 'Moderate income contraction (−15%)', months: ll15 },
        { label: 'Severe income contraction (−30%)', months: ll30 },
        { label: 'Ramp delayed +3 months', months: llRamp3 },
      ];
      const maxLL = Math.max(...llScenarios.filter(s => s.months < 999).map(s => s.months), 24);

      llScenarios.forEach((sc, i) => {
        const pct = sc.months >= 999 ? 1.0 : Math.min(sc.months / (maxLL * 1.15), 1.0);
        const barW = Math.round(pct * (W - 150));
        const barColor = sc.months >= 24 ? C.navy : sc.months >= 12 ? C.coal : C.muted;
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(sc.label, LEFT, y, { width: W - 152 });
        doc.fillColor(C.navy).fontSize(10).font('Times-Bold').text(fmtMoShort(sc.months), RIGHT - 148, y, { width: 148, align: 'right' });
        y += 13;
        doc.rect(LEFT, y, W - 150, 10).fill(C.border);
        doc.rect(LEFT, y, barW, 10).fill(barColor);
        y += 18;
      });
      y += 8;

      // Warning callout based on ll30
      let warningText: string, warningBg: string, warningBorder: string;
      if (ll30 < 6) {
        warningBg = '#fef2f2'; warningBorder = C.red;
        warningText = `Under a severe income contraction (−30%), your Tier 1+2 capital would be exhausted in ${ll30} months. That's less than 6 months — a very thin cushion. This does not mean don't go — it means the risk profile changes sharply, fast.`;
      } else if (ll30 < 12) {
        warningBg = '#fffbeb'; warningBorder = C.amber;
        warningText = `Under a severe income contraction (−30%), your Tier 1+2 capital lasts ${ll30} months before running out. Under ${12} months is worth taking seriously — a bad quarter in the first year could force difficult decisions.`;
      } else {
        warningBg = '#f0fdf4'; warningBorder = C.green;
        warningText = `Even under a severe income contraction (−30%), your Tier 1+2 capital covers ${ll30 >= 999 ? 'well beyond the model horizon' : `${ll30} months`}. That's a meaningful cushion. The pressure point is comfort, not survival.`;
      }
      doc.rect(LEFT, y, W, 48).fill(warningBg);
      doc.rect(LEFT, y, 3, 48).fill(warningBorder);
      doc.fillColor(C.coal).fontSize(9.5).font('Helvetica').text(warningText, LEFT + 12, y + 10, { width: W - 24, lineGap: 2 });
      y += 58;

      // Comparison table
      doc.rect(LEFT, y, W, 22).fill(C.navy);
      ['Scenario', 'Liquidity Line', 'Full Runway', 'Tier 3 Required?'].forEach((h, i) => {
        const xp = [LEFT + 10, LEFT + 200, LEFT + 300, LEFT + 392];
        doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text(h, xp[i], y + 7);
      });
      y += 22;

      llScenarios.forEach((sc, i) => {
        const fullRun = i === 0 ? sim.baseRunway : i === 1 ? sim.runway15Down : i === 2 ? sim.runway30Down : sim.runwayRampDelay;
        const needsTier3 = sc.months < fullRun && fullRun < 999;
        const bg = i % 2 === 0 ? C.light : C.mid;
        doc.rect(LEFT, y, W, 28).fill(bg);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(sc.label, LEFT + 10, y + 9, { width: 185 });
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtMoShort(sc.months), LEFT + 200, y + 9);
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtYrs(fullRun), LEFT + 300, y + 9);
        doc.fillColor(needsTier3 ? C.red : C.green).fontSize(9).font('Helvetica-Bold').text(needsTier3 ? 'Yes' : 'No', LEFT + 392, y + 9);
        y += 28;
      });

      pageFooter(doc, 5, TOTAL);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 6 — REVENUE STRESS + CASH COVERAGE LADDER
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'Revenue Stress Scenarios',
        'Three revenue scenarios tested against your burn. The ladder below shows your Tier 1+2 capital position at milestone months.', y);

      // 3-scenario summary
      const stressScenarios = [
        { label: 'Expected conditions', revMult: 1.00, ll: llBase, full: sim.baseRunway },
        { label: 'Moderate contraction (−15%)', revMult: 0.85, ll: ll15, full: sim.runway15Down },
        { label: 'Severe contraction (−30%)', revMult: 0.70, ll: ll30, full: sim.runway30Down },
      ];

      doc.rect(LEFT, y, W, 22).fill(C.navy);
      ['Scenario', 'Monthly Revenue', 'Liquidity Line', 'Full Runway'].forEach((h, i) => {
        const xp = [LEFT + 10, LEFT + 195, LEFT + 290, LEFT + 390];
        doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text(h, xp[i], y + 7);
      });
      y += 22;

      stressScenarios.forEach((sc, i) => {
        const monthlyRev = Math.round(sim.expectedRevenue * sc.revMult * (1 - sim.volatilityPercent / 100));
        const bg = i % 2 === 0 ? C.light : C.mid;
        doc.rect(LEFT, y, W, 28).fill(bg);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(sc.label, LEFT + 10, y + 9, { width: 180 });
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(fmtM(monthlyRev) + '/mo', LEFT + 195, y + 9);
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtMoShort(sc.ll), LEFT + 290, y + 9);
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtYrs(sc.full), LEFT + 390, y + 9);
        y += 28;
      });
      y += 14;

      // Cash Coverage Ladder (base case, milestone months)
      doc.fillColor(C.navy).fontSize(12).font('Times-Bold').text('Cash Coverage Ladder — Base Case', LEFT, y);
      y += 6;
      doc.fillColor(C.muted).fontSize(8.5).font('Helvetica').text('Tier 1+2 capital remaining at milestone months under expected conditions.', LEFT, y, { width: W });
      y += 16;

      const ladder = coverageLadder(sim, 1.00, sim.rampDuration);
      doc.rect(LEFT, y, W, 20).fill(C.navy);
      ['Month', 'Revenue', 'Burn', 'Gap', 'Remaining T1+2', 'Status'].forEach((h, i) => {
        const xp = [LEFT + 6, LEFT + 58, LEFT + 140, LEFT + 218, LEFT + 302, LEFT + 390];
        doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text(h, xp[i], y + 6);
      });
      y += 20;

      ladder.forEach((row, i) => {
        const bg = row.inTier3Zone ? '#fef2f2' : i % 2 === 0 ? C.light : C.mid;
        doc.rect(LEFT, y, W, 20).fill(bg);
        const statusColor = row.inTier3Zone ? C.red : C.green;
        const statusText = row.inTier3Zone ? 'Tier 3 Zone' : 'Safe (T1+2)';
        const xp = [LEFT + 6, LEFT + 58, LEFT + 140, LEFT + 218, LEFT + 302, LEFT + 390];
        doc.fillColor(C.coal).fontSize(8).font('Helvetica')
          .text(`${row.month}`, xp[0], y + 6)
          .text(fmtM(row.revenue), xp[1], y + 6)
          .text(fmtM(row.burn), xp[2], y + 6)
          .text(row.gap >= 0 ? fmtM(row.gap) : `(${fmtM(Math.abs(row.gap))})`, xp[3], y + 6);
        doc.fillColor(row.remainingT1T2 === 0 && row.inTier3Zone ? C.red : C.navy).fontSize(8).font('Helvetica-Bold')
          .text(fmtM(row.remainingT1T2), xp[4], y + 6);
        doc.fillColor(statusColor).fontSize(8).font('Helvetica-Bold').text(statusText, xp[5], y + 6);
        y += 20;
      });

      pageFooter(doc, 6, TOTAL);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 7 — RAMP TIMING SCENARIOS
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'Ramp Timing Sensitivity',
        `Your base ramp is ${sim.rampDuration} months. This shows how arriving early or late by up to 3 months shifts your Liquidity Line.`, y);

      doc.rect(LEFT, y, W, 22).fill(C.navy);
      ['Ramp Delta', 'Months', 'Liquidity Line', 'Full Runway', 'Tier 3?'].forEach((h, i) => {
        const xp = [LEFT + 10, LEFT + 90, LEFT + 175, LEFT + 285, LEFT + 390];
        doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text(h, xp[i], y + 7);
      });
      y += 22;

      rampVariants.forEach((rv, i) => {
        const bg = rv.delta === 0 ? C.mid : i % 2 === 0 ? C.light : C.mid;
        const deltaLabel = rv.delta === 0 ? 'Base case' : rv.delta > 0 ? `+${rv.delta} months (late)` : `${rv.delta} months (early)`;
        const needsTier3 = rv.ll < rv.full && rv.full < 999;
        doc.rect(LEFT, y, W, 28).fill(bg);
        if (rv.delta === 0) doc.rect(LEFT, y, 3, 28).fill(C.navy);
        const xp = [LEFT + 10, LEFT + 90, LEFT + 175, LEFT + 285, LEFT + 390];
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(deltaLabel, xp[0], y + 9);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(`${rv.rampMonths} mo`, xp[1], y + 9);
        doc.fillColor(rv.delta === 0 ? C.navy : C.coal).fontSize(rv.delta === 0 ? 10 : 9)
          .font(rv.delta === 0 ? 'Helvetica-Bold' : 'Helvetica').text(fmtMoShort(rv.ll), xp[2], y + 9);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(fmtYrs(rv.full), xp[3], y + 9);
        doc.fillColor(needsTier3 ? C.red : C.green).fontSize(9).font('Helvetica-Bold')
          .text(needsTier3 ? 'Yes' : 'No', xp[4], y + 9);
        y += 28;
      });
      y += 14;

      // Interpretation
      const baseLL = rampVariants.find(r => r.delta === 0)?.ll ?? 0;
      const minus3LL = rampVariants.find(r => r.delta === -3)?.ll ?? 0;
      const plus3LL = rampVariants.find(r => r.delta === 3)?.ll ?? 0;
      const rampText = `A 3-month early ramp shifts the Liquidity Line from ${fmtMoShort(baseLL)} to ${fmtMoShort(minus3LL)} — a ${minus3LL >= 999 || baseLL >= 999 ? 'significant' : `${minus3LL - baseLL} month`} improvement. A 3-month late ramp shifts it to ${fmtMoShort(plus3LL)}. Every month of early revenue reduces how long your savings must cover the full gap.`;
      y = insightBlock(doc, 'What Ramp Timing Means', rampText, y);

      pageFooter(doc, 7, TOTAL);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 8 — HOUSEHOLD SHOCK SCENARIOS
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'Household Shock Scenarios', 'Secondary risks that can compound the transition. Not predictions — edge cases worth knowing.', y);

      // Partner Job Loss
      doc.fillColor(C.navy).fontSize(12).font('Times-Bold').text('Partner Job Loss', LEFT, y);
      y += 18;

      if (partnerLoss && sim.isDualIncome) {
        doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
          .text(`Partner income of ${fmtM(sim.partnerIncome)}/month is currently offsetting burn. If that stops, your effective burn rises by that amount for the duration of the loss.`, LEFT, y, { width: W, lineGap: 2 });
        y += 22;

        doc.rect(LEFT, y, W, 22).fill(C.navy);
        ['Duration', 'Liquidity Line', 'Full Runway', 'Tier 3 Required?'].forEach((h, i) => {
          const xp = [LEFT + 10, LEFT + 130, LEFT + 255, LEFT + 380];
          doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text(h, xp[i], y + 7);
        });
        y += 22;

        partnerLoss.forEach((pl, i) => {
          const needsTier3 = pl.ll < pl.full && pl.full < 999;
          const bg = i % 2 === 0 ? C.light : C.mid;
          doc.rect(LEFT, y, W, 28).fill(bg);
          const xp = [LEFT + 10, LEFT + 130, LEFT + 255, LEFT + 380];
          doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(`Loss for ${pl.dur} months`, xp[0], y + 9);
          doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtMoShort(pl.ll), xp[1], y + 9);
          doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(fmtYrs(pl.full), xp[2], y + 9);
          doc.fillColor(needsTier3 ? C.red : C.green).fontSize(9).font('Helvetica-Bold')
            .text(needsTier3 ? 'Yes' : 'No', xp[3], y + 9);
          y += 28;
        });
        y = insightBlock(doc, 'What this means',
          `Partner job loss during the transition is exactly the kind of shock that forces Tier 3 territory earlier than planned. If you're dual-income and your position relies on that offset, have a clear conversation about job security before the leap.`, y + 8);
      } else {
        doc.rect(LEFT, y, W, 30).fill(C.light);
        doc.fillColor(C.muted).fontSize(9).font('Helvetica').text('Not applicable — no partner income entered. Partner job loss scenario is only relevant for dual-income households.', LEFT + 12, y + 10, { width: W - 24 });
        y += 40;
      }

      // New Child
      doc.fillColor(C.navy).fontSize(12).font('Times-Bold').text('New Child', LEFT, y);
      y += 16;
      doc.fillColor(C.muted).fontSize(8).font('Helvetica')
        .text('Assumptions used below — adjust with your advisor if different apply.', LEFT, y);
      y += 12;

      const childAssumptions = [
        `One-time cost: ${fmtM(CHILD_ONETIME)} (equipment, setup, medical)`,
        `Monthly delta: ${fmtM(CHILD_MONTHLY)}/month (childcare, supplies, insurance adjustments)`,
        'No adjustment to partner income or healthcare assumed',
      ];
      childAssumptions.forEach(a => {
        doc.rect(LEFT, y, W, 18).fill(C.light);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(`· ${a}`, LEFT + 10, y + 4, { width: W - 20 });
        y += 18;
      });
      y += 8;

      // New child impact vs base
      const childNeedsTier3 = llNewChild < (llBase < 999 ? llBase : 999) || llNewChild < sim.baseRunway;
      doc.rect(LEFT, y, W, 50).fill(C.mid);
      doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('BASE LIQUIDITY LINE', LEFT + 12, y + 8);
      doc.fillColor(C.muted).fontSize(8).text('WITH NEW CHILD', LEFT + 200, y + 8);
      doc.fillColor(C.muted).fontSize(8).text('TIER 3 REQUIRED?', LEFT + 360, y + 8);
      doc.fillColor(C.navy).fontSize(14).font('Times-Bold').text(fmtMoShort(llBase), LEFT + 12, y + 24);
      doc.fillColor(childNeedsTier3 ? C.red : C.navy).fontSize(14).font('Times-Bold').text(fmtMoShort(llNewChild), LEFT + 200, y + 24);
      doc.fillColor(childNeedsTier3 ? C.red : C.green).fontSize(14).font('Times-Bold').text(childNeedsTier3 ? 'Yes' : 'No', LEFT + 360, y + 24);
      y += 58;

      pageFooter(doc, 8, TOTAL);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 9 — WHAT MOVES THE NEEDLE
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'What Moves the Needle',
        'Sensitivity analysis — how specific changes shift your Liquidity Line. This does not mean you should make these changes. It shows leverage.', y);

      // Burn reduction table
      doc.fillColor(C.navy).fontSize(12).font('Times-Bold').text('Lever A — Reduce Monthly Burn', LEFT, y);
      y += 16;
      doc.rect(LEFT, y, W, 20).fill(C.navy);
      ['Reduction', 'New Burn', 'LL — Base', 'LL — Severe (−30%)', 'Delta vs Base'].forEach((h, i) => {
        const xp = [LEFT + 10, LEFT + 100, LEFT + 185, LEFT + 285, LEFT + 390];
        doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text(h, xp[i], y + 6);
      });
      y += 20;

      [0, 500, 1000, 2000].forEach((adj, i) => {
        const newBurn = sim.tmib - adj;
        const llB = adj === 0 ? llBase : calcLLBurnAdj(adj);
        const llS = adj === 0 ? ll30 : (() => {
          let cap = t1t2Cap; const vol = 1 - sim.volatilityPercent / 100;
          for (let m = 1; m <= 300; m++) {
            const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
            cap -= ((sim.tmib - adj) - sim.expectedRevenue * 0.70 * rf * vol);
            if (cap <= 0) return m;
          }
          return 999;
        })();
        const delta = llB >= 999 ? '—' : llBase >= 999 ? '—' : `+${llB - llBase} mo`;
        const bg = i % 2 === 0 ? C.light : C.mid;
        doc.rect(LEFT, y, W, 24).fill(bg);
        const xp = [LEFT + 10, LEFT + 100, LEFT + 185, LEFT + 285, LEFT + 390];
        const label = adj === 0 ? 'No change (base)' : `-${fmtM(adj)}/mo`;
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(label, xp[0], y + 7);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(fmtM(newBurn), xp[1], y + 7);
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtMoShort(llB), xp[2], y + 7);
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtMoShort(llS), xp[3], y + 7);
        doc.fillColor(adj > 0 ? C.green : C.muted).fontSize(9).font('Helvetica-Bold').text(adj === 0 ? '—' : delta, xp[4], y + 7);
        y += 24;
      });
      y += 14;

      // Revenue increase table
      doc.fillColor(C.navy).fontSize(12).font('Times-Bold').text('Lever B — Increase Stable Revenue Target', LEFT, y);
      y += 16;
      doc.rect(LEFT, y, W, 20).fill(C.navy);
      ['Increase', 'New Target', 'LL — Base', 'LL — Severe (−30%)', 'Delta vs Base'].forEach((h, i) => {
        const xp = [LEFT + 10, LEFT + 100, LEFT + 185, LEFT + 285, LEFT + 390];
        doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text(h, xp[i], y + 6);
      });
      y += 20;

      [0, 500, 1000].forEach((adj, i) => {
        const newTarget = sim.expectedRevenue + adj;
        const llB = adj === 0 ? llBase : calcLLRevAdj(adj);
        const llS = adj === 0 ? ll30 : (() => {
          let cap = t1t2Cap; const vol = 1 - sim.volatilityPercent / 100;
          for (let m = 1; m <= 300; m++) {
            const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
            cap -= (sim.tmib - (sim.expectedRevenue + adj) * 0.70 * rf * vol);
            if (cap <= 0) return m;
          }
          return 999;
        })();
        const delta = llB >= 999 ? '—' : llBase >= 999 ? '—' : `+${llB - llBase} mo`;
        const bg = i % 2 === 0 ? C.light : C.mid;
        doc.rect(LEFT, y, W, 24).fill(bg);
        const xp = [LEFT + 10, LEFT + 100, LEFT + 185, LEFT + 285, LEFT + 390];
        const label = adj === 0 ? 'No change (base)' : `+${fmtM(adj)}/mo`;
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(label, xp[0], y + 7);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(fmtM(newTarget), xp[1], y + 7);
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtMoShort(llB), xp[2], y + 7);
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtMoShort(llS), xp[3], y + 7);
        doc.fillColor(adj > 0 ? C.green : C.muted).fontSize(9).font('Helvetica-Bold').text(adj === 0 ? '—' : delta, xp[4], y + 7);
        y += 24;
      });
      y += 14;

      // Healthcare lever (if significant)
      if (hc > sim.tmib * 0.12) {
        doc.fillColor(C.navy).fontSize(12).font('Times-Bold').text('Lever C — Healthcare Cost Reduction', LEFT, y);
        y += 16;
        const hcBurnPct = Math.round((hc / sim.tmib) * 100);
        y = insightBlock(doc, `Healthcare is ${hcBurnPct}% of your burn (${fmtM(hc)}/month)`,
          `If healthcare cost dropped by ${fmtM(Math.round(hc * 0.40))} (e.g., through partner coverage or income-based ACA subsidies), the Liquidity Line under base conditions would extend by approximately ${Math.round((hc * 0.40) / Math.max(1, sim.tmib - sim.expectedRevenue * 0.85 * (1 - sim.volatilityPercent / 100)) * (ll15 < 999 ? 1 : 0))} months. Healthcare is one of the highest-leverage controllable costs.`, y);
      }

      doc.fillColor(C.muted).fontSize(8).font('Helvetica-Oblique')
        .text('These are sensitivity results, not recommendations. Context matters. Consult a qualified professional before acting on any of these figures.', LEFT, y, { width: W, lineGap: 2 });

      pageFooter(doc, 9, TOTAL);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 10 — STABILITY THRESHOLDS
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'Stability Thresholds',
        'To survive a severe income contraction (−30%) without entering Tier 3, at least one of the following conditions must hold. These are thresholds, not advice.', y);

      const thresholds = [
        {
          title: 'Minimum Tier 1+2 Capital Required',
          current: fmtM(t1t2Cap),
          target: fmtM(minT1T2For12Mo),
          met: t1t2Cap >= minT1T2For12Mo,
          explanation: `Under a −30% revenue scenario, your monthly Tier1+2 drain is ${fmtM(monthlyDrain30)}. To sustain 12 months without touching Tier 3, you'd need ${fmtM(minT1T2For12Mo)} in Tier 1+2. You currently have ${fmtM(t1t2Cap)}.`,
        },
        {
          title: 'Minimum Revenue Target to Sustain 12 Months',
          current: fmtM(sim.expectedRevenue),
          target: minRevFor12Mo > 0 ? fmtM(minRevFor12Mo) : 'Already sufficient',
          met: minRevFor12Mo <= 0 || sim.expectedRevenue >= minRevFor12Mo,
          explanation: `For your current Tier1+2 capital (${fmtM(t1t2Cap)}) to cover 12 months under −30% stress, you'd need monthly revenue of at least ${minRevFor12Mo > 0 ? fmtM(minRevFor12Mo) : 'less than your current target'}. Your target is ${fmtM(sim.expectedRevenue)}.`,
        },
        {
          title: 'Maximum Sustainable Burn (12-Month Threshold)',
          current: fmtM(sim.tmib),
          target: fmtM(maxBurnFor12Mo),
          met: sim.tmib <= maxBurnFor12Mo,
          explanation: `Given your current Tier1+2 capital and revenue plan, your burn cannot exceed ${fmtM(maxBurnFor12Mo)}/month to maintain 12 months of liquidity under severe stress. Your current burn is ${fmtM(sim.tmib)}.`,
        },
      ];

      thresholds.forEach((t, i) => {
        const bg = t.met ? '#f0fdf4' : '#fef2f2';
        const bc = t.met ? C.green : C.red;
        const statusLabel = t.met ? 'Met' : 'Gap Exists';
        const h = Math.max(90, Math.ceil(t.explanation.length / 80) * 10 + 55);
        doc.rect(LEFT, y, W, h).fill(bg);
        doc.rect(LEFT, y, 3, h).fill(bc);
        doc.fillColor(bc).fontSize(8).font('Helvetica-Bold').text(statusLabel.toUpperCase(), LEFT + 12, y + 8);
        doc.fillColor(C.navy).fontSize(10).font('Helvetica-Bold').text(t.title, LEFT + 60, y + 8);
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('CURRENT', LEFT + 12, y + 26).text('TARGET', LEFT + 130, y + 26);
        doc.fillColor(C.coal).fontSize(12).font('Times-Bold').text(t.current, LEFT + 12, y + 38);
        doc.fillColor(bc).fontSize(12).font('Times-Bold').text(t.target, LEFT + 130, y + 38);
        doc.fillColor(C.coal).fontSize(8.5).font('Helvetica').text(t.explanation, LEFT + 12, y + 56, { width: W - 24, lineGap: 1.5 });
        y += h + 10;
      });

      pageFooter(doc, 10, TOTAL);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 11 — ADVISOR COMMENTARY
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'What This Means For You', 'A plain-English summary of your structural position.', y);

      const sColor = score >= 70 ? C.green : score >= 50 ? C.amber : C.red;
      doc.rect(LEFT, y, W, 56).fill(C.mid);
      doc.fillColor(sColor).fontSize(26).font('Times-Bold').text(`${score}`, LEFT + 16, y + 10);
      doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('/ 100', LEFT + 56, y + 20);
      doc.fillColor(sColor).fontSize(11).font('Helvetica-Bold').text(scoreLabel(score), LEFT + 80, y + 14);
      const bandText = score >= 70 ? 'Structurally stable — meaningful flexibility under normal conditions.'
        : score >= 50 ? 'Moderately exposed — workable, but limited margin for compounding problems.'
        : 'Structurally fragile — thin cushion against early income shortfalls.';
      doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(bandText, LEFT + 80, y + 30, { width: W - 100 });
      y += 68;

      // Advisory paragraphs
      const advisorParagraph = score >= 70
        ? `Your capital and income plan create a defensible position. Under expected conditions, your Liquidity Line holds for ${fmtMoShort(llBase)} — and ${llBase >= 12 ? 'that\'s enough buffer to absorb a slow start without immediately entering Tier 3 territory' : 'though you\'d want that to strengthen before a move this significant'}. The transition is viable as modeled. The primary remaining variable is execution.`
        : score >= 50
        ? `The numbers are workable — but not comfortable. Under a severe scenario, your Liquidity Line is ${fmtMoShort(ll30)}. ${ll30 < 12 ? 'That\'s under 12 months, which means a slow ramp or one rough quarter forces difficult decisions early.' : 'You have some buffer, but not enough to absorb multiple things going wrong at once.'} The transition is feasible with discipline.`
        : `The numbers show real pressure. A Liquidity Line of ${fmtMoShort(ll30)} under severe stress means your breathing room is thin. That doesn't mean this move is wrong — it means the current structure makes it fragile. More Tier 1+2 capital, lower burn, or a confirmed revenue ramp would change that picture materially.`;
      y = insightBlock(doc, 'Overall Assessment', advisorParagraph, y);

      const retirementNote = tier3Cap > 0 && ll30 < (t1t2Cap > 0 ? t1t2Cap / Math.max(1, monthlyDrain30) : 999)
        ? `Your Tier 1+2 capital (${fmtM(t1t2Cap)}) runs out at month ${fmtMoShort(ll30)} under severe stress — before your full runway ends. That gap would have to be filled by Tier 3 assets. Accessing retirement funds early permanently reduces long-term compounding. The model shows you this gap not to encourage it, but to make sure you're going in clear-eyed.`
        : `Your Tier 1+2 capital appears sufficient to carry this transition without needing to touch retirement assets under the modeled scenarios. That is the healthiest position to be in — and worth protecting.`;
      y = insightBlock(doc, 'Retirement Dependency', retirementNote, y);

      const hcBurnPct2 = sim.tmib > 0 ? Math.round((hc / sim.tmib) * 100) : 0;
      const bestMove = (hcBurnPct2 >= 15)
        ? `Healthcare cost (${hcBurnPct2}% of burn, ${fmtM(hc)}/month) is the single highest-leverage controllable cost. Partner coverage or income-based ACA subsidies could materially change your position without touching capital.`
        : (sim.rampDuration > 6)
        ? `Entering with client commitments already in hand — or shortening your ramp by even 2 months — would significantly reduce how long your savings must cover the full gap.`
        : `Adding even $1,000/month to your stable revenue target has outsized impact on the Liquidity Line. Any pre-exit work that validates revenue reduces the dependency on capital.`;
      y = insightBlock(doc, 'The Single Change That Matters Most', bestMove, y);

      pageFooter(doc, 11, TOTAL);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 12 — APPENDIX: YOUR INPUTS
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      pageHeader(doc, reportDate);
      y = 50;
      y = sectionHead(doc, 'Appendix — Your Inputs', 'Every value used in this simulation. Verify against your own records.', y);

      const inputGroups = [
        {
          heading: 'Income Context',
          rows: [
            ['Household type', sim.isDualIncome ? 'Dual income' : 'Single income'],
            ['Your monthly take-home', fmtM(sim.currentSalary ?? 0)],
            ...(sim.isDualIncome ? [['Partner monthly take-home', fmtM(sim.partnerIncome ?? 0)]] : []),
          ],
        },
        {
          heading: 'Household Expenses (Non-Debt, Non-Healthcare)',
          rows: [
            ['Monthly household living costs', fmtM(sim.livingExpenses)],
          ],
        },
        {
          heading: 'Debt Payments (Required Minimums)',
          rows: [
            ['Monthly debt payments', fmtM(sim.monthlyDebtPayments)],
            ['Total remaining loan balances', fmtM(sim.totalDebt ?? 0)],
          ],
        },
        {
          heading: 'Healthcare',
          rows: [
            ['Coverage type', sim.healthcareType],
            ['Adults on plan', `${sim.adultsOnPlan}`],
            ['Dependent children', `${sim.dependentChildren}`],
            ['Current payroll deduction', fmtM(sim.currentPayrollHealthcare ?? 0)],
            ['Healthcare cost delta (monthly)', fmtM(hc)],
          ],
        },
        {
          heading: 'Liquidity / Capital (with haircuts)',
          rows: [
            ['Cash & HYSA (100%)', fmtM(sim.cash)],
            ['Brokerage (80%)', `${fmtM(sim.brokerage)} → ${fmtM(tier2Cap)} counted`],
            ['Roth IRA contributions (100%)', fmtM(sim.roth)],
            ['Traditional IRA / 401(k) (50%)', `${fmtM(sim.traditional)} → ${fmtM(Math.round(sim.traditional * 0.50))} counted`],
            ['Home equity (30%)', `${fmtM(sim.realEstate)} → ${fmtM(Math.round(sim.realEstate * 0.30))} counted`],
            ['Liquidity Line (Tier 1+2)', fmtM(t1t2Cap)],
            ['Total accessible capital', fmtM(sim.accessibleCapital)],
          ],
        },
        {
          heading: 'Income Plan',
          rows: [
            ['Business model', sim.businessModelType.replace(/_/g, ' ')],
            ['Business operating cost', fmtM(sim.businessCostBaseline)],
            ['Expected monthly revenue', fmtM(sim.expectedRevenue)],
            ['Ramp timeline', `${sim.rampDuration} months`],
            ['Volatility / income variance', `${sim.volatilityPercent}%`],
            ['SE tax reserve (28% of revenue)', fmtM(sim.selfEmploymentTax)],
            ['True Monthly Burn', fmtM(sim.tmib)],
          ],
        },
      ];

      inputGroups.forEach(grp => {
        doc.rect(LEFT, y, W, 18).fill(C.navy);
        doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text(grp.heading.toUpperCase(), LEFT + 10, y + 5);
        y += 18;
        grp.rows.forEach((row, i) => {
          const h = 20;
          doc.rect(LEFT, y, W, h).fill(i % 2 === 0 ? C.light : C.mid);
          doc.fillColor(C.muted).fontSize(8.5).font('Helvetica').text(row[0], LEFT + 10, y + 5, { width: 260 });
          doc.fillColor(C.navy).fontSize(8.5).font('Helvetica-Bold').text(row[1], LEFT + 280, y + 5, { width: W - 290 });
          y += h;
        });
        y += 6;
      });

      pageFooter(doc, 12, TOTAL);

      doc.end();

    } catch (err) {
      console.error('PDF generation failed:', err);
      if (!res.headersSent) res.status(500).json({ message: 'PDF generation failed. Please try again.' });
    }
  });

  return httpServer;
}

