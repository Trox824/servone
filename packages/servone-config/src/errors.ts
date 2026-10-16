export type ConfigErrorCode = 'invalid' | 'stale' | 'not-found' | 'wrong-status' | 'forbidden' | 'self-approval' | 'failed'

export class ConfigError extends Error {
  constructor (
    readonly code: ConfigErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ConfigError'
  }
}
