<script lang="ts">
  import {
    AlignLeft,
    Banknote,
    Calendar,
    CircleHelp,
    Hash,
    Link,
    List,
    ListChecks,
    ListOrdered,
    Lock,
    ToggleLeft,
    Type,
    User
  } from '@lucide/svelte'
  import type { RowKind } from '../fields'

  export let kind: RowKind

  const ICONS: Record<RowKind, typeof Type> = {
    text: Type,
    longText: AlignLeft,
    number: Hash,
    money: Banknote,
    date: Calendar,
    boolean: ToggleLeft,
    select: List,
    multiSelect: ListChecks,
    person: User,
    autoNumber: ListOrdered,
    link: Link,
    reference: Lock,
    other: CircleHelp
  }
</script>

<svelte:component this={ICONS[kind]} class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
