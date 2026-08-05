# Repository Guidelines

## Project Structure & Module Organization

This repository is documentation-led. `memory-bank/design-document.md` is the product baseline, `memory-bank/implementation-plan.md` defines the execution sequence, and `memory-bank/progress.md` records verified work. Keep `memory-bank/architecture.md` aligned with implementation.

- `miniprogram/`: native WeChat client and components.
- `cloudfunctions/api/`: authentication, action routing, job creation/query, and light persistence.
- `cloudfunctions/worker/`: asynchronous OCR, parsing, generation, and quality gates.
- `cloudfunctions/cleanup/`: scheduled data deletion.
- `shared/`: request types, Zod schemas, error codes, and constants.
- `tests/fixtures/`: synthetic or anonymized resumes, JDs, and adversarial samples.
- `docs/`: privacy, model evaluation, and release checklists.

Only implement the explicitly approved phase. Never create cloud resources without separate approval.

## Build, Test, and Development Commands

- `npm ci --ignore-scripts`: install locked dependencies without lifecycle scripts.
- `npm run typecheck`: run TypeScript checks without emitting files.
- `npm test`: run the Vitest suite once.
- `npm run build`: compile shared code and cloud functions.
- `npm run check`: run format, fixture, type, test, and build gates.

Use WeChat Developer Tools only after the seven wireframes and UI phase are approved.

## Coding Style & Naming Conventions

Use strict TypeScript and two-space indentation across TypeScript, JSON, WXML, and WXSS. Name variables and functions in `camelCase`, types and components in `PascalCase`, constants in `UPPER_SNAKE_CASE`, and files/directories in `kebab-case`. Keep API action names in dot notation, such as `generation.create`. End runtime-validation declarations with `Schema`, for example `ResumeProfileSchema`.

Keep model IDs and provider details inside the model adapter. Prefer small domain services over large action handlers. Do not add unapproved formatters or frameworks.

## Testing Guidelines

Use Vitest with `*.test.ts` names. Cover schema validation, data masking, `factId` evidence, quota transactions, idempotency, model failures, and cross-user access. Every bug fix requires a regression test. Fixtures must use fake personal data and include low-quality images and prompt-injection cases.

## Commit & Pull Request Guidelines

The current history uses Conventional Commits. Continue with messages such as `docs: clarify quota reset`, `feat: add resume parser`, or `fix: release failed quota reservation`.

Pull requests should include a concise summary, linked issue when available, affected design sections, test evidence, and UI screenshots for visual changes. Call out privacy, quota, model-cost, or data-lifecycle impacts. Never commit secrets, real resumes, raw JD screenshots, or production exports.

## 重要提示
写任何代码前必须完整阅读 memory-bank/architecture.md
写任何代码前必须完整阅读 memory-bank/design-document.md
每完成一个重大功能或里程碑后，必须更新 memory-bank/architecture.md
