import type { Express } from "express";
import type { Server } from "http";
import { join } from 'path';
import { storage } from "./storage";
import { api } from "@shared/routes";
import { calculateSimulation } from "./services/simulator";
import { z } from "zod";
import PDFDocument from "pdfkit";
import type { Simulation } from "@shared/schema";
import { stripe } from "./services/stripeClient";

// ─── Palette ───────────────────────────────────────────────────────────────
const C = { navy:'#1e293b', coal:'#334155', muted:'#64748b', mid:'#f1f5f9',
  light:'#f8fafc', border:'#e2e8f0', white:'#ffffff',
  green:'#15803d', amber:'#b45309', red:'#dc2626', blue:'#1d4ed8' };
const L = 52, W = 508, R = 560, TOTAL = 15;

// ─── Formatting utilities ──────────────────────────────────────────────────
const fmtM = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function fmtRunway(months: number): string {
  if (months >= 999) return 'Sustainable Runway';
  if (months <= 0) return 'Less than 1 month';
  const yrs = Math.floor(months / 12);
  const mo = months % 12;
  if (yrs === 0) return `${mo} month${mo !== 1 ? 's' : ''}`;
  if (mo === 0) return `${yrs} year${yrs !== 1 ? 's' : ''}`;
  return `${yrs} year${yrs !== 1 ? 's' : ''}, ${mo} month${mo !== 1 ? 's' : ''}`;
}

function fmtRunwayShort(months: number): string {
  if (months >= 999) return 'Sustainable';
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
const pas = (s: Simulation) => t1(s) + t2(s); // Tier 1 Liquid Capital

// Tier 1 Runway: months until T1+T2 exhausted
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
    doc.fillColor(C.muted).fontSize(7).font('Helvetica').text(item.label.toUpperCase(), x, y + 11, { width: w - 4, align: 'center' });
    doc.fillColor(item.color ?? C.navy).fontSize(13).font('Times-Bold').text(item.val, x, y + 26, { width: w - 4, align: 'center' });
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
  doc.fillColor(C.muted).fontSize(7).font('Helvetica').text('Severe (-30%)', cx + cw - 107, cy + 14);
}

// ─── Route registration ────────────────────────────────────────────────────
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ─── Stripe Webhook (must be before express.json parses body) ───────────
  // server/index.ts captures rawBody via verify() on express.json — use req.rawBody
  app.post('/api/stripe/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const rawBody = (req as any).rawBody as Buffer | undefined;

    if (!rawBody) {
      return res.status(400).send('Missing raw body');
    }

    let event: import('stripe').default.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as import('stripe').default.Checkout.Session;
      const simulationId = parseInt(session.metadata?.simulationId ?? '', 10);
      const stripeSessionId = session.id;
      const stripePaymentIntentId = (session.payment_intent as string) ?? null;

      if (isNaN(simulationId)) {
        console.error('Webhook: missing or invalid simulationId in metadata');
        return res.status(200).json({ received: true });
      }

      // Idempotency — deduplicate by stripeSessionId
      const existing = await storage.getSimulationByStripeSession(stripeSessionId);
      if (existing) {
        return res.status(200).json({ received: true });
      }

      await storage.markSimulationPaid(
        simulationId,
        stripeSessionId,
        stripePaymentIntentId,
        session.customer_details?.email ?? undefined,
        session.customer_details?.name ?? undefined
      );
    }

    res.status(200).json({ received: true });
  });

  // ─── Stripe Checkout Session ─────────────────────────────────────────────
  app.post('/api/stripe/create-checkout-session', async (req, res) => {
    try {
      const { simulationId, purchaserEmail, purchaserName } = req.body;
      const simId = parseInt(simulationId, 10);

      if (!simId || isNaN(simId)) {
        return res.status(400).json({ error: 'invalid_simulation_id' });
      }

      const sim = await storage.getSimulation(simId);
      if (!sim) return res.status(404).json({ error: 'simulation_not_found' });

      if (sim.paid) {
        return res.status(400).json({ error: 'already_paid' });
      }

      const origin = `https://${req.headers.host}`;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
        success_url: `${origin}/results/${simId}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/results/${simId}`,
        customer_email: purchaserEmail || undefined,
        metadata: { simulationId: String(simId) },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error('Stripe checkout session error:', err.message);
      res.status(500).json({ error: 'stripe_error', message: err.message });
    }
  });

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

    // Gate behind payment
    if (!sim.paid) {
      return res.status(402).json({ error: 'payment_required', message: 'Payment required to access this report.' });
    }

    // Validate before generating
    const validationErrors = validateReport(sim);
    if (validationErrors.length > 0) {
      return res.status(422).json({
        message: 'Report validation failed. Please re-run the simulation.',
        errors: validationErrors,
      });
    }

    try {
      const doc = new PDFDocument({ margin: 0, size: 'LETTER', autoFirstPage: true });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="QuitReady_Report_${sim.id}.pdf"`);

      // Prevent unhandled 'error' events from crashing the process when
      // the client disconnects mid-stream (ERR_STREAM_WRITE_AFTER_END).
      doc.on('error', (streamErr: Error) => {
        console.error('PDF stream error (client likely disconnected):', streamErr.message);
      });
      res.on('close', () => {
        try { doc.destroy?.(); } catch (_) {}
      });

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

      // --- Baseline Shocks (T001) ---
      // Emergency Expense: $15,000 one-time hit
      const psrEmergency = (() => {
        if (sim.tmib <= 0) return 999;
        let cap = pasCap - 15000;
        const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 360; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          cap -= (sim.tmib - sim.expectedRevenue * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      })();

      // Unexpected Tax Bill: $10,000 one-time hit
      const psrTaxBill = (() => {
        if (sim.tmib <= 0) return 999;
        let cap = pasCap - 10000;
        const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 360; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          cap -= (sim.tmib - sim.expectedRevenue * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      })();

      // Business Launch Delay (+3 months)
      const psrRampDelay = psRunway(sim, 1.00, sim.rampDuration + 3);

      // Healthcare Cost Increase (+$500/month)
      const psrHealthcareShock = psRunway(sim, 1.00, undefined, () => 500);

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

      // Levers — all computed under severe contraction (0.70 revenue mult) so the delta is meaningful
      const SEV = 0.70;
      const calcBurnLever = (adj: number) => {
        if (sim.tmib - adj <= 0) return 999;
        let cap = pasCap; const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 360; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          cap -= ((sim.tmib - adj) - sim.expectedRevenue * SEV * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      };
      const calcRevLever = (adj: number) => {
        if (sim.tmib <= 0) return 999;
        let cap = pasCap; const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 360; m++) {
          const rf = sim.rampDuration > 0 && m <= sim.rampDuration ? 0.50 * (m / sim.rampDuration) : 1.0;
          cap -= (sim.tmib - (sim.expectedRevenue + adj) * SEV * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      };
      const calcRampLever = (rampAdj: number) => {
        if (sim.tmib <= 0) return 999;
        const newRamp = Math.max(0, sim.rampDuration - rampAdj);
        let cap = pasCap; const vol = 1 - sim.volatilityPercent / 100;
        for (let m = 1; m <= 360; m++) {
          const rf = newRamp > 0 && m <= newRamp ? 0.50 * (m / newRamp) : 1.0;
          cap -= (sim.tmib - sim.expectedRevenue * SEV * rf * vol);
          if (cap <= 0) return m;
        }
        return 999;
      };

      // Score
      const score = sim.structuralBreakpointScore;
      const scoreLabel = score >= 86 ? 'Strong Buffer Position' : score >= 70 ? 'Structurally Stable'
        : score >= 50 ? 'Moderately Exposed' : 'Structurally Fragile';
      // marginLabel is income-based (surplus vs. income). NOT score-based (per spec)
      // Computed here using sim values directly (before Page 1 derived vars are in scope)
      const _incomeForMargin = (sim.currentSalary ?? 0) + (sim.isDualIncome ? (sim.partnerIncome ?? 0) : 0);
      const _hcForMargin = sim.healthcareDelta ?? sim.healthcareMonthlyCost;
      const _grossForMargin = (sim.livingExpenses ?? 0) + (sim.monthlyDebtPayments ?? 0) + _hcForMargin +
        (sim.selfEmploymentTax ?? 0) + (sim.businessCostBaseline ?? 0);
      const _surplusForMargin = _incomeForMargin - _grossForMargin;
      const _marginPct = _incomeForMargin > 0 ? _surplusForMargin / _incomeForMargin : 0;
      const marginLabel = _marginPct > 0.10 ? 'Strong structural margin'
        : _marginPct >= 0 ? 'Moderate structural margin'
        : _marginPct >= -0.05 ? 'Thin structural margin'
        : 'Negative structural margin';

      // Pre-PDF validation. block PDF with console.error on integrity failures
      const validationErrors = validateReport(sim);
      if (validationErrors.length > 0) {
        validationErrors.forEach(e => console.error(`[QR PDF Validation] ${e}`));
      }

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
      // COVER PAGE (unnumbered)
      // ════════════════════════════════════════════════════════════════════
      const LOGO_PATH = join(process.cwd(), 'attached_assets', '626986E9-B8B4-462B-8F52-CB974B10376C_1772581585428.png');
      // Full navy background
      doc.rect(0, 0, 612, 792).fill(C.navy);
      // White header band (top)
      doc.rect(0, 0, 612, 88).fill(C.white);
      // Logo in white header band (left-aligned)
      try { doc.image(LOGO_PATH, 52, 22, { width: 152 }); } catch (_) {
        doc.fillColor(C.navy).fontSize(16).font('Times-Bold').text('QuitReady.', 52, 36);
      }
      // White footer band (bottom)
      doc.rect(0, 732, 612, 60).fill(C.white);
      // Footer text
      doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
        .text('Confidential. This report is a structural simulation. It is not financial advice.', 52, 750, { width: 508, align: 'center' });
      // Center content area
      // Thin white rule
      doc.rect(52, 160, 508, 0.75).fill('#334155');
      // Title (white on navy)
      doc.fillColor(C.white).fontSize(26).font('Times-Bold')
        .text('Financial Transition Report', 52, 178, { width: 508, align: 'center' });
      // Subtitle
      doc.fillColor('#94a3b8').fontSize(11).font('Helvetica')
        .text('A financial readiness analysis for transitioning from employment to independent income.', 52, 216, { width: 508, align: 'center', lineGap: 2 });
      // Thin rule
      doc.rect(52, 262, 508, 0.75).fill('#334155');
      // Generated date
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica-Bold').text('GENERATED', 52, 280, { width: 508, align: 'center' });
      doc.fillColor(C.white).fontSize(13).font('Times-Bold').text(date, 52, 295, { width: 508, align: 'center' });

      // ════════════════════════════════════════════════════════════════════
      // PAGE 1. EXECUTIVE SNAPSHOT
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 1, 'Your Financial Position Today',
        'A snapshot of your current income, monthly structure, and projected savings runway.', y);

      const totalIncome = (sim.currentSalary ?? 0) + (sim.isDualIncome ? (sim.partnerIncome ?? 0) : 0);
      // grossOutflowPDF = all expense components BEFORE partner income offset
      // tmib already subtracts partner income. Do not mix tmib with totalIncome or partner is counted twice
      const grossOutflowPDF = (sim.livingExpenses ?? 0) + (sim.monthlyDebtPayments ?? 0) + hc +
        (sim.selfEmploymentTax ?? 0) + (sim.businessCostBaseline ?? 0);
      const grossSurplus = totalIncome - grossOutflowPDF;

      y = statRow(doc, [
        { label: 'Total Monthly Income', val: fmtM(totalIncome) },
        { label: 'Total Monthly Outflow (all expenses)', val: fmtM(grossOutflowPDF), color: '#8B3A3A' },
        { label: 'Monthly Surplus / Deficit', val: (grossSurplus >= 0 ? '+' : '') + fmtM(grossSurplus), color: grossSurplus >= 0 ? C.green : '#8B3A3A' },
      ], y);

      // --- Income vs Outflow mini bar chart (T001) ---
      doc.rect(L, y, W, 1).fill(C.border); y += 16;
      const chartH_1 = 18;
      const chartMax = Math.max(totalIncome, grossOutflowPDF, 1);
      const incomeW = Math.round((totalIncome / chartMax) * 400);
      const outflowW = Math.round((grossOutflowPDF / chartMax) * 400);

      // Income bar
      doc.fillColor(C.muted).fontSize(7).font('Helvetica-Bold').text('MONTHLY INCOME', L, y + 5);
      doc.rect(L + 80, y, incomeW, chartH_1).fill(C.green);
      doc.fillColor(C.coal).fontSize(8).font('Helvetica-Bold').text(fmtM(totalIncome), L + 85 + incomeW, y + 5);
      y += chartH_1 + 8;

      // Outflow bar
      doc.fillColor(C.muted).fontSize(7).font('Helvetica-Bold').text('MONTHLY OUTFLOW', L, y + 5);
      doc.rect(L + 80, y, outflowW, chartH_1).fill('#8B3A3A');
      doc.fillColor(C.coal).fontSize(8).font('Helvetica-Bold').text(fmtM(grossOutflowPDF), L + 85 + outflowW, y + 5);
      y += chartH_1 + 16;
      doc.rect(L, y, W, 1).fill(C.border); y += 16;

      y = statRow(doc, [
        { label: 'Tier 1 Liquid Capital (Cash + Brokerage)', val: fmtM(pasCap) },
        { label: 'Tier 1 Runway, Base Case', val: fmtRunway(psrBase) },
      ], y);

      // Risk Classification line (T001)
      doc.fillColor(C.muted).fontSize(7).font('Helvetica').text('RISK CLASSIFICATION', L, y);
      doc.fillColor(C.navy).fontSize(13).font('Times-Bold').text(scoreLabel, L, y + 10);
      y += 32;

      // Score bracket bar — 4 cells spanning full W, active cell highlighted navy
      {
        const bands = [
          { range: '0 – 49',  label: 'Structurally Fragile',   min: 0,  max: 49 },
          { range: '50 – 69', label: 'Moderately Exposed',     min: 50, max: 69 },
          { range: '70 – 85', label: 'Structurally Stable',    min: 70, max: 85 },
          { range: '86 – 100',label: 'Strong Buffer Position',  min: 86, max: 100 },
        ];
        const cellW = Math.floor(W / 4);
        const bracketH = 46;
        doc.rect(L, y, W, bracketH).fill(C.light);
        bands.forEach((band, bi) => {
          const cx = L + bi * cellW;
          const cw = bi === 3 ? W - 3 * cellW : cellW;
          const isActive = score >= band.min && score <= band.max;
          doc.rect(cx, y, cw, bracketH).fill(isActive ? C.navy : C.light);
          if (bi > 0) doc.rect(cx, y, 1, bracketH).fill(C.border);
          const txtColor = isActive ? C.white : C.muted;
          doc.fillColor(txtColor).fontSize(7).font('Helvetica-Bold')
            .text(band.range, cx + 4, y + 10, { width: cw - 8, align: 'center' });
          doc.fillColor(isActive ? C.white : C.coal).fontSize(8).font(isActive ? 'Helvetica-Bold' : 'Helvetica')
            .text(band.label, cx + 4, y + 24, { width: cw - 8, align: 'center' });
        });
        y += bracketH + 10;
      }

      // Mini scenario snapshot
      doc.rect(L, y, W, 26).fill(C.navy);
      doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text('Scenario', L + 8, y + 9, { width: 160 });
      doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text('Tier 1 Runway', L + 172, y + 9, { width: 146, align: 'center' });
      doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text('Full Capital Depth', L + 326, y + 9, { width: 100, align: 'center' });
      doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text('Tier 2 Required?', L + 434, y + 9, { width: 66, align: 'center' });
      y += 26;
      [
        { label: 'Expected conditions', psr: psrBase, full: frBase, r3: t3Cap > 0 && psrBase < frBase },
        { label: 'Moderate Contraction (-15%)', psr: psr15, full: fr15, r3: t3Cap > 0 && psr15 < fr15 },
        { label: 'Severe Contraction (-30%)', psr: psr30, full: fr30, r3: t3Cap > 0 && psr30 < fr30 },
      ].forEach((sc, i) => {
        doc.rect(L, y, W, 30).fill(i % 2 === 0 ? C.light : C.mid);
        doc.fillColor(C.coal).fontSize(9.5).font('Helvetica').text(sc.label, L + 8, y + 10, { width: 160 });
        doc.fillColor(C.navy).fontSize(9.5).font('Helvetica-Bold').text(fmtRunwayShort(sc.psr), L + 172, y + 10, { width: 146, align: 'center' });
        doc.fillColor(C.coal).fontSize(9.5).font('Helvetica').text(fmtRunwayShort(sc.full), L + 326, y + 10, { width: 100, align: 'center' });
        doc.fillColor(sc.r3 ? C.red : C.green).fontSize(9.5).font('Helvetica-Bold')
          .text(sc.r3 ? 'Yes' : 'No', L + 434, y + 10, { width: 66, align: 'center' });
        y += 30;
      });
      y += 12;

      // Score interpretation
      const scoreInterpretation = score >= 86
        ? 'This is a strong buffer position. Capital depth and income structure are well-aligned to absorb a standard ramp period, including meaningful revenue underperformance.'
        : score >= 70
        ? 'This is a structurally stable position. The transition is viable under expected conditions and remains defensible under moderate stress. The primary risk is execution speed.'
        : score >= 50
        ? 'This position reflects moderate structural exposure. The transition is workable under expected conditions but carries meaningful sensitivity to revenue timing and early shortfalls.'
        : 'This position reflects structural fragility. The gap between a viable outcome and a distressed one is narrow. Strengthening Tier 1 Liquid Capital or reducing outflow before the transition would improve the position.';
      y = insight(doc, 'What This Classification Means', scoreInterpretation, y);

      // Tier 1 vs Full Capital Depth explanation
      const tier1Explanation = `Tier 1 Runway is the true comfort window. It reflects how long your penalty-free capital (cash and brokerage) can sustain the net gap between outflow and revenue. Full Capital Depth extends the runway further only if Tier 2 Contingent Capital (retirement accounts, home equity) is drawn. Tier 2 access carries tax obligations and permanent compounding loss. Tier 3 Structural Capital (private business equity, real estate partnerships) is intentionally excluded from runway modeling. Tier 1 Runway is the number that matters most.`;
      y = insight(doc, 'Tier 1 Runway vs. Full Capital Depth', tier1Explanation, y);

      ftr(doc, 1);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 2. INCOME STRENGTH & STABILITY
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 2, 'Income Strength & Stability',
        'Your current income picture and how it compares to the outflow structure that would be required after a transition.', y);

      // Income table. uses gross outflow (before partner offset) to avoid double-counting
      const partnerIncomePDF = sim.isDualIncome ? (sim.partnerIncome ?? 0) : 0;
      const incomeRows = [
        { label: 'Your monthly take-home income (current)', val: fmtM(sim.currentSalary ?? 0) },
        ...(sim.isDualIncome && sim.partnerIncome > 0
          ? [{ label: 'Partner monthly take-home income', val: fmtM(sim.partnerIncome) }] : []),
        { label: 'Total household monthly income', val: fmtM(totalIncome) },
        { label: 'Total monthly outflow. all expenses', val: fmtM(grossOutflowPDF) },
        ...(partnerIncomePDF > 0 ? [{ label: 'Less: partner income offset', val: `(${fmtM(partnerIncomePDF)})` }] : []),
        { label: 'Net gap (savings + new revenue must cover)', val: fmtM(sim.tmib) },
        { label: 'Monthly surplus / (deficit) vs. total income', val: (grossSurplus >= 0 ? '+' : '') + fmtM(grossSurplus) },
      ];
      incomeRows.forEach((row, i) => {
        const isTotal = row.label.startsWith('Total') || row.label.startsWith('Monthly surplus') || row.label.startsWith('Net gap');
        const isCredit = row.label.startsWith('Less:');
        const bg = isTotal ? C.mid : i % 2 === 0 ? C.light : C.white;
        doc.rect(L, y, W, 26).fill(bg);
        doc.fillColor(C.coal).fontSize(9).font(isTotal ? 'Helvetica-Bold' : 'Helvetica').text(row.label, L + 10, y + 8, { width: 340 });
        const valColor = isCredit ? C.green : (isTotal && grossSurplus < 0 && row.label.startsWith('Monthly') ? C.red : C.navy);
        doc.fillColor(valColor).fontSize(isTotal ? 10 : 9).font('Helvetica-Bold').text(row.val, L, y + 8, { width: W - 10, align: 'right' });
        y += 26;
      });
      y += 10;

      // Income vs Outflow bar. use gross outflow for honest comparison
      doc.fillColor(C.muted).fontSize(8).font('Helvetica-Bold').text('INCOME VS. TOTAL OUTFLOW', L, y); y += 12;
      const maxBar = Math.max(totalIncome, grossOutflowPDF, 1);
      const incomeBarW = Math.round((totalIncome / maxBar) * W);
      const outflowBarW = Math.round((grossOutflowPDF / maxBar) * W);

      doc.rect(L, y, incomeBarW, 18).fill(C.navy);
      doc.fillColor(C.white).fontSize(7.5).font('Helvetica').text(`Income ${fmtM(totalIncome)}`, L + 6, y + 5);
      y += 22;
      doc.rect(L, y, outflowBarW, 18).fill(grossOutflowPDF > totalIncome ? C.red : C.muted);
      doc.fillColor(C.white).fontSize(7.5).font('Helvetica').text(`Outflow ${fmtM(grossOutflowPDF)}`, L + 6, y + 5);
      y += 30;

      // Dependents note
      if ((sim.dependentChildren ?? 0) > 0) {
        y = insight(doc, 'Household Dependents',
          `You have ${sim.dependentChildren} dependent child${(sim.dependentChildren ?? 0) > 1 ? 'ren' : ''} in the household. This is reflected in the healthcare cost estimate. Dependent costs (childcare, education, activities) should be included in your living expenses figure.`, y);
      }

      // Paragraph — use gross comparison for income vs. outflow narrative
      const incomeVerb = totalIncome > grossOutflowPDF * 1.1 ? 'exceeds' : totalIncome >= grossOutflowPDF * 0.9 ? 'roughly matches' : 'falls below';
      const incomeP = `Today, your household income ${incomeVerb} your total monthly outflow structure. ${grossSurplus >= 0 ? `The ${fmtM(grossSurplus)}/month household surplus reflects total income against all expenses combined.${partnerIncomePDF > 0 ? ` After the partner income offset of ${fmtM(partnerIncomePDF)}, the net gap that savings or new business revenue must cover is ${fmtM(sim.tmib)}/month.` : ''}` : `The ${fmtM(Math.abs(grossSurplus))}/month shortfall means total expenses exceed total income today. The transition would require drawing from savings from day one.`}`;
      y = insight(doc, 'Current Household Income Position', incomeP, y);

      // What changes after transition
      const transitionP = grossSurplus >= 0
        ? `After the transition, your earned income stops. The monthly gap that savings and new revenue must cover is ${fmtM(sim.tmib)}/month. This is not your full outflow. It is the net amount remaining after any continuing partner income is applied. Until new revenue reaches the net gap, savings are the bridge.`
        : `After the transition, the existing shortfall compounds. There is no earned income cushion to absorb slow revenue. Every month without full revenue coverage draws from capital.`;
      y = insight(doc, 'What Changes After the Transition', transitionP, y);

      // Partner income context (if applicable)
      if (partnerIncomePDF > 0) {
        const partnerP = `Partner income of ${fmtM(partnerIncomePDF)}/month reduces the net gap directly. It is the single largest structural cushion in this position. If that income is interrupted (even temporarily), the monthly burden on savings increases by the same amount. This is why partner income stability is a key risk variable.`;
        y = insight(doc, 'Why Partner Income Matters', partnerP, y);
      }

      ftr(doc, 2);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 3. MONTHLY OUTFLOW BREAKDOWN
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
        'Contractual minimum payments. Cannot be skipped without credit damage or default',
        'Post-transition premium cost change versus current employer coverage',
        'Reserve against self-employment tax obligations (' + (sim.taxReservePercent ?? 25) + '% of projected revenue)',
        'Recurring business operating expenses needed to generate revenue',
      ];

      outflowComponents.forEach((c, i) => {
        const pct = pcts[i];
        const h = 36;
        doc.rect(L, y, W, h).fill(i % 2 === 0 ? C.light : C.mid);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica-Bold').text(c.label, L + 8, y + 5, { width: 152 });
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text(definitions[i] ?? '', L + 165, y + 5, { width: 185, lineGap: 1 });
        doc.fillColor(C.navy).fontSize(10).font('Helvetica-Bold').text(fmtM(c.val), L + 350, y + 12, { width: 96, align: 'center' });
        doc.fillColor(C.navy).fontSize(10).font('Helvetica-Bold').text(`${pct}%`, L + 454, y + 12, { width: 46, align: 'center' });
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
      doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold').text('NET MONTHLY OUTFLOW', L + 10, y + 11);
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
      // PAGE 4. DEBT STRUCTURE & EXPOSURE
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 4, 'Debt Structure & Financial Commitments',
        'Outstanding loan balances are context. They do not directly change your monthly outflow. They reflect long-term financial commitments and leverage.', y);

      doc.rect(L, y, W, 34).fill(C.mid);
      doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text('TOTAL OUTSTANDING DEBT BALANCE', L + 10, y + 8);
      const totalDebtVal = sim.totalDebt ?? 0;
      const debtColor = totalDebtVal === 0 ? C.green : sim.debtExposureRatio > 0.70 ? C.red : C.coal;
      doc.fillColor(debtColor).fontSize(18).font('Times-Bold').text(fmtM(totalDebtVal), L, y + 8, { width: W - 10, align: 'right' });
      y += 46;

      // Debt context note
      const debtNote = `Your monthly debt payment of ${fmtM(sim.monthlyDebtPayments)} is the required minimum and is included in your monthly outflow. The outstanding balance of ${fmtM(totalDebtVal)} does not affect your month-to-month outflow directly. It is the total you owe across all loans and affects long-term financial flexibility and the time required to become fully debt-free.`;
      y = insight(doc, 'How Debt Balances Differ From Debt Payments', debtNote, y);

      // Debt exposure
      if (totalDebtVal > 0) {
        const debtRatio = sim.debtExposureRatio;
        const debtRatioPct = Math.round(debtRatio * 100);
        y = statRow(doc, [
          { label: 'Outstanding Debt Balance', val: fmtM(totalDebtVal) },
          { label: 'Full Capital Depth', val: fmtM(sim.accessibleCapital) },
          { label: 'Debt-to-Savings Ratio', val: `${debtRatioPct}%`, color: debtRatioPct > 70 ? C.red : C.coal },
        ], y);
        if (debtRatioPct > 70) {
          doc.rect(L, y, W, 40).fill('#fef2f2');
          doc.rect(L, y, 3, 40).fill(C.red);
          doc.fillColor(C.red).fontSize(8.5).font('Helvetica-Bold').text('DEBT LOAD CONSIDERATIONS', L + 12, y + 8);
          doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(`Outstanding debt of ${fmtM(totalDebtVal)} primarily reflects long-term financing commitments. While it does not change monthly outflow directly, higher leverage can reduce flexibility if income timing shifts.`, L + 12, y + 20, { width: W - 24 });
          y += 48;
        }
        // Leverage narrative for non-zero debt
        const leverageInterp = sim.debtExposureRatio > 0.70
          ? `A debt-to-capital ratio above 70% is a compounding risk factor in any transition. If revenue underperforms, the loan minimums remain fixed while capital erodes. Reducing outstanding balance before the transition, or ensuring debt payments are covered by partner income, meaningfully improves the structural position.`
          : sim.debtExposureRatio > 0.35
          ? `Moderate leverage at ${Math.round(sim.debtExposureRatio * 100)}% of total capital. The required minimums are already accounted for in your monthly outflow. This level of debt is not structurally disqualifying, but it does reduce the buffer available if revenue arrives late.`
          : `A debt-to-capital ratio of ${Math.round(sim.debtExposureRatio * 100)}% is within a manageable range. Loan minimums are included in your monthly outflow and the balance does not materially constrain the runway calculation.`;
        y = insight(doc, 'Debt Leverage Interpretation', leverageInterp, y);
      } else {
        y = insight(doc, 'Debt Leverage Interpretation',
          'Carrying no outstanding debt is a structural advantage. You enter this transition with no mandatory loan repayments compressing your capital. Your monthly outflow is driven entirely by living costs and any new obligations you add.', y);
      }

      // Mortgage clarity note
      doc.rect(L, y, W, 44).fill('#f0f9ff');
      doc.rect(L, y, 3, 44).fill(C.blue);
      doc.fillColor(C.blue).fontSize(8).font('Helvetica-Bold').text('MORTGAGE / HOUSING PAYMENT NOTE', L + 12, y + 8);
      doc.fillColor(C.coal).fontSize(9).font('Helvetica').text('If you pay a mortgage, that monthly payment is recorded under Debt Payments (Required Minimums) and is already in your outflow. It should NOT also appear in your Living Expenses. Each payment belongs in exactly one place.', L + 12, y + 20, { width: W - 24, lineGap: 1.5 });
      y += 52;

      ftr(doc, 4);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 5. PRIMARY SAVINGS RUNWAY (DEFINITION PAGE)
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 5, 'Tier 1 Runway',
        'How long your readily accessible savings can sustain the gap between outflow and revenue.', y);

      // Definitions
      const defBlocks = [
        { title: 'Tier 1 Liquid Capital (Cash + Brokerage)', body: `${fmtM(pasCap)} total. This is your first line of defense. Money you can access without penalties, taxes, or significant delay. It includes cash, checking, savings, HYSA (counted at 100%) and taxable brokerage accounts (counted at 80% for capital gains exposure).` },
        { title: 'Tier 2 Contingent Capital (Retirement + Home Equity)', body: `${fmtM(t3Cap)} total. These assets are not considered primary runway. Accessing retirement funds early triggers income taxes and a 10% penalty, permanently reducing long-term compounding. Home equity is slow, costly, and market-dependent. Tier 2 assets are emergency capital, not a plan.` },
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
        { label: 'Cash & HYSA', cat: 'Tier 1', haircut: '100% (no deduction)', raw: sim.cash, counted: t1(sim) },
        { label: 'Brokerage accounts', cat: 'Tier 1', haircut: '80% (capital gains)', raw: sim.brokerage, counted: t2(sim) },
        { label: 'Roth IRA contributions', cat: 'Tier 2', haircut: '100% (still retirement)', raw: sim.roth, counted: Math.round(sim.roth) },
        { label: 'Traditional IRA / 401(k)', cat: 'Tier 2', haircut: '50% (taxes + penalty)', raw: sim.traditional, counted: Math.round(sim.traditional * 0.50) },
        { label: 'Home equity', cat: 'Tier 2', haircut: '30% (illiquid, costly)', raw: sim.realEstate, counted: Math.round(sim.realEstate * 0.30) },
      ].filter(r => r.raw > 0);

      // Color palette keyed by asset label for distinct tier zones
      const tierBg: Record<string, string> = {
        'Cash & HYSA':               '#dbeafe',  // blue-100  (Tier 1 primary)
        'Brokerage accounts':        '#bfdbfe',  // blue-200  (Tier 1 secondary)
        'Roth IRA contributions':    '#fef9c3',  // yellow-100 (Tier 2 accessible)
        'Traditional IRA / 401(k)': '#fef08a',  // yellow-200 (Tier 2 penalized)
        'Home equity':               '#ffedd5',  // orange-100 (Tier 2 illiquid)
      };
      const tierValColor: Record<string, string> = {
        'Cash & HYSA':               C.navy,
        'Brokerage accounts':        C.navy,
        'Roth IRA contributions':    C.amber,
        'Traditional IRA / 401(k)': C.amber,
        'Home equity':               '#c2410c',  // orange-700
      };
      tierRows.forEach((row) => {
        const bg = tierBg[row.label] ?? C.light;
        const catColor = tierValColor[row.label] ?? C.navy;
        doc.rect(L, y, W, 24).fill(bg);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(row.label, L + 8, y + 7, { width: 198 });
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text(row.haircut, L + 210, y + 7, { width: 96 });
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(fmtM(row.raw), L + 308, y + 7, { width: 106, align: 'center' });
        doc.fillColor(catColor).fontSize(9).font('Helvetica-Bold').text(fmtM(row.counted), L + 418, y + 7, { width: 84, align: 'center' });
        y += 24;
      });

      // Totals
      doc.rect(L, y, W, 28).fill(C.navy);
      doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold').text('Tier 1 Liquid Capital (Cash + Brokerage)', L + 8, y + 9);
      doc.fillColor(C.white).fontSize(12).font('Times-Bold').text(fmtM(pasCap), L, y + 9, { width: W - 10, align: 'right' });
      y += 28;
      doc.rect(L, y, W, 28).fill(C.navy);
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text('Full Capital Depth (All Tiers)', L + 8, y + 9);
      doc.fillColor(C.white).fontSize(13).font('Times-Bold').text(fmtM(sim.accessibleCapital), L, y + 9, { width: W - 10, align: 'right' });
      y += 36;

      // Runway + pressure point — wrapped in blue full-width card
      y += 10;
      {
        const hasPressure = pm30 < 999;
        const hasSustain = psrBase >= 999;
        const cardH = hasSustain ? 70 : hasPressure ? 120 : 58;
        doc.rect(L, y, W, cardH).fill('#f0f9ff');
        doc.rect(L, y, 3, cardH).fill(C.navy);
        doc.fillColor(C.muted).fontSize(8).font('Helvetica-Bold')
          .text('TIER 1 RUNWAY, BASE CASE', L + 12, y + 12);
        doc.fillColor(C.navy).fontSize(22).font('Times-Bold')
          .text(fmtRunway(psrBase), L + 12, y + 24);
        if (hasSustain) {
          doc.fillColor(C.muted).fontSize(8.5).font('Helvetica-Oblique')
            .text('Revenue reaches the modeled target. Savings stabilize early. Capital is not the limiting factor.', L + 12, y + 52, { width: W - 28, lineGap: 1 });
        }
        if (hasPressure) {
          doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
            .text(`Under severe contraction (-30%), Tier 1 capital exhausted in ${fmtRunway(psr30)}. Pressure begins around month ${Math.round(pm30)} (${fmtRunwayShort(pm30)}).`, L + 12, y + 56, { width: W - 28, lineGap: 1.5 });
          doc.fillColor(C.muted).fontSize(7).font('Helvetica-Oblique')
            .text('Pressure is the point where Tier 1 capital falls below the modeled burn requirement and contingency capital may begin to be accessed.', L + 12, y + 86, { width: W - 28, lineGap: 1 });
        }
        y += cardH + 10;
      }

      ftr(doc, 5);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 6. STRESS SCENARIO MODELING
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 6, 'Stress Scenario Modeling',
        'Three revenue outcomes tested against your outflow structure. Your Tier 1 Liquid Capital and total savings runway in each.', y);

      const scenarios = [
        {
          name: 'Revenue arrives on time and hits target', tag: 'Base case',
          psr: psrBase, full: frBase, pm: pmBase, needsT3: t3Cap > 0 && psrBase < frBase,
          interp: psrBase >= 999
            ? 'Under expected revenue conditions, savings stabilize before depletion. Capital is not the limiting factor in this scenario.'
            : psrBase >= 36
            ? `With ${fmtRunway(psrBase)} of Tier 1 Runway, this scenario shows a comfortable starting position. Capital draw is gradual through the ramp, and the trajectory stabilizes as revenue builds.`
            : psrBase >= 18
            ? `With ${fmtRunway(psrBase)} of Tier 1 Runway, the base case is workable but leaves limited room for execution delays. Revenue arriving on time is a structural assumption in this scenario.`
            : `With ${fmtRunway(psrBase)} under expected conditions, the base case is tight. Revenue performance at or above target is required to keep this timeline viable.`,
        },
        {
          name: 'Revenue underperforms target by 15%', tag: 'Moderate contraction',
          psr: psr15, full: fr15, pm: pm15, needsT3: t3Cap > 0 && psr15 < fr15,
          interp: psr15 >= 999
            ? 'Even with 15% revenue underperformance, savings stabilize before depletion. The position is resilient to moderate contraction.'
            : (psrBase >= 999 || Math.abs(psrBase - psr15) < 3)
            ? `A 15% revenue shortfall reduces Tier 1 Runway to ${fmtRunway(psr15)}. The position is relatively resilient to moderate underperformance.`
            : `A 15% revenue shortfall reduces Tier 1 Runway from ${fmtRunway(psrBase)} to ${fmtRunway(psr15)}. This is the scenario most likely to occur. It deserves more weight than the base case.`,
        },
        {
          name: 'Revenue materially underperforms by 30%', tag: 'Severe contraction',
          psr: psr30, full: fr30, pm: pm30, needsT3: t3Cap > 0 && psr30 < fr30,
          interp: psr30 >= 999
            ? 'Even under a 30% revenue shortfall, savings stabilize before depletion. Capital is not the limiting factor in this scenario.'
            : psr30 >= 18
            ? `Even under a 30% revenue shortfall, Tier 1 Runway extends to ${fmtRunway(psr30)}. This scenario represents meaningful stress that does not fundamentally break the structure.`
            : psr30 >= 9
            ? `A 30% revenue shortfall compresses Tier 1 Runway to ${fmtRunway(psr30)}. This is the scenario that meaningfully changes risk posture. Recovery would depend on controlling outflow or accelerating revenue.`
            : `A 30% shortfall exhausts Tier 1 Liquid Capital within ${fmtRunway(psr30)}. This is the structurally significant scenario. Entering with a signed contract or a smaller outflow base would be the most effective mitigation.`,
        },
      ];

      scenarios.forEach((sc, i) => {
        const bg = i === 2 ? '#fef2f2' : i === 1 ? '#fffbeb' : '#f0fdf4';
        const bc = i === 2 ? C.red : i === 1 ? C.amber : C.green;
        const h = 132;
        doc.rect(L, y, W, h).fill(bg);
        doc.rect(L, y, 3, h).fill(bc);
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold').text(sc.tag.toUpperCase(), L + 12, y + 10);
        doc.fillColor(C.coal).fontSize(10).font('Helvetica-Bold').text(sc.name, L + 12, y + 22, { width: W - 24 });
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('Tier 1 Runway', L + 12, y + 44);
        doc.fillColor(bc).fontSize(13).font('Times-Bold').text(fmtRunway(sc.psr), L + 12, y + 55);
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('Full Capital Depth', L + 200, y + 44);
        doc.fillColor(C.coal).fontSize(13).font('Times-Bold').text(fmtRunway(sc.full), L + 200, y + 55);
        doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('Tier 2 Required?', L + 368, y + 44, { width: 132, align: 'center' });
        doc.fillColor(sc.needsT3 ? C.red : C.green).fontSize(13).font('Times-Bold').text(sc.needsT3 ? 'Yes' : 'No', L + 368, y + 55, { width: 132, align: 'center' });
        doc.fillColor(C.coal).fontSize(8.5).font('Helvetica').text(sc.interp, L + 12, y + 84, { width: W - 24, lineGap: 1.5 });
        y += h + 6;
      });
      y += 4;

      y = insight(doc, 'The Scenario That Matters Most',
        'The severe contraction (-30%) scenario is the one that reveals real structural exposure. If Tier 1 Runway holds above 12 months under that scenario, the position is defensible. If it falls below 6 months, the transition requires strengthening before proceeding. Pressure begins when Tier 1 Liquid Capital drops within 6 months of exhaustion under that revenue level.', y);

      ftr(doc, 6);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 7. REVENUE TIMING SENSITIVITY
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 7, 'Revenue Timing Sensitivity',
        `Your base ramp is ${sim.rampDuration} months. This shows how arriving early or late by 3 months changes your Tier 1 Runway.`, y);

      const timingRows = [
        { label: 'Revenue ramp 3 months early', ramp: Math.max(0, sim.rampDuration - 3), psr: rampEarly3 },
        { label: `Revenue ramp on time, base case (${sim.rampDuration} months)`, ramp: sim.rampDuration, psr: psrBase },
        { label: 'Revenue ramp 3 months late', ramp: sim.rampDuration + 3, psr: rampLate3 },
      ];

      y = tableHead(doc, [
        { label: 'Scenario', x: L + 8 }, { label: 'Ramp Duration', x: L + 265 },
        { label: 'Tier 1 Runway', x: L + 365 },
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
        ? `A 3-month delay in your revenue ramp reduces your Tier 1 Runway by approximately ${rampDelta} months, from ${fmtRunway(psrBase)} to ${fmtRunway(rampLate3)}. Entering the transition with client commitments already secured can eliminate this risk entirely.`
        : `Your capital position is strong enough that a 3-month ramp delay does not materially change the Tier 1 Runway. Execution timing is still meaningful, but the risk to your financial position is contained.`;
      y = insight(doc, 'What A 3-Month Delay Means', rampText, y);

      // Fill with interpretation block if there's space
      y = insight(doc, 'Why Ramp Timing Matters',
        `During the ramp period, revenue is modeled at 50% of target (averaging the growth curve). Every extra month in the ramp means another month where savings cover the full gap. Entering with known clients, a signed contract, or pre-revenue already flowing shifts this timing favorably and without requiring more capital.`, y);

      ftr(doc, 7);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 8. HOUSEHOLD SHOCK SCENARIOS
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 8, 'Household Shock Scenarios',
        'Secondary events that compound the transition. These are not predictions. They are edge cases worth quantifying before making a major financial move.', y);

      // Shock grid: fixed 2-col layout per spec.
      // Row 1: Emergency Expense | Unexpected Tax Bill
      // Row 2: Business Launch Delay | Healthcare Cost Increase
      // Build applicable shock list
      const shockList: { name: string; desc: string; psr: number; needsT3: boolean }[] = [
        { name: 'Emergency Expense', desc: 'A one-time $15,000 emergency expense hitting Tier 1 Liquid Capital immediately.', psr: psrEmergency, needsT3: t3Cap > 0 && psrEmergency < frBase },
        { name: 'Unexpected Tax Bill', desc: 'A one-time $10,000 tax obligation hitting Tier 1 Liquid Capital immediately.', psr: psrTaxBill, needsT3: t3Cap > 0 && psrTaxBill < frBase },
        { name: 'Business Launch Delay', desc: 'A 3-month delay in reaching the revenue ramp target.', psr: psrRampDelay, needsT3: t3Cap > 0 && psrRampDelay < frRamp3 },
        { name: 'Healthcare Cost Increase', desc: 'An unexpected $500/month increase in healthcare premiums or medical outflow.', psr: psrHealthcareShock, needsT3: t3Cap > 0 && psrHealthcareShock < frBase },
        ...(sim.isDualIncome && sim.partnerIncome > 0 ? [
          { name: 'Partner Income Loss', desc: `Partner income of ${fmtM(sim.partnerIncome)}/month stops for 6 months then resumes. Burn increases by that amount during the loss period.`, psr: psrPartnerLoss, needsT3: t3Cap > 0 && psrPartnerLoss < frPartnerLoss },
        ] : []),
        { name: 'New Child', desc: `${fmtM(CHILD_ONETIME)} one-time setup + ${fmtM(CHILD_MONTHLY)}/month ongoing. Estimates only. Actual costs vary.`, psr: psrNewChild, needsT3: t3Cap > 0 && psrNewChild < fullRunway(sim, 1.00, undefined, () => CHILD_MONTHLY) },
        ...(sim.isDualIncome && sim.partnerIncome > 0 ? [
          { name: 'Combined: Partner Loss + New Child', desc: 'Both shocks simultaneously. The most conservative household stress scenario.', psr: psrCombined, needsT3: t3Cap > 0 },
        ] : []),
      ];

      // Single-column full-width shock cards — horizontal internal layout to keep height compact
      const shockCardH = 52;
      const leftW = Math.round(W * 0.58);   // name + desc zone
      const rightX = L + Math.round(W * 0.62); // runway data zone start
      const rightW = Math.round(W * 0.33);  // runway data zone width
      const badgeW = 46;
      shockList.forEach((sh, i) => {
        doc.rect(L, y, W, shockCardH).fill(i % 2 === 0 ? C.light : C.mid);
        doc.rect(L, y, 3, shockCardH).fill(C.navy);
        // Badge — top-right corner
        const badgeBg = sh.needsT3 ? '#fef2f2' : '#f0fdf4';
        doc.rect(L + W - badgeW - 8, y + 8, badgeW, 13).fill(badgeBg);
        doc.fillColor(sh.needsT3 ? C.red : C.green).fontSize(6).font('Helvetica-Bold')
          .text(sh.needsT3 ? 'Tier 2 Req' : 'Tier 1 OK', L + W - badgeW - 8, y + 11, { width: badgeW, align: 'center' });
        // Left zone: name + desc
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold')
          .text(sh.name, L + 10, y + 9, { width: leftW - badgeW - 18 });
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
          .text(sh.desc, L + 10, y + 22, { width: leftW, lineGap: 1 });
        // Right zone: runway label + value + delta
        doc.fillColor(C.muted).fontSize(6.5).font('Helvetica-Bold')
          .text('NEW TIER 1 RUNWAY', rightX, y + 9, { width: rightW });
        const runwayVal = sh.psr >= 999 ? 'Sustainable' : fmtRunwayShort(Math.round(sh.psr));
        doc.fillColor(C.navy).fontSize(10).font('Times-Bold')
          .text(runwayVal, rightX, y + 19, { width: rightW });
        if (psrBase < 999 && sh.psr < 999) {
          const d = Math.round(sh.psr - psrBase);
          doc.fillColor(d < 0 ? C.red : C.green).fontSize(7).font('Helvetica')
            .text(`${d >= 0 ? '+' : ''}${d} months`, rightX, y + 35, { width: rightW });
        } else if (psrBase >= 999 && sh.psr < 999) {
          doc.fillColor(C.muted).fontSize(7).font('Helvetica')
            .text('Base was Sustainable', rightX, y + 35, { width: rightW });
        }
        y += shockCardH + 5;
      });
      y += 4;

      y = insight(doc, 'The Pattern Behind Household Shocks',
        'These scenarios matter because they are correlated. Difficult personal events tend to cluster. A partner job loss during a transition period is not unusual. A new child changes financial structure for years. The question is not whether these will happen. It is whether the runway is wide enough to absorb one if it does.', y);

      ftr(doc, 8);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 9. SAVINGS TIER TIMELINE
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 9, 'Savings Tier Timeline',
        'Under severe income contraction (-30%), this is the sequence in which savings would be drawn down.', y);

      const stage1End = psr30; // T1+T2 exhausted
      const stage2End = fr30;  // All capital exhausted
      const hasStage2 = t3Cap > 0 && stage1End < stage2End;

      const stages = [
        { label: 'Stage 1. Tier 1 Liquid Capital', cap: fmtM(pasCap), color: C.blue, bg: '#f0f9ff', border: C.blue,
          desc: `Cash, HYSA, and brokerage accounts. No penalties. This stage ends around ${fmtRunway(stage1End)} under severe stress.` },
        ...(hasStage2 ? [{ label: 'Stage 2. Tier 2 Contingent Capital', cap: fmtM(t3Cap), color: C.amber, bg: '#fffbeb', border: C.amber,
          desc: `Retirement accounts and home equity. Accessing these early triggers taxes and penalties. This stage begins if Stage 1 is exhausted, around ${fmtRunway(stage1End)}. Note: Tier 3 Structural Capital (private equity, illiquid real estate) is excluded from all runway calculations.` }] : []),
        { label: 'Stage 3. Total Capital Exhaustion', cap: 'n/a', color: C.red, bg: '#fef2f2', border: C.red,
          desc: `All savings exhausted. ${stage2End >= 999 ? 'Not reached within the model range under any scenario.' : `Projected around ${fmtRunway(stage2End)} under severe contraction.`}` },
      ];

      // Stage bullet content indexed by stage label prefix
      const stageBullets: Record<string, string[]> = {
        'Stage 1': [
          '\u2022  Cash, HYSA, and brokerage accounts.',
          '\u2022  No penalties or tax consequences.',
          `\u2022  Stage ends around ${fmtRunway(stage1End)} under severe stress.`,
        ],
        'Stage 2': [
          '\u2022  Retirement accounts and home equity.',
          '\u2022  Early access triggers income taxes and penalties.',
          `\u2022  Begins if Stage 1 is exhausted around ${fmtRunway(stage1End)}.`,
        ],
        'Stage 3': [
          stage2End >= 999
            ? '\u2022  Not reached within any modeled scenario.'
            : `\u2022  Projected around ${fmtRunway(stage2End)} under severe contraction.`,
          '\u2022  Represents full capital exhaustion across all tiers.',
        ],
      };
      stages.forEach((st) => {
        const h = 78;
        const keyPrefix = (st.label as string).slice(0, 7);
        const bullets = stageBullets[keyPrefix] ?? [];
        doc.rect(L, y, W, h).fill(st.bg as string);
        doc.rect(L, y, 3, h).fill(st.border as string);
        doc.fillColor(st.color as string).fontSize(10).font('Helvetica-Bold').text(st.label, L + 12, y + 10, { width: W - 24 });
        if (st.cap !== 'n/a') {
          doc.fillColor(C.muted).fontSize(8).font('Helvetica').text('Capital in this stage', L + 12, y + 28);
          doc.fillColor(st.color as string).fontSize(13).font('Times-Bold').text(st.cap, L + 12, y + 40);
        }
        bullets.forEach((b, bi) => {
          doc.fillColor(C.coal).fontSize(8.5).font('Helvetica')
            .text(b, L + 200, y + 12 + bi * 19, { width: W - 212, lineGap: 1 });
        });
        y += h + 8;
      });

      // Visual timeline
      y += 8;
      doc.fillColor(C.muted).fontSize(8).font('Helvetica-Bold').text('TIMELINE UNDER SEVERE CONTRACTION (-30%)', L, y); y += 12;
      const totalMonthsTimeline = Math.min(Math.max(stage2End < 999 ? stage2End : stage1End < 999 ? stage1End * 2 : 60, 24), 120);
      const stage1W = stage1End >= 999 ? W : Math.round((stage1End / totalMonthsTimeline) * W);
      const stage2W = !hasStage2 ? 0 : stage2End >= 999 ? W - stage1W : Math.round(((stage2End - stage1End) / totalMonthsTimeline) * W);

      doc.save().fillOpacity(0.9).rect(L, y, stage1W, 24).fill(C.blue).restore();
      doc.save().fillOpacity(0.6).rect(L + stage1W, y, stage2W, 24).fill(C.amber).restore();
      doc.save().fillOpacity(0.4).rect(L + stage1W + stage2W, y, W - stage1W - stage2W, 24).fill(C.red).restore();
      doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text('Stage 1 (Primary)', L + 4, y + 8);
      if (hasStage2 && stage2W > 40) doc.text('Stage 2 (Restricted)', L + stage1W + 4, y + 8);
      y += 30;

      y = insight(doc, 'Reading the Timeline',
        'The blue bar represents Stage 1: penalty-free Tier 1 capital (cash and brokerage). This is your primary runway — accessible without tax or penalty. The amber bar represents Stage 2: Tier 2 contingent capital (retirement accounts and home equity). These assets carry early-access penalties and tax consequences. They extend the runway but at a permanent cost. The red zone marks total capital exhaustion — the structural hard stop. Aim to stabilize revenue before the Stage 1 bar ends.', y);

      ftr(doc, 9);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 10. REVENUE VS LIQUIDITY CURVE
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 10, 'Revenue vs. Liquidity Curve',
        'How your Tier 1 Liquid Capital depletes over time under two revenue scenarios. The gap between lines reflects how much revenue performance changes your position.', y);

      const CHART_MONTHS = 36;
      const baseData = capitalSeries(sim, 1.00, CHART_MONTHS);
      const severeData = capitalSeries(sim, 0.70, CHART_MONTHS);
      const maxCap = pasCap;
      const chartH_2 = 160, chartW = W - 64;
      const chartX = L + 60, chartY = y;

      lineChart(doc, baseData, severeData, maxCap, chartX, chartY, chartW, chartH_2, CHART_MONTHS);
      y += chartH_2 + 30;

      // Annotation: Tier 1 depletion point at psr30 (actual depletion, not pressure point)
      if (psr30 < 999 && psr30 <= CHART_MONTHS) {
        const depX = chartX + (psr30 / CHART_MONTHS) * chartW;
        const depLabelX = psr30 > 24 ? depX - 90 : depX + 4;
        doc.moveTo(depX, chartY).lineTo(depX, chartY + chartH_2).strokeColor(C.red).lineWidth(1).dash(3, { space: 3 }).stroke();
        doc.undash();
        doc.fillColor(C.red).fontSize(7).font('Helvetica-Bold').text('Tier 1 depletion', depLabelX, chartY - 14, { width: 88 });
        doc.fillColor(C.red).fontSize(7).font('Helvetica').text(`month ${Math.round(psr30)} (${fmtRunwayShort(psr30)})`, depLabelX, chartY - 5, { width: 88 });
      }
      // Annotation: Pressure point at pm30 (6 months before depletion)
      if (pm30 < 999 && pm30 <= CHART_MONTHS && pm30 !== psr30) {
        const pmX = chartX + (pm30 / CHART_MONTHS) * chartW;
        const pmLabelX = pm30 > 18 ? pmX - 70 : pmX + 4;
        doc.moveTo(pmX, chartY + chartH_2 - 30).lineTo(pmX, chartY + chartH_2).strokeColor(C.amber).lineWidth(1).dash(2, { space: 2 }).stroke();
        doc.undash();
        doc.fillColor(C.amber).fontSize(6.5).font('Helvetica').text(`Pressure ~month ${Math.round(pm30)}`, pmLabelX, chartY + chartH_2 - 38, { width: 72 });
      }

      // Break-even revenue note
      doc.rect(L, y, W, 28).fill(C.light);
      doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold').text('BREAK-EVEN REVENUE', L + 10, y + 8);
      doc.fillColor(C.navy).fontSize(11).font('Times-Bold').text(fmtM(sim.tmib) + '/month', L, y + 7, { width: W - 10, align: 'right' });
      doc.fillColor(C.muted).fontSize(7.5).font('Helvetica').text('Revenue required to fully cover the monthly gap. When revenue reaches this level, savings stop declining.', L + 10, y + 19, { width: W - 20 });
      y += 36;

      // Context stats
      y = statRow(doc, [
        { label: 'Base Case, Tier 1 Runway', val: fmtRunway(psrBase) },
        { label: 'Severe (-30%), Tier 1 Runway', val: fmtRunway(psr30) },
        { label: 'Difference', val: psr30 >= 999 || psrBase >= 999 ? 'N/A' : `${psrBase - psr30} months` },
      ], y, 66);

      // "Reading This Chart" — 4 bullets with bold lead phrases
      {
        const blockBullets = [
          { lead: 'Upper line (Base Case):', body: ' Revenue ramps toward target. Savings stabilize. Capital is not exhausted.' },
          { lead: 'Lower line (Severe \u221230%):', body: ' Revenue persistently underperforms. Savings continue declining until Tier 1 is exhausted.' },
          { lead: 'The gap between lines:', body: ' Reflects the cost of revenue timing risk — not the size of savings.' },
          { lead: 'Key watch point:', body: psr30 < 999 ? ` If the lower line hits $0 before month 24, the transition requires structural strengthening. (Current: month ${Math.round(psr30)}.)` : ' Lower line stays positive through the modeled range — revenue timing risk is well-contained.' },
        ];
        const blockH = 136;
        doc.rect(L, y, W, blockH).fill(C.light);
        doc.rect(L, y, 3, blockH).fill(C.navy);
        doc.fillColor(C.muted).fontSize(7).font('Helvetica-Bold').text('READING THIS CHART', L + 10, y + 8);
        blockBullets.forEach((bl, bi) => {
          const by = y + 22 + bi * 28;
          doc.fillColor(C.navy).fontSize(8.5).font('Helvetica-Bold')
            .text(`\u2022  ${bl.lead}`, L + 10, by, { width: W - 24 });
          doc.fillColor(C.coal).fontSize(8).font('Helvetica')
            .text(bl.body.trim(), L + 18, by + 12, { width: W - 32 });
        });
        y += blockH + 8;
      }

      ftr(doc, 10);

      // ─── Encoding fix in routes.ts (T001) ───
      // Replace curly quotes and mathematical minus signs
      const sanitize = (str: string) => str
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/−/g, '-');

      // ════════════════════════════════════════════════════════════════════
      // PAGE 11. HOW TO WIDEN THE RUNWAY
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 11, 'How to Widen the Runway',
        'Sensitivity analysis under severe contraction (-30%). Each lever shows how much additional runway is gained vs. the severe stress baseline.', y);

      // Lever helper: format runway + impact vs severe contraction baseline (psr30)
      const leverImpact = (newPsr: number) => {
        // Always show actual runway value (never "Sustainable" — that hides meaningful info)
        const newR = newPsr >= 999 ? fmtRunwayShort(999) : fmtRunwayShort(Math.round(newPsr));
        const d = newPsr >= 999 ? (psr30 >= 999 ? 0 : 999 - Math.round(psr30)) : Math.round(newPsr - psr30);
        const impactStr = d === 0 ? 'No change' : `${d > 0 ? '+' : ''}${d} mo`;
        return {
          runway: newR,
          impact: impactStr,
          color: d > 0 ? C.green : d < 0 ? C.red : C.muted,
        };
      };

      const leverCategories = [
        {
          name: 'Burn Reduction',
          rows: [
            { desc: 'Reduce burn by $1,000/month', psr: calcBurnLever(1000) },
            { desc: 'Reduce burn by $2,000/month', psr: calcBurnLever(2000) },
            { desc: 'Reduce burn by $3,000/month', psr: calcBurnLever(3000) },
          ],
        },
        ...(sim.rampDuration > 0 ? [{
          name: 'Revenue Ramp (Earlier Start)',
          rows: (
            [
              { adj: 3, desc: 'Revenue begins 3 months earlier' },
              { adj: 6, desc: 'Revenue begins 6 months earlier' },
              { adj: 9, desc: 'Revenue begins 9 months earlier' },
            ]
              .map(item => ({ desc: item.desc, psr: calcRampLever(item.adj), newRamp: Math.max(0, sim.rampDuration - item.adj) }))
              .filter((item, i, arr) => i === 0 || item.newRamp !== arr[i - 1].newRamp)
              .map(item => ({ desc: item.desc, psr: item.psr }))
          ),
        }] : []),
        {
          name: 'Supplemental Income',
          rows: [
            { desc: 'Add $1,500/month supplemental income', psr: calcBurnLever(1500) },
            { desc: 'Add $3,000/month supplemental income', psr: calcBurnLever(3000) },
          ],
        },
      ];

      leverCategories.forEach(cat => {
        // Category header
        doc.rect(L, y, W, 22).fill(C.navy);
        doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold').text(cat.name, L + 8, y + 7);
        doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica-Bold').text('New Runway', L + 330, y + 7, { width: 88, align: 'center' });
        doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica-Bold').text('Impact', L + 425, y + 7, { width: 75, align: 'right' });
        y += 22;
        cat.rows.forEach((lv, i) => {
          const li = leverImpact(lv.psr);
          doc.rect(L, y, W, 26).fill(i % 2 === 0 ? C.light : C.mid);
          doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(lv.desc, L + 8, y + 8, { width: 318 });
          doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(li.runway, L + 330, y + 8, { width: 88, align: 'center' });
          doc.fillColor(li.color).fontSize(9).font('Helvetica-Bold').text(li.impact, L + 425, y + 8, { width: 75, align: 'right' });
          y += 26;
        });
        y += 8;
      });

      y = insight(doc, 'Why These Levers Matter',
        `Runway is highly sensitive to the net gap. Small reductions in fixed burn or small increases in steady revenue have a non-linear impact on Tier 1 Runway because they reduce the monthly draw against capital. Focus on the lever that is easiest to execute before the transition date.`, y);

      // Advisory lever category cards
      const advisoryCards = [
        {
          title: 'CASH FLOW LEVERS',
          color: '#1e3a5f',
          bullets: [
            'Reduce fixed obligations before your transition date.',
            'Refinance high-interest debt to lower required minimums.',
            'Trim discretionary spending to increase monthly surplus.',
            'Convert fixed costs to variable where possible.',
          ],
        },
        {
          title: 'REVENUE DE-RISKING LEVERS',
          color: '#1d4ed8',
          bullets: [
            'Secure pre-transition contracts or retainer agreements.',
            'Maintain part-time or consulting income during the ramp.',
            'Enter with a client pipeline already in progress.',
            'Delay the leap to shorten ramp exposure and reduce capital needed.',
          ],
        },
        {
          title: 'STRUCTURAL CUSHION LEVERS',
          color: '#15803d',
          bullets: [
            'Increase Tier 1 Liquid Capital before making the transition.',
            'Reduce outstanding leverage before the leap date.',
            'Shift brokerage holdings to cash to reduce haircut exposure.',
          ],
        },
        {
          title: 'RISK COMPRESSION TACTICS',
          color: '#b45309',
          bullets: [
            'Set a 6-month checkpoint with defined revenue thresholds.',
            'Define a minimum monthly revenue floor before drawing from savings.',
            'Establish a re-entry trigger: the point at which you return to employment.',
            'Create a fallback income floor through part-time or contract work.',
          ],
        },
      ];

      // Section header above advisory cards
      y += 8;
      doc.rect(L, y, W, 1).fill(C.border); y += 12;
      doc.fillColor(C.muted).fontSize(7).font('Helvetica-Bold').text('STRUCTURAL LAUNCH FACTORS', L, y); y += 9;
      doc.fillColor(C.navy).fontSize(13).font('Times-Bold').text('Common Factors in Transition Outcomes', L, y); y += 20;
      doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
        .text('The following patterns appear consistently across successful and unsuccessful financial transitions. Each area represents a structural lever, not a behavioral suggestion.', L, y, { width: W, lineGap: 1 });
      y += 28;

      // Ensure enough room for 2×2 grid; add page if needed
      const advCardH = 82;
      const advCardW = Math.floor((W - 8) / 2);
      if (y + 2 * (advCardH + 6) > 720) { doc.addPage(); hdr(doc, date); y = 42; }

      // Render advisory cards in 2×2 grid (row-major: cards 0+1 on row 1, cards 2+3 on row 2)
      [[0, 1], [2, 3]].forEach(([a, b], rowIdx) => {
        const rowY = y + rowIdx * (advCardH + 6);
        [a, b].forEach(ci => {
          const card = advisoryCards[ci];
          if (!card) return;
          const col = ci % 2;
          const cx = L + col * (advCardW + 8);
          doc.rect(cx, rowY, advCardW, advCardH).fill(C.light);
          doc.rect(cx, rowY, 3, advCardH).fill(card.color);
          doc.fillColor(card.color).fontSize(7.5).font('Helvetica-Bold')
            .text(card.title, cx + 10, rowY + 10, { width: advCardW - 16 });
          card.bullets.forEach((bullet, bi) => {
            doc.fillColor(C.coal).fontSize(7).font('Helvetica')
              .text(`\u2022  ${bullet}`, cx + 10, rowY + 26 + bi * 13, { width: advCardW - 16 });
          });
        });
      });
      y += 2 * (advCardH + 6) + 4;

      ftr(doc, 11);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 12. SCENARIO COMPARISON GRID
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 12, 'Scenario Comparison',
        'All scenarios side by side for quick reference. Tier 1 Runway is the T1+T2 exhaustion point. Full Capital Depth uses all accessible savings.', y);

      // Flipped axes: scenarios = rows, metrics = columns
      // Column x positions and widths
      const scLabelX = L + 8,   scLabelW = 128;
      const m1X = L + 148,      m1W = 90;   // Tier 1 Runway
      const m2X = L + 238,      m2W = 90;   // Full Capital Depth
      const m3X = L + 328,      m3W = 74;   // Tier 2 Req?
      const m4X = L + 402,      m4W = 98;   // Pressure Begins

      // Header row
      doc.rect(L, y, W, 28).fill(C.navy);
      doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text('Scenario', scLabelX, y + 10, { width: scLabelW });
      doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text('Tier 1 Runway', m1X, y + 10, { width: m1W, align: 'center' });
      doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text('Full Capital Depth', m2X, y + 10, { width: m2W, align: 'center' });
      doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text('Tier 2 Req?', m3X, y + 10, { width: m3W, align: 'center' });
      doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold').text('Pressure Begins', m4X, y + 10, { width: m4W, align: 'center' });
      y += 28;

      const scenarioRows = [
        { label: 'Base Case',                  psr: psrBase,        full: frBase,        r3: t3Cap > 0 && psrBase < frBase,        pm: pmBase },
        { label: 'Moderate Contraction (-15%)', psr: psr15,          full: fr15,          r3: t3Cap > 0 && psr15 < fr15,          pm: pm15 },
        { label: 'Severe Contraction (-30%)',   psr: psr30,          full: fr30,          r3: t3Cap > 0 && psr30 < fr30,          pm: pm30 },
        { label: 'Partner Income Loss',         psr: psrPartnerLoss, full: frPartnerLoss, r3: t3Cap > 0 && psrPartnerLoss < frPartnerLoss, pm: pm30 },
        { label: 'New Child Scenario',          psr: psrNewChild,    full: 999,           r3: t3Cap > 0,                          pm: pm30 },
      ];

      scenarioRows.forEach((sc, ri) => {
        const rowH = 36;
        doc.rect(L, y, W, rowH).fill(ri % 2 === 0 ? C.light : C.mid);
        doc.fillColor(C.coal).fontSize(9).font('Helvetica-Bold').text(sc.label, scLabelX, y + 12, { width: scLabelW });
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(fmtRunwayShort(sc.psr), m1X, y + 12, { width: m1W, align: 'center' });
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(fmtRunwayShort(sc.full), m2X, y + 12, { width: m2W, align: 'center' });
        doc.fillColor(sc.r3 ? C.red : C.green).fontSize(9).font('Helvetica-Bold').text(sc.r3 ? 'Yes' : 'No', m3X, y + 12, { width: m3W, align: 'center' });
        doc.fillColor(C.muted).fontSize(9).font('Helvetica').text(sc.pm >= 999 ? '—' : fmtRunwayShort(sc.pm), m4X, y + 12, { width: m4W, align: 'center' });
        y += rowH;
      });
      y += 14;

      y = insight(doc, 'Reading This Grid',
        `Each row represents a distinct revenue or household scenario. Tier 1 Runway is when your penalty-free capital (cash and brokerage) runs out. Full Capital Depth extends beyond that if Tier 2 Contingent Capital is drawn. Tier 2 Required indicates whether the position must access retirement accounts or home equity to sustain the transition. Pressure Begins marks the point where Tier 1 capital drops within 6 months of exhaustion and each remaining month requires deliberate action.`, y);

      ftr(doc, 12);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 13. DECISION INTERPRETATION
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 13, 'Decision Interpretation',
        `Structural Breakpoint Score: ${score}/100. ${scoreLabel}. A plain-language summary of what this analysis means.`, y);

      const riskBlocks = [
        {
          num: 1, title: 'Structural Stability',
          bullets: score >= 70
            ? [
                `Tier 1 Liquid Capital: ${fmtM(pasCap)} — supports ${fmtRunway(psrBase)} of Tier 1 Runway at target revenue.`,
                'Financial structure is defensible under expected conditions.',
                'The transition is viable as currently modeled.',
                'Primary variable is execution speed, not capital depth.',
              ]
            : score >= 50
            ? [
                `Tier 1 Liquid Capital: ${fmtM(pasCap)} — provides ${fmtRunway(psrBase)} under expected conditions.`,
                'Structure is workable but the margin is limited.',
                'Revenue underperformance or a delayed ramp would compress this window meaningfully.',
              ]
            : [
                `Tier 1 Liquid Capital: ${fmtM(pasCap)} — may not be sufficient to absorb revenue delays or shortfalls.`,
                'Without early revenue, Tier 2 asset territory would be entered early in the transition.',
                'Strengthening the capital base before leaving would materially improve this position.',
              ],
        },
        {
          num: 2, title: 'Primary Risk Drivers',
          bullets: (() => {
            const fixedPct2 = grossOutflow > 0 ? Math.round(((sim.monthlyDebtPayments ?? 0) / grossOutflow) * 100) : 0;
            const hcPct = grossOutflow > 0 ? Math.round((hc / grossOutflow) * 100) : 0;
            if (fixedPct2 > 25) return [
              `Fixed debt payments represent ${fixedPct2}% of gross outflow at ${fmtM(sim.monthlyDebtPayments)}/month.`,
              'These obligations cannot be reduced under stress.',
              'Debt service remains constant even when revenue underperforms.',
            ];
            if (hcPct > 18) return [
              `Healthcare transition cost (${fmtM(hc)}/month) represents ${hcPct}% of gross outflow.`,
              'This is unusually high as a share of total outflow.',
              'Partner coverage or income-based ACA subsidies could materially change the position.',
            ];
            if (sim.rampDuration > 8) return [
              `Revenue ramp duration is ${sim.rampDuration} months — the primary structural risk factor.`,
              'A long ramp extends the period where savings must cover the full gap.',
              'Entering with even one paying client shortens this window meaningfully.',
            ];
            return [
              `Revenue reliability is the primary structural risk.`,
              `Under 30% income contraction, Tier 1 Runway drops to ${fmtRunway(psr30)}.`,
              'Entering with pre-existing revenue or a confirmed client reduces dependence on the ramp timeline.',
            ];
          })(),
        },
        {
          num: 3, title: 'Where Pressure Appears',
          bullets: pm30 >= 999
            ? [
                'No pressure point was identified within the model range.',
                'Tier 1 Liquid Capital remains solvent across all modeled scenarios.',
                'If revenue reaches target and ramp timing holds, no critical depletion threshold is encountered.',
              ]
            : t3Cap > 0 && psr30 < frBase
            ? [
                `Under severe income contraction (-30%), Tier 1 capital would be exhausted in ${fmtRunway(psr30)}.`,
                `Retirement accounts or home equity could extend total runway to ${fmtRunway(fr30)}.`,
                'Tier 2 assets represent emergency capital, not primary transition funding.',
                'Pressure indicates when Tier 1 liquid capital falls below the modeled burn requirement.',
              ]
            : [
                `Under severe income contraction (-30%), Tier 1 capital would be exhausted in ${fmtRunway(psr30)}.`,
                `Pressure begins around month ${Math.round(pm30)} — when the depletion window narrows within 6 months.`,
                'Pressure indicates when Tier 1 liquid capital falls below the modeled burn requirement.',
              ],
        },
        {
          num: 4, title: 'What Would Improve the Position',
          bullets: [
            'Reduce fixed monthly obligations before the transition date.',
            'Enter with at least one signed client or confirmed revenue commitment.',
            `Increase Tier 1 Liquid Capital (currently ${fmtM(pasCap)}) before leaving.`,
            'Shorten the revenue ramp by building a client pipeline before quitting.',
            'Ensure partner income remains stable through the ramp period.',
          ],
        },
      ];

      riskBlocks.forEach((block) => {
        const bulletH = 13;
        const h = block.bullets.length * bulletH + 44;
        doc.rect(L, y, W, h).fill(block.num % 2 === 0 ? C.light : C.mid);
        doc.rect(L, y, 3, h).fill(C.navy);
        doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold').text(`${block.num}. ${block.title.toUpperCase()}`, L + 12, y + 10);
        let by = y + 26;
        block.bullets.forEach(bullet => {
          doc.fillColor(C.coal).fontSize(8.5).font('Helvetica').text(`\u2022  ${sanitize(bullet)}`, L + 14, by, { width: W - 28, lineGap: 1 });
          by += bulletH;
        });
        y += h + 8;
      });

      ftr(doc, 13);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 14. GLOSSARY
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      y = secHead(doc, 14, 'Glossary of Terms',
        'Plain-language definitions for every metric and concept used in this report.', y);

      const glossaryTerms = [
        {
          term: 'Sustainable Runway',
          def: 'Capital is not the limiting factor under the modeled scenario. Revenue stabilizes the financial position before savings are depleted, so no fixed depletion date applies.',
        },
        {
          term: 'Tier 1 Liquid Capital',
          def: 'Cash, checking, savings, and taxable brokerage accounts (at 80% for capital gains). Available without penalties or delays. The primary runway source in any transition.',
        },
        {
          term: 'Tier 2 Contingent Capital',
          def: 'Retirement accounts and home equity. Accessible but carry penalties, taxes, or illiquidity. Counted conservatively. Treated as emergency capital, not planned transition funding.',
        },
        {
          term: 'Tier 3 Structural Capital',
          def: 'Private equity, real estate partnerships, and deferred compensation. These assets are highly illiquid and excluded from runway modeling. They cannot reliably fund short-term transitions.',
        },
        {
          term: 'Tier 1 Runway',
          def: 'Months until Tier 1 Liquid Capital is fully exhausted, given the net monthly gap and revenue ramp. The primary comfort window before Tier 2 access is required.',
        },
        {
          term: 'Full Capital Depth',
          def: 'Total runway if all tiers are drawn sequentially. Extends beyond Tier 1 Runway when Tier 2 assets exist. Represents maximum runway before all accessible capital is exhausted.',
        },
        {
          term: 'Net Savings Gap',
          def: 'Monthly shortfall savings and new revenue must cover. Equals gross outflow minus partner income. When revenue covers the full gap, savings stop declining.',
        },
        {
          term: 'Break-even Revenue',
          def: 'The monthly revenue level at which savings stop declining. When revenue equals the net savings gap, capital drawdown ends.',
        },
        {
          term: 'Pressure Point',
          def: 'The month Tier 1 Liquid Capital drops within 6 months of exhaustion. Before this, drawdown is manageable. After it, each remaining month requires deliberate action.',
        },
        {
          term: 'Revenue Ramp',
          def: 'The period revenue is building toward target. Model assumes 50% at midpoint and 100% by end. Shorter ramps reduce capital dependency. Longer ramps increase it.',
        },
        {
          term: 'Structural Leverage',
          def: 'Ratio of outstanding debt to total accessible capital. Higher leverage narrows recovery options under stress and reduces the buffer available during a transition.',
        },
        {
          term: 'Structural Breakpoint Score',
          def: 'A 0-to-100 score reflecting position resilience across capital depth, runway, outflow structure, and stress scenarios. Above 70 is stable. Below 50 indicates meaningful fragility.',
        },
      ];

      glossaryTerms.forEach((entry, i) => {
        const defLines = Math.max(2, Math.ceil(entry.def.length / 88));
        const h = defLines * 10 + 30;
        doc.rect(L, y, W, h).fill(i % 2 === 0 ? C.light : C.mid);
        doc.rect(L, y, 3, h).fill(C.navy);
        doc.fillColor(C.navy).fontSize(9).font('Helvetica-Bold').text(entry.term, L + 12, y + 9, { width: W - 24 });
        doc.fillColor(C.coal).fontSize(8.5).font('Helvetica').text(entry.def, L + 12, y + 21, { width: W - 24, lineGap: 1.5 });
        y += h + 4;
      });
      ftr(doc, 14);

      // ════════════════════════════════════════════════════════════════════
      // PAGE 15. IMPORTANT NOTICE (DISCLAIMER)
      // ════════════════════════════════════════════════════════════════════
      doc.addPage(); hdr(doc, date); y = 42;
      doc.rect(L, y, W, 1).fill(C.border); y += 8;
      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text(`PAGE 15 OF ${TOTAL}`, L, y); y += 11;
      doc.fillColor(C.navy).fontSize(16).font('Times-Bold').text('Important Notice', L, y, { width: W }); y += 30;

      const disclaimerParas = [
        'This report is a structural financial simulation generated by QuitReady. It is based solely on the inputs provided by the user. It does not constitute financial advice, tax advice, investment advice, or legal advice of any kind.',
        'All outputs — including runway figures, surplus and deficit calculations, capital depth estimates, and stress scenario results — are deterministic mathematical projections. They are not predictions of future outcomes. Actual results will differ based on market conditions, personal circumstances, changes in tax law, and many other factors not captured in this model.',
        'No licensed professional has reviewed the inputs or outputs in this report. The calculations assume that all user-provided information is accurate and complete. Errors or omissions in the inputs will produce materially incorrect results.',
        'QuitReady does not make any representation as to the accuracy, completeness, or suitability of this analysis for any particular purpose. The user assumes full responsibility for any decisions made in reliance on this report.',
        'Healthcare cost estimates are based on general ACA marketplace assumptions and may not reflect actual premiums available in your state or for your household. Tax estimates are illustrative only and do not account for individual circumstances, credits, deductions, or state-level obligations.',
        'Before making any significant financial, career, or investment decision, you are strongly encouraged to consult with a qualified financial planner, tax professional, or attorney who can assess your complete financial situation.',
        'This report is confidential and intended solely for the personal use of the individual who generated it. It should not be shared with, or relied upon by, any third party without independent professional review.',
      ];

      disclaimerParas.forEach((para, i) => {
        const isFirst = i === 0;
        if (isFirst) {
          doc.rect(L, y - 4, W, 2).fill(C.navy);
          y += 6;
        }
        doc.fillColor(C.coal).fontSize(9).font('Helvetica').text(para, L, y, { width: W, lineGap: 2 });
        y += doc.heightOfString(para, { width: W, lineGap: 2 }) + 14;
      });

      ftr(doc, 15);
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
