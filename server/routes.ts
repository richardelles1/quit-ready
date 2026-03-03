import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { calculateSimulation, BUSINESS_COST_BASELINES } from "./services/simulator";
import { z } from "zod";
import PDFDocument from "pdfkit";
import type { Simulation } from "@shared/schema";

// ─── PDF color palette ─────────────────────────────────────────────────────
const PDF = {
  navy:    '#1e293b',
  charcoal:'#334155',
  muted:   '#64748b',
  light:   '#f8fafc',
  mid:     '#f1f5f9',
  border:  '#e2e8f0',
  green:   '#15803d',
  amber:   '#b45309',
  red:     '#dc2626',
  white:   '#ffffff',
  cream:   '#f9fafb',
};

const W     = 492;   // usable content width
const LEFT  = 60;    // left margin
const RIGHT = 552;   // right edge
const BOTTOM_SAFE = 706; // Y threshold before forcing new page

function fmtM (n: number): string { return `$${Math.round(n).toLocaleString('en-US')}`; }
function fmtPctP(n: number): string { return `${(n * 100).toFixed(1)}%`; }
function fmtYrs(months: number): string {
  if (months >= 999) return '24+ years';
  return `${(months / 12).toFixed(1)} yrs (${months} mo)`;
}
function scoreLabel(s: number): string {
  if (s >= 86) return 'Strong Buffer Position';
  if (s >= 70) return 'Structurally Stable';
  if (s >= 50) return 'Moderately Exposed';
  return 'Structurally Fragile';
}
function scoreColor(s: number): string {
  if (s >= 70) return PDF.green;
  if (s >= 50) return PDF.amber;
  return PDF.red;
}

function pageFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number) {
  doc.fillColor(PDF.muted).fontSize(8).font('Helvetica')
    .text(`QuitReady · Structural Breakpoint Report`, LEFT, 758, { width: 220 })
    .text(`Page ${pageNum} of ${totalPages}`, LEFT, 758, { width: W, align: 'right' });
}

function sectionHeading(doc: PDFKit.PDFDocument, title: string, sub: string | null, y: number): number {
  doc.rect(LEFT, y, W, 1).fill(PDF.border);
  y += 8;
  doc.fillColor(PDF.navy).fontSize(16).font('Times-Bold').text(title, LEFT, y, { width: W });
  y += 22;
  if (sub) {
    doc.fillColor(PDF.muted).fontSize(9).font('Helvetica').text(sub, LEFT, y, { width: W, lineGap: 2 });
    y += 22;
  }
  return y + 4;
}

function metricBox(doc: PDFKit.PDFDocument, x: number, y: number, w: number, label: string, value: string) {
  doc.rect(x, y, w, 46).fill(PDF.mid);
  doc.fillColor(PDF.muted).fontSize(7).font('Helvetica').text(label.toUpperCase(), x + 10, y + 8, { width: w - 20 });
  doc.fillColor(PDF.navy).fontSize(14).font('Times-Bold').text(value, x + 10, y + 20, { width: w - 20 });
}

function insightCard(doc: PDFKit.PDFDocument, y: number, heading: string, body: string): number {
  const bodyHeight = Math.max(50, Math.ceil(body.length / 72) * 12 + 20);
  const h = bodyHeight + 28;
  doc.rect(LEFT, y, W, h).fill(PDF.light);
  doc.rect(LEFT, y, 3, h).fill(PDF.navy);
  doc.fillColor(PDF.muted).fontSize(7.5).font('Helvetica-Bold')
    .text(heading.toUpperCase(), LEFT + 12, y + 8, { width: W - 20 });
  doc.fillColor(PDF.charcoal).fontSize(9.5).font('Helvetica')
    .text(body, LEFT + 12, y + 20, { width: W - 24, lineGap: 2 });
  return y + h + 8;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ─── POST /api/simulations ───────────────────────────────────────────────
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
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── GET /api/simulations/:id ────────────────────────────────────────────
  app.get(api.simulations.get.path, async (req, res) => {
    const sim = await storage.getSimulation(Number(req.params.id));
    if (!sim) return res.status(404).json({ message: 'Simulation not found' });
    res.json(sim);
  });

  // ─── GET /api/simulations/:id/pdf ────────────────────────────────────────
  app.get(api.simulations.downloadPdf.path, async (req, res) => {
    const sim = await storage.getSimulation(Number(req.params.id));
    if (!sim) return res.status(404).json({ message: 'Simulation not found' });

    try {
      const doc = new PDFDocument({ margin: 0, size: 'LETTER', autoFirstPage: true });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="QuitReady_Report_${sim.id}.pdf"`);
      doc.pipe(res);

      const reportDate = new Date(sim.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const TOTAL_PAGES = 6;
      const score  = sim.structuralBreakpointScore;
      const hc     = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
      const debtFlagged = sim.debtExposureRatio > 0.70;
      const worstRunway = Math.min(sim.runway15Down, sim.runway30Down, sim.runwayRampDelay);

      // Tier breakdown
      const tier1 = sim.cash;
      const tier2 = Math.round(sim.brokerage * 0.80);
      const tier3Roth = Math.round(sim.roth * 1.00);
      const tier3Trad = Math.round(sim.traditional * 0.50);
      const tier3RE   = Math.round(sim.realEstate * 0.30);
      const tier3Total = tier3Roth + tier3Trad + tier3RE;
      const reliesOnRetirement = tier3Total > 0 && (tier1 + tier2) < sim.tmib * 12;

      // Advisor bullets (plain text)
      const sScore = score >= 70 ? 'stable'
        : score >= 50 ? 'moderately exposed' : 'under meaningful pressure';
      const bullet1 = `Your finances are ${sScore} based on these inputs. The score of ${score}/100 places you in the "${scoreLabel(score)}" range.`;
      const bullet2 = sim.baseRunway >= 999
        ? `If revenue comes in as expected, your savings would last well beyond the model horizon. Capital is not your constraint.`
        : `If revenue comes in as expected, your savings would cover roughly ${fmtYrs(sim.baseRunway)} of expenses before running out.`;
      const bullet3 = sim.runway30Down >= 999
        ? `Even under a severe income contraction (−30%), the model finds no depletion point. Strong position.`
        : `Under a severe income contraction (−30%), liquidity is exhausted in approximately ${fmtYrs(sim.runway30Down)}.`;
      const bullet4 = debtFlagged
        ? `Loan balances represent ${fmtPctP(sim.debtExposureRatio)} of accessible capital — the primary structural vulnerability.`
        : hc > sim.tmib * 0.18
        ? `Healthcare transition cost represents ${Math.round((hc / sim.tmib) * 100)}% of monthly burn — a significant lever.`
        : `Revenue ramp execution is the most likely variable to determine whether the transition succeeds or strains capital.`;

      // Advisor commentary
      const advisorSummary = score >= 70
        ? `You have real flexibility here. The numbers support this move without requiring retirement assets under normal conditions. The key variable is whether revenue ramps on schedule.`
        : score >= 50
        ? `The transition is financially viable under expected conditions, but you have limited margin for error. A slower ramp or one bad revenue quarter could push you toward retirement assets sooner than planned.`
        : `This transition faces structural headwinds. The capital cushion is thin relative to the monthly burn. Reducing burn or increasing liquid savings before exit would meaningfully improve the outcome.`;

      const advisorBestMove = (hc > sim.tmib * 0.15)
        ? `Reducing healthcare cost — through partner coverage or income-based ACA subsidies — would have the fastest impact. At ${fmtM(hc)}/month, it represents ${Math.round((hc / sim.tmib) * 100)}% of total burn.`
        : (sim.rampDuration > 6)
        ? `Entering with existing client commitments or a shorter ramp would reduce the months your savings must cover the full gap.`
        : `Increasing stable revenue by even $1,000/month has outsized impact on worst-case runway. Any work done before exit to validate revenue helps.`;

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 1 — COVER
      // ═══════════════════════════════════════════════════════════════════
      doc.rect(0, 0, 612, 792).fill(PDF.navy);

      // Wordmark
      doc.fillColor('#ffffff').fontSize(38).font('Times-Bold').text('QuitReady.', LEFT, 100);
      doc.fillColor('#94a3b8').fontSize(1).moveDown(0);
      doc.rect(LEFT, 148, 80, 2).fill('#3b82f6');

      doc.fillColor('#ffffff').fontSize(20).font('Times-Roman')
        .text('Structural Breakpoint Report', LEFT, 162);

      doc.fillColor('#94a3b8').fontSize(11).font('Helvetica')
        .text(`${reportDate}`, LEFT, 196)
        .text(`Simulation ID: ${sim.id}`, LEFT, 212);

      // Score callout on cover
      const coverScoreColor = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
      doc.rect(LEFT, 270, 180, 90).fill('#0f172a');
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('STRUCTURAL BREAKPOINT SCORE', LEFT + 14, 283);
      doc.fillColor(coverScoreColor).fontSize(42).font('Times-Bold').text(`${score}`, LEFT + 14, 294);
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text(`/ 100 · ${scoreLabel(score)}`, LEFT + 66, 311);

      // Summary stat row on cover
      doc.rect(LEFT, 390, W, 1).fill('#334155');
      doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica')
        .text('MONTHLY BURN', LEFT, 404).text('ACCESSIBLE CAPITAL', LEFT + 130, 404)
        .text('BASE RUNWAY', LEFT + 270, 404).text('WORST-CASE RUNWAY', LEFT + 390, 404);
      doc.fillColor('#ffffff').fontSize(13).font('Times-Bold')
        .text(fmtM(sim.tmib), LEFT, 418)
        .text(fmtM(sim.accessibleCapital), LEFT + 130, 418)
        .text(fmtYrs(sim.baseRunway), LEFT + 270, 418)
        .text(fmtYrs(worstRunway), LEFT + 390, 418);
      doc.rect(LEFT, 440, W, 1).fill('#334155');

      // Disclaimer footer on cover
      doc.fillColor('#475569').fontSize(8).font('Helvetica')
        .text(
          'This report is an educational financial simulation based on user-provided inputs and estimated U.S. averages. It is not financial, tax, or legal advice. Consult a qualified professional before making any major financial decisions.',
          LEFT, 700, { width: W, lineGap: 2 }
        );

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 2 — EXECUTIVE SUMMARY + BREAKPOINT SCORE
      // ═══════════════════════════════════════════════════════════════════
      doc.addPage();
      let y = 60;

      // Header stripe
      doc.rect(0, 0, 612, 38).fill(PDF.navy);
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
        .text('QUITREADY · STRUCTURAL BREAKPOINT REPORT', LEFT, 14)
        .text(reportDate, LEFT, 14, { width: W, align: 'right' });
      y = 58;

      y = sectionHeading(doc, 'Executive Summary', null, y);

      const bullets = [bullet1, bullet2, bullet3, bullet4];
      bullets.forEach((b, i) => {
        const bh = Math.max(40, Math.ceil(b.length / 78) * 11 + 18);
        doc.rect(LEFT, y, W, bh).fill(i % 2 === 0 ? PDF.light : PDF.mid);
        doc.fillColor(PDF.muted).fontSize(8).font('Helvetica-Bold').text(`${i + 1}`, LEFT + 10, y + 9);
        doc.fillColor(PDF.charcoal).fontSize(9.5).font('Helvetica').text(b, LEFT + 26, y + 9, { width: W - 36, lineGap: 1.5 });
        y += bh + 4;
      });
      y += 10;

      // Key metrics (2 × 2)
      metricBox(doc, LEFT, y, 236, 'Monthly Burn', fmtM(sim.tmib));
      metricBox(doc, LEFT + 246, y, 236, 'Accessible Capital', fmtM(sim.accessibleCapital));
      y += 54;
      metricBox(doc, LEFT, y, 236, 'Base Runway', fmtYrs(sim.baseRunway));
      metricBox(doc, LEFT + 246, y, 236, 'Worst-Case Runway', fmtYrs(worstRunway));
      y += 62;

      // Score section
      y = sectionHeading(doc, 'Breakpoint Score', null, y);

      doc.rect(LEFT, y, 150, 64).fill(score >= 70 ? '#f0fdf4' : score >= 50 ? '#fffbeb' : '#fef2f2');
      doc.rect(LEFT, y, 3, 64).fill(scoreColor(score));
      doc.fillColor(scoreColor(score)).fontSize(34).font('Times-Bold').text(`${score}`, LEFT + 14, y + 8);
      doc.fillColor(PDF.muted).fontSize(8).font('Helvetica').text('/ 100', LEFT + 72, y + 20);
      doc.fillColor(PDF.charcoal).fontSize(10).font('Helvetica-Bold').text(scoreLabel(score), LEFT + 14, y + 44);

      // 4-band legend
      const bands = [
        { range: '0–49',   label: 'Structurally Fragile' },
        { range: '50–69',  label: 'Moderately Exposed' },
        { range: '70–85',  label: 'Structurally Stable' },
        { range: '86–100', label: 'Strong Buffer' },
      ];
      let bx = LEFT + 162;
      bands.forEach((b, i) => {
        const isActive = (i === 0 && score < 50) || (i === 1 && score >= 50 && score < 70) ||
          (i === 2 && score >= 70 && score <= 85) || (i === 3 && score > 85);
        doc.rect(bx, y, 76, 64).fill(isActive ? PDF.mid : PDF.cream);
        if (isActive) doc.rect(bx, y, 76, 3).fill(PDF.navy);
        doc.fillColor(PDF.navy).fontSize(9.5).font('Helvetica-Bold').text(b.range, bx + 8, y + 14);
        doc.fillColor(PDF.muted).fontSize(7.5).font('Helvetica').text(b.label, bx + 8, y + 30, { width: 60 });
        bx += 80;
      });

      if (sim.breakpointMonth >= 999) {
        doc.fillColor(PDF.green).fontSize(9).font('Helvetica-Bold')
          .text('No structural breakpoint identified within the 24-year model horizon.', LEFT + 162, y + 50, { width: 320 });
      } else {
        doc.fillColor(PDF.charcoal).fontSize(9).font('Helvetica')
          .text(`Earliest breakpoint: ${fmtYrs(sim.breakpointMonth)} — ${sim.breakpointScenario}`, LEFT + 162, y + 50, { width: 320 });
      }

      pageFooter(doc, 2, TOTAL_PAGES);

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 3 — RUNWAY COMPARISON
      // ═══════════════════════════════════════════════════════════════════
      doc.addPage();
      doc.rect(0, 0, 612, 38).fill(PDF.navy);
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
        .text('QUITREADY · STRUCTURAL BREAKPOINT REPORT', LEFT, 14)
        .text(reportDate, LEFT, 14, { width: W, align: 'right' });
      y = 58;

      y = sectionHeading(doc, 'Liquidity Runway Under Stress Scenarios',
        'Bars show how long savings last before running out in each scenario. Revenue stress never increases your burn rate.', y);

      const scenarios = [
        { label: 'Expected conditions — revenue at target', runway: sim.baseRunway },
        { label: 'Moderate income contraction (−15%)', runway: sim.runway15Down },
        { label: 'Severe income contraction (−30%)', runway: sim.runway30Down },
        { label: 'Ramp takes 3 months longer than planned', runway: sim.runwayRampDelay },
      ];
      const maxRunways = scenarios.map(s => s.runway < 999 ? s.runway : 0);
      const maxScale = Math.max(Math.min(Math.max(...maxRunways, 24) * 1.2, 288), 24);

      scenarios.forEach((s) => {
        const pct = s.runway >= 999 ? 1.0 : Math.min(s.runway / maxScale, 1.0);
        const barW = Math.round(pct * (W - 160));
        const barColor = s.runway >= 999 ? PDF.green : s.runway >= 24 ? PDF.navy : s.runway >= 12 ? PDF.muted : PDF.charcoal;

        doc.fillColor(PDF.charcoal).fontSize(9).font('Helvetica').text(s.label, LEFT, y, { width: W - 160 });
        doc.fillColor(PDF.navy).fontSize(10).font('Times-Bold')
          .text(fmtYrs(s.runway), RIGHT - 138, y, { width: 138, align: 'right' });
        y += 13;
        // Track
        doc.rect(LEFT, y, W - 160, 10).fill('#e2e8f0');
        doc.rect(LEFT, y, barW, 10).fill(barColor);
        y += 18;
      });
      y += 10;

      // Scenario table
      doc.rect(LEFT, y, W, 26).fill(PDF.navy);
      const tableHeaders = ['Scenario', 'Runway', 'Liquidity Exhausted'];
      const tableX = [LEFT + 10, LEFT + 250, LEFT + 355];
      tableHeaders.forEach((h, i) => {
        doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold').text(h, tableX[i], y + 9);
      });
      y += 26;

      scenarios.forEach((s, i) => {
        const bg = i % 2 === 0 ? PDF.light : PDF.mid;
        const exhausted = s.runway >= 999 ? 'Not within horizon' : `${fmtYrs(s.runway)} · month ${s.runway}`;
        const eColor = s.runway >= 999 ? PDF.green : s.runway < 12 ? PDF.red : PDF.amber;
        doc.rect(LEFT, y, W, 32).fill(bg);
        doc.fillColor(PDF.charcoal).fontSize(9).font('Helvetica').text(s.label, tableX[0], y + 10, { width: 234 });
        doc.fillColor(PDF.navy).fontSize(9).font('Helvetica-Bold').text(fmtYrs(s.runway), tableX[1], y + 10, { width: 98 });
        doc.fillColor(eColor).fontSize(9).font('Helvetica-Bold').text(exhausted, tableX[2], y + 10, { width: 140 });
        y += 32;
      });

      pageFooter(doc, 3, TOTAL_PAGES);

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 4 — STRUCTURAL BURN BREAKDOWN
      // ═══════════════════════════════════════════════════════════════════
      doc.addPage();
      doc.rect(0, 0, 612, 38).fill(PDF.navy);
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
        .text('QUITREADY · STRUCTURAL BREAKPOINT REPORT', LEFT, 14)
        .text(reportDate, LEFT, 14, { width: W, align: 'right' });
      y = 58;

      y = sectionHeading(doc, 'Monthly Burn Breakdown', null, y);

      // Group header helper
      const drawGroupHeader = (label: string, yy: number): number => {
        doc.rect(LEFT, yy, W, 20).fill(PDF.mid);
        doc.fillColor(PDF.muted).fontSize(7.5).font('Helvetica-Bold').text(label.toUpperCase(), LEFT + 10, yy + 6);
        return yy + 20;
      };

      const drawBurnRow = (label: string, val: number, subtract = false, yy: number): number => {
        if (val === 0) return yy;
        doc.rect(LEFT, yy, W, 28).fill(PDF.light);
        doc.rect(LEFT, yy, W, 1).fill(PDF.border);
        doc.fillColor(PDF.charcoal).fontSize(9.5).font('Helvetica').text(label, LEFT + 10, yy + 9, { width: 360 });
        const valStr = subtract ? `(${fmtM(val)})` : fmtM(val);
        doc.fillColor(subtract ? PDF.green : PDF.navy).fontSize(10).font('Helvetica-Bold')
          .text(valStr, LEFT, yy + 9, { width: W - 10, align: 'right' });
        return yy + 28;
      };

      // Group 1: Fixed
      y = drawGroupHeader('Required Fixed Obligations', y);
      y = drawBurnRow('Required loan payments', sim.monthlyDebtPayments, false, y);
      y = drawBurnRow('Household living costs', sim.livingExpenses, false, y);
      y += 4;

      // Group 2: Transition
      y = drawGroupHeader('Transition Adjustments', y);
      y = drawBurnRow('Additional healthcare cost', hc, false, y);
      if (sim.isDualIncome && sim.partnerIncome > 0) {
        y = drawBurnRow('Partner income offset', sim.partnerIncome, true, y);
      }
      y += 4;

      // Group 3: Income plan
      y = drawGroupHeader('Income Plan Costs', y);
      y = drawBurnRow('Self-employment tax reserve (28%)', sim.selfEmploymentTax, false, y);
      y = drawBurnRow('Business operating cost', sim.businessCostBaseline, false, y);
      y += 4;

      // Total
      doc.rect(LEFT, y, W, 38).fill(PDF.navy);
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text('TRUE MONTHLY BURN', LEFT + 10, y + 7);
      doc.fillColor('#ffffff').fontSize(18).font('Times-Bold').text(fmtM(sim.tmib), LEFT, y + 12, { width: W - 10, align: 'right' });
      y += 50;

      // Composition bar
      const burnParts = [
        { label: 'Loan payments', val: sim.monthlyDebtPayments },
        { label: 'Living costs', val: sim.livingExpenses },
        { label: 'Healthcare', val: hc },
        { label: 'Tax reserve', val: sim.selfEmploymentTax },
        { label: 'Business', val: sim.businessCostBaseline },
      ].filter(p => p.val > 0);
      const totalBurn = burnParts.reduce((a, p) => a + p.val, 0) || 1;
      const barAlphas = [1, 0.72, 0.54, 0.36, 0.22];
      let bx2 = LEFT;
      burnParts.forEach((p, i) => {
        const bw = Math.round((p.val / totalBurn) * W);
        doc.save();
        doc.fillOpacity(barAlphas[i] ?? 0.2);
        doc.rect(bx2, y, bw, 12).fill(PDF.navy);
        doc.restore();
        bx2 += bw;
      });
      y += 16;
      // Legend
      let lx = LEFT;
      burnParts.forEach((p, i) => {
        doc.save().fillOpacity(barAlphas[i] ?? 0.2).rect(lx, y, 8, 8).fill(PDF.navy).restore();
        doc.fillColor(PDF.muted).fontSize(7.5).font('Helvetica')
          .text(`${p.label} ${Math.round((p.val / totalBurn) * 100)}%`, lx + 11, y + 1);
        lx += 90;
      });
      y += 22;

      // Interpretation
      if (sim.tmib > 0) {
        const fixedPct = Math.round(((sim.monthlyDebtPayments + hc) / sim.tmib) * 100);
        const sePct = Math.round((sim.selfEmploymentTax / sim.tmib) * 100);
        doc.fillColor(PDF.muted).fontSize(8.5).font('Helvetica')
          .text(`Fixed obligations (loan payments + healthcare) represent ${fixedPct}% of burn — they cannot be reduced without structural changes.`, LEFT, y, { width: W, lineGap: 2 });
        if (sePct > 0) {
          y += 16;
          doc.text(`The self-employment tax reserve (${sePct}% of burn) scales with income and eases automatically in lower-revenue months.`, LEFT, y, { width: W, lineGap: 2 });
        }
        y += 20;
      }

      if (debtFlagged) {
        doc.rect(LEFT, y, W, 30).fill('#fef2f2');
        doc.rect(LEFT, y, 3, 30).fill(PDF.red);
        doc.fillColor(PDF.red).fontSize(8.5).font('Helvetica')
          .text(`Loan balances represent ${fmtPctP(sim.debtExposureRatio)} of accessible capital — above the 70% elevated risk threshold.`, LEFT + 12, y + 10, { width: W - 20 });
        y += 38;
      }

      pageFooter(doc, 4, TOTAL_PAGES);

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 5 — LIQUIDITY DEFENSE MAP
      // ═══════════════════════════════════════════════════════════════════
      doc.addPage();
      doc.rect(0, 0, 612, 38).fill(PDF.navy);
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
        .text('QUITREADY · STRUCTURAL BREAKPOINT REPORT', LEFT, 14)
        .text(reportDate, LEFT, 14, { width: W, align: 'right' });
      y = 58;

      y = sectionHeading(doc, 'Liquidity Defense Map',
        'Your capital is organized by accessibility. Under stress, depletion follows this order.', y);

      // Tier 1
      doc.rect(LEFT, y, W, 22).fill(PDF.mid);
      doc.fillColor(PDF.navy).fontSize(8).font('Helvetica-Bold').text('TIER 1 — FULLY LIQUID  ·  Primary Runway  ·  Counted at 100%', LEFT + 10, y + 7);
      y += 22;
      if (tier1 > 0) {
        doc.rect(LEFT, y, W, 32).fill(PDF.light);
        doc.fillColor(PDF.charcoal).fontSize(9.5).font('Helvetica').text('Cash, checking, savings, HYSA', LEFT + 10, y + 10, { width: 300 });
        doc.fillColor(PDF.muted).fontSize(8).text('No penalty, no tax, no delay', LEFT + 10, y + 22, { width: 300 });
        doc.fillColor(PDF.navy).fontSize(11).font('Helvetica-Bold').text(fmtM(tier1), LEFT, y + 12, { width: W - 10, align: 'right' });
        y += 32;
      } else {
        doc.fillColor(PDF.muted).fontSize(8.5).font('Helvetica').text('No Tier 1 capital entered.', LEFT + 10, y + 4);
        y += 18;
      }
      y += 6;

      // Tier 2
      doc.rect(LEFT, y, W, 22).fill(PDF.mid);
      doc.fillColor(PDF.navy).fontSize(8).font('Helvetica-Bold').text('TIER 2 — SEMI-LIQUID  ·  Access with Trade-offs  ·  Counted at 80%', LEFT + 10, y + 7);
      y += 22;
      if (tier2 > 0) {
        doc.rect(LEFT, y, W, 32).fill(PDF.light);
        doc.fillColor(PDF.charcoal).fontSize(9.5).font('Helvetica').text('Brokerage and taxable investment accounts', LEFT + 10, y + 10, { width: 300 });
        doc.fillColor(PDF.muted).fontSize(8).text('Selling may trigger capital gains taxes', LEFT + 10, y + 22, { width: 300 });
        doc.fillColor(PDF.navy).fontSize(11).font('Helvetica-Bold').text(fmtM(tier2), LEFT, y + 12, { width: W - 10, align: 'right' });
        y += 32;
      } else {
        doc.fillColor(PDF.muted).fontSize(8.5).font('Helvetica').text('No Tier 2 capital entered.', LEFT + 10, y + 4);
        y += 18;
      }
      y += 6;

      // Tier 3
      doc.rect(LEFT, y, W, 22).fill(PDF.mid);
      doc.fillColor(PDF.navy).fontSize(8).font('Helvetica-Bold').text('TIER 3 — RESTRICTED  ·  Last Resort  ·  NOT Primary Runway', LEFT + 10, y + 7);
      y += 22;

      const tier3Rows = [
        { label: 'Roth IRA — contributions only', note: 'Penalty-free contributions (100%)', val: tier3Roth },
        { label: 'Traditional IRA / 401(k)',       note: 'Income tax + 10% penalty (50% counted)', val: tier3Trad },
        { label: 'Home equity',                    note: 'Illiquid, 6–10% transaction costs (30% counted)', val: tier3RE },
      ].filter(r => r.val > 0);

      if (tier3Rows.length > 0) {
        tier3Rows.forEach(r => {
          doc.rect(LEFT, y, W, 32).fill(PDF.light);
          doc.fillColor(PDF.charcoal).fontSize(9.5).font('Helvetica').text(r.label, LEFT + 10, y + 10, { width: 300 });
          doc.fillColor(PDF.muted).fontSize(8).text(r.note, LEFT + 10, y + 22, { width: 300 });
          doc.fillColor(PDF.navy).fontSize(11).font('Helvetica-Bold').text(fmtM(r.val), LEFT, y + 12, { width: W - 10, align: 'right' });
          y += 32;
        });
      } else {
        doc.fillColor(PDF.muted).fontSize(8.5).font('Helvetica').text('No Tier 3 capital entered.', LEFT + 10, y + 4);
        y += 18;
      }

      if (reliesOnRetirement) {
        y += 6;
        doc.rect(LEFT, y, W, 34).fill('#fffbeb');
        doc.rect(LEFT, y, 3, 34).fill(PDF.amber);
        doc.fillColor(PDF.amber).fontSize(8.5).font('Helvetica')
          .text(`Tier 1 + Tier 2 capital (${fmtM(tier1 + tier2)}) covers less than 12 months of burn under stress. This transition would rely on retirement funds.`, LEFT + 12, y + 10, { width: W - 24 });
        y += 40;
      }

      y += 6;
      doc.rect(LEFT, y, W, 40).fill(PDF.navy);
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text('TOTAL ACCESSIBLE CAPITAL', LEFT + 10, y + 8);
      doc.fillColor('#ffffff').fontSize(20).font('Times-Bold').text(fmtM(sim.accessibleCapital), LEFT, y + 12, { width: W - 10, align: 'right' });

      pageFooter(doc, 5, TOTAL_PAGES);

      // ═══════════════════════════════════════════════════════════════════
      // PAGE 6 — WHAT MOVES THE NEEDLE + ADVISOR COMMENTARY
      // ═══════════════════════════════════════════════════════════════════
      doc.addPage();
      doc.rect(0, 0, 612, 38).fill(PDF.navy);
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
        .text('QUITREADY · STRUCTURAL BREAKPOINT REPORT', LEFT, 14)
        .text(reportDate, LEFT, 14, { width: W, align: 'right' });
      y = 58;

      y = sectionHeading(doc, 'What Moves the Needle',
        'The specific changes with the highest leverage on your outcome.', y);

      // Sensitivity cards
      const hcBurnPct = sim.tmib > 0 ? Math.round((hc / sim.tmib) * 100) : 0;

      if (hcBurnPct >= 12) {
        y = insightCard(doc, y,
          `Healthcare cost — ${hcBurnPct}% of monthly burn`,
          `Healthcare transition adds ${fmtM(hc)}/month to your burn. Partner coverage or income-based ACA subsidies could eliminate a meaningful portion of this cost.`
        );
      }

      if (debtFlagged) {
        y = insightCard(doc, y,
          `Loan balance exposure — ${fmtPctP(sim.debtExposureRatio)} of accessible capital`,
          `Reducing loan balances before exit would lower structural risk and improve runway. Current outstanding loan balance is ${fmtM(sim.totalDebt)}.`
        );
      }

      y = insightCard(doc, y,
        'Revenue ramp — the primary execution variable',
        `A ramp of ${sim.rampDuration} months means your savings cover the full burn gap for that period. Entering with client commitments reduces this dependency significantly.`
      );

      y += 8;

      // Advisor commentary
      y = sectionHeading(doc, 'What This Means For You', null, y);

      doc.rect(LEFT, y, W, 3).fill(PDF.navy);
      y += 12;

      const advisorText = `${advisorSummary}\n\nThe single change most likely to improve your position: ${advisorBestMove}`;
      const advisorH = Math.max(80, Math.ceil(advisorText.length / 72) * 11 + 24);
      doc.rect(LEFT, y, W, advisorH).fill(PDF.light);
      doc.fillColor(PDF.charcoal).fontSize(10).font('Helvetica')
        .text(advisorText, LEFT + 14, y + 14, { width: W - 28, lineGap: 3 });
      y += advisorH + 16;

      if (reliesOnRetirement) {
        const retNote = `Based on your Tier 1 and Tier 2 capital (${fmtM(tier1 + tier2)}), you would need to access retirement funds to sustain this transition beyond the near term. Retirement assets carry long-term costs beyond the immediate penalty — treat them as emergency capital, not a plan.`;
        const retH = Math.max(40, Math.ceil(retNote.length / 78) * 11 + 18);
        doc.rect(LEFT, y, W, retH).fill('#fffbeb');
        doc.rect(LEFT, y, 3, retH).fill(PDF.amber);
        doc.fillColor(PDF.charcoal).fontSize(9.5).font('Helvetica')
          .text(retNote, LEFT + 12, y + 10, { width: W - 24, lineGap: 2 });
        y += retH + 10;
      }

      // Disclaimer
      doc.rect(LEFT, y, W, 1).fill(PDF.border);
      y += 10;
      doc.fillColor(PDF.muted).fontSize(7.5).font('Helvetica')
        .text(
          'DISCLAIMER: This report is an educational financial simulation based on user-provided inputs and estimated U.S. averages. It is not financial, tax, or legal advice. No recommendations are made. Consult a qualified financial professional before making major financial decisions.',
          LEFT, y, { width: W, lineGap: 2 }
        );

      pageFooter(doc, 6, TOTAL_PAGES);

      doc.end();

    } catch (err) {
      console.error('PDF generation failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'PDF generation failed. Please try again.' });
      }
    }
  });

  return httpServer;
}
