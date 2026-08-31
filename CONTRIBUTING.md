# Contributing

## Setup

```bash
git clone https://github.com/Narcooo/inkos.git
cd inkos
pnpm install
pnpm build
pnpm test
```

Node ≥ 22, pnpm ≥ 9.

## Project Structure

```
packages/
  core/    # Agents, pipeline, state management, LLM providers
  cli/     # Commander.js CLI and TUI
  studio/  # Studio web UI and API
```

Monorepo managed with pnpm workspaces. Internal packages are linked through the workspace configuration during development.

## Development

```bash
pnpm dev          # Watch mode (all packages)
pnpm build        # Build once
pnpm test         # Run all tests
pnpm typecheck    # Type-check without emitting
```

### Vietnamese localization gate

Run the localization check when changing user-facing locale entries, Vietnamese runtime assets, or the locale guidance in the designated documentation:

```bash
pnpm check:vi-localization
```

The gate is deliberately scoped: it checks an explicit reviewed list of Studio locale keys, required documentation examples, and only the runtime asset paths listed in `REVIEWED_RUNTIME_ASSETS` in `scripts/check-vietnamese-localization.mjs` against the owning package's published `files`. It does not demand blanket translation of arbitrary prose, parser markers, technical IDs, or test fixtures.

When adding or changing a user-facing Studio locale entry, provide its `vi` value and add the key to the checker's reviewed-key list. When a new Vietnamese runtime asset becomes part of the reviewed localization contract, add its exact repository-relative path to `REVIEWED_RUNTIME_ASSETS` and ensure the owning package publishes it. Expand an allowlist only for a specific, reviewed non-user-facing case; do not weaken the checker with broad directory or content exclusions.

Content generation/project language and UI locale are separate settings:

```text
inkos init <project-name> --lang vi
```

Ngôn ngữ tạo nội dung/dự án dùng mã `vi`; ngôn ngữ giao diện TUI dùng locale `vi-VN`.

```powershell
PowerShell: $env:INKOS_TUI_LOCALE="vi-VN"; inkos tui
```

```bat
Command Prompt: set INKOS_TUI_LOCALE=vi-VN && inkos tui
```

Use placeholders such as `<project-name>` and `<your-api-key>` in documentation and pull requests. Never paste real credentials.

## Commit Convention

```
<type>: <description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Keep commits atomic — one logical change per commit. Split new files, interface changes, tests, and docs into separate commits when they're non-trivial.

## Pull Request Checklist

- [ ] `pnpm build` passes
- [ ] `pnpm test` passes (all existing + new tests)
- [ ] `pnpm typecheck` passes
- [ ] New features have tests
- [ ] `pnpm check:vi-localization` passes when user-facing locale entries, Vietnamese runtime assets, or designated locale docs changed
- [ ] No unrelated formatting changes (keep diffs focused)
- [ ] Commit messages follow the convention above

## Code Style

- TypeScript, strict mode
- 2-space indentation
- Immutable patterns: `{ ...obj, key: value }` over mutation
- Functions < 50 lines, files < 800 lines
- Errors must surface, not be swallowed (`catch { }` without re-throw needs a comment)
- Publishable package manifests must use registry-installable internal versions, not `workspace:*`; `pnpm` links local packages through the workspace config during development.

## Adding a CLI Command

1. Create `packages/cli/src/commands/<name>.ts`
2. Export a `Command` instance
3. Register it in `packages/cli/src/index.ts`
4. Add `--json` output support
5. Support book-id auto-detection when only one book exists

## Adding a Genre

1. Create `packages/core/genres/<id>.md` with YAML frontmatter
2. Define: `chapterTypes`, `fatigueWords`, `numericalSystem`, `powerScaling`, `pacingRule`, `satisfactionTypes`, `auditDimensions`, `language`
3. Add genre body (prohibitions, language rules, narrative guidance)

## Testing

Tests live next to source in `__tests__/` directories. We use Vitest.

```bash
pnpm --filter @actalk/inkos-core test    # Core tests only
pnpm --filter @actalk/inkos test         # CLI tests only
```

For features touching the LLM pipeline, mock the LLM calls — don't make real API requests in tests.

## Questions?

Open an issue or check existing ones: https://github.com/Narcooo/inkos/issues
