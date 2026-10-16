import type { AnyTool } from '../tool'
import { calendarTools } from './calendar'
import { chatTools } from './chat'
import { driveTools } from './drive'
import { inboxTools } from './inbox'
import { packTools } from './packs'
import { peopleTools } from './people'
import { searchTools } from './search'
import { studioTools } from './studio'
import { trackerTools } from './tracker'

export const ALL_TOOLS: AnyTool[] = [
  ...trackerTools,
  ...chatTools,
  ...peopleTools,
  ...inboxTools,
  ...calendarTools,
  ...searchTools,
  ...driveTools,
  ...studioTools,
  ...packTools
]
