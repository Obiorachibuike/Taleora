import { withAuth, apiOk, HttpError } from "@/lib/api/handler";
import { z } from "zod";
import { parseBody } from "@/lib/api/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paystack verification — server-side check, never trust the redirect alone. */
export const POST = withAuth(async (req, ctx) => {
  const body = await parseBody(req, z.object({ reference: z.string().min(1) }));
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new HttpError(503, "not_configured", "Paystack is not configured");
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(body.reference)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new HttpError(502, "verify_failed", "Could not verify payment");
  const data = await res.json();
  const txn = data?.data;
  if (!txn) throw new HttpError(502, "verify_failed", "Could not read payment status");
  return apiOk({ reference: body.reference, status: txn.status, amount: txn.amount, currency: txn.currency, paidAt: txn.paid_at }, ctx.requestId);
});
