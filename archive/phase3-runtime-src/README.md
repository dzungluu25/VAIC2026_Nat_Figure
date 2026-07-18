# ARCHIVED — superseded by `backend/src`

This is the retail-credit (KHCN) engine audited independently in the repo's
`AUDIT_REPORT.md` (case-fixture loader, `khcn-engine.service.ts`, separated
credit/legal/security/gate rule-engine modules, 18/18 backend tests, 224/224 rule
validation checks). It has since been **superseded** by a LangGraph `StateGraph`
rewrite that now lives at the current `backend/src` (see
`services/orchestration/orchestration-graph.ts`) and is not wired into the root
`docker-compose.yml`, imported by `backend/src`/`frontend/src`, or run by any CI.

It is kept here, unmodified, purely as **audit evidence** — `AUDIT_REPORT.md`'s file
references (e.g. `case-fixture.service.ts:102`, `khcn-engine.service.ts:421-424`) point
into `archive/phase3-runtime-src/backend/src/...` following this move.

`data/khcn` and `data/rules` were moved alongside it into `archive/phase3-runtime-src/data/`
— this is the only place in the repo that still consumes that fixture data (the current
`backend/src` retail-credit pipeline uses its own in-memory seed data instead, see
`backend/src/services/data/retail-case-data.ts`). This also fixes a pre-existing gap:
`case-fixture.service.ts`'s `DATA_ROOT` fallback and this folder's own `docker-compose.yml`
(`./data:/data`) both expected a `data/` directory at this exact location, which didn't
exist before this move.

Do not build new features on top of this code. If you need to reproduce the original
audit run, see `../../AUDIT_REPORT.md` in the repo root for the exact verification
commands.
