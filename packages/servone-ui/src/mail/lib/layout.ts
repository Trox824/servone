export const LIST_PANE_PX = 380 // spec UI: thread list column width
export const LIST_SKELETON_ROWS = Array.from({ length: 8 }, (_, row) => row) // spec UI: 8 rows, 40px each, in the loading list pane
export const SPLIT_MIN_PX = 2 * LIST_PANE_PX

export function isSplitView (width: number): boolean {
  return width >= SPLIT_MIN_PX
}
