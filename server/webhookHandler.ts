import type { Request, Response } from "express";
import { stripe } from "./services/stripeClient";
import { storage } from "./storage";
import type Stripe from "stripe";

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

    await storage.markSimulationPaid(
      simulationId,
      stripeSessionId,
      stripePaymentIntentId,
      session.customer_details?.email ?? undefined,
      session.customer_details?.name ?? undefined
    );
  }

  res.status(200).json({ received: true });
}
