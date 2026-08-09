# HANDOFF — swarm-intel

> Updated at end of every real session, by the Fable who worked. Newest entry first.

## 2026-08-09 — SCANNING — overnight persistence branch merged to main, pushed

**Done:** Merged `overnight/2026-08-07-persistence` into main (merge commit `1ab5f82`, Kyle approved 8/9), pushed to origin, deleted the branch. Contents: server persists every synthesis run to `runs/` (inputs.json on receipt, synthesis.md on completion) + `GET /api/research/runs` read API + absence discipline (`30e7b5f`); localStorage save throttling + batched stream flushes — the white-screen root cause (`bf9c267`); ErrorBoundary so crashes fail loud with recovery pointers (`92a606d`). Verified post-merge: `tsc --noEmit` clean, server boots on 3369, SPA renders, `/api/research/runs` → 200 `{"runs":[]}`, zero console errors.
**In flight:** Nothing half-done in the code. Untracked `.claude/launch.json` (preview config, port 3369) left uncommitted — commit deliberately or ignore.
**Next:** Kyle's naming-subculture session rescue — his 8-agent run likely still in HIS browser's localStorage (`research_swarm_current_session`). The F12 rescue one-liner was delivered in chat 8/7; with persistence now merged, a re-synthesis POST to `/api/research/synthesize-stream` will land in `runs/` permanently. Browser storage is evaporation-prone: do this soon.
**Watch out:** `runs/` is gitignored by design (research content stays out of the repo). Noted follow-ups from 8/7, not started: agent-stream chunk batching; agent-level absence-claim guard (synthesis-level guard is in).
