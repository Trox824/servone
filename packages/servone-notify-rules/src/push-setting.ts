// The user's own Push NotificationProviderSetting as the rules read it. The servone* keys are extra JSONB
// any client can write, so each is parsed where it is read.
export interface PushSetting {
  enabled: boolean
  servoneSchedule?: unknown
  servoneDigest?: unknown
}
