import type { HistoryEntry, JobStatus, ModelInfo, PyWebViewApi } from "./pywebview";

function api(): PyWebViewApi {
  if (!window.pywebview?.api) {
    throw new Error("PyWebView API is not available.");
  }
  return window.pywebview.api;
}

export function waitForApi(timeoutMs = 30000): Promise<PyWebViewApi> {
  if (window.pywebview?.api) {
    return Promise.resolve(window.pywebview.api);
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("pywebviewready", onReady);
      reject(new Error("Timed out waiting for PyWebView API."));
    }, timeoutMs);

    const onReady = () => {
      window.clearTimeout(timer);
      if (window.pywebview?.api) {
        resolve(window.pywebview.api);
      } else {
        reject(new Error("PyWebView API is not available."));
      }
    };

    window.addEventListener("pywebviewready", onReady, { once: true });
  });
}

export async function getModels(): Promise<ModelInfo[]> {
  return api().get_models();
}

export async function getLanguages(): Promise<string[]> {
  return api().get_languages();
}

export async function pickAudioFile(): Promise<string | null> {
  return api().pick_audio_file();
}

export async function startTranscribe(
  path: string,
  model: string,
  language: string,
  task: string,
): Promise<{ started: boolean; error?: string }> {
  return api().transcribe(path, model, language, task);
}

export async function getJobStatus(): Promise<JobStatus> {
  return api().get_job_status();
}

export async function listHistory(): Promise<HistoryEntry[]> {
  return api().list_history();
}

export async function getHistory(id: string): Promise<HistoryEntry | null> {
  return api().get_history(id);
}

export async function createHistory(
  title: string,
  text: string,
  meta?: {
    audio_path?: string | null;
    model?: string | null;
    language?: string | null;
    task?: string | null;
    detected_language?: string | null;
  },
): Promise<HistoryEntry> {
  return api().create_history(
    title,
    text,
    meta?.audio_path ?? null,
    meta?.model ?? null,
    meta?.language ?? null,
    meta?.task ?? null,
    meta?.detected_language ?? null,
  );
}

export async function updateHistory(
  id: string,
  fields: {
    title?: string;
    text?: string;
    audio_path?: string | null;
    model?: string | null;
    language?: string | null;
    task?: string | null;
    detected_language?: string | null;
  },
): Promise<HistoryEntry> {
  const result = await api().update_history(
    id,
    fields.title ?? null,
    fields.text ?? null,
    fields.audio_path ?? null,
    fields.model ?? null,
    fields.language ?? null,
    fields.task ?? null,
    fields.detected_language ?? null,
  );
  if (!result.ok || !result.entry) {
    throw new Error(result.error ?? "Failed to update transcript.");
  }
  return result.entry;
}

export async function deleteHistory(id: string): Promise<void> {
  const result = await api().delete_history(id);
  if (!result.ok) {
    throw new Error(result.error ?? "Failed to delete transcript.");
  }
}

export async function saveTranscript(
  text: string,
  defaultName?: string,
): Promise<{ saved: boolean; path?: string; error?: string }> {
  return api().save_transcript(text, defaultName);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  const result = await api().copy_to_clipboard(text);
  return result.ok;
}

export async function pollUntilDone(
  onProgress?: (status: JobStatus) => void,
  intervalMs = 300,
): Promise<JobStatus> {
  for (;;) {
    const status = await getJobStatus();
    onProgress?.(status);
    if (status.status === "done" || status.status === "error" || status.status === "idle") {
      return status;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
