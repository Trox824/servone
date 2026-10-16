// Same cap as Slack's slash command names.
export const MAX_COMMAND_NAME_LENGTH = 32
const NAME_PATTERN = new RegExp(`^[a-z0-9-]{1,${MAX_COMMAND_NAME_LENGTH}}$`)

// Must cover the first words of BUILT_IN_COMMANDS in packages/servone-ui/src/lib/slash-commands.ts.
export const BUILT_IN_NAMES: readonly string[] = ['issue', 'doc', 'file', 'person', 'new']

export type NameError = 'invalid_name' | 'reserved_name' | 'name_taken'

export const isCommandName = (name: string): boolean => NAME_PATTERN.test(name)

export function checkCommandName (name: string, taken: readonly string[]): NameError | undefined {
  if (!isCommandName(name)) return 'invalid_name'
  if (BUILT_IN_NAMES.includes(name)) return 'reserved_name'
  if (taken.includes(name)) return 'name_taken'
  return undefined
}
