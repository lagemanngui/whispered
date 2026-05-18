import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AudioLines,
  Copy,
  Download,
  Loader2,
  Mic,
  Save,
  Trash2,
} from "lucide-react";
import type { HistoryEntry, JobPhase, ModelInfo } from "./pywebview";
import { HistoryPanel } from "@/components/HistoryPanel";
import {
  copyToClipboard,
  createHistory,
  deleteHistory,
  getLanguages,
  getModels,
  listHistory,
  pickAudioFile,
  pollUntilDone,
  saveTranscript,
  startTranscribe,
  updateHistory,
  waitForApi,
} from "./bridge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function fileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

function phaseLabel(phase: JobPhase, busy: boolean): string {
  if (!busy) return "idle";
  if (!phase || phase === "starting") return "starting";
  return phase;
}

function normalizeTitle(value: string): string {
  return value.trim() || "Untitled transcript";
}

function applyEntryToEditor(
  entry: HistoryEntry,
  setters: {
    setActiveHistoryId: (id: string) => void;
    setTitle: (t: string) => void;
    setTranscript: (t: string) => void;
    setAudioPath: (p: string | null) => void;
    setModel: (m: string) => void;
    setLanguage: (l: string) => void;
    setTask: (t: "transcribe" | "translate") => void;
    setStatusLine: (s: string | null) => void;
  },
  savedTitle?: { current: string },
) {
  setters.setActiveHistoryId(entry.id);
  setters.setTitle(entry.title);
  if (savedTitle) savedTitle.current = entry.title;
  setters.setTranscript(entry.text);
  setters.setAudioPath(entry.audio_path);
  if (entry.model) setters.setModel(entry.model);
  if (entry.language) setters.setLanguage(entry.language);
  if (entry.task === "translate" || entry.task === "transcribe") {
    setters.setTask(entry.task);
  }
  setters.setStatusLine(
    entry.detected_language
      ? `Detected: ${entry.detected_language}`
      : null,
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [model, setModel] = useState("turbo");
  const [language, setLanguage] = useState("auto");
  const [task, setTask] = useState<"transcribe" | "translate">("transcribe");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [phase, setPhase] = useState<JobPhase>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryEntry | null>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const savedTitleRef = useRef("");

  const selectedModel = useMemo(
    () => models.find((m) => m.id === model),
    [models, model],
  );

  const translateDisabled =
    selectedModel !== undefined && !selectedModel.supports_translate;

  const isLive = busy && !!transcript && phase === "transcribing";
  const words = wordCount(transcript);
  const isDraft = activeHistoryId === null;
  const canEdit = !busy;
  const hasUnsavedDraft = isDraft && transcript.trim().length > 0;

  const refreshHistory = useCallback(async () => {
    const entries = await listHistory();
    setHistory(entries);
    return entries;
  }, []);

  const editorSetters = useMemo(
    () => ({
      setActiveHistoryId,
      setTitle,
      setTranscript,
      setAudioPath,
      setModel,
      setLanguage,
      setTask,
      setStatusLine,
    }),
    [],
  );

  useEffect(() => {
    if (translateDisabled && task === "translate") {
      setTask("transcribe");
    }
  }, [translateDisabled, task]);

  useEffect(() => {
    if (!busy || !transcriptRef.current) return;
    const el = transcriptRef.current;
    el.scrollTop = el.scrollHeight;
  }, [transcript, busy]);

  useEffect(() => {
    if (!busy) {
      setElapsedMs(0);
      return;
    }
    const started = Date.now();
    setElapsedMs(0);
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - started);
    }, 200);
    return () => window.clearInterval(id);
  }, [busy]);

  useEffect(() => {
    waitForApi()
      .then(async () => {
        const [m, langs] = await Promise.all([
          getModels(),
          getLanguages(),
          refreshHistory(),
        ]);
        setModels(m);
        setLanguages(langs);
        setReady(true);
      })
      .catch((err: Error) => setError(err.message));
  }, [refreshHistory]);

  const handlePickFile = useCallback(async () => {
    setError(null);
    try {
      const path = await pickAudioFile();
      if (path) {
        setAudioPath(path);
        setActiveHistoryId(null);
        setTitle("");
        savedTitleRef.current = "";
        setTranscript("");
        setStatusLine(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleNewDraft = useCallback(() => {
    setActiveHistoryId(null);
    setTitle("");
    savedTitleRef.current = "";
    setTranscript("");
    setStatusLine(null);
    setError(null);
  }, []);

  const commitTitle = useCallback(async () => {
    if (!activeHistoryId || !canEdit) return;
    const nextTitle = normalizeTitle(title);
    if (nextTitle === savedTitleRef.current) return;
    setError(null);
    try {
      const entry = await updateHistory(activeHistoryId, { title: nextTitle });
      setTitle(entry.title);
      savedTitleRef.current = entry.title;
      await refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeHistoryId, canEdit, title, refreshHistory]);

  const handleSelectHistory = useCallback(
    async (entry: HistoryEntry) => {
      if (activeHistoryId && activeHistoryId !== entry.id) {
        await commitTitle();
      }
      applyEntryToEditor(entry, editorSetters, savedTitleRef);
      setError(null);
    },
    [activeHistoryId, commitTitle, editorSetters],
  );

  const handleSaveToHistory = useCallback(async () => {
    if (!transcript.trim()) {
      setError("Nothing to save.");
      return;
    }
    setError(null);
    try {
      if (activeHistoryId) {
        const entry = await updateHistory(activeHistoryId, {
          title: normalizeTitle(title),
          text: transcript,
          audio_path: audioPath,
          model,
          language,
          task,
        });
        await refreshHistory();
        applyEntryToEditor(entry, editorSetters, savedTitleRef);
      } else {
        const entry = await createHistory(
          normalizeTitle(title),
          transcript,
          {
            audio_path: audioPath,
            model,
            language,
            task,
          },
        );
        await refreshHistory();
        applyEntryToEditor(entry, editorSetters, savedTitleRef);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [
    activeHistoryId,
    title,
    transcript,
    audioPath,
    model,
    language,
    task,
    refreshHistory,
    editorSetters,
  ]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      await deleteHistory(deleteTarget.id);
      if (activeHistoryId === deleteTarget.id) {
        handleNewDraft();
      }
      await refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, activeHistoryId, handleNewDraft, refreshHistory]);

  const handleTranscribe = useCallback(async () => {
    if (!audioPath) {
      setError("Choose an audio file first.");
      return;
    }

    setBusy(true);
    setError(null);
    setProgress("Starting…");
    setProgressPercent(null);
    setPhase("starting");
    setStatusLine(null);
    setTranscript("");
    setActiveHistoryId(null);
    const userTitle = title.trim();
    setTitle("");
    savedTitleRef.current = "";

    try {
      const start = await startTranscribe(audioPath, model, language, task);
      if (!start.started) {
        setError(start.error ?? "Could not start transcription.");
        return;
      }

      const job = await pollUntilDone((status) => {
        setProgress(status.progress);
        setPhase(status.phase);
        setProgressPercent(
          status.phase === "downloading" ? status.percent : null,
        );
        if (
          status.phase === "transcribing" &&
          status.partial_text !== null &&
          status.partial_text !== undefined
        ) {
          setTranscript(status.partial_text);
        }
      });
      if (job.status === "error") {
        setError(job.error ?? "Transcription failed.");
        return;
      }
      if (job.history_entry) {
        await refreshHistory();
        applyEntryToEditor(job.history_entry, editorSetters, savedTitleRef);
        if (userTitle) {
          const entry = await updateHistory(job.history_entry.id, {
            title: userTitle,
          });
          setTitle(entry.title);
          savedTitleRef.current = entry.title;
          await refreshHistory();
        }
      } else if (job.result) {
        setTranscript(job.result.text);
        const lang = job.result.language;
        setStatusLine(lang ? `Detected: ${lang}` : "Complete");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
      setProgressPercent(null);
      setPhase(null);
    }
  }, [audioPath, model, language, task, title, refreshHistory, editorSetters]);

  const handleCopy = useCallback(async () => {
    if (!transcript) return;
    const ok = await copyToClipboard(transcript);
    if (!ok) setError("Could not copy to clipboard.");
  }, [transcript]);

  const handleExportFile = useCallback(async () => {
    if (!transcript) return;
    const defaultName = audioPath
      ? `${fileName(audioPath).replace(/\.[^.]+$/, "")}.txt`
      : title.trim()
        ? `${title.trim().replace(/[^\w.-]+/g, "_")}.txt`
        : "transcript.txt";
    const result = await saveTranscript(transcript, defaultName);
    if (!result.saved && result.error) {
      setError(result.error);
    }
  }, [transcript, audioPath, title]);

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm font-medium">Loading Whispered</p>
          <p className="text-xs text-muted-foreground">Connecting to engine…</p>
          {error && (
            <Alert variant="destructive" className="max-w-sm">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Mic className="size-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-none">Whispered</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Local Whisper transcription
              </p>
            </div>
          </div>
        </div>

        <ScrollArea className="max-h-[calc(100vh-420px)] flex-1 px-5 py-5">
          <div className="space-y-5">
            <Card
              className="cursor-pointer py-4 transition-colors hover:bg-accent/50"
              onClick={() => !busy && handlePickFile()}
            >
              <CardHeader className="px-4 pb-0">
                <CardDescription className="text-xs uppercase tracking-wide">
                  Audio source
                </CardDescription>
                <CardTitle className="flex items-start gap-2 text-sm font-medium">
                  <AudioLines className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {audioPath ? fileName(audioPath) : "Choose a file"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-2">
                <p className="text-xs text-muted-foreground">
                  mp3, wav, m4a, flac, ogg
                </p>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Select
                  value={model}
                  onValueChange={setModel}
                  disabled={busy}
                >
                  <SelectTrigger id="model" className="w-full">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select
                  value={language}
                  onValueChange={setLanguage}
                  disabled={busy}
                >
                  <SelectTrigger id="language" className="w-full">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {lang === "auto" ? "Auto-detect" : lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task">Task</Label>
                <Select
                  value={task}
                  onValueChange={(v) =>
                    setTask(v as "transcribe" | "translate")
                  }
                  disabled={busy || translateDisabled}
                >
                  <SelectTrigger id="task" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transcribe">Transcribe</SelectItem>
                    <SelectItem value="translate">Translate to English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {translateDisabled && (
              <Alert>
                <AlertDescription className="text-xs">
                  Translation requires medium or large. Turbo and .en models
                  only transcribe.
                </AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleTranscribe}
              disabled={busy || !audioPath}
            >
              {busy ? (
                <>
                  <Loader2 className="animate-spin" />
                  Working…
                </>
              ) : (
                "Transcribe"
              )}
            </Button>
          </div>
        </ScrollArea>

        <HistoryPanel
          entries={history}
          activeId={activeHistoryId}
          disabled={busy}
          onSelect={handleSelectHistory}
          onNew={handleNewDraft}
          onDelete={setDeleteTarget}
        />

        <div className="space-y-3 border-t border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Status</span>
            <div className="flex items-center gap-2">
              {busy && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatElapsed(elapsedMs)}
                </span>
              )}
              <Badge variant={busy ? "default" : "secondary"}>
                {phaseLabel(phase, busy)}
              </Badge>
            </div>
          </div>
          {(progress || progressPercent !== null) && (
            <div className="space-y-2">
              {progressPercent !== null && (
                <Progress value={progressPercent} className="h-1.5" />
              )}
              {progress && (
                <p className="text-xs text-muted-foreground">{progress}</p>
              )}
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
          {statusLine && !error && (
            <p className="text-xs text-muted-foreground">{statusLine}</p>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-4 border-b border-border px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="title" className="text-xs text-muted-foreground">
                Title
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => void commitTitle()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Untitled transcript"
                disabled={!canEdit}
                className="max-w-xl"
              />
              <p className="text-sm text-muted-foreground">
                {busy
                  ? `Transcribing — ${formatElapsed(elapsedMs)} elapsed`
                  : isLive
                  ? "Streaming segments as they decode"
                  : isDraft
                    ? hasUnsavedDraft
                      ? "Draft — save to history when ready"
                      : "Transcribe audio or create a new note"
                    : "Saved in history"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {busy && (
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1.5 font-mono tabular-nums",
                    isLive && "border-primary/40 text-primary",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full bg-primary",
                      isLive && "animate-pulse",
                    )}
                  />
                  {isLive ? "Live · " : ""}
                  {formatElapsed(elapsedMs)}
                </Badge>
              )}
              {isDraft && hasUnsavedDraft && (
                <Badge variant="secondary">Draft</Badge>
              )}
              <Badge variant="secondary" className="font-mono tabular-nums">
                {words} words
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSaveToHistory}
              disabled={!transcript.trim() || !canEdit}
            >
              <Save />
              {activeHistoryId ? "Update" : "Save to history"}
            </Button>
            {activeHistoryId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const entry = history.find((h) => h.id === activeHistoryId);
                  if (entry) setDeleteTarget(entry);
                }}
                disabled={!canEdit}
              >
                <Trash2 />
                Delete
              </Button>
            )}
            <Separator orientation="vertical" className="mx-1 h-6" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!transcript || busy}
            >
              <Copy />
              Copy
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleExportFile}
              disabled={!transcript || busy}
            >
              <Download />
              Export file
            </Button>
          </div>
        </header>

        <div className="relative flex flex-1 flex-col p-6">
          <Textarea
            ref={transcriptRef}
            readOnly={!canEdit}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Transcript will appear here as audio is processed…"
            spellCheck={canEdit}
            className={cn(
              "min-h-0 flex-1 resize-none border-0 bg-transparent p-4 text-base leading-relaxed shadow-none focus-visible:ring-0",
              isLive && "ring-1 ring-primary/30",
            )}
          />
          {!transcript && !busy && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Select audio and run transcription
            </p>
          )}
        </div>
      </main>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete transcript?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.title}” will be removed from history. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
