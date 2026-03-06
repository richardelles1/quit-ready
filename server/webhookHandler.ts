import type { Request, Response } from "express";
import { stripe } from "./services/stripeClient";
import { storage } from "./storage";
import { sendReportEmail } from "./services/emailService";
import type Stripe from "stripe";
import crypto from "crypto";

async function fetchPdfBuffer(simulationId: number, host: string): Promise<Buffer | null> {
  try {
    const url = `${host}/api/simulations/${simulationId}/pdf`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`PDF fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    console.error("PDF fetch exception:", err);
    return null;
  }
}

export async function stripeWebhookHandler(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string;

  if (!sig) {
    return res.status(400).send('Missing stripe-signature header');
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const simulationId = parseInt(session.metadata?.simulationId ?? '', 10);
    const stripeSessionId = session.id;
    const stripePaymentIntentId = (session.payment_intent as string) ?? null;

    if (isNaN(simulationId)) {
      console.error('Webhook: missing or invalid simulationId in metadata');
      return res.status(200).json({ received: true });
    }

    const existing = await storage.getSimulationByStripeSession(stripeSessionId);
    if (existing) {
      return res.status(200).json({ received: true });
    }

    // Generate a unique single-use rerun token
    const rerunToken = crypto.randomBytes(24).toString('hex');

    await storage.markSimulationPaid(
      simulationId,
      stripeSessionId,
      stripePaymentIntentId,
      session.customer_details?.email ?? undefined,
      session.customer_details?.name ?? undefined,
      rerunToken
    );

    // Send branded report email with PDF attached (non-blocking)
    const email = session.customer_details?.email;
    if (email) {
      const origin = (req.headers.origin as string)
        || process.env.APP_URL
        || `https://${req.get('host')}`;

      // Fetch the generated PDF
      const pdfBuffer = await fetchPdfBuffer(simulationId, origin);

      // Get the full simulation record
      const simulation = await storage.getSimulation(simulationId);

      if (simulation && pdfBuffer) {
        const result = await sendReportEmail(simulation, pdfBuffer, rerunToken, origin);
        if (!result.success) {
          console.error(`Email send failed for sim ${simulationId}:`, result.error);
        } else {
          console.log(`Report email sent to ${email} for sim ${simulationId}`);
        }
      } else {
        console.warn(`Skipping email for sim ${simulationId}: simulation=${!!simulation}, pdf=${!!pdfBuffer}`);
      }
    }
  }

  res.status(200).json({ received: true });
}
