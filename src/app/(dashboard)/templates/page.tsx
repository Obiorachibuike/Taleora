import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSessionWithUser } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout";
import { Card, EmptyState } from "@/components/ui";
import type { User } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("taleora_session")?.value;
  const session = token ? await getSessionWithUser(token) : null;
  if (!session?.user) redirect("/login");
  const user = session.user;

  const TEMPLATES = [
    { name: "The Hero's Journey", genre: "Fantasy", premise: "A reluctant hero is drawn into a quest that changes everything.", tone: "Epic, grounded" },
    { name: "Mystery Noir", genre: "Mystery", premise: "A detective is drawn into a web of lies where every answer closes a door.", tone: "Dark, tense" },
    { name: "Romance in Love", genre: "Romance", premise: "Two exiles, one city, one chapter too many.", tone: "Tender, aching" },
    { name: "Slow Burn Psychological", genre: "Literary", premise: "An ordinary day becomes unbearable, and stays unbearable.", tone: "Intimate, suspended" },
    { name: "Sci-Fi Awakening", genre: "Sci-Fi", premise: "A discovery that breaks the rules of perception.", tone: "Profound, vast" },
  ];
  const rows: any[] = TEMPLATES;

  return (
    <DashboardShell user={user} title="Story Templates" crumbs={["Templates"]}>
      <p className="text-muted text-sm mb-6">Start new stories faster from a template. Templates hold premise, genre, tone and structure.</p>
      {rows.length === 0 ? (
        <EmptyState title="No templates yet" description="Templates are baked in — pick one to start." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(rows as any[]).map((t) => (
            <Card key={t.id} className="p-5">
              <h3 className="font-semibold text-lg">{t.name}</h3>
              {t.genre && <p className="text-xs text-muted mt-1 uppercase tracking-wide">{t.genre}</p>}
              {t.premise && <p className="mt-2 text-sm text-muted line-clamp-3">{t.premise}</p>}
              <Link href="/stories/new" className="mt-4 inline-block text-sm text-accent hover:underline">Use this template →</Link>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
