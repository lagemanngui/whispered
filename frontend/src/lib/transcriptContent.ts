export type SaveFormat = "html" | "txt" | "md";

export function plainTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "<p></p>";

  return trimmed
    .split(/\n{2,}/)
    .map((block) => {
      const inner = block
        .split("\n")
        .map((line) => escapeHtml(line))
        .join("<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function extensionForFormat(format: SaveFormat): string {
  switch (format) {
    case "html":
      return ".html";
    case "md":
      return ".md";
    case "txt":
      return ".txt";
  }
}

export function fileTypesForFormat(format: SaveFormat): string[] {
  switch (format) {
    case "html":
      return ["HTML (*.html)", "All files (*.*)"];
    case "md":
      return ["Markdown (*.md)", "All files (*.*)"];
    case "txt":
      return ["Text (*.txt)", "All files (*.*)"];
  }
}

export function defaultFileName(baseName: string, format: SaveFormat): string {
  const stem = baseName.replace(/\.[^.]+$/, "") || "transcript";
  return `${stem}${extensionForFormat(format)}`;
}

export function defaultTranscriptBaseName(
  audioPath: string | null,
  title: string,
  fileNameFromPath: (path: string) => string,
): string {
  if (audioPath) {
    return fileNameFromPath(audioPath).replace(/\.[^.]+$/, "");
  }
  const trimmed = title.trim();
  if (trimmed) {
    return trimmed.replace(/[^\w.-]+/g, "_");
  }
  return "transcript";
}
