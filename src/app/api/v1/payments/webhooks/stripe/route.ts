import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { payments, subscriptions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe webhook — signature verification via stripe-signature (HMAC SHA256). */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: { code: "not_configured", message: "Stripe webhook not configured" } }, { status: 503 });
  }
  const header = req.headers.get("stripe-signature") ?? "";
  if (!verifyStripeSignature(raw, header, secret)) {
    return NextResponse.json({ ok: false, error: { code: "invalid_signature", message: "Invalid signature" } }, { status: 401 });
  }
  let event: any;
  try { event = JSON.parse(raw); } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_json", message: "Invalid JSON" } }, { status: 400 });
  }

  const data = event?.data?.object ?? {};
  if (event?.type === "invoice.payment_succeeded") {
    const db = await getDb();
    const customerEmail = data?.customer_email ?? null;
    const user = customerEmail ? (await db.select().from(users).where(eq(users.email, String(customerEmail).toLowerCase())).limit(1))[0] : null;
    const reference = String(data?.id ?? crypto.randomUUID());
    const existing = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
    if (!existing[0]) {
      const [payment] = await db.insert(payments).values({
        id: crypto.randomUUID(),
        userId: user?.id ?? null,
        provider: "stripe",
        reference,
        providerPaymentId: String(data?.id ?? ""),
        amount: Number(data?.amount_paid ?? 0),
        currency: String(data?.currency ?? "usd").toUpperCase(),
        status: "success",
        subscriptionId: String(data?.subscription ?? ""),
        metadata: { event: event.type },
      }).returning();
      if (user?.id) {
        const subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
        if (subRows[0]) await db.update(subscriptions).set({ status: "active", updatedAt: new Date() }).where(eq(subscriptions.id, subRows[0].id));
      }
    }
  }
  return NextResponse.json({ ok: true, data: { received: true } });
}

function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  // format: t=<timestamp>,v1=<signature>[,v1=<signature2>...]
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    })
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  const signedPayload = `${t}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  if (expected.length !== v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
