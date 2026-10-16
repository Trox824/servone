export const menuPopupClass = 'bg-popover text-popover-foreground rounded-md border border-border shadow-md p-1 flex flex-col overflow-hidden min-w-[10rem]'

export const menuItemClass = 'flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm text-left outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 cursor-default'

export const menuGroupLabelClass = 'px-2 py-1.5 text-xs text-muted-foreground select-none'

export const menuSeparatorClass = '-mx-1 my-1 h-px bg-border'

export const menuCheckClass = 'ml-auto flex h-4 w-4 shrink-0 items-center justify-center'

export const menuScrollClass = 'overflow-auto max-h-[20rem]'

export type HulyButtonKind =
  | 'primary'
  | 'secondary'
  | 'positive'
  | 'negative'
  | 'regular'
  | 'ghost'
  | 'icon'
  | 'no-border'
  | 'link'
  | 'link-bordered'
  | 'dangerous'
  | 'list'
  | 'list-header'
  | 'contrast'
  | 'stepper'
  | 'attention'
  | 'warning'

function kindVariantClass (kind: HulyButtonKind): string {
  switch (kind) {
    case 'primary':
      return 'border border-transparent bg-primary text-primary-foreground hover:bg-primary/90'
    case 'dangerous':
      return 'border border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90'
    case 'secondary':
    case 'contrast':
      return 'border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80'
    case 'positive':
      return 'border border-transparent bg-primary text-primary-foreground hover:bg-primary/90'
    case 'negative':
      return 'border border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90'
    case 'regular':
    case 'list-header':
      return 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
    case 'link':
    case 'link-bordered':
      return 'border-transparent underline-offset-4 hover:underline text-primary'
    case 'warning':
      return 'border border-transparent bg-amber-500 text-white hover:bg-amber-500/90'
    case 'icon':
    case 'ghost':
    case 'no-border':
    case 'list':
    case 'stepper':
    case 'attention':
    default:
      return 'border border-transparent hover:bg-accent hover:text-accent-foreground'
  }
}

export function triggerButtonClass (kind: HulyButtonKind, disabled: boolean, pressed: boolean): string {
  return [
    'inline-flex max-w-full items-center gap-1.5 h-8 px-2.5 rounded-md text-sm font-medium transition-colors outline-none',
    'focus-visible:ring-1 focus-visible:ring-ring',
    kindVariantClass(kind),
    pressed ? 'bg-accent text-accent-foreground' : '',
    disabled ? 'pointer-events-none opacity-50' : ''
  ].filter(Boolean).join(' ')
}
