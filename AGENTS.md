# Agent Observatory - Agent Guidance

## Project Overview
Agent Observatory is a multi-agent CLI harness and orchestration system supporting Claude Code, OpenAI Codex, Antigravity, OpenCode, Freebuff, and Command Code.

## Commands
- Run all tests: `npm test`
- Typecheck: `npm run typecheck`
- Doctor check: `node --experimental-strip-types src/cli.ts doctor`

## Rules & Standards
- Use Node 24 native `--experimental-strip-types` (no build step for tests).
- All SQLite operations must be ACID-safe and maintain isolated in-memory testing (`:memory:`).
- Document all notable changes in `CHANGELOG.md` under `## [Unreleased]`.
- `AgentObservatory_Tum_Dosyalar_Mimari_Rehberi.pdf` belgesi, projedeki her dosya veya mimari değişikliğinde (yeni dosya ekleme, çıkarma veya işlev güncellemesinde) sürekli olarak güncel tutulmalıdır.
