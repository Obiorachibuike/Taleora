"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { api } from "@/lib/api/client";
import { Button, Card, Badge, Input } from "@/components/ui";
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, Quote, Minus, Undo, Redo, Sparkles, Loader2, Save } from "lucide-react";

export default function WritingStudioClient() {
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get("project");

  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState(projectId ?? "");
  const [chapters, setChapters] = useState<any[]>([]);
  const [activeChapter, setActiveChapter] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const editorRef = useRef<any>(null);

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: "Start writing…" })],
    content: "",
    immediatelyRender: false,
    editorProps: { attributes: { class: "editor-content max-w-3xl mx-auto px-6 py-6 text-ink text-lg leading-relaxed focus:outline-none" } },
    onUpdate: () => setDirty(true),
  });

  useEffect(() => {
    api<{ projects: any[] }>("/api/v1/projects").then((r) => {
      const list = (r as any).data?.projects ?? [];
      setProjects(list);
      if (!selectedProject && list.length > 0 && projectId) setSelectedProject(projectId);
      if (!selectedProject && list.length > 0 && !projectId) setSelectedProject(list[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!selectedProject) return;
    api<{ chapters: any[] }>(`/api/v1/projects/${selectedProject}/chapters`).then((r) => {
      const list = (r as any).data?.chapters ?? [];
      setChapters(list);
      if (list.length > 0) loadChapter(list[0]);
    }).catch(() => {});
  }, [selectedProject]); // eslint-disable-line

  function loadChapter(ch: any) {
    setActiveChapter(ch);
    setDirty(false);
    if (editor && ch.content) {
      editor.commands.setContent(ch.content);
    }
  }

  async function save() {
    if (!editor || !activeChapter) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await api(`/api/v1/projects/${selectedProject}/chapters/${activeChapter.id}`, {
        method: "PATCH",
        body: JSON.stringify({ content: editor.getHTML(), version: activeChapter.version }),
      });
      setDirty(false);
      setSaveMsg("Saved");
      const fresh = await api<{ chapter: any }>(`/api/v1/projects/${selectedProject}/chapters/${activeChapter.id}`);
      setChapters((prev) => prev.map((c) => (c.id === activeChapter.id ? (fresh as any).data?.chapter ?? c : c)));
      setActiveChapter((fresh as any).data?.chapter ?? activeChapter);
    } catch (err: any) {
      setSaveMsg(err?.message ?? "Save failed");
    } finally { setSaving(false); }
  }

  async function runAiInline(command: string) {
    if (!editor || !aiPrompt.trim()) return;
    setAiBusy(true);
    setAiMsg(null);
    try {
      // For now, AI writing helpers enqueue a job; we approximate inline via the AI humanize/rewrite endpoints.
      const text = editor.getText();
      if (command === "continue" && activeChapter) {
        await api("/api/v1/generation/continue", { method: "POST", body: JSON.stringify({ chapterId: activeChapter.id }) });
        setAiMsg("Continue queued — watch the job status.");
      } else if (command === "rewrite") {
        // Use humanization pipeline inline for short text
        const res = await api<{ job: any }>("/api/v1/humanization", { method: "POST", body: JSON.stringify({ text: text.slice(0, 4000), mode: "natural", intensity: "light" }) });
        setAiMsg("Rewrite job queued — check Humanizer tab.");
      } else if (command === "polish") {
        await api("/api/v1/generation/chapter", { method: "POST", body: JSON.stringify({ projectId: selectedProject, chapterIndex: activeChapter?.index ?? 0 }) });
        setAiMsg("Chapter regenerate queued — refresh in a moment.");
      }
    } catch (err: any) {
      setAiMsg(err?.message ?? "AI action failed");
    } finally { setAiBusy(false); }
  }

  // autosave debounce
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => { save(); }, 1500);
    return () => clearTimeout(t);
  }, [dirty, activeChapter?.id]); // eslint-disable-line

  return (
    <div className="-m-6 lg:-m-10">
      <div className="grid h-[calc(100vh-5rem)] lg:grid-cols-[260px_1fr_300px]">
        {/* chapters panel */}
        <aside className="border-r border-line bg-surface p-4 overflow-y-auto hidden md:block">
          <label className="text-xs uppercase tracking-wide text-muted">Story</label>
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} className="mt-1 w-full rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink">
            <option value="">— Select —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <p className="mt-6 text-xs uppercase tracking-wide text-muted">Chapters</p>
          <ul className="mt-2 space-y-1">
            {chapters.map((c) => (
              <li key={c.id}>
                <button onClick={() => loadChapter(c)} className={`w-full text-left rounded-lg px-3 py-2 text-sm ${activeChapter?.id === c.id ? "bg-elevated text-ink border border-line" : "text-muted hover:bg-elevated"}`}>
                  <span className="font-mono text-xs">{c.index + 1}.</span> {c.title ?? `Chapter ${c.index + 1}`}
                </button>
              </li>
            ))}
            {chapters.length === 0 && <li className="text-xs text-muted py-2">No chapters yet.</li>}
          </ul>
        </aside>

        {/* editor */}
        <main className="border-r border-line flex flex-col min-w-0">
          <div className="flex items-center gap-1 border-b border-line px-4 py-2 flex-wrap">
            <ToolbarButton active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} icon={<Bold className="h-4 w-4" />} />
            <ToolbarButton active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} icon={<Italic className="h-4 w-4" />} />
            <ToolbarButton active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} icon={<Heading1 className="h-4 w-4" />} />
            <ToolbarButton active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} icon={<Heading2 className="h-4 w-4" />} />
            <ToolbarButton active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()} icon={<Quote className="h-4 w-4" />} />
            <ToolbarButton active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} icon={<List className="h-4 w-4" />} />
            <ToolbarButton active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} icon={<ListOrdered className="h-4 w-4" />} />
            <ToolbarButton onClick={() => editor?.chain().focus().setHorizontalRule().run()} icon={<Minus className="h-4 w-4" />} />
            <div className="ml-auto flex items-center gap-2">
              {saveMsg && <span className="text-xs text-muted">{saveMsg}</span>}
              <Button size="sm" variant="secondary" onClick={() => editor?.chain().focus().undo().run()}><Undo className="h-4 w-4" /></Button>
              <Button size="sm" variant="secondary" onClick={() => editor?.chain().focus().redo().run()}><Redo className="h-4 w-4" /></Button>
              <Button size="sm" variant="accent" onClick={save} disabled={saving || !activeChapter}><Save className="h-4 w-4" />{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <EditorContent editor={editor} />
          </div>
        </main>

        {/* AI panel */}
        <aside className="bg-surface p-4 overflow-y-auto hidden lg:block">
          <h3 className="text-xs uppercase tracking-wide text-muted">AI assistant</h3>
          <p className="mt-1 text-xs text-muted">Queue AI actions on this chapter.</p>
          <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={4} placeholder="What do you want the AI to do?" className="mt-3 w-full rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink" />
          <div className="mt-3 space-y-2">
            <button onClick={() => runAiInline("continue")} disabled={aiBusy} className="w-full rounded-lg border border-line py-2 text-sm text-ink hover:bg-elevated disabled:opacity-50 flex items-center justify-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Continue chapter</button>
            <button onClick={() => runAiInline("rewrite")} disabled={aiBusy} className="w-full rounded-lg border border-line py-2 text-sm text-ink hover:bg-elevated disabled:opacity-50 flex items-center justify-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Rewrite this chapter</button>
            <button onClick={() => runAiInline("polish")} disabled={aiBusy} className="w-full rounded-lg border border-line py-2 text-sm text-ink hover:bg-elevated disabled:opacity-50 flex items-center justify-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Regenerate chapter</button>
          </div>
          {aiBusy && <p className="mt-3 text-xs text-muted flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Processing…</p>}
          {aiMsg && <p className="mt-3 text-xs text-accent">{aiMsg}</p>}
          <div className="mt-6">
            <h3 className="text-xs uppercase tracking-wide text-muted">Stats</h3>
            <div className="mt-2 space-y-1 text-xs text-muted">
              <p>Chapters: {chapters.length}</p>
              <p>Words: {chapters.reduce((a: number, c: any) => a + (c.wordCount ?? 0), 0).toLocaleString()}</p>
              <p>Status: {activeChapter?.status ?? "—"}</p>
              <p>Version: {activeChapter?.version ?? "—"}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ToolbarButton({ active, onClick, icon }: { active?: boolean; onClick?: () => void; icon: React.ReactNode }) {
  return <button onClick={onClick} className={`flex h-8 w-8 items-center justify-center rounded-md ${active ? "bg-accent text-canvas" : "text-muted hover:bg-elevated hover:text-ink"}`}>{icon}</button>;
}
