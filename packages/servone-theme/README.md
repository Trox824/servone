# @servone/theme

Token bridge that makes Huly's existing UI (every unmodified `.scss` file
under `packages/theme/styles`, every plugin's `.svelte` component) render in
the shadcn-svelte "new-york / neutral" palette, plus a Tailwind v4 pipeline
(no preflight) for new shadcn-svelte components going forward.

This package ships CSS only. There is no build step — the files under
`styles/` are consumed directly by webpack (`css-loader` + `postcss-loader`),
the same way `@hcengineering/theme/styles/global.scss` is consumed today.

## Load order

Wired into `dev/prod/webpack.config.js`:

```js
bundle: [
  '@hcengineering/theme/styles/global.scss',
  '@servone/theme/styles/index.css',
  ...(dev ? ['./src/main-dev.ts'] : ['./src/main.ts'])
]
```

`index.css` itself imports, in order:

1. `@fontsource-variable/inter` — registers the Inter Variable font faces.
2. `tokens.css` — shadcn tokens (`--background`, `--primary`, `--radius`, ...).
3. `tailwind.css` — Tailwind v4 `theme` + `utilities` layers (preflight
   deliberately excluded), consuming the tokens above via `@theme inline`.
4. `bridge.css` — **must load last.** It repoints every Huly `--theme-*` /
   `--*-BorderRadius` / `--font-family` variable at the tokens, and needs to
   win the cascade against `global.scss`, which defines those same variables
   inside `.theme-dark {}` / `.theme-light {}` blocks (specificity 0,1,0).
   `bridge.css` targets the same selectors at the same specificity, so it
   wins purely because it loads later in the bundle array.

## Which element carries the theme class

`packages/theme/src/Theme.svelte` sets the class directly on
`document.documentElement` (the `<html>` element):

```js
document.documentElement.setAttribute('class', `${getRealTheme(theme)} ${fontsize} ${emoji}`)
```

`getRealTheme()` always resolves to a concrete `theme-dark` or `theme-light`
— `theme-system` is resolved to one of the two in JS (via
`matchMedia('(prefers-color-scheme: dark)')`) before the class is ever
written to the DOM. `tokens.css` still ships a `.theme-system` +
`@media (prefers-color-scheme: dark)` fallback block for the brief window
before that JS runs, but in normal operation the class you'll see in
DevTools is always `theme-dark` or `theme-light`.

## Huly var → shadcn token mapping (bridge.css)

Grouped the same way as `bridge.css`. All Huly-side names were verified to
exist in `packages/theme/styles/_colors.scss`, `_vars.scss` or
`global.scss` — see "Verification" below.

| Group | Huly vars (examples) | Shadcn token |
|---|---|---|
| Page background | `--theme-bg-color`, `--theme-back-color` | `--background` |
| Sidebar/navpanel | `--theme-navpanel-color`, `--theme-navpanel-divider`, `--theme-navpanel-border` | `--sidebar`, `--sidebar-border` |
| Panels/cards | `--theme-panel-color`, `--theme-comp-header-color`, `--theme-kanban-card-bg-color`, `--theme-list-row-color`, `--theme-table-row-color` | `--card` |
| Popups/dialogs | `--theme-popup-color`, `--theme-dialog-background-color` | `--popover` |
| Popup/dialog borders | `--theme-popup-divider`, `--theme-dialog-border-color`, `--theme-bg-divider-color` | `--border` |
| Body text | `--theme-content-color`, `--theme-caption-color`, `--theme-text-primary-color`, `--theme-accent-color` | `--foreground` |
| Muted text | `--theme-dark-color`, `--theme-darker-color`, `--theme-text-placeholder-color` | `--muted-foreground` |
| Links/caret | `--theme-link-color`, `--theme-caret-color` | `--primary` |
| Dividers/table/list borders | `--theme-divider-color`, `--theme-list-border-color`, `--theme-table-border-color`, `--theme-refinput-border` | `--border` |
| Ghost/icon buttons | `--theme-button-default/hovered/pressed/focused/border/disabled`, `--theme-button-icon-*`, `--theme-breadcrumb-*` | `--accent` / `--border` / `--ring` |
| Contrast buttons | `--theme-button-contrast-*` | `--primary-foreground` / `--primary` |
| Primary CTA | `--primary-button-*` | `--primary` / `--primary-foreground` |
| Secondary CTA | `--secondary-button-*` | `--secondary` / `--secondary-foreground` |
| Inputs | `--theme-editbox-focus-border`, `--theme-editbox-focus-color` | `--ring` |
| Checkbox/toggle | `--theme-checkbox-*`, `--theme-toggle-*` | `--primary` / `--muted` |
| Errors | `--theme-error-color`, `--theme-lost-color`, `--theme-urgent-color`, `--theme-state-negative-*` | `--destructive` |
| Neutral state | `--theme-state-regular-*`, `--theme-state-ghost-*` | `--muted-foreground` |
| Info state | `--theme-state-primary-*` | `--primary` |
| Tooltip | `--theme-tooltip-bg/color/key-bg` | `--popover` / `--popover-foreground` / `--muted` |
| Radius scale | `--min-/--extra-small-/--small-/--medium-/--large-BorderRadius` (+ `-focus-` variants) | `calc(var(--radius) ± Npx)` |
| Font | `--font-family` | `'Inter Variable', Inter, system-ui, ...` |
| Shadows | `--theme-popup-shadow`, `--popup-shadow`, `--popup-panel-shadow`, `--card-shadow`, `--button-shadow`, `--primary-shadow` | shadcn `sm`/`lg` box-shadow values |

Run `grep -oE '^\s*--[a-zA-Z0-9_-]+:' styles/bridge.css | sort -u | wc -l`
from this package's directory to get the exact current override count.

## Dependencies that must be installed

These are declared in this package's `package.json` / in
`dev/prod/package.json`, and are picked up by the orchestrator's
`rush update`:

- `@fontsource-variable/inter@^5.2.5` (this package's own `dependencies`)
- `tailwindcss@^4.1.13` (dev/prod devDependency)
- `@tailwindcss/postcss@^4.1.13` (dev/prod devDependency)

## Known gaps — Huly vars intentionally NOT overridden

- **Font-face / rich-text editor palette vars** (`--theme-text-editor-palette-*`,
  `--text-editor-*`, `--theme-clockface-*`, `--theme-diffview-*`,
  `--theme-calendar-*`, `--theme-inbox-*`, `--theme-drawing-bg-color`,
  `--theme-mention-*`, label colors beyond blue/gray). These are narrow,
  feature-specific accents (calendar clock face, diff viewer syntax colors,
  text editor highlight palette) with no natural shadcn-token equivalent;
  remapping them risks breaking specific-color meaning (e.g. diff green/red)
  for no visual-consistency gain. Left on Huly's original values.
- **`--global-popover-Shadow*` / `--global-modal-Shadow*`** (`_vars.scss`):
  these are shadow *dimensions* (blur/spread/x/y), not colors — they compose
  with other color vars in mixins.scss. Left alone; the popup/modal shadow
  color+opacity is instead overridden at the point they're consumed
  (`--theme-popup-shadow`, `--popup-panel-shadow`, `--card-shadow`).
- **Vars referenced in plugin `.svelte` files but not defined anywhere under
  `packages/theme/styles`** (e.g. `--theme-state-info-color`,
  `--theme-content-trans-color`). These are plugin-local custom properties,
  not part of the global theme contract, so overriding them here would be
  guessing at a name that doesn't actually exist upstream — out of scope per
  this package's "don't invent var names" rule.
- **`--accent-shadow`, `--dangerous-shadow`, `--tooltip-bg-color` (legacy,
  non-`theme-` prefixed vars outside the groups above)**: low usage
  (1–3 references each), left as-is to keep the diff focused on
  high-traffic surfaces.

## Verification

Every var name in `bridge.css` was checked against a definitive extraction
of everything actually defined in the Huly theme package:

```sh
grep -oE '^\s*--[a-zA-Z0-9_-]+' packages/theme/styles/_colors.scss \
  packages/theme/styles/_vars.scss packages/theme/styles/global.scss \
  | sed -E 's/.*://; s/^\s+//' | sort -u > /tmp/defined_vars.txt

grep -oE '^\s*--[a-zA-Z0-9_-]+:' packages/servone-theme/styles/bridge.css \
  | sed -E 's/:$//; s/^\s+//' | sort -u > /tmp/bridge_vars.txt

comm -23 /tmp/bridge_vars.txt /tmp/defined_vars.txt   # must print nothing
```

At the time this package was authored this printed nothing (0 unknown
vars) against 144 overridden variable names.
