<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Repo: Higgsfield costs dashboard (vanilla-ts, Chrome latest only)

- Stack: Vite+ via `vp`, pnpm 12.4.1, TypeScript ~6, no framework, no runtime deps. English only (code, docs, UI).
- Entry: `index.html` → `src/main.ts` → `src/style.css`. Cost data: `public/higgsfield-costs.json` + `scripts/fetch-higgsfield-costs.ps1`. Spec: `doc/spec.md`.

## Commands

- `vp dev` — dev server. `vp run dev` runs the `dev` script instead (built-ins vs scripts differ).
- `vp check` — format + lint + typecheck. Run before calling anything done.
- `vp build` — `tsc && vp build`. `vp test` — vitest (no tests yet → exits 1, expected).
- `vp toolchain` / `vp env doctor` — when setup or runtime looks wrong.

## Conventions

- `type="module"`, `const` by default; semantic HTML, one `h1`; native CSS (`light-dark()`, `dvh`, container queries); Chrome-only, no fallbacks or polyfills.
- TS: `erasableSyntaxOnly` + `verbatimModuleSyntax` — no `enum`, namespaces, or parameter properties; model CLI enums as string-literal unions + `as const`. `noUnusedLocals`/`noUnusedParameters` are on.
- A11y: associated labels, visible `:focus-visible`, 44px targets, AA contrast, `prefers-reduced-motion`. Test 375px and 1280px+ in Chrome.
- Mark deliberate shortcuts with a `ponytail:` comment.

## Boundaries

- Always: `vp check` before reporting done; keep `doc/spec.md` current when scope changes.
- Ask first: new dependencies, build tools, Cloudflare resources, folder-structure changes.
- Never: commit secrets/tokens, generate AI images (page only), duplicate `doc/spec.md` content here.
