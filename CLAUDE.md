# Agent Observatory - Claude Code Guidance

## Project Overview
Agent Observatory is a multi-agent CLI harness and orchestration system supporting Claude Code, OpenAI Codex, Antigravity, OpenCode, Freebuff, and Command Code.

## Architecture & Current Milestone
We are building the **Adaptive Mission Orchestrator** following the 9-phase roadmap in `ROADMAP.md`:
- **[x] Faz 0:** Regression freeze (all 31 test suites passing 100%).
- **[x] Faz 1:** Domain models (`src/core/mission_types.ts`) and SQLite schema (`src/core/sqlite_store.ts`) completed and verified in `test/mission_domain.test.ts`.
- **[x] Faz 2:** `AgentAdapter` standardization and capability discovery (`probe()`) completed (32 test suites passing).
- **[ ] Faz 3 (ACTIVE SPRINT / Sıradaki):** Süreç gözetimi, heartbeat ve crash recovery (veya Faz 7 tek turluk yazar -> inceler -> düzeltir döngüsü).
- **[ ] Faz 6 (UPCOMING):** Mission Control Web UI (Task Graph, Agent Fleet, and Diff Viewer).
- **[ ] Faz 7 (UPCOMING):** Worktree izolasyonu ve Review Gate (ping-pong döngüsü).

## Commands
- Run all tests: `npm test`
- Typecheck: `npm run typecheck`
- Doctor check: `node --experimental-strip-types src/cli.ts doctor`

## Rules & Standards
- Use Node 24 native `--experimental-strip-types` (no build step for tests).
- All SQLite operations must be ACID-safe and maintain isolated in-memory testing (`:memory:`).
- Document all notable changes in `CHANGELOG.md` under `## [Unreleased]`.
