export interface ModelInfo {
  id: string;
  label: string;
  english_only: boolean;
  supports_translate: boolean;
}

export interface TranscribeResult {
  text: string;
  language?: string;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
}

export interface HistoryEntry {
  id: string;
  title: string;
  text: string;
  audio_path: string | null;
  model: string | null;
  language: string | null;
  task: string | null;
  detected_language: string | null;
  segments?: TranscribeResult["segments"];
  created_at: string;
  updated_at: string;
}

export type JobPhase =
  | "starting"
  | "downloading"
  | "loading"
  | "transcribing"
  | null;

export interface JobStatus {
  status: "idle" | "running" | "done" | "error";
  phase: JobPhase;
  progress: string | null;
  percent: number | null;
  partial_text: string | null;
  result: TranscribeResult | null;
  history_entry: HistoryEntry | null;
  error: string | null;
}

export interface PyWebViewApi {
  get_models(): Promise<ModelInfo[]>;
  get_languages(): Promise<string[]>;
  get_ffmpeg_status(): Promise<{ bundled: boolean; path: string | null }>;
  pick_audio_file(): Promise<string | null>;
  transcribe(
    path: string,
    model: string,
    language: string,
    task: string,
  ): Promise<{ started: boolean; error?: string }>;
  get_job_status(): Promise<JobStatus>;
  list_history(): Promise<HistoryEntry[]>;
  get_history(id: string): Promise<HistoryEntry | null>;
  create_history(
    title: string,
    text: string,
    audio_path?: string | null,
    model?: string | null,
    language?: string | null,
    task?: string | null,
    detected_language?: string | null,
  ): Promise<HistoryEntry>;
  update_history(
    id: string,
    title?: string | null,
    text?: string | null,
    audio_path?: string | null,
    model?: string | null,
    language?: string | null,
    task?: string | null,
    detected_language?: string | null,
  ): Promise<{ ok: boolean; entry?: HistoryEntry; error?: string }>;
  delete_history(id: string): Promise<{ ok: boolean; error?: string }>;
  save_transcript(text: string, default_name?: string): Promise<{
    saved: boolean;
    path?: string;
    error?: string;
  }>;
  copy_to_clipboard(text: string): Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    pywebview?: {
      api: PyWebViewApi;
    };
  }
}

export {};
