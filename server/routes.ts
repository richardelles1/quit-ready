import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { calculateSimulation } from "./services/simulator";
import { z } from "zod";
import PDFDocument from "pdfkit";
import type { Simulation } from "@shared/schema";

// ─── Palette ───────────────────────────────────────────────────────────────
const C = { navy:'#1e293b', coal:'#334155', muted:'#64748b', mid:'#f1f5f9',
  light:'#f8fafc', border:'#e2e8f0', white:'#ffffff',
  green:'#15803d', amber:'#b45309', red:'#dc2626', blue:'#1d4ed8' };
const L = 52, W = 508, R = 560, TOTAL = 14;

// ─── Formatting utilities ──────────────────────────────────────────────────
const fmtM = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function fmtRunway(months: number): string {
  if (months >= 999) return '24+ years';
  if (months <= 0) return 'Less than 1 month';
  const yrs = Math.floor(months / 12);
  const mo = months % 12;
  if (yrs === 0) return `${mo} month${mo !== 1 ? 's' : ''}`;
  if (mo === 0) return `${yrs} year${yrs !== 1 ? 's' : ''}`;
  return `${yrs} year${yrs !== 1 ? 's' : ''} ${mo} month${mo !== 1 ? 's' : ''}`;
}

function fmtRunwayShort(months: number): string {
  if (months >= 999) return '24+ yrs';
  if (months <= 0) return '< 1 mo';
  const yrs = Math.floor(months / 12);
  const mo = months % 12;
  if (yrs === 0) return `${mo} mo`;
  if (mo === 0) return `${yrs} yr${yrs !== 1 ? 's' : ''}`;
  return `${yrs} yr${yrs !== 1 ? 's' : ''} ${mo} mo`;
}

// Distribute rounding so percentages sum to exactly 100
function pct100(values: number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return values.map(() => 0);
  const raw = values.map(v => (v / sum) * 100);
  const floored = raw.map(Math.floor);
  let rem = 100 - floored.reduce((a, b) => a + b, 0);
  const byFrac = raw.map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let j = 0; j < rem; j++) floored[byFrac[j].i]++;
  return floored;
}

// ─── Capital helpers ───────────────────────────────────────────────────────
const t1 = (s: Simulation) => s.cash;
const t2 = (s: Simulation) => Math.round(s.brokerage * 0.80);
const t3 = (s: Simulation) => Math.round(s.roth + s.traditional * 0.50 + s.realEstate * 0.30);
const pas = (s: Simulation) => t1(s) + t2(s); // Primary Accessible Savings

// Primary Savings Runway: months until T1+T2 exhausted
function psRunway(s: Simulation, revMult = 1.0, rampOverride?: number,
  extraBurn: (m: number) => number = () => 0): number {
  if (s.tmib <= 0) return 999;
  let cap = pas(s);
  const vol = 1 - s.volatilityPercent / 100;
  const ramp = rampOverride ?? s.rampDuration;
  for (let m = 1; m <= 360; m++) {
    const rf = ramp > 0 && m <= ramp ? 0.50 * (m / ramp) : 1.0;
    cap -= (s.tmib + extraBurn(m) - s.expectedRevenue * revMult * rf * vol);
    if (cap <= 0) return m;
  }
  return 999;
}

// Full runway: months until all capital exhausted
function fullRunway(s: Simulation, revMult = 1.0, rampOverride?: number,
  extraBurn: (m: number) => number = () => 0): number {
  if (s.tmib <= 0) return 999;
  let cap = s.accessibleCapital;
  const vol = 1 - s.volatilityPercent / 100;
  const ramp = rampOverride ?? s.rampDuration;
  for (let m = 1; m <= 360; m++) {
    const rf = ramp > 0 && m <= ramp ? 0.50 * (m / ramp) : 1.0;
    cap -= (s.tmib + extraBurn(m) - s.expectedRevenue * revMult * rf * vol);
    if (cap <= 0) return m;
  }
  return 999;
}

// Month when PAS falls below 6× monthly drain (pressure begins)
function pressureMonth(s: Simulation, revMult: number): number {
  const vol = 1 - s.volatilityPercent / 100;
  const stableRev = s.expectedRevenue * revMult * vol;
  const drain = Math.max(0, s.tmib - stableRev);
  if (drain <= 0) return 999;
  const threshold = drain * 6;
  let cap = pas(s);
  for (let m = 1; m <= 360; m++) {
    const rf = s.rampDuration > 0 && m <= s.rampDuration ? 0.50 * (m / s.rampDuration) : 1.0;
    cap -= (s.tmib - s.expectedRevenue * revMult * rf * vol);
    if (cap <= threshold) return m;
  }
  return 999;
}

// Monthly capital series for line chart
function capitalSeries(s: Simulation, revMult: number, n: number): number[] {
  let cap = pas(s);
  const vol = 1 - s.volatilityPercent / 100;
  const pts: number[] = [cap];
  for (let m = 1; m <= n; m++) {
    const rf = s.rampDuration > 0 && m <= s.rampDuration ? 0.50 * (m / s.rampDuration) : 1.0;
    cap = Math.max(0, cap - (s.tmib - s.expectedRevenue * revMult * rf * vol));
    pts.push(cap);
    if (cap === 0) break;
  }
  while (pts.length <= n) pts.push(0);
  return pts;
}

// ─── Validation ────────────────────────────────────────────────────────────
function validateReport(s: Simulation): string[] {
  const errs: string[] = [];
  if (s.baseRunway < 0) errs.push('Base runway is negative');
  if (s.runway30Down < 0) errs.push('Severe scenario runway is negative');
  const hc = s.healthcareDelta ?? s.healthcareMonthlyCost;
  const partnerOff = s.isDualIncome ? (s.partnerIncome ?? 0) : 0;
  const gross = (s.livingExpenses ?? 0) + (s.monthlyDebtPayments ?? 0) + hc +
    (s.selfEmploymentTax ?? 0) + (s.businessCostBaseline ?? 0);
  const expected = Math.max(0, gross - partnerOff);
  if (Math.abs(s.tmib - expected) > 100) {
    errs.push(`Monthly outflow mismatch: stored ${fmtM(s.tmib)}, computed ${fmtM(expected)}`);
  }
  const psr = psRunway(s, 1.0);
  if (psr > s.baseRunway + 3 && s.baseRunway < 999) {
    errs.push('Stage ordering error: primary savings runway exceeds total runway');
  }
  return errs;
}

// ─── PDF helpers ───────────────────────────────────────────────────────────
function hdr(doc: PDFKit.PDFDocument, date: string) {
  doc.rect(0, 0, 612, 32).fill(C.navy);
  doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold')
    .text('QUITREADY · FINANCIAL POSITION REPORT', L, 11)
    .text(date, L, 11, { width: W, align: 'right' });
}

function ftr(doc: PDFKit.PDFDocument, n: number) {
  doc.fillColor(C.muted).fontSize(7).font('Helvetica')
    .text('This report is a financial simulation based on your inputs. It is not financial, tax, or legal advice. Consult a qualified professional.', L, 763, { width: W - 60 })
    .text(`Page ${n} of ${TOTAL}`, L, 763, { width: W, align: 'right' });
}

function secHead(doc: PDFKit.PDFDocument, pg: number, title: string, sub: string | null, y: number): number {
  doc.rect(L, y, W, 1).fill(C.border); y += 8;
  doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text(`PAGE ${pg} OF ${TOTAL}`, L, y); y += 11;
  doc.fillColor(C.navy).fontSize(16).font('Times-Bold').text(title, L, y, { width: W }); y += 22;
  if (sub) {
    doc.fillColor(C.muted).fontSize(8.5).font('Helvetica').text(sub, L, y, { width: W, lineGap: 1.5 }); y += 18;
  }
  return y + 4;
}

function statRow(doc: PDFKit.PDFDocument, items: {label:string; val:string; color?:string}[], y: number, rowH = 52): number {
  const w = Math.floor(W / items.length);
  items.forEach((item, i) => {
    const x = L + i * w;
    doc.rect(x, y, w - 4, rowH).fill(C.mid);
    doc.fillColor(C.muted).fontSize(7).font('Helvetica').text(item.label.toUpperCase(), x + 8, y + 8, { width: w - 20 });
    doc.fillColor(item.color ?? C.navy).fontSize(13).font('Times-Bold').text(item.val, x + 8, y + 22, { width: w - 20 });
  });
  return y + rowH + 6;
}

function tableHead(doc: PDFKit.PDFDocument, cols: {label:string; x:number}[], y: number): number {
  doc.rect(L, y, W, 22).fill(C.navy);
  cols.forEach(c => {
    doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text(c.label, c.x, y + 7);
  });
  return y + 22;
}

function tableRow(doc: PDFKit.PDFDocument, cells: {val:string; x:number; bold?:boolean; color?:string}[],
  y: number, even: boolean, h = 26): number {
  doc.rect(L, y, W, h).fill(even ? C.light : C.mid);
  cells.forEach(c => {
    doc.fillColor(c.color ?? C.coal).fontSize(9).font(c.bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(c.val, c.x, y + (h - 10) / 2, { width: 200 });
  });
  return y + h;
}

function insight(doc: PDFKit.PDFDocument, heading: string, body: string, y: number): number {
  const lines = Math.max(2, Math.ceil(body.length / 86));
  const h = lines * 10 + 30;
  doc.rect(L, y, W, h).fill(C.light);
  doc.rect(L, y, 3, h).fill(C.navy);
  doc.fillColor(C.muted).fontSize(7).font('Helvetica-Bold').text(heading.toUpperCase(), L + 12, y + 8, { width: W - 24 });
  doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(body, L + 12, y + 20, { width: W - 24, lineGap: 1.5 });
  return y + h + 8;
}

function compositionBar(doc: PDFKit.PDFDocument, segments: {val:number;opacity:number}[], maxVal: number, y: number, h = 14): number {
  const total = segments.reduce((a, s) => a + s.val, 0) || 1;
  let x = L;
  segments.forEach(s => {
    const bw = Math.round((s.val / total) * W);
    doc.save().fillOpacity(s.opacity).rect(x, y, bw, h).fill(C.navy).restore();
    x += bw;
  });
  return y + h + 4;
}

function lineChart(doc: PDFKit.PDFDocument, base: number[], severe: number[], maxCap: number,
  cx: number, cy: number, cw: number, ch: number, totalMonths: number) {
  // Background
  doc.rect(cx, cy, cw, ch).fill(C.light);
  // Grid lines (4 horizontal)
  for (let i = 1; i <= 4; i++) {
    const gy = cy + (i / 4) * ch;
    doc.moveTo(cx, gy).lineTo(cx + cw, gy).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.fillColor(C.muted).fontSize(7).font('Helvetica')
      .text(fmtM(maxCap * (1 - i / 4)), cx - 52, gy - 4, { width: 50, align: 'right' });
  }
  // Y-axis label
  doc.fillColor(C.muted).fontSize(7).font('Helvetica').text(fmtM(0), cx - 52, cy + ch - 4, { width: 50, align: 'right' });
  // X-axis labels
  [0, 6, 12, 18, 24, 30, 36].forEach(m => {
    if (m <= totalMonths) {
      const px = cx + (m / totalMonths) * cw;
      doc.fillColor(C.muted).fontSize(7).font('Helvetica').text(`Mo ${m}`, px - 10, cy + ch + 4, { width: 24, align: 'center' });
    }
  });
  // Draw base case line
  let started = false;
  base.forEach((cap, m) => {
    const px = cx + (m / totalMonths) * cw;
    const py = cy + ch - (Math.min(cap, maxCap) / Math.max(1, maxCap)) * ch;
    if (!started) { doc.moveTo(px, py); started = true; } else { doc.lineTo(px, py); }
  });
  doc.strokeColor(C.navy).lineWidth(2).stroke();
  // Draw severe case line (dashed effect via short strokes)
  started = false;
  severe.forEach((cap, m) => {
    const px = cx + (m / totalMonths) * cw;
    const py = cy + ch - (Math.min(cap, maxCap) / Math.max(1, maxCap)) * ch;
    if (!started) { doc.moveTo(px, py); started = true; } else { doc.lineTo(px, py); }
  });
  doc.strokeColor(C.muted).lineWidth(1.5).stroke();
  // Legend
  doc.rect(cx + cw - 120, cy + 6, 10, 4).fill(C.navy);
  doc.fillColor(C.navy).fontSize(7).font('Helvetica').text('Base case', cx + cw - 107, cy + 4);
  doc.rect(cx + cw - 120, cy + 16, 10, 4).fill(C.muted);
  doc.fillColor(C.muted).fontSize(7).font('Helvetica').text('Severe (−30%)', cx + cw - 107, cy + 14);
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

  // ─── PDF Generation ────────────────────────────────────────────────────
  app.get(api.simulations.downloadPdf.path, async (req, res) => {
    const sim = await storage.getSimulation(Number(req.params.id));
    if (!sim) return res.status(404).json({ message: 'Simulation not found' });

    // Validate before generating
    const validationErrors = validateReport(sim);
    if (validationErrors.length > 0) {
      return res.status(422).json({
        message: 'Report validation failed — please re-run the simulation.',
        errors: validationErrors,
      });
    }

    try {
      const doc = new PDFDocument({ margin: 0, size: 'LETTER', autoFirstPage: true });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="QuitReady_Report_${sim.id}.pdf"`);
      doc.pipe(res);

      const date = new Date(sim.createdAt).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
      const hc = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
      const partnerOff = sim.isDualIncome ? (sim.partnerIncome ?? 0) : 0;
      const pasCap = pas(sim);
      const t3Cap = t3(sim);

      // Pre-compute scenario values
      const psrBase = psRunway(sim, 1.00);
      const psr15   = psRunway(sim, 0.85);
      const psr30   = psRunway(sim, 0.70);
      const psrRamp3 = psRunway(sim, 1.00, sim.rampDuration + 3);

      const frBase  = sim.baseRunway;
      const fr15    = sim.runway15Down;
      const fr30    = sim.runway30Down;
      const frRamp3 = sim.runwayRampDelay;

      const pmBase = pressureMonth(sim, 1.00);
      const pm15   = pressureMonth(sim, 0.85);
      const pm30   = pressureMonth(sim, 0.70);

      const rampEarly3 = psRunway(sim, 1.00, Math.max(0, sim.rampDuration - 3));
      const rampLate3  = psRunway(sim, 1.00, sim.rampDuration + 3);

      // Partner loss (6 months)
      const psrPartnerLoss = sim.isDualIncome && sim.partnerIncome > 0
        ? psRunway(sim, 1.00, undefined, (m) => m <= 6 ? sim.partnerIncome : 0)
        : psrBase;
      const frPartnerLoss = sim.isDualIncome && sim.partnerIncome > 0
        ? fullRunway(sim, 1.00, undefined, (m) => m <= 6 ? sim.partnerIncome : 0)
        : frBase;

      // New child (3k one-time + 1500/mo)
      const CHILD_ONETIME = 3000, CHILD_MONTHLY = 1500;
      const psrNewChild = (() => {
        if (sim.tmib <= 0) return 999;
        let cap = pasCap - CHILD_ONETIME;
        const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 360; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          cap -= (sim.tmib + CHILD_MONTHLY - sim.expectedRevenue * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      })();

      // Combined shock
      const psrCombined = (() => {
        if (!sim.isDualIncome || sim.partnerIncome <= 0) return psrNewChild;
        let cap = pasCap - CHILD_ONETIME;
        const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 360; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          const extra = CHILD_MONTHLY + (m <= 6 ? sim.partnerIncome : 0);
          cap -= (sim.tmib + extra - sim.expectedRevenue * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      })();

      // Levers
      const calcBurnLever = (adj: number) => {
        if (sim.tmib <= 0) return 999;
        let cap = pasCap; const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 360; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          cap -= ((sim.tmib - adj) - sim.expectedRevenue * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      };
      const calcRevLever = (adj: number) => {
        if (sim.tmib <= 0) return 999;
        let cap = pasCap; const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 360; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          cap -= (sim.tmib - (sim.expectedRevenue + adj) * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      };

      // Score
      const score = sim.structuralBreakpointScore;
      const scoreLabel = score >= 86 ? 'Strong Buffer Position' : score >= 70 ? 'Structurally Stable'
        : score >= 50 ? 'Moderately Exposed' : 'Structurally Fragile';
      const marginLabel = score >= 70 ? 'strong' : score >= 50 ? 'moderate' : score >= 30 ? 'thin' : 'negative';

      // Outflow components for pct breakdown (gross, before partner offset)
      const outflowComponents = [
        { label: 'Living Expenses',     val: sim.livingExpenses,          opacity: 1.00 },
        { label: 'Debt Payments',       val: sim.monthlyDebtPayments,     opacity: 0.74 },
        { label: 'Healthcare',          val: hc,                           opacity: 0.54 },
        { label: 'Tax Reserve',         val: sim.selfEmploymentTax,       opacity: 0.36 },
        { label: 'Business Costs',      val: sim.businessCostBaseline,    opacity: 0.22 },
      ].filter(c => c.val > 0);
      const grossOutflow = outflowComponents.reduce((a, c) => a + c.val, 0);
      const pcts = pct100(outflowComponents.map(c => c.val));

      let y = 0;

      // ════════════════════════════════════════════════════════════════════
      // PAGE 1 — EXECUTIVE SNAPSHOT
      // ════════════════════════════════════════════════════════════════════
      hdr(doc, date); y = 42;
      y = secHead(doc, 1, 'Your Financial Position Today',
        'A snapshot of your current income, monthly structure, and projected savings runway.', y);

      const totalIncome = (sim.currentSalary ?? 0) + (sim.isDualIncome ? (sim.partnerIncome ?? 0) : 0);
      const netSurplus = totalIncome - sim.tmib;

      y = statRow(doc, [
        { label: 'Total Monthly Income', val: fmtM(totalIncome) },
        { label: 'Monthly Outflow', val: fmtM(sim.tmib) },
        { label: 'Monthly Surplus / Deficit', val: (netSurplus >= 0 ? '+' : '') + fmtM(netSurplus), color: netSurplus >= 0 ? C.green : C.red },
      ], y);

      y = statRow(doc, [
        { label: 'Primary Accessible Savings (Cash + Brokerage)', val: fmtM(pasCap) },
        { label: 'Primary Savings Runway — Base Case', val: fmtRunway(psrBase) },
        { label: 'Risk Position Score', val: `${score}/100` },
      ], y);

      // Identity line
      const identityLine = `You are currently operating with ${marginLabel} structural margin based on your inputs.`;
      const marginBg = score >= 70 ? '#f0fdf4' : score >= 50 ? '#fffbeb' : '#fef2f2';
      const marginBorder = score >= 70 ? C.green : score >= 50 ? C.amber : C.red;
      doc.rect(L, y, W, 36).fill(marginBg);
      doc.rect(L, y, 3, 36).fill(marginBorder);
      doc.fillColor(C.coal).fontSize(10).font('Times-Roman').text(identityLine, L + 12, y + 12, { width: W - 24 });
      y += 46;

      // Mini scenario snapshot
      doc.rect(L, y, W, 22).fill(C.navy);
      [['Scenario', L + 8], ['Primary Savings Runway', L + 175], ['Full Runway', L + 310], ['Restricted Assets?', L + 400]].forEach(([h, x]) => {
        doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text(h as string, x as number, y + 7);
      });
      y += 22;
      [
        { label: 'Expected conditions', psr: psrBase, full: frBase, r3: t3Cap > 0 && psrBase < frBase },
        { label: 'Moderate contraction (−15%)', psr: psr15, full: fr15, r3: t3Cap > 0 && psr15 < fr15 },
        { label: 'Severe contraction (−30%)', psr: psr30, full: fr30, r3: t3Cap > 0 && psr30 < fr30 },
      ].forEach((sc, i) => {
        doc.rect(L, y, W, 24).fill(i % 2 === 0 ? C.light : C.mid);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(sc.label, L + 8, y + 7, { width: 165 });
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtRunwayShort(sc.psr), L + 175, y + 7);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(fmtRunwayShort(sc.full), L + 310, y + 7);
        doc.fillColor(sc.r3 ? C.red : C.green).fontSize(9).font('Helvetica-Bold')
          .text(sc.r3 ? 'Yes' : 'No', L + 400, y + 7);
        y += 24;
      });

      ftr(doc, 1);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 2 — INCOME STRENGTH & STABILITY
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 2, 'Income Strength & Stability',
        'Your current income picture and how it compares to the outflow structure that would be required after a transition.', y);

      // Income table
      const incomeRows = [
        { label: 'Your monthly take-home income (current)', val: fmtM(sim.currentSalary ?? 0) },
        ...(sim.isDualIncome && sim.partnerIncome > 0
          ? [{ label: 'Partner monthly take-home income', val: fmtM(sim.partnerIncome) }] : []),
        { label: 'Total household monthly income', val: fmtM(totalIncome) },
        { label: 'Required monthly outflow (post-transition)', val: fmtM(sim.tmib) },
        { label: 'Net monthly surplus / (deficit)', val: (netSurplus >= 0 ? '+' : '') + fmtM(netSurplus) },
      ];
      incomeRows.forEach((row, i) => {
        const isTotal = row.label.startsWith('Total') || row.label.startsWith('Net');
        const bg = isTotal ? C.mid : i % 2 === 0 ? C.light : C.white;
        doc.rect(L, y, W, 26).fill(bg);
        doc.fillColor(C.coal).fontSize(9).font(isTotal ? 'Helvetica-Bold' : 'Helvetica').text(row.label, L + 10, y + 8, { width: 340 });
        doc.fillColor(isTotal && netSurplus < 0 && row.label.startsWith('Net') ? C.red : C.navy)
          .fontSize(isTotal ? 10 : 9).font('Helvetica-Bold').text(row.val, L, y + 8, { width: W - 10, align: 'right' });
        y += 26;
      });
      y += 10;

      // Income vs Outflow bar
      doc.fillColor(C.muted).fontSize(8).font('Helvetica-Bold').text('INCOME VS. MONTHLY OUTFLOW', L, y); y += 12;
      const maxBar = Math.max(totalIncome, sim.tmib, 1);
      const incomeBarW = Math.round((totalIncome / maxBar) * W);
      const outflowBarW = Math.round((sim.tmib / maxBar) * W);

      doc.rect(L, y, incomeBarW, 18).fill(C.navy);
      doc.fillColor(C.white).fontSize(7.5).font('Helvetica').text(`Income ${fmtM(totalIncome)}`, L + 6, y + 5);
      y += 22;
      doc.rect(L, y, outflowBarW, 18).fill(sim.tmib > totalIncome ? C.red : C.muted);
      doc.fillColor(C.white).fontSize(7.5).font('Helvetica').text(`Outflow ${fmtM(sim.tmib)}`, L + 6, y + 5);
      y += 30;

      // Dependents note
      if ((sim.dependentChildren ?? 0) > 0) {
        y = insight(doc, 'Household Dependents',
          `You have ${sim.dependentChildren} dependent child${(sim.dependentChildren ?? 0) > 1 ? 'ren' : ''} in the household. This is reflected in the healthcare cost estimate. Dependent costs (childcare, education, activities) should be included in your living expenses figure.`, y);
      }

      // Paragraph
      const incomeVerb = totalIncome > sim.tmib * 1.1 ? 'exceeds' : totalIncome >= sim.tmib * 0.9 ? 'roughly matches' : 'falls below';
      const incomeP = `Today, your household income ${incomeVerb} your required monthly outflow structure. ${netSurplus >= 0 ? `The ${fmtM(netSurplus)}/month surplus shows financial capacity that could be directed toward savings before a transition.` : `The ${fmtM(Math.abs(netSurplus))}/month shortfall means the transition would require drawing from savings from day one even before accounting for ramp delays.`}`;
      y = insight(doc, 'What This Means', incomeP, y);

      ftr(doc, 2);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 3 — MONTHLY OUTFLOW BREAKDOWN
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 3, 'Where Your Money Goes Each Month',
        'A breakdown of every component of your monthly outflow structure. Percentages reflect share of gross outflow before partner income offset.', y);

      // Column headers
      y = tableHead(doc, [
        { label: 'Category', x: L + 8 }, { label: 'Definition', x: L + 165 },
        { label: 'Monthly Amount', x: L + 355 }, { label: '% of Outflow', x: L + 448 },
      ], y);

      const definitions = [
        'Day-to-day household expenses, not including loan payments or healthcare',
        'Contractual minimum payments — cannot be skipped without credit damage or default',
        'Post-transition premium cost change versus current employer coverage',
        'Reserve against self-employment tax obligations (28% of projected revenue)',
        'Recurring business operating expenses needed to generate revenue',
      ];

      outflowComponents.forEach((c, i) => {
        const pct = pcts[i];
        const h = 36;
        doc.rect(L, y, W, h).fill(i % 2 === 0 ? C.light : C.mid);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica-Bold').text(c.label, L + 8, y + 5, { width: 152 });
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text(definitions[i] ?? '', L + 165, y + 5, { width: 185, lineGap: 1 });
        doc.fillColor(C.navy).fontSize(10).font('Helvetica-Bold').text(fmtM(c.val), L + 355, y + 12);
        doc.fillColor(C.navy).fontSize(10).font('Helvetica-Bold').text(`${pct}%`, L + 448, y + 12);
        y += h;
      });

      // Partner offset row
      if (partnerOff > 0) {
        doc.rect(L, y, W, 26).fill(C.mid);
        doc.fillColor(C.green).fontSize(9).font('Helvetica-Bold').text('Partner Income Offset', L + 8, y + 8, { width: 152 });
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text('Continuing partner income reduces the net outflow gap', L + 165, y + 8, { width: 185 });
        doc.fillColor(C.green).fontSize(10).font('Helvetica-Bold').text(`(${fmtM(partnerOff)})`, L + 355, y + 8);
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('offset', L + 448, y + 10);
        y += 26;
      }

      // Net total
      doc.rect(L, y, W, 32).fill(C.navy);
      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text('NET MONTHLY OUTFLOW', L + 10, y + 8);
      doc.fillColor(C.white).fontSize(16).font('Times-Bold').text(fmtM(sim.tmib), L, y + 8, { width: W - 10, align: 'right' });
      y += 44;

      // Composition bar
      doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold').text('OUTFLOW COMPOSITION', L, y); y += 8;
      const segsY = y;
      let bx = L;
      outflowComponents.forEach(c => {
        const bw = Math.round((c.val / grossOutflow) * W);
        doc.save().fillOpacity(c.opacity).rect(bx, y, bw, 14).fill(C.navy).restore();
        bx += bw;
      });
      y += 18;
      bx = L;
      outflowComponents.forEach((c, i) => {
        doc.save().fillOpacity(c.opacity).rect(bx, y, 8, 8).fill(C.navy).restore();
        doc.fillColor(C.muted).fontSize(7).font('Helvetica').text(`${c.label} ${pcts[i]}%`, bx + 11, y + 1);
        bx += 96;
      });
      y += 18;

      ftr(doc, 3);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 4 — DEBT STRUCTURE & EXPOSURE
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 4, 'Debt Structure & Exposure',
        'Outstanding loan balances are context — they do not directly change your monthly outflow. They reflect structural leverage and long-term risk exposure.', y);

      doc.rect(L, y, W, 34).fill(C.mid);
      doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text('TOTAL OUTSTANDING DEBT BALANCE', L + 10, y + 8);
      const totalDebtVal = sim.totalDebt ?? 0;
      const debtColor = totalDebtVal === 0 ? C.green : sim.debtExposureRatio > 0.70 ? C.red : C.coal;
      doc.fillColor(debtColor).fontSize(18).font('Times-Bold').text(fmtM(totalDebtVal), L, y + 8, { width: W - 10, align: 'right' });
      y += 46;

      // Debt context note
      const debtNote = `Your monthly debt payment of ${fmtM(sim.monthlyDebtPayments)} is the required minimum and is included in your monthly outflow. The outstanding balance of ${fmtM(totalDebtVal)} does not affect your month-to-month outflow directly — it is the total you owe across all loans. It affects long-term financial flexibility and the time required to become fully debt-free.`;
      y = insight(doc, 'How Debt Balances Differ From Debt Payments', debtNote, y);

      // Debt exposure
      if (totalDebtVal > 0) {
        const debtRatio = sim.debtExposureRatio;
        const debtRatioPct = Math.round(debtRatio * 100);
        y = statRow(doc, [
          { label: 'Outstanding Debt Balance', val: fmtM(totalDebtVal) },
          { label: 'Total Accessible Savings', val: fmtM(sim.accessibleCapital) },
          { label: 'Debt-to-Savings Ratio', val: `${debtRatioPct}%`, color: debtRatioPct > 70 ? C.red : C.coal },
        ], y);
        if (debtRatioPct > 70) {
          doc.rect(L, y, W, 40).fill('#fef2f2');
          doc.rect(L, y, 3, 40).fill(C.red);
          doc.fillColor(C.red).fontSize(8.5).font('Helvetica-Bold').text('ELEVATED DEBT EXPOSURE', L + 12, y + 8);
          doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(`Outstanding debt of ${fmtM(totalDebtVal)} represents ${debtRatioPct}% of your accessible savings — above the 70% elevated threshold. This narrows recovery options under stress.`, L + 12, y + 20, { width: W - 24 });
          y += 48;
        }
      }

      // Mortgage clarity note
      doc.rect(L, y, W, 44).fill('#f0f9ff');
      doc.rect(L, y, 3, 44).fill(C.blue);
      doc.fillColor(C.blue).fontSize(8).font('Helvetica-Bold').text('MORTGAGE / HOUSING PAYMENT NOTE', L + 12, y + 8);
      doc.fillColor(C.coal).fontSize(9).font('Helvetica').text('If you pay a mortgage, that monthly payment is recorded under Debt Payments (Required Minimums) and is already in your outflow. It should NOT also appear in your Living Expenses. Each payment belongs in exactly one place.', L + 12, y + 20, { width: W - 24, lineGap: 1.5 });
      y += 52;

      ftr(doc, 4);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 5 — PRIMARY SAVINGS RUNWAY (DEFINITION PAGE)
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 5, 'Primary Savings Runway',
        'How long your readily accessible savings can sustain the gap between outflow and revenue.', y);

      // Definitions
      const defBlocks = [
        { title: 'Primary Accessible Savings (Cash + Brokerage)', body: `${fmtM(pasCap)} total. This is your first line of defense — money you can access without penalties, taxes, or significant delay. It includes cash, checking, savings, HYSA (counted at 100%) and taxable brokerage accounts (counted at 80% for capital gains exposure).` },
        { title: 'Restricted or Long-Term Assets (Retirement + Home Equity)', body: `${fmtM(t3Cap)} total. These assets are not considered primary runway. Accessing retirement funds early triggers income taxes and a 10% penalty — permanently reducing long-term compounding. Home equity is slow, costly, and market-dependent. Restricted assets are emergency capital, not a plan.` },
      ];
      defBlocks.forEach((b, i) => {
        const h = 60;
        doc.rect(L, y, W, h).fill(i === 0 ? '#f0f9ff' : '#fffbeb');
        doc.rect(L, y, 3, h).fill(i === 0 ? C.blue : C.amber);
        doc.fillColor(i === 0 ? C.blue : C.amber).fontSize(8.5).font('Helvetica-Bold').text(b.title, L + 12, y + 8, { width: W - 24 });
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(b.body, L + 12, y + 22, { width: W - 24, lineGap: 1.5 });
        y += h + 6;
      });

      // Tier table
      y = tableHead(doc, [
        { label: 'Asset Type', x: L + 8 }, { label: 'Haircut Applied', x: L + 210 },
        { label: 'Your Amount', x: L + 310 }, { label: 'Counted As', x: L + 420 },
      ], y);
      const tierRows = [
        { label: 'Cash & HYSA', cat: 'Primary', haircut: '100% (no deduction)', raw: sim.cash, counted: t1(sim) },
        { label: 'Brokerage accounts', cat: 'Primary', haircut: '80% (capital gains)', raw: sim.brokerage, counted: t2(sim) },
        { label: 'Roth IRA contributions', cat: 'Restricted', haircut: '100% (still retirement)', raw: sim.roth, counted: Math.round(sim.roth) },
        { label: 'Traditional IRA / 401(k)', cat: 'Restricted', haircut: '50% (taxes + penalty)', raw: sim.traditional, counted: Math.round(sim.traditional * 0.50) },
        { label: 'Home equity', cat: 'Restricted', haircut: '30% (illiquid, costly)', raw: sim.realEstate, counted: Math.round(sim.realEstate * 0.30) },
      ].filter(r => r.raw > 0);

      tierRows.forEach((row, i) => {
        const bg = row.cat === 'Restricted' ? (i % 2 === 0 ? '#fffbeb' : '#fef9c3') : i % 2 === 0 ? C.light : C.mid;
        doc.rect(L, y, W, 24).fill(bg);
        const catColor = row.cat === 'Restricted' ? C.amber : C.navy;
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(row.label, L + 8, y + 7, { width: 198 });
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text(row.haircut, L + 210, y + 7, { width: 96 });
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(fmtM(row.raw), L + 310, y + 7);
        doc.fillColor(catColor).fontSize(9).font('Helvetica-Bold').text(fmtM(row.counted), L + 420, y + 7);
        y += 24;
      });

      // Totals
      doc.rect(L, y, W, 28).fill('#f0f9ff');
      doc.fillColor(C.blue).fontSize(9).font('Helvetica-Bold').text('Primary Accessible Savings (Cash + Brokerage)', L + 8, y + 9);
      doc.fillColor(C.blue).fontSize(12).font('Times-Bold').text(fmtM(pasCap), L, y + 9, { width: W - 10, align: 'right' });
      y += 28;
      doc.rect(L, y, W, 28).fill(C.navy);
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text('Total Accessible Savings (All Tiers)', L + 8, y + 9);
      doc.fillColor(C.white).fontSize(13).font('Times-Bold').text(fmtM(sim.accessibleCapital), L, y + 9, { width: W - 10, align: 'right' });
      y += 36;

      // Runway + pressure point
      doc.fillColor(C.muted).fontSize(8).font('Helvetica-Bold').text('PRIMARY SAVINGS RUNWAY — BASE CASE', L, y); y += 10;
      doc.fillColor(C.navy).fontSize(22).font('Times-Bold').text(fmtRunway(psrBase), L, y); y += 28;
      if (pm30 < 999) {
        doc.fillColor(C.muted).fontSize(9).font('Helvetica')
          .text(`Financial pressure would begin around ${fmtRunwayShort(pm30)} under severe income contraction (−30%).`, L, y, { width: W });
        y += 18;
      }

      ftr(doc, 5);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 6 — STRESS SCENARIO MODELING
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 6, 'Stress Scenario Modeling',
        'Three revenue outcomes tested against your outflow structure. Your Primary Accessible Savings and total savings runway in each.', y);

      const scenarios = [
        { name: 'Revenue arrives on time and hits target', tag: 'Base case', psr: psrBase, full: frBase, pm: pmBase, revMult: 1.00, needsT3: t3Cap > 0 && psrBase < frBase },
        { name: 'Revenue underperforms target by 15%', tag: 'Moderate contraction', psr: psr15, full: fr15, pm: pm15, revMult: 0.85, needsT3: t3Cap > 0 && psr15 < fr15 },
        { name: 'Revenue materially underperforms by 30%', tag: 'Severe contraction', psr: psr30, full: fr30, pm: pm30, revMult: 0.70, needsT3: t3Cap > 0 && psr30 < fr30 },
      ];

      scenarios.forEach((sc, i) => {
        const bg = i === 2 ? '#fef2f2' : i === 1 ? '#fffbeb' : '#f0fdf4';
        const bc = i === 2 ? C.red : i === 1 ? C.amber : C.green;
        const h = 90;
        doc.rect(L, y, W, h).fill(bg);
        doc.rect(L, y, 3, h).fill(bc);
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold').text(sc.tag.toUpperCase(), L + 12, y + 8);
        doc.fillColor(C.coal).fontSize(11).font('Helvetica-Bold').text(sc.name, L + 12, y + 20, { width: W - 24 });
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('Primary Savings Runway', L + 12, y + 40);
        doc.fillColor(bc).fontSize(14).font('Times-Bold').text(fmtRunway(sc.psr), L + 12, y + 52);
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('Full Runway', L + 220, y + 40);
        doc.fillColor(C.coal).fontSize(14).font('Times-Bold').text(fmtRunway(sc.full), L + 220, y + 52);
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('Restricted assets req\'d?', L + 370, y + 40);
        doc.fillColor(sc.needsT3 ? C.red : C.green).fontSize(14).font('Times-Bold').text(sc.needsT3 ? 'Yes' : 'No', L + 370, y + 52);
        if (sc.pm < 999) {
          doc.fillColor(C.muted).fontSize(8).font('Helvetica').text(`Pressure begins around: ${fmtRunwayShort(sc.pm)}`, L + 12, y + 74, { width: W - 24 });
        }
        y += h + 8;
      });

      y = insight(doc, 'What "Pressure Begins" Means',
        'Pressure is defined as when your Primary Accessible Savings drops within 6 months of exhaustion under that scenario\'s revenue level. Before that point, the drawdown exists but the timeline is comfortable. After that point, each month carries meaningful urgency.', y);

      ftr(doc, 6);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 7 — REVENUE TIMING SENSITIVITY
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 7, 'Revenue Timing Sensitivity',
        `Your base ramp is ${sim.rampDuration} months. This shows how arriving early or late by 3 months changes your Primary Savings Runway.`, y);

      const timingRows = [
        { label: 'Revenue ramp 3 months early', ramp: Math.max(0, sim.rampDuration - 3), psr: rampEarly3 },
        { label: `Revenue ramp on time (base — ${sim.rampDuration} months)`, ramp: sim.rampDuration, psr: psrBase },
        { label: 'Revenue ramp 3 months late', ramp: sim.rampDuration + 3, psr: rampLate3 },
      ];

      y = tableHead(doc, [
        { label: 'Scenario', x: L + 8 }, { label: 'Ramp Duration', x: L + 265 },
        { label: 'Primary Savings Runway', x: L + 365 },
      ], y);
      timingRows.forEach((row, i) => {
        const isBase = i === 1;
        doc.rect(L, y, W, 28).fill(isBase ? C.mid : C.light);
        if (isBase) doc.rect(L, y, 3, 28).fill(C.navy);
        doc.fillColor(C.coal).fontSize(9).font(isBase ? 'Helvetica-Bold' : 'Helvetica').text(row.label, L + 8, y + 9, { width: 254 });
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(`${row.ramp} months`, L + 265, y + 9);
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtRunway(row.psr), L + 365, y + 9);
        y += 28;
      });
      y += 14;

      const rampDelta = rampLate3 >= 999 ? null : psrBase >= 999 ? null : psrBase - rampLate3;
      const rampText = rampDelta !== null && rampDelta > 0
        ? `A 3-month delay in your revenue ramp reduces your Primary Savings Runway by approximately ${rampDelta} months — from ${fmtRunway(psrBase)} to ${fmtRunway(rampLate3)}. Entering the transition with client commitments already secured can eliminate this risk entirely.`
        : `Your capital position is strong enough that a 3-month ramp delay does not materially change the Primary Savings Runway. Execution timing is still meaningful, but the risk to your financial position is contained.`;
      y = insight(doc, 'What A 3-Month Delay Means', rampText, y);

      // Fill with interpretation block if there's space
      y = insight(doc, 'Why Ramp Timing Matters',
        `During the ramp period, revenue is modeled at 50% of target (averaging the growth curve). Every extra month in the ramp means another month where savings cover the full gap. Entering with known clients, a signed contract, or pre-revenue already flowing shifts this timing favorably and without requiring more capital.`, y);

      ftr(doc, 7);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 8 — HOUSEHOLD SHOCK SCENARIOS
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 8, 'Household Shock Scenarios',
        'Secondary events that compound the transition. These are not predictions — they\'re edge cases worth quantifying before making a major move.', y);

      const shockRows = [
        {
          name: 'Partner income loss — 6 months',
          desc: sim.isDualIncome && sim.partnerIncome > 0
            ? `Partner income of ${fmtM(sim.partnerIncome)}/month stops for 6 months, then resumes. Burn increases by that amount during the loss period.`
            : 'Not applicable — no partner income entered.',
          psr: psrPartnerLoss, full: frPartnerLoss,
          needsT3: t3Cap > 0 && psrPartnerLoss < frPartnerLoss,
          applicable: sim.isDualIncome && sim.partnerIncome > 0,
        },
        {
          name: 'New child',
          desc: `Assumptions: ${fmtM(CHILD_ONETIME)} one-time setup cost + ${fmtM(CHILD_MONTHLY)}/month ongoing (childcare, supplies, insurance adjustments). These are estimates — actual costs vary significantly.`,
          psr: psrNewChild, full: fullRunway(sim, 1.00, undefined, () => CHILD_MONTHLY),
          needsT3: t3Cap > 0 && psrNewChild < fullRunway(sim, 1.00, undefined, () => CHILD_MONTHLY),
          applicable: true,
        },
        {
          name: 'Combined — partner loss (6 months) + new child',
          desc: 'Both shocks occurring simultaneously — the most conservative household stress test.',
          psr: psrCombined, full: fullRunway(sim, 1.00, undefined, (m) => CHILD_MONTHLY + (m <= 6 && sim.isDualIncome ? (sim.partnerIncome ?? 0) : 0)),
          needsT3: t3Cap > 0,
          applicable: sim.isDualIncome,
        },
      ];

      shockRows.forEach((sh, i) => {
        if (!sh.applicable) return;
        const h = 90;
        const bg = i % 2 === 0 ? C.light : C.mid;
        doc.rect(L, y, W, h).fill(bg);
        doc.fillColor(C.coal).fontSize(10).font('Helvetica-Bold').text(sh.name, L + 10, y + 8, { width: W - 20 });
        doc.fillColor(C.muted).fontSize(8.5).font('Helvetica').text(sh.desc, L + 10, y + 24, { width: 260, lineGap: 1 });
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text('Primary Savings Runway', L + 285, y + 14);
        doc.fillColor(C.navy).fontSize(13).font('Times-Bold').text(fmtRunway(sh.psr), L + 285, y + 26);
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text('Restricted assets req\'d?', L + 285, y + 50);
        doc.fillColor(sh.needsT3 ? C.red : C.green).fontSize(11).font('Helvetica-Bold')
          .text(sh.needsT3 ? 'Yes' : 'No', L + 285, y + 62);
        y += h + 6;
      });
      y += 6;

      y = insight(doc, 'The Pattern Behind Household Shocks',
        `These scenarios matter because they\'re correlated — difficult personal events tend to cluster. A partner job loss during a transition period is not unusual. A new child changes financial structure for years. The question isn\'t whether these will happen — it\'s whether the runway is wide enough to absorb one if it does.`, y);

      ftr(doc, 8);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 9 — SAVINGS TIER TIMELINE
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 9, 'Savings Tier Timeline',
        'Under severe income contraction (−30%), this is the sequence in which savings would be drawn down.', y);

      const stage1End = psr30; // T1+T2 exhausted
      const stage2End = fr30;  // All capital exhausted
      const hasStage2 = t3Cap > 0 && stage1End < stage2End;

      const stages = [
        { label: 'Stage 1 — Primary Accessible Savings', cap: fmtM(pasCap), color: C.blue, bg: '#f0f9ff', border: C.blue,
          desc: `Cash, HYSA, and brokerage accounts. No penalties. This stage ends around ${fmtRunway(stage1End)} under severe stress.` },
        ...(hasStage2 ? [{ label: 'Stage 2 — Restricted or Long-Term Assets', cap: fmtM(t3Cap), color: C.amber, bg: '#fffbeb', border: C.amber,
          desc: `Retirement accounts and home equity. Accessing these early triggers taxes and penalties. This stage begins if Stage 1 is exhausted — around ${fmtRunway(stage1End)}.` }] : []),
        { label: 'Stage 3 — Total Capital Exhaustion', cap: 'n/a', color: C.red, bg: '#fef2f2', border: C.red,
          desc: `All savings exhausted. ${stage2End >= 999 ? 'Not reached within the model range under any scenario.' : `Projected around ${fmtRunway(stage2End)} under severe contraction.`}` },
      ];

      stages.forEach((st, i) => {
        const h = 64;
        doc.rect(L, y, W, h).fill(st.bg as string);
        doc.rect(L, y, 3, h).fill(st.border as string);
        doc.fillColor(st.color as string).fontSize(10).font('Helvetica-Bold').text(st.label, L + 12, y + 10, { width: W - 24 });
        if (st.cap !== 'n/a') {
          doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('Capital in this stage', L + 12, y + 26);
          doc.fillColor(st.color as string).fontSize(13).font('Times-Bold').text(st.cap, L + 12, y + 36);
        }
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(st.desc, L + 200, y + 10, { width: W - 212, lineGap: 1.5 });
        y += h + 8;
      });

      // Visual timeline
      y += 8;
      doc.fillColor(C.muted).fontSize(8).font('Helvetica-Bold').text('TIMELINE UNDER SEVERE CONTRACTION (−30%)', L, y); y += 12;
      const totalMonthsTimeline = Math.min(Math.max(stage2End < 999 ? stage2End : stage1End < 999 ? stage1End * 2 : 60, 24), 120);
      const stage1W = stage1End >= 999 ? W : Math.round((stage1End / totalMonthsTimeline) * W);
      const stage2W = !hasStage2 ? 0 : stage2End >= 999 ? W - stage1W : Math.round(((stage2End - stage1End) / totalMonthsTimeline) * W);

      doc.save().fillOpacity(0.9).rect(L, y, stage1W, 24).fill(C.blue).restore();
      doc.save().fillOpacity(0.6).rect(L + stage1W, y, stage2W, 24).fill(C.amber).restore();
      doc.save().fillOpacity(0.4).rect(L + stage1W + stage2W, y, W - stage1W - stage2W, 24).fill(C.red).restore();
      doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text('Stage 1 (Primary)', L + 4, y + 8);
      if (hasStage2 && stage2W > 40) doc.text('Stage 2 (Restricted)', L + stage1W + 4, y + 8);
      y += 30;
      doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
        .text(`Stage 1 ends: ${fmtRunway(stage1End)}`, L, y)
        .text(hasStage2 ? `Stage 2 ends: ${fmtRunway(stage2End)}` : `No Stage 2 reached under this scenario.`, L + 200, y);
      y += 20;

      ftr(doc, 9);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 10 — REVENUE VS LIQUIDITY CURVE
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 10, 'Revenue vs. Liquidity Curve',
        'How your Primary Accessible Savings depletes over time under two revenue scenarios. The gap between lines reflects how much revenue performance changes your position.', y);

      const CHART_MONTHS = 36;
      const baseData = capitalSeries(sim, 1.00, CHART_MONTHS);
      const severeData = capitalSeries(sim, 0.70, CHART_MONTHS);
      const maxCap = pasCap;
      const chartH = 160, chartW = W - 64;
      const chartX = L + 60, chartY = y;

      lineChart(doc, baseData, severeData, maxCap, chartX, chartY, chartW, chartH, CHART_MONTHS);
      y += chartH + 30;

      // Annotation: pressure point
      if (pm30 < 999 && pm30 <= CHART_MONTHS) {
        const pmX = chartX + (pm30 / CHART_MONTHS) * chartW;
        doc.moveTo(pmX, chartY).lineTo(pmX, chartY + chartH).strokeColor(C.red).lineWidth(1).dash(3, { space: 3 }).stroke();
        doc.undash();
        doc.fillColor(C.red).fontSize(7.5).font('Helvetica-Bold')
          .text(`Pressure begins ~${fmtRunwayShort(pm30)}`, pmX - 40, chartY - 12, { width: 80, align: 'center' });
      }

      // Context
      y = statRow(doc, [
        { label: 'Base Case — Primary Savings Runway', val: fmtRunway(psrBase) },
        { label: 'Severe (−30%) — Primary Savings Runway', val: fmtRunway(psr30) },
        { label: 'Difference', val: psr30 >= 999 || psrBase >= 999 ? '—' : `${psrBase - psr30} months` },
      ], y);

      y = insight(doc, 'Reading This Chart',
        `The upper line (dark) shows your Primary Accessible Savings position under expected revenue. The lower line (gray) shows the same under a 30% revenue shortfall. Where the lower line drops to zero is when Primary Accessible Savings would be exhausted under severe stress — and Restricted assets would be needed if the full runway extends beyond that point.`, y);

      ftr(doc, 10);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 11 — WHAT MOVES THE NEEDLE
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 11, 'What Moves the Needle',
        'Ranked levers by impact on your Primary Savings Runway under severe stress (−30%). These are sensitivity results — not prescriptions.', y);

      const l500  = calcBurnLever(500),  l1k = calcBurnLever(1000), l2k = calcBurnLever(2000);
      const r500  = calcRevLever(500),   r1k = calcRevLever(1000);
      const llEarly3 = psRunway(sim, 1.00, Math.max(0, sim.rampDuration - 3));

      // Rank levers by impact on psr30
      const leverImpacts = [
        { name: 'Reduce Monthly Outflow by $500', delta: calcBurnLever(500) < 999 && psr30 < 999 ? calcBurnLever(500) - psr30 : (calcBurnLever(500) >= 999 ? 999 : 0), what: `Reducing outflow by ${fmtM(500)}/month to ${fmtM(sim.tmib - 500)} raises Primary Savings Runway from ${fmtRunway(psr30)} to ${fmtRunway(calcBurnLever(500))} under severe stress.` },
        { name: 'Reduce Monthly Outflow by $1,000', delta: calcBurnLever(1000) < 999 && psr30 < 999 ? calcBurnLever(1000) - psr30 : (calcBurnLever(1000) >= 999 ? 999 : 0), what: `Reducing outflow by ${fmtM(1000)}/month to ${fmtM(sim.tmib - 1000)} raises Primary Savings Runway from ${fmtRunway(psr30)} to ${fmtRunway(calcBurnLever(1000))} under severe stress.` },
        { name: 'Reduce Monthly Outflow by $2,000', delta: calcBurnLever(2000) < 999 && psr30 < 999 ? calcBurnLever(2000) - psr30 : (calcBurnLever(2000) >= 999 ? 999 : 0), what: `Reducing outflow by ${fmtM(2000)}/month to ${fmtM(Math.max(0, sim.tmib - 2000))} raises Primary Savings Runway from ${fmtRunway(psr30)} to ${fmtRunway(calcBurnLever(2000))} under severe stress.` },
        { name: 'Increase Revenue Target by $500/month', delta: calcRevLever(500) < 999 && psr30 < 999 ? calcRevLever(500) - psr30 : (calcRevLever(500) >= 999 ? 999 : 0), what: `Raising stable revenue target by ${fmtM(500)}/month raises Primary Savings Runway from ${fmtRunway(psr30)} to ${fmtRunway(calcRevLever(500))} under severe stress.` },
        { name: 'Increase Revenue Target by $1,000/month', delta: calcRevLever(1000) < 999 && psr30 < 999 ? calcRevLever(1000) - psr30 : (calcRevLever(1000) >= 999 ? 999 : 0), what: `Raising stable revenue target by ${fmtM(1000)}/month raises Primary Savings Runway from ${fmtRunway(psr30)} to ${fmtRunway(calcRevLever(1000))} under severe stress.` },
        { name: 'Revenue ramp 3 months earlier', delta: llEarly3 < 999 && psr30 < 999 ? llEarly3 - psr30 : (llEarly3 >= 999 ? 999 : 0), what: `A 3-month earlier revenue ramp raises Primary Savings Runway from ${fmtRunway(psr30)} to ${fmtRunway(llEarly3)} under severe stress. Each month of earlier revenue reduces capital dependency significantly.` },
      ].filter(l => l.delta > 0 || l.delta === 999).sort((a, b) => (b.delta === 999 ? 999 : b.delta) - (a.delta === 999 ? 999 : a.delta)).slice(0, 3);

      leverImpacts.forEach((lev, i) => {
        const deltaStr = lev.delta >= 999 ? 'Unlimited (fully cash-flow positive)' : `+${lev.delta} months`;
        const h = Math.max(60, Math.ceil(lev.what.length / 78) * 10 + 38);
        doc.rect(L, y, W, h).fill(i % 2 === 0 ? C.light : C.mid);
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold').text(`LEVER ${i + 1}`, L + 10, y + 8);
        doc.fillColor(C.navy).fontSize(10).font('Helvetica-Bold').text(lev.name, L + 10, y + 20, { width: 320 });
        doc.fillColor(C.green).fontSize(13).font('Times-Bold').text(deltaStr, L + 340, y + 18);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(lev.what, L + 10, y + 36, { width: W - 20, lineGap: 1.5 });
        y += h + 6;
      });
      y += 8;

      doc.fillColor(C.muted).fontSize(8).font('Helvetica-Oblique')
        .text('These are sensitivity calculations based on your inputs. They show how much each lever moves your position — not whether you should pull it. Financial decisions involve tradeoffs not captured here. Consult a qualified professional before acting.', L, y, { width: W, lineGap: 2 });

      ftr(doc, 11);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 12 — SCENARIO COMPARISON GRID
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 12, 'Scenario Comparison',
        'All scenarios side by side for quick reference. Primary Savings Runway is the T1+T2 exhaustion point. Full Runway uses all accessible savings.', y);

      const cols = [
        { label: 'Base', psr: psrBase, full: frBase, r3: t3Cap > 0 && psrBase < frBase, pm: pmBase },
        { label: 'Mild (−15%)', psr: psr15, full: fr15, r3: t3Cap > 0 && psr15 < fr15, pm: pm15 },
        { label: 'Severe (−30%)', psr: psr30, full: fr30, r3: t3Cap > 0 && psr30 < fr30, pm: pm30 },
        { label: 'Partner Loss', psr: psrPartnerLoss, full: frPartnerLoss, r3: t3Cap > 0 && psrPartnerLoss < frPartnerLoss, pm: pm30 },
        { label: 'New Child', psr: psrNewChild, full: 999, r3: t3Cap > 0, pm: pm30 },
      ];
      const colW = Math.floor(W / cols.length);

      // Header row
      doc.rect(L, y, W, 26).fill(C.navy);
      doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text('Metric', L + 8, y + 8);
      cols.forEach((col, i) => {
        doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text(col.label, L + 100 + i * 80, y + 8, { width: 78, align: 'center' });
      });
      y += 26;

      const gridRows = [
        { label: 'Primary Savings Runway', vals: cols.map(c => fmtRunwayShort(c.psr)) },
        { label: 'Full Runway', vals: cols.map(c => fmtRunwayShort(c.full)) },
        { label: 'Restricted assets req\'d?', vals: cols.map(c => c.r3 ? 'Yes' : 'No'), colors: cols.map(c => c.r3 ? C.red : C.green) },
        { label: 'Pressure begins', vals: cols.map(c => c.pm >= 999 ? 'None' : fmtRunwayShort(c.pm)) },
      ];

      gridRows.forEach((row, ri) => {
        const rowH = 28;
        doc.rect(L, y, W, rowH).fill(ri % 2 === 0 ? C.light : C.mid);
        doc.fillColor(C.muted).fontSize(8.5).font('Helvetica-Bold').text(row.label, L + 8, y + 9, { width: 90 });
        row.vals.forEach((val, ci) => {
          const color = row.colors ? row.colors[ci] : C.navy;
          doc.fillColor(color).fontSize(8.5).font('Helvetica-Bold').text(val, L + 100 + ci * 80, y + 9, { width: 78, align: 'center' });
        });
        y += rowH;
      });
      y += 16;

      y = insight(doc, 'Reading This Grid',
        `Each column represents a distinct revenue or household scenario. Primary Savings Runway is when your Primary Accessible Savings (cash + brokerage) runs out. Full Runway extends beyond that if Restricted or Long-Term Assets are drawn. "Restricted assets req\'d?" = Yes means there is a gap between primary savings and full depletion that would require accessing retirement or home equity.`, y);

      ftr(doc, 12);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 13 — RISK PROFILE SUMMARY
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 13, 'Risk Profile Summary',
        `Structural Breakpoint Score: ${score}/100 — ${scoreLabel}`, y);

      const riskBlocks = [
        {
          num: 1, title: 'Structural Position',
          body: score >= 70
            ? `Your financial structure is defensible under expected conditions. Primary Accessible Savings of ${fmtM(pasCap)} supports a runway of ${fmtRunway(psrBase)} at target revenue. The transition is viable as currently modeled.`
            : score >= 50
            ? `Your financial structure is workable but tight. Primary Accessible Savings of ${fmtM(pasCap)} provides ${fmtRunway(psrBase)} under expected conditions — but the margin narrows quickly under stress.`
            : `Your financial structure carries meaningful pressure. Primary Accessible Savings of ${fmtM(pasCap)} may not be sufficient to absorb revenue delays or shortfalls without entering Restricted asset territory early in the transition.`,
        },
        {
          num: 2, title: 'Primary Risk Driver',
          body: (() => {
            const fixedPct2 = grossOutflow > 0 ? Math.round(((sim.monthlyDebtPayments ?? 0) / grossOutflow) * 100) : 0;
            const hcPct = grossOutflow > 0 ? Math.round((hc / grossOutflow) * 100) : 0;
            if (fixedPct2 > 25) return `Fixed debt payments (${fmtM(sim.monthlyDebtPayments)}/month, ${fixedPct2}% of gross outflow) are the primary structural risk. These cannot be reduced under stress and represent the hardest component to manage during a revenue shortfall.`;
            if (hcPct > 18) return `Healthcare transition cost (${fmtM(hc)}/month, ${hcPct}% of gross outflow) is the primary structural risk. This is unusually high as a share of outflow and represents the largest controllable cost in the profile.`;
            if (sim.rampDuration > 8) return `Ramp duration (${sim.rampDuration} months) is the primary structural risk. A long ramp extends the period where savings must cover the full gap, maximizing the capital needed before revenue is reliable.`;
            return `Revenue volatility (${sim.volatilityPercent}% monthly variance assumption) is the primary structural risk. High income variance means the most favorable months cannot reliably offset the worst months.`;
          })(),
        },
        {
          num: 3, title: 'Pressure Timeline',
          body: pm30 >= 999
            ? `No pressure timeline was identified under any modeled scenario. Your Primary Accessible Savings appear sufficient to cover the transition without reaching a critical depletion point within the model range.`
            : `Under severe income contraction (−30%), financial pressure is estimated to begin around ${fmtRunway(pm30)}. This is when Primary Accessible Savings would drop within 6 months of exhaustion — the inflection point where each month carries meaningful urgency.`,
        },
        {
          num: 4, title: 'Execution Sensitivity',
          body: (() => {
            const rampDeltaMonths = rampLate3 < 999 && psrBase < 999 ? psrBase - rampLate3 : 0;
            if (rampDeltaMonths > 6) return `This profile is highly sensitive to ramp timing. A 3-month late revenue ramp reduces Primary Savings Runway by approximately ${rampDeltaMonths} months. Entering with pre-existing revenue or signed clients materially reduces this sensitivity.`;
            if (psr30 < 12) return `This profile is sensitive to revenue shortfalls in the first year. Under severe contraction, Primary Savings Runway drops to ${fmtRunway(psr30)} — leaving limited margin for extended underperformance. Early client acquisition or a confirmed anchor contract would substantially de-risk the first year.`;
            return `This profile shows moderate execution sensitivity. Revenue arriving on time or slightly early provides comfortable positioning. The primary execution risk is a simultaneous revenue shortfall and unexpected household expense event.`;
          })(),
        },
      ];

      riskBlocks.forEach((block) => {
        const lines = Math.max(3, Math.ceil(block.body.length / 86));
        const h = lines * 10 + 38;
        doc.rect(L, y, W, h).fill(block.num % 2 === 0 ? C.light : C.mid);
        doc.rect(L, y, 3, h).fill(C.navy);
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold').text(`${block.num}. ${block.title.toUpperCase()}`, L + 12, y + 10);
        doc.fillColor(C.coal).fontSize(9.5).font('Helvetica').text(block.body, L + 12, y + 24, { width: W - 24, lineGap: 2 });
        y += h + 8;
      });

      ftr(doc, 13);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 14 — FINAL SYNTHESIS
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 14, 'What This Means Based on Your Inputs',
        'A plain-English synthesis. No advice. No prescriptions. Just what the numbers show.', y);

      const synthBlocks = [
        {
          title: 'Structural Stability',
          body: score >= 70
            ? `Your financial structure supports this transition under expected conditions. Primary Accessible Savings of ${fmtM(pasCap)} provides ${fmtRunway(psrBase)} of Primary Savings Runway at target revenue — enough buffer to absorb a slow start without immediately entering Restricted asset territory.`
            : score >= 50
            ? `Your financial structure is workable. The transition is feasible under expected conditions, but there is limited margin if revenue arrives slower or lower than planned. The first 12 months are the highest-risk period.`
            : `Your financial structure shows meaningful fragility. Primary Accessible Savings may not be sufficient to sustain the transition through a standard ramp period if revenue underperforms. The window between "viable" and "distressed" is narrow.`,
        },
        {
          title: 'What Actually Drives the Risk',
          body: (() => {
            const fixedShare = grossOutflow > 0 ? (sim.monthlyDebtPayments ?? 0) / grossOutflow : 0;
            const hcShare = grossOutflow > 0 ? hc / grossOutflow : 0;
            const rampRisk = sim.rampDuration > 8;
            if (fixedShare > 0.25) return `Debt payments (${fmtM(sim.monthlyDebtPayments)}/month) represent ${Math.round(fixedShare * 100)}% of outflow and cannot be reduced without structural change. This creates an inflexible floor that amplifies the impact of any revenue shortfall.`;
            if (hcShare > 0.18) return `Healthcare transition cost (${fmtM(hc)}/month) represents ${Math.round(hcShare * 100)}% of outflow. This is the highest-leverage controllable cost — alternative coverage or income-based subsidies could materially change the structure.`;
            if (rampRisk) return `A ${sim.rampDuration}-month revenue ramp is the primary driver. The longer the ramp, the more capital must cover the full gap before revenue becomes reliable. Every month of ramp extension compounds this exposure.`;
            return `Revenue reliability (${sim.volatilityPercent}% monthly variance) creates the primary risk. With ${sim.volatilityPercent}% variance, the model conservatively discounts monthly revenue — meaning actual results need to be consistently above the volatile baseline to track with projections.`;
          })(),
        },
        {
          title: 'When Pressure Begins Under Severe Stress',
          body: pm30 >= 999
            ? `No meaningful pressure timeline was identified under severe contraction (−30%). Your Primary Accessible Savings appear sufficient to absorb this scenario through the full model range. This is the strongest indicator of financial resilience in this profile.`
            : `Under severe income contraction (−30%), financial pressure is estimated to begin around ${fmtRunway(pm30)}. That is when Primary Accessible Savings falls within 6 months of exhaustion. If revenue does not recover before that point, decisions about Restricted assets would become relevant.`,
        },
        {
          title: 'Two Highest-Impact Stabilizers',
          body: (() => {
            const burns = [calcBurnLever(500) - psr30, calcBurnLever(1000) - psr30, calcRevLever(500) - psr30, calcRevLever(1000) - psr30, llEarly3 - psr30].filter(d => d > 0);
            const maxDelta = Math.max(...burns, 0);
            const burnDelta = calcBurnLever(1000) < 999 && psr30 < 999 ? calcBurnLever(1000) - psr30 : null;
            const revDelta = calcRevLever(1000) < 999 && psr30 < 999 ? calcRevLever(1000) - psr30 : null;
            const lev1 = burnDelta !== null
              ? `Reducing outflow by ${fmtM(1000)}/month would extend Primary Savings Runway by approximately ${burnDelta} months under severe stress.`
              : `Increasing stable revenue by ${fmtM(1000)}/month would extend Primary Savings Runway by approximately ${revDelta ?? '—'} months under severe stress.`;
            const lev2 = revDelta !== null && revDelta > 0
              ? `Increasing stable revenue target by ${fmtM(1000)}/month would extend Primary Savings Runway by approximately ${revDelta} months under severe stress.`
              : `Entering with revenue already flowing or client commitments in hand would eliminate 3 months of ramp exposure — estimated at ${psrBase >= 999 ? 'significant' : `${Math.max(0, rampEarly3 - psrBase)} months`} of additional runway.`;
            return `First: ${lev1}\n\nSecond: ${lev2}`;
          })(),
        },
      ];

      synthBlocks.forEach(block => {
        const lines = Math.max(3, Math.ceil(block.body.length / 84));
        const h = lines * 10 + 38;
        doc.rect(L, y, W, h).fill(C.light);
        doc.rect(L, y, 3, h).fill(C.navy);
        doc.fillColor(C.navy).fontSize(10).font('Helvetica-Bold').text(block.title, L + 12, y + 10);
        doc.fillColor(C.coal).fontSize(9.5).font('Helvetica').text(block.body, L + 12, y + 26, { width: W - 24, lineGap: 2 });
        y += h + 8;
      });

      // Final disclaimer
      doc.rect(L, y, W, 44).fill(C.mid);
      doc.rect(L, y, 3, 44).fill(C.muted);
      doc.fillColor(C.muted).fontSize(8.5).font('Helvetica-Bold').text('IMPORTANT', L + 12, y + 8);
      doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('This report is a deterministic financial simulation. It is not financial advice, tax advice, or a prediction of future outcomes. All figures depend entirely on your inputs. Consult a qualified financial professional before making major financial or career decisions.', L + 12, y + 20, { width: W - 24, lineGap: 1.5 });
      y += 52;

      ftr(doc, 14);
      doc.end();

    } catch (err) {
      console.error('PDF generation error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'PDF generation failed. Please try again.' });
      }
    }
  });

  return httpServer;
}
