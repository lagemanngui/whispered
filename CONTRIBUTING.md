# Contributing to Whispered

Thank you for considering a contribution. Whispered is a small, focused desktop app — clear issues and focused pull requests are the easiest to review.

## Before you start

1. Search [existing issues](https://github.com/lagemanngui/whispered/issues) to avoid duplicate work.
2. For larger changes (new platforms, packaging changes, UI redesigns), open an issue first so we can align on scope.

## Development setup

See the [README](README.md#development) for environment requirements and the `./scripts/dev.sh` quick start.

Minimum checklist before opening a PR:

- [ ] Frontend builds: `cd frontend && npm ci && npm run build`
- [ ] App runs locally: `PYTHONPATH=. python run.py` (with venv activated)
- [ ] Changes are limited to what the PR describes

## Pull request guidelines

- **One concern per PR** when possible (bug fix, feature, or docs — not all three).
- Write a short description: what changed, why, and how you tested it.
- Keep commits readable; squash locally if you prefer a single commit.
- Do not commit secrets, `.env` files, or `vendor/ffmpeg` binaries.

## Code style

- **Python**: match existing modules under `app/` — type hints, small functions, no unnecessary abstractions.
- **TypeScript/React**: follow patterns in `frontend/src/` (functional components, hooks, shadcn/ui primitives).
- Avoid drive-by refactors unrelated to your change.

## Reporting bugs

Include:

- OS and version (macOS / Windows, architecture if relevant)
- Whispered version or commit SHA
- Whisper model used
- Steps to reproduce and expected vs actual behavior
- Relevant logs from the terminal when running from source

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
