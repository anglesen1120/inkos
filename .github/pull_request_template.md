## Summary
<!-- 1-3 bullet points: what changed and why -->

-

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behavior change)
- [ ] Docs / SKILL.md
- [ ] Test
- [ ] Performance

## Motivation (optional)
<!-- Why this change is needed. Link issues if applicable. Closes #xxx -->

## Changes
<!-- File-level change list: what each file does -->

| File | Change |
|------|--------|
| | |

## Usage (optional)
<!-- Code snippets, CLI examples, or config samples showing how to use the new feature -->

<!-- Locale examples must use placeholders only; never include real credentials.
Content generation/project language and TUI UI locale are distinct:
inkos init <project-name> --lang vi
Ngôn ngữ tạo nội dung/dự án dùng mã `vi`; ngôn ngữ giao diện TUI dùng locale `vi-VN`.
PowerShell: $env:INKOS_TUI_LOCALE="vi-VN"; inkos tui
Command Prompt: set INKOS_TUI_LOCALE=vi-VN && inkos tui
-->

## Test plan

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (all existing + new tests)
- [ ] Manual verification: <!-- describe manual test steps -->
- [ ] If this PR changes user-facing locale entries, designated locale docs, or a reviewed Vietnamese runtime asset: added the applicable `vi` entry/doc example; added every newly reviewed asset's exact path to `REVIEWED_RUNTIME_ASSETS` in `scripts/check-vietnamese-localization.mjs`; verified the owning package publishes it; and ran `pnpm check:vi-localization` (no blanket translation required)

## Breaking changes (optional)
<!-- List any breaking changes to public API, CLI flags, config format, etc. -->
