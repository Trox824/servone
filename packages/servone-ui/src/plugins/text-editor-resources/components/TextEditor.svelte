<script lang="ts">
  import { Analytics } from '@hcengineering/analytics'
  import { type Blob, type Markup, type Ref } from '@hcengineering/core'
  import { type IntlString, translateCB } from '@hcengineering/platform'
  import { EmptyMarkup, getMarkup, markupToJSON } from '@hcengineering/text'
  import textEditor from '@hcengineering/text-editor'
  import { themeStore } from '@hcengineering/ui'
  import { type Content, Editor, type FocusPosition, mergeAttributes } from '@tiptap/core'
  import { type ParseOptions } from '@tiptap/pm/model'
  import { type EditorView } from '@tiptap/pm/view'
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import { type EditorKitOptions, getEditorKit } from '../kits/editor-kit'
  import { deleteAttachment } from '../command/deleteAttachment'
  import { defaultEditorAttributes } from './editor/editorProps'
  import { SlackKeymapExtension } from './slackKeymap'

  export let content: Markup = EmptyMarkup
  export let placeholder: IntlString = textEditor.string.EditorPlaceholder
  export let placeholderParams: Record<string, any> = {}
  export let supportSubmit = true
  export let editorAttributes: Record<string, string> = {}
  export let spellcheck = true
  export let boundary: HTMLElement | undefined = undefined
  export let autofocus: FocusPosition = false
  export let onPaste: ((view: EditorView, event: ClipboardEvent) => boolean) | undefined = undefined
  export let kitOptions: Partial<EditorKitOptions> = {}
  export let onKeyDown: ((view: EditorView, event: KeyboardEvent) => boolean) | undefined = undefined

  interface TippyHost {
    _tippy?: { setProps: (props: { aria: { expanded: boolean } }) => void }
  }

  const dispatch = createEventDispatcher()

  let rootElement: HTMLDivElement
  let editor: Editor | undefined
  let hasEditorFocus = false
  let isFocusWanted = false
  let wantedFocusPosition: FocusPosition | undefined
  let ariaLabel = ''

  $: translateCB(placeholder, placeholderParams, $themeStore.language, (translated) => {
    ariaLabel = translated
  })

  $: if (editor !== undefined && isFocusWanted) {
    if (!hasEditorFocus) {
      editor.commands.focus(wantedFocusPosition)
      wantedFocusPosition = undefined
    }
    isFocusWanted = false
  }

  function stripTippyAria (activeEditor: Editor): void {
    const editorDom = activeEditor.view.dom as HTMLElement & TippyHost
    editorDom._tippy?.setProps({ aria: { expanded: false } })
    editorDom.removeAttribute('aria-expanded')
  }

  async function createEditor (): Promise<void> {
    const extensionKit = await getEditorKit(
      {
        mode: 'compact',
        drawingBoard: false,
        textAlign: false,
        reference: false,
        emoji: false,
        placeholder: {
          placeholderIntl: placeholder,
          placeholderIntlParams: placeholderParams,
          themeStore
        },
        submit: supportSubmit ? { submit } : false
      },
      kitOptions
    )

    editor = new Editor({
      element: rootElement,
      enableContentCheck: true,
      onContentError: ({ error }) => {
        Analytics.handleError(error)
      },
      content: markupToJSON(content),
      autofocus,
      extensions: [extensionKit, SlackKeymapExtension],
      parseOptions: { preserveWhitespace: 'full' },
      editorProps: {
        attributes: mergeAttributes(
          defaultEditorAttributes,
          { 'aria-label': ariaLabel },
          editorAttributes,
          { spellcheck: spellcheck ? 'true' : 'false' }
        ),
        handlePaste: onPaste,
        handleKeyDown: (view, event) => (onKeyDown !== undefined ? onKeyDown(view, event) : false)
      },
      onTransaction: () => {
        editor = editor
      },
      onFocus: () => {
        hasEditorFocus = true
        dispatch('focus')
      },
      onBlur: () => {
        hasEditorFocus = false
        dispatch('blur')
      },
      onUpdate: () => {
        if (editor === undefined) return
        const currentMarkup = getMarkup(editor)
        content = currentMarkup
        dispatch('value', currentMarkup)
        dispatch('update', currentMarkup)
      }
    })

    stripTippyAria(editor)
  }

  onMount(() => {
    void createEditor()
  })

  onDestroy(() => {
    editor?.destroy()
  })

  export function isEditable (): boolean {
    return editor?.isEditable ?? false
  }

  export function setEditable (editable: boolean): void {
    editor?.setEditable(editable)
  }

  export function submit (): void {
    if (editor === undefined) return
    const currentMarkup = getMarkup(editor)
    content = currentMarkup
    dispatch('content', currentMarkup)
  }

  export function getContent (): Markup {
    return getMarkup(editor as Editor)
  }

  export function setContent (newContent: Markup): void {
    if (editor === undefined || newContent === content) return
    content = newContent
    editor.commands.setContent(markupToJSON(newContent))
  }

  export function clear (): void {
    if (editor === undefined) return
    content = EmptyMarkup
    editor.commands.clearContent(true)
  }

  export function getEditor (): Editor {
    return editor as Editor
  }

  export function insertEmoji (text: string, image?: Ref<Blob>): void {
    editor?.commands.insertEmoji(text, image !== undefined ? 'image' : 'unicode', image)
  }

  export function insertText (text: string): void {
    editor?.commands.insertContent(text)
  }

  export function insertTable (options: { rows?: number, cols?: number, withHeaderRow?: boolean }): void {
    editor?.commands.insertTable(options)
  }

  export function insertCodeBlock (pos?: number): void {
    if (editor === undefined) return
    editor.commands.insertContent(
      { type: 'codeBlock', content: [{ type: 'text', text: ' ' }] },
      { updateSelection: false }
    )
    if (pos !== undefined) {
      editor.commands.focus(pos, { scrollIntoView: false })
    }
  }

  export function insertSeparatorLine (): void {
    editor?.commands.setHorizontalRule()
  }

  export function insertContent (
    value: Content,
    options?: { parseOptions?: ParseOptions, updateSelection?: boolean }
  ): void {
    editor?.commands.insertContent(value, options)
  }

  export function insertMarkup (markup: Markup): void {
    editor?.commands.insertContent(markupToJSON(markup))
  }

  export function focus (position?: FocusPosition): void {
    wantedFocusPosition = position
    isFocusWanted = true
  }

  export function removeAttachment (id: string): void {
    editor?.commands.command(deleteAttachment(id))
  }
</script>

<div bind:this={rootElement} class="select-text w-full"></div>
