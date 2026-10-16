<!--
  servone: chips are Huly's own FilteredView records, the same ones as the navigator's saved views.
-->
<script lang="ts">
  import core, { getCurrentAccount, type Class, type Doc, type Ref, type Space } from '@hcengineering/core'
  import { createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import {
    Button,
    getCurrentResolvedLocation,
    getEventPositionElement,
    IconMoreH,
    SelectPopup,
    showPopup,
    type Location
  } from '@hcengineering/ui'
  import view, { type FilteredView, type ViewOptions, type Viewlet } from '@hcengineering/view'
  import {
    EditBoxPopup,
    filterStore,
    getActiveViewletId,
    selectedFilterStore,
    setActiveViewletId,
    setFilters,
    setViewOptions
  } from '@hcengineering/view-resources'
  import { str } from '../../sprints/plugin'

  export let _class: Ref<Class<Doc>>
  export let viewlet: Viewlet | undefined
  export let viewOptions: ViewOptions | undefined

  const client = getClient()
  const me = getCurrentAccount()

  let loc: Location = getCurrentResolvedLocation()
  $: pathKey = loc.path.join('/')

  let views: FilteredView[] = []
  const viewsQuery = createQuery()
  $: viewsQuery.query(view.class.FilteredView, { attachedTo: loc.path[2] as Ref<Doc>, filterClass: _class }, (res) => {
    views = res
      .filter((v) => v.location.path.join('/') === pathKey)
      .filter((v) => v.users.includes(me.uuid) || v.sharable)
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  $: selected = $selectedFilterStore?._id

  function clone<T> (v: T): T {
    return JSON.parse(JSON.stringify(v))
  }

  async function apply (fv: FilteredView): Promise<void> {
    if (selected === fv._id) {
      selectedFilterStore.set(undefined)
      setFilters([])
      return
    }
    selectedFilterStore.set(fv)
    if (fv.viewletId != null) {
      setActiveViewletId(fv.viewletId, fv.location)
      const target = await client.findOne<Viewlet>(view.class.Viewlet, { _id: fv.viewletId })
      if (fv.viewOptions !== undefined) setViewOptions(target ?? ({ _id: fv.viewletId } as unknown as Viewlet), clone(fv.viewOptions))
    }
    setFilters(JSON.parse(fv.filters))
  }

  async function targetSpace (): Promise<Ref<Space>> {
    const id = loc.path[3]
    if (id === undefined) return core.space.Workspace
    const space = await client.findOne(core.class.Space, { _id: id as Ref<Space> })
    return space?._id ?? core.space.Workspace
  }

  function create (e: MouseEvent): void {
    loc = getCurrentResolvedLocation()
    showPopup(EditBoxPopup, { value: '', format: 'text', placeholder: str.ViewName }, getEventPositionElement(e), async (name?: string) => {
      if (typeof name !== 'string' || name.trim() === '') return
      const location = { ...loc, fragment: undefined }
      const id = await client.createDoc(view.class.FilteredView, await targetSpace(), {
        name: name.trim(),
        location,
        filterClass: _class,
        filters: JSON.stringify($filterStore),
        attachedTo: loc.path[2] as Ref<Doc>,
        viewOptions: viewOptions !== undefined ? clone(viewOptions) : undefined,
        viewletId: getActiveViewletId() ?? viewlet?._id ?? null,
        sharable: true,
        users: [me.uuid]
      })
      const created = await client.findOne(view.class.FilteredView, { _id: id })
      if (created !== undefined) selectedFilterStore.set(created)
    })
  }

  function menu (e: MouseEvent, fv: FilteredView): void {
    const mine = fv.createdBy !== undefined && me.socialIds.includes(fv.createdBy)
    const items = [
      { id: 'rename', label: str.RenameView },
      { id: 'update', label: str.UpdateView },
      ...(mine ? [{ id: 'delete', label: str.DeleteView }] : [])
    ]
    const anchor = getEventPositionElement(e)
    showPopup(SelectPopup, { value: items }, anchor, async (id?: string) => {
      if (id === 'rename') {
        showPopup(EditBoxPopup, { value: fv.name, format: 'text' }, anchor, async (name?: string) => {
          if (typeof name === 'string' && name.trim() !== '') await client.update(fv, { name: name.trim() })
        })
      } else if (id === 'update') {
        await client.update(fv, {
          filters: JSON.stringify($filterStore),
          viewOptions: viewOptions !== undefined ? clone(viewOptions) : undefined,
          viewletId: getActiveViewletId() ?? viewlet?._id ?? null
        })
      } else if (id === 'delete') {
        showPopup(MessageBox, {
          label: str.DeleteView,
          message: str.DeleteViewConfirm,
          params: { name: fv.name },
          dangerous: true,
          action: async () => {
            if (selected === fv._id) selectedFilterStore.set(undefined)
            await client.remove(fv)
          }
        })
      }
    })
  }
</script>

<div class="flex items-center gap-1">
  {#each views as fv (fv._id)}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="group flex items-center"
      on:contextmenu={(e) => {
        e.preventDefault()
        menu(e, fv)
      }}
    >
      <Button kind={'ghost'} size={'small'} selected={selected === fv._id} on:click={() => apply(fv)}>
        <span slot="content" class="max-w-40 truncate">{fv.name}</span>
      </Button>
      {#if selected === fv._id}
        <Button kind={'ghost'} size={'small'} icon={IconMoreH} on:click={(e) => menu(e, fv)} />
      {/if}
    </div>
  {/each}
  <Button
    kind={'ghost'}
    size={'small'}
    icon={view.icon.Views}
    showTooltip={{ label: str.NewView }}
    on:click={create}
  />
</div>
