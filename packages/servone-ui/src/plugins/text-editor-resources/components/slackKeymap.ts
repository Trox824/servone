import { showPopup } from '@hcengineering/ui'
import { Extension, type Editor } from '@tiptap/core'

import { hideTextEditorToolbar } from './extension/toolbar/toolbar'
import LinkPopup from './LinkPopup.svelte'

const ABOVE_STARTER_KIT_PRIORITY = 1000

function toggleMark (editor: Editor, name: string): boolean {
  if (editor.schema.marks[name] === undefined) return false
  return editor.chain().focus().toggleMark(name).run()
}

function editLink (editor: Editor): boolean {
  const { from, to } = editor.state.selection
  if (from === to || editor.schema.marks.link === undefined) return false

  hideTextEditorToolbar(editor)
  showPopup(LinkPopup, { link: editor.getAttributes('link').href }, undefined, undefined, (newLink) => {
    const chain = editor.chain().focus().extendMarkRange('link')
    if (newLink === '') chain.unsetLink().run()
    else chain.setLink({ href: newLink }).run()
  })
  return true
}

export const SlackKeymapExtension = Extension.create({
  name: 'servoneSlackKeymap',
  priority: ABOVE_STARTER_KIT_PRIORITY,

  addKeyboardShortcuts () {
    return {
      'Mod-Shift-x': () => toggleMark(this.editor, 'strike'),
      'Mod-Shift-c': () => toggleMark(this.editor, 'code'),
      'Mod-Shift-9': () => {
        if (this.editor.schema.nodes.blockquote === undefined) return false
        return this.editor.chain().focus().toggleWrap('blockquote').run()
      },
      'Mod-Shift-u': () => editLink(this.editor),
      'Mod-Shift-s': () => true
    }
  }
})
