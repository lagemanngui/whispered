# Whispered — Frontend

React UI for [Whispered](../README.md). Built with Vite, TypeScript, Tailwind CSS 4, and Radix-based components. Ships as static files consumed by PyWebView (`frontend/dist/`).

## Scripts

```bash
npm install
npm run build    # production bundle → dist/
npm run dev      # watch mode (rebuild on change; restart Python app to pick up)
```

## Layout

| Path | Role |
|------|------|
| `src/App.tsx` | Main editor, transcription flow, settings |
| `src/bridge.ts` | `pywebview.api` wrappers and job polling |
| `src/components/HistoryPanel.tsx` | Transcript sidebar |
| `src/components/ui/` | shadcn-style primitives |
| `src/pywebview.d.ts` | API types shared with bridge |

## Python bridge

In the desktop shell, call Python via `window.pywebview.api` (typed in `pywebview.d.ts`). In a browser-only context those methods are unavailable — development is intended through `python run.py` at the repo root.

See [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the full request flow.
