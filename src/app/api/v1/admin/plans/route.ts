import { withAuth, apiOk, parseBody, requireAdmin } from "@/lib/api/handler";
import { planUpdateSchema } from "@/lib/validation/schemas";
import { getDb } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { asc, sql } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const db = await getDb();
  const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder));
  return apiOk({ plans: rows }, ctx.requestId);
});

export const POST = withAuth(async (req, ctx) => {
  requireAdmin(ctx.user!);
  const body = await parseBody(req, z.object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(1000).optional(),
    monthlyPriceCents: z.number().int().min(0).default(0),
    annualPriceCents: z.number().int().min(0).default(0),
    generationCredits: z.number().int().min(0).default(20),
    humanizationLimit: z.number().int().min(0).default(5),
    maxProjects: z.number().int().min(1).default(2),
    maxChapters: z.number().int().min(1).default(10),
    maxManuscriptWords: z.number().int().min(100).default(5000),
    exportEnabled: z.boolean().default(false),
    features: z.array(z.string().max(60)).max(30).default([]),
    modelAccess: z.array(z.string().max(200)).max(30).default([]),
    durationDays: z.number().int().min(1).default(30),
    sortOrder: z.number().int().default(0),
  }));
  const db = await getDb();
  const [row] = await db.insert(plans).values({ id: crypto.randomUUID(), ...body, isActive: true }).returning();
  return apiOk({ plan: row }, ctx.requestId);
});
