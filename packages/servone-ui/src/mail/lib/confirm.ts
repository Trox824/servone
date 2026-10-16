import { MessageBox } from '@hcengineering/presentation'
import { showPopup } from '@hcengineering/ui'
import { str } from '../plugin'

export async function confirmDeleteForever (count: number): Promise<boolean> {
  return await new Promise((resolve) => {
    showPopup(
      MessageBox,
      { label: str.DeleteForever, message: str.DeleteForeverConfirm, params: { count }, okLabel: str.DeleteForever, dangerous: true },
      'top',
      (result) => { resolve(result === true) }
    )
  })
}
