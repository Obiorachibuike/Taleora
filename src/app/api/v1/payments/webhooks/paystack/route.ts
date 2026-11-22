import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { payments, subscriptions, creditAccounts, creditTransactions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paystack webhook — verifies signature, never trusts redirect alone. */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET ?? process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ ok: false, error: { code: "not_configured", message: "Paystack webhook not configured" } }, { status: 503 });
  }
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const expected = crypto.createHmac("sha512", secret).update(raw).digest("hex");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return NextResponse.json({ ok: false, error: { code: "invalid_signature", message: "Invalid signature" } }, { status: 401 });
  }
  let event: any;
  try { event = JSON.parse(raw); } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_json", message: "Invalid JSON" } }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (event?.data ?? {}) as any;
  const reference = data.reference ?? data.status ?? undefined;
  if (!reference) {
    return NextResponse.json({ ok: true, data: { ignored: true } });
  }

  if (event.event === "charge.success" && data.status === "success") {
    const db = await getDb();
    // find existing payment (idempotency)
    const existing = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
    if (!existing[0]) {
      const [payment] = await db.insert(payments).values({
        id: crypto.randomUUID(),
        userId: await findUserByEmail(db, data.customer?.email ?? null),
        provider: "paystack",
        reference,
        providerPaymentId: String(data.id ?? ""),
        amount: Number(data.amount ?? 0),
        currency: String(data.currency ?? "NGN"),
        status: "success",
        subscriptionId: String(data.subscription_id ?? ""),
        metadata: { event: event.event, channel: data.channel },
      }).returning();
      // Plan assignment happens through subscription activations — do NOT fabricate credit grants.
      // Only record a ledger transaction when the payment could be matched to a real user.
      if (payment.userId) {
        await db.insert(creditTransactions).values({
          id: crypto.randomUUID(),
          userId: payment.userId,
          amount: 0,
          type: "adjustment",
          reason: `paystack:${event.event}`,
          reference,
        }).catch(() => {});
      }
      // set subscription active if we can match a user by payment
      if (payment.userId) {
        const subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, payment.userId)).limit(1);
        if (subRows[0]) await db.update(subscriptions).set({ status: "active", updatedAt: new Date() }).where(eq(subscriptions.id, subRows[0].id));
      }
    }
  }
  return NextResponse.json({ ok: true, data: { received: true } });
}

async function findUserByEmail(db: any, email: string | null): Promise<string | null> {
  if (!email) return null;
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return rows[0]?.id ?? null;
}
