# Contributing to Servone

Thanks for helping. Bug reports, fixes, translations and new features are all welcome.

## Before you start

- **Bugs and feature requests:** open an [issue](https://github.com/Trox824/servone/issues/new/choose) using one of the forms.
- **Questions and early ideas:** start a [discussion](https://github.com/Trox824/servone/discussions).
- **Security problems:** report them privately as described in [SECURITY.md](SECURITY.md), never in a public issue.
- **Larger changes:** open an issue or discussion first so we can agree on the approach before you spend time on it.

Issues labelled [`good first issue`](https://github.com/Trox824/servone/labels/good%20first%20issue) are a good place to begin.

## Set up a development environment

You need Node.js 22 (see `.nvmrc`), [Rush](https://rushjs.io), Docker with Compose, and about 8 GB of free memory.

```bash
nvm use
npm install -g @microsoft/rush
rush install
rush build
dev/servone-stack.sh up
dev/servone-front.sh local
```

See the [README](README.md#run-it-locally) for details. The [Huly Platform README](https://github.com/hcengineering/platform#readme) covers Docker images, Windows and WSL.

## Where code goes

Servone is a fork of Huly, and we keep merging upstream changes. To keep that possible:

- Put new work in Servone's own folders: `packages/servone-*`, `services/servone`, `dev/servone-*` and `tests/servone`.
- If a Huly file has to change, keep the edit as small as possible, usually one import or one prop, and put the logic in a Servone file. Mark the edit with a `servone:` comment and add a row to [docs/upstream-edits.md](docs/upstream-edits.md).
- Do not copy a whole Huly component to change it. Ask in the issue first if you think you need to.

## Code style

- TypeScript and Svelte 4. Follow the style of the file you are editing.
- Parse untyped input (HTTP bodies, env, JSON, `localStorage`) into a typed value at the boundary. Avoid `any`, `as unknown as`, and non-null `!`.
- Name things for what they are (`activeSprint`, not `data`). Booleans read as predicates (`isExpired`, `canEdit`).
- Comment only the non-obvious why. The code should say what it does.
- Every user-facing string needs an English and a Vietnamese translation. Write specific copy: "Invite teammate", not "Get started".

## Tests

Run the tests for the packages you changed:

```bash
cd packages/servone-ui && rushx test
```

End-to-end tests live in `tests/servone` and use Playwright. CI builds and tests the Servone packages on every pull request.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org) with a subject of 50 characters or less, for example `fix(tracker): keep sprint dates on copy`.
- Keep a pull request to one change. Open it against `develop` and fill in the template.
- Include screenshots for UI changes, in both light and dark themes if colours are involved.

## License

Servone is licensed under the [Eclipse Public License 2.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
