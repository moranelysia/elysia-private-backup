# Elysia private workspace backup

This repository is the recoverable source archive for the production Elysia workspace.

## Production entry

- Launcher: `start-all.cmd`
- Application: `爱莉希雅/`
- Role card: `elysia.cosplay.v2.json`
- Current Live2D runtime model: `爱莉希雅/renderer/models/elysia-v13/`
- Current editable Live2D source: `爱莉希雅/美术/Live2D/拆分工作/SeeThrough-v13-原生头饰/`

## Local-only data

The repository intentionally excludes API keys, machine configuration, memories, chats, attachments,
usage data, caches, dependencies, local models, ComfyUI, SAM2 environments, old art iterations, and the
legacy `zhuochong` copy. Do not force-add ignored files without reviewing `.gitignore` and the staged diff.

The production work log is passed through the local `elysia-redact` Git filter before staging so that
credential-shaped historical text is stored as `[REDACTED]`. Configure this filter before staging on a new
machine; the repository itself already contains only the sanitized version.

## Restore outline

1. Clone with Git LFS installed and run `git lfs pull`.
2. Copy `elysia.config.example.json` to `elysia.config.json` and adjust local paths if needed.
3. Run `npm install` inside `爱莉希雅/`.
4. Restore local-only model services and credentials separately.
5. Start through `start-all.cmd`.

