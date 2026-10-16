<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { isDocCreatedByAccount } from '@hcengineering/contact'
  import {
    AccountRole,
    type Blob,
    type Class,
    type CollaborativeDoc,
    type Doc,
    generateId,
    getCurrentAccount,
    hasAccountRole,
    makeDocCollabId,
    type Ref
  } from '@hcengineering/core'
  import { type Asset, type IntlString, translateCB } from '@hcengineering/platform'
  import {
    type DrawingCmd,
    getAttribute,
    getClient,
    getFileUrl,
    getImageSize,
    imageSizeToRatio,
    type KeyedAttribute
  } from '@hcengineering/presentation'
  import textEditor, {
    CollaborationIds,
    type CollaborationUser,
    type RefAction,
    type TextEditorCommandHandler,
    type TextEditorHandler
  } from '@hcengineering/text-editor'
  import { markupToJSON } from '@hcengineering/text'
  import {
    type AnySvelteComponent,
    Button,
    getEventPositionElement,
    getPopupPositionElement,
    IconScribble,
    type IconSize,
    Loading,
    type PopupAlignment,
    popupstore,
    themeStore,
    ThrottledCaller
  } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { Editor, type FocusPosition, mergeAttributes } from '@tiptap/core'
  import { isChangeOrigin } from '@tiptap/extension-collaboration'
  import type { Instance as TippyInstance } from 'tippy.js'
  import { createEventDispatcher, getContext, onDestroy, onMount } from 'svelte'
  import { Doc as YDoc } from 'yjs'

  import { type EditorKitOptions, getEditorKit } from '../../src/kits/editor-kit'
  import { deleteAttachment } from '../command/deleteAttachment'
  import { textEditorCommandHandler } from '../commands'
  import { type Provider } from '../provider/types'
  import { createRemoteProvider } from '../provider/utils'
  import { addTableHandler } from '../utils'
  import { noSelectionRender, renderCursor } from './editor/collaboration'
  import { defaultEditorAttributes } from './editor/editorProps'
  import { type SavedBoard } from './extension/drawingBoard'
  import { hideTextEditorToolbar } from './extension/toolbar/toolbar'
  import { type FileAttachFunction } from './extension/types'
  import { inlineCommandsConfig } from './extensions'

  export let object: Doc
  export let attribute: KeyedAttribute
  export let user: CollaborationUser
  export let userComponent: AnySvelteComponent | undefined = undefined
  export let readonly: boolean = false
  export let buttonSize: IconSize = 'small'
  export let actionsButtonSize: IconSize = 'medium'
  export let full: boolean = false
  export let placeholder: IntlString = textEditor.string.EditorPlaceholder
  export let placeholderParams: Record<string, string | number> = {}
  export let refActions: RefAction[] = []
  export let editorAttributes: Record<string, string> = {}
  export let spellcheck: boolean = true
  export let overflow: 'auto' | 'none' = 'none'
  export let boundary: HTMLElement | undefined = undefined
  export let attachFile: FileAttachFunction | undefined = undefined
  export let withSideMenu: boolean = true
  export let withInlineCommands: boolean = true
  export let kitOptions: Partial<EditorKitOptions> = {}
  export let requestSideSpace: ((width: number) => void) | undefined = undefined

  type TippyHost = HTMLElement & { _tippy?: TippyInstance }
  type InsertMenuItem = { id: string, label: IntlString, icon: Asset | AnySvelteComponent }
  type BoardEntry = { document: YDoc, hasLoaded: boolean }

  const dispatch = createEventDispatcher<{
    editor: Editor | undefined
    loaded: void
    focus: void
    blur: FocusEvent
    update: void
  }>()

  const contextDoc = getContext<YDoc | undefined>(CollaborationIds.Doc)
  const contextProvider = getContext<Provider | undefined>(CollaborationIds.Provider)
  const ydoc = contextDoc ?? new YDoc({ guid: generateId(), gc: false })
  const provider =
    contextProvider ??
    createRemoteProvider(
      ydoc,
      makeDocCollabId(object, attribute.key),
      getAttribute(getClient(), object, attribute)
    )

  const currentAccount = getCurrentAccount()
  const canEditByRole =
    hasAccountRole(currentAccount, AccountRole.User) ||
    (currentAccount.role === AccountRole.Guest && isDocCreatedByAccount(object, currentAccount))
  const isGuestViewer =
    currentAccount.role === AccountRole.DocGuest || currentAccount.role === AccountRole.ReadOnlyGuest

  const awarenessThrottle = new ThrottledCaller(100)
  const boardCache = new Map<string, BoardEntry>()

  let mountElement: HTMLElement | undefined
  let popupHost: HTMLElement | undefined
  let imageInput: HTMLInputElement | undefined

  let editorInstance: Editor | undefined
  let cachedCommandHandler: TextEditorCommandHandler | undefined
  let hasSynced = false
  let hasContentError = false
  let isEditorCreated = false
  let isEditorFocused = false
  let isFocusWanted = false
  let pendingFocusPosition: FocusPosition | undefined
  let ariaPlaceholder = ''
  let isLatestInputInsideEditor = false
  let knownPopupCount = $popupstore.length
  let isDestroyed = false

  void provider.loaded.then(() => {
    hasSynced = true
    dispatch('loaded')
  })

  $: translateCB(placeholder, placeholderParams, $themeStore.language, (text) => {
    ariaPlaceholder = text
  })

  $: cachedCommandHandler = textEditorCommandHandler(editorInstance)
  $: dispatch('editor', editorInstance)

  $: shouldBeEditable = !readonly && !hasContentError && hasSynced && isEditorCreated && canEditByRole
  $: if (editorInstance !== undefined && isEditorCreated && editorInstance.isEditable !== shouldBeEditable) {
    editorInstance.setEditable(shouldBeEditable, !hasContentError)
  }

  $: if (editorInstance !== undefined && isFocusWanted) {
    if (!editorInstance.isFocused) {
      editorInstance.commands.focus(pendingFocusPosition)
      pendingFocusPosition = undefined
    }
    isFocusWanted = false
  }

  $: handlePopupCount($popupstore.length)

  function handlePopupCount (popupCount: number): void {
    if (popupCount > knownPopupCount && editorInstance !== undefined && !isLatestInputInsideEditor) {
      hideTextEditorToolbar(editorInstance)
    }
    knownPopupCount = popupCount
  }

  function trackInputTarget (event: Event): void {
    const inputTarget = event.target
    isLatestInputInsideEditor =
      inputTarget instanceof Element &&
      (mountElement?.contains(inputTarget) === true ||
        popupHost?.contains(inputTarget) === true ||
        inputTarget.closest('[data-block-editor-blur="true"]') !== null)
  }

  export function commands (): TextEditorCommandHandler | undefined {
    return cachedCommandHandler
  }

  export function removeAttachment (id: string): void {
    editorInstance?.commands.command(deleteAttachment(id))
  }

  export function isEditable (): boolean {
    return editorInstance?.isEditable ?? false
  }

  export function focus (position?: FocusPosition): void {
    pendingFocusPosition = position
    isFocusWanted = true
  }

  export function isFocused (): boolean {
    return isEditorFocused
  }

  export function handleAttachImage (): void {
    imageInput?.click()
  }

  async function handleImagesChosen (): Promise<void> {
    if (readonly || imageInput === undefined) return
    const chosenFiles = Array.from(imageInput.files ?? [])
    if (chosenFiles.length === 0) return

    for (const chosenFile of chosenFiles) {
      if (!chosenFile.type.startsWith('image/') || attachFile === undefined) continue
      const uploaded = await attachFile(chosenFile)
      if (uploaded === undefined) continue
      const imageSize = await getImageSize(chosenFile)
      editorInstance?.commands.insertContent(
        {
          type: 'image',
          attrs: {
            'file-id': uploaded.file,
            width: imageSizeToRatio(imageSize.width, imageSize.pixelRatio)
          }
        },
        { updateSelection: false }
      )
    }
    imageInput.value = ''
  }

  const insertMenuItems: InsertMenuItem[] = [
    { id: 'image', label: textEditor.string.Image, icon: view.icon.Image },
    { id: 'table', label: textEditor.string.Table, icon: view.icon.Table2 },
    { id: 'code-block', label: textEditor.string.CodeBlock, icon: view.icon.CodeBlock },
    { id: 'separator-line', label: textEditor.string.SeparatorLine, icon: view.icon.SeparatorLine },
    { id: 'todo-list', label: textEditor.string.TodoItem, icon: view.icon.TodoList },
    { id: 'drawing-board', label: textEditor.string.DrawingBoard, icon: IconScribble },
    { id: 'mermaid', label: textEditor.string.MermaidDiargram, icon: view.icon.Model }
  ]

  async function handleInsertSelect (id: string, pos: number, target?: MouseEvent | HTMLElement): Promise<void> {
    const activeEditor = editorInstance
    if (activeEditor === undefined) return
    activeEditor.commands.focus(pos, { scrollIntoView: false })

    if (id === 'image') {
      handleAttachImage()
    } else if (id === 'table') {
      let popupPosition: PopupAlignment | undefined
      if (target instanceof MouseEvent) {
        popupPosition = getEventPositionElement(target)
      } else if (target instanceof HTMLElement) {
        popupPosition = getPopupPositionElement(target)
      }
      setTimeout(() => {
        void addTableHandler((tableOptions) => {
          activeEditor.chain().focus(pos).insertTable(tableOptions).run()
        }, popupPosition)
      }, 0)
    } else if (id === 'code-block') {
      activeEditor.commands.insertContentAt(pos, { type: 'codeBlock' })
    } else if (id === 'todo-list') {
      activeEditor.chain().insertContentAt(pos, { type: 'paragraph' }).toggleTaskList().run()
    } else if (id === 'separator-line') {
      activeEditor.commands.setHorizontalRule()
    } else if (id === 'drawing-board') {
      activeEditor.commands.insertContentAt(pos, { type: 'drawingBoard', attrs: { id: generateId() } })
    } else if (id === 'mermaid') {
      activeEditor.commands.insertContentAt(pos, { type: 'mermaid' })
    }
  }

  function createBoardEntry (boardId: string): BoardEntry {
    const entry: BoardEntry = { document: new YDoc({ guid: boardId, gc: false }), hasLoaded: false }
    const boardCollabId: CollaborativeDoc = {
      objectClass: 'DrawingBoard' as Ref<Class<Doc>>,
      objectId: boardId as Ref<Doc>,
      objectAttr: 'content'
    }
    const boardProvider = createRemoteProvider(entry.document, boardCollabId, boardId as Ref<Blob>)
    void boardProvider.loaded.then(() => {
      entry.hasLoaded = true
    })
    return entry
  }

  function getSavedBoard (boardId: string): SavedBoard {
    const entry = boardCache.get(boardId) ?? createBoardEntry(boardId)
    boardCache.set(boardId, entry)
    return {
      document: entry.document,
      props: entry.document.getMap('props'),
      commands: entry.document.getArray<DrawingCmd>('commands'),
      loading: !entry.hasLoaded
    }
  }

  const refActionHandler: TextEditorHandler = {
    insertText: (text) => editorInstance?.commands.insertContent(text),
    insertEmoji: (text, image) =>
      editorInstance?.commands.insertEmoji(text, image === undefined ? 'unicode' : 'image', image),
    insertMarkup: (markup) => editorInstance?.commands.insertContent(markupToJSON(markup)),
    insertTemplate: (_templateName, markup) => editorInstance?.commands.insertContent(markupToJSON(markup)),
    insertTable: (tableOptions) => editorInstance?.commands.insertTable(tableOptions),
    insertCodeBlock: () => editorInstance?.commands.setCodeBlock(),
    insertContent: (content) => editorInstance?.commands.insertContent(content),
    insertSeparatorLine: () => editorInstance?.commands.setHorizontalRule(),
    focus: () => focus()
  }

  function runRefAction (action: RefAction, clickEvent: MouseEvent): void {
    action.action(clickEvent.target as HTMLElement, refActionHandler, clickEvent)
  }

  function hideToolbarTippyAria (rootNode: TippyHost): void {
    rootNode._tippy?.setProps({ aria: { expanded: false } })
    rootNode.removeAttribute('aria-expanded')
  }

  onMount(async () => {
    await provider.loaded
    if (isDestroyed || mountElement === undefined) return

    const baseOptions: Partial<EditorKitOptions> = {
      objectId: object._id,
      objectClass: object._class,
      objectSpace: object.space,
      history: false,
      submit: false,
      shortcuts:
        attachFile !== undefined
          ? { imageUpload: { attachFile, getFileUrl }, fileUpload: { attachFile } }
          : { imageUpload: false, fileUpload: false },
      toolbar: { boundary, popupContainer: popupHost },
      codeSnippets: { codeBlockMermaid: { ydoc, ydocContentField: attribute.key } },
      drawingBoard: { getSavedBoard },
      leftMenu: withSideMenu
        ? {
            width: 20,
            height: 20,
            marginX: 8,
            className: 'tiptap-left-menu',
            icon: view.icon.Add,
            iconProps: { className: 'svg-tiny', fill: 'currentColor' },
            items: insertMenuItems as Array<{ id: string, label: string, icon: Asset }>,
            handleSelect: handleInsertSelect
          }
        : false,
      inlineCommands: withInlineCommands
        ? inlineCommandsConfig(handleInsertSelect, attachFile === undefined ? ['image'] : [])
        : false,
      placeholder: { placeholderIntl: placeholder, placeholderIntlParams: placeholderParams, themeStore },
      collaboration: {
        collaboration: { document: ydoc, field: attribute.key },
        collaborationCursor: { provider, user, render: renderCursor, selectionRender: noSelectionRender },
        inlineComments: isGuestViewer
          ? false
          : {
              ydoc,
              boundary,
              popupContainer: popupHost,
              requestSideSpace,
              whenSync: provider.loaded
            }
      }
    }
    const editorKit = await getEditorKit(baseOptions, kitOptions)
    if (isDestroyed || mountElement === undefined) return

    editorInstance = new Editor({
      extensions: [editorKit],
      element: mountElement,
      editable: !readonly,
      enableContentCheck: true,
      parseOptions: { preserveWhitespace: 'full' },
      editorProps: {
        attributes: mergeAttributes(
          defaultEditorAttributes,
          { 'aria-label': ariaPlaceholder },
          editorAttributes,
          {
            class: 'flex-grow',
            translate: readonly ? 'yes' : 'no',
            spellcheck: spellcheck ? 'true' : 'false'
          }
        )
      },
      onCreate: () => {
        isEditorCreated = true
      },
      onTransaction: () => {
        editorInstance = editorInstance
      },
      onFocus: () => {
        isEditorFocused = true
        dispatch('focus')
      },
      onBlur: ({ event }) => {
        isEditorFocused = false
        dispatch('blur', event)
      },
      onUpdate: ({ transaction }) => {
        if (!transaction.docChanged || isChangeOrigin(transaction)) return
        awarenessThrottle.call(() => {
          provider.awareness?.setLocalStateField('lastUpdate', Date.now())
        })
        dispatch('update')
      },
      onContentError: ({ error, disableCollaboration }) => {
        disableCollaboration()
        hasContentError = true
        console.error(error)
        Analytics.handleError(error)
      }
    })

    hideToolbarTippyAria(editorInstance.view.dom as TippyHost)
  })

  onDestroy(() => {
    isDestroyed = true
    try {
      editorInstance?.destroy()
    } catch {}
    if (contextProvider === undefined) {
      void provider.destroy()
    }
  })
</script>

<svelte:window on:pointerdown|capture={trackInputTarget} on:keydown|capture={trackInputTarget} />

<div class="editorPopupContainer" bind:this={popupHost}></div>
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="ref-container grow flex flex-col relative clear-mins"
  class:h-full={full}
  style:overflow
  on:click|preventDefault|stopPropagation={() => {
    focus()
  }}
>
  {#if !hasSynced}
    <div class="flex flex-row p-3">
      <Loading />
    </div>
  {/if}
  <div class="text-area-wrapper grow flex justify-between items-start gap-4 min-h-5 bg-transparent">
    <div class="select-text w-full" style:display={hasSynced ? null : 'none'} bind:this={mountElement}></div>
  </div>
  {#if refActions.length > 0}
    <div class="buttons-panel flex-between clear-mins no-print">
      <div class="buttons-group xsmall-gap mt-3">
        {#each refActions as action, actionIndex (action)}
          {#if actionIndex !== 0 && action.order % 10 === 0}
            <div class="buttons-divider"></div>
          {/if}
          <Button
            kind="ghost"
            size="medium"
            icon={action.icon}
            iconProps={{ size: actionsButtonSize }}
            disabled={action.disabled}
            showTooltip={{ label: action.label }}
            on:click={(clickEvent) => {
              runRefAction(action, clickEvent)
            }}
          />
        {/each}
      </div>
    </div>
  {/if}
</div>
<input
  id="imageInput"
  name="file"
  type="file"
  multiple
  accept="image/*"
  style="display: none"
  bind:this={imageInput}
  on:change={handleImagesChosen}
/>

<style>
  .text-area-wrapper :global(.tiptap-left-menu) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 20%;
    color: var(--theme-trans-color);
  }
  .text-area-wrapper :global(.tiptap-left-menu:hover) {
    background-color: var(--theme-button-hovered);
    cursor: pointer;
  }
  .text-area-wrapper :global(.tiptap-left-menu:active) {
    background-color: var(--theme-button-pressed);
  }
</style>
