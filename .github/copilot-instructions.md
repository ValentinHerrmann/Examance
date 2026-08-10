# Project Conventions (BlindGrade)

## Architecture & Defaults
- Local mode is the default setting for exercise and exam management; do not default to backend server endpoints.
- Mind WebAssembly / Argon2 asset resolving (`busytex.wasm`, `argon2.wasm`) when adjusting frontend bundling rules.

## Planning & Progress
- Persist any multi-step plan, design, or task-progress tracker to a tracked `.md` file in the repo (`PLAN.md` at root, or `docs/plans/<name>.md` for more than one). Keep it updated as work progresses so state survives a session reset.

## Validation
- Before completing any feature or fix, verify that the project builds clean without lint or bundle resolution errors.
- Do not execute npm commands which will not terminate until the process is killed (except I explicitly tell you to).