import type { CardSpace, MasterTag } from '@hcengineering/card'
import type { Permission, Ref } from '@hcengineering/core'

export const CHANGE_TYPE = 'servone:type:ConfigChange' as Ref<MasterTag>
export const CHANGE_SPACE = 'servone:space:ConfigChanges' as Ref<CardSpace>
export const CHANGE_TYPE_NAME = 'Thay đổi cấu hình'
export const CHANGE_SPACE_NAME = 'Lịch sử thay đổi cấu hình'

// Ids from plugins/card-resources/src/plugin.ts; importing card-resources pulls in Svelte.
export const CARD_PERMISSION_ADD_TAG = 'card:permission:AddTag' as Ref<Permission>
export const CARD_PERMISSION_REMOVE_TAG = 'card:permission:RemoveTag' as Ref<Permission>

// Mirrors noCategory in plugins/view-resources/src/viewOptions.ts.
export const NO_GROUPING = '#no_category'

// whitePalette and darkPalette in packages/ui/src/colors.ts both have 24 entries.
export const PALETTE_SIZE = 24

// Serializes TxApplyIf of this scope on one transactor; the change-log version match in commit is what rejects a raced change.
export const APPLY_SCOPE = 'servone-config'
