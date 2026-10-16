import { isSplitView } from '../layout'

it('splits list and thread only when the thread pane gets at least the list width', () => {
  expect(isSplitView(760)).toBe(true)
  expect(isSplitView(759)).toBe(false)
})
