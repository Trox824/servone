export const DRAFT_DEBOUNCE_MS = 5000

export class DraftSaver {
  private timerHandle: number | undefined
  private inFlight: Promise<void> | undefined
  private dirty = false
  private editedDuringSave = false

  constructor (
    private readonly save: () => Promise<void>,
    private readonly schedule: (run: () => void, ms: number) => number,
    private readonly cancel: (handle: number) => void,
    private readonly onError: (error: Error) => void
  ) {}

  get isDirty (): boolean {
    return this.dirty
  }

  touch (): void {
    this.dirty = true
    if (this.inFlight !== undefined) this.editedDuringSave = true
    if (this.timerHandle !== undefined) this.cancel(this.timerHandle)
    this.timerHandle = this.schedule(() => {
      this.timerHandle = undefined
      this.runSave().catch((error: Error) => { this.onError(error) })
    }, DRAFT_DEBOUNCE_MS)
  }

  async flush (): Promise<void> {
    this.cancelTimer()
    await this.runSave()
  }

  async saveNow (): Promise<void> {
    this.dirty = true
    if (this.inFlight !== undefined) this.editedDuringSave = true
    await this.flush()
  }

  async stop (): Promise<void> {
    this.cancelTimer()
    this.dirty = false
    const running = this.inFlight
    if (running !== undefined) await running.then(() => undefined, () => undefined)
    this.dirty = false
  }

  private cancelTimer (): void {
    if (this.timerHandle === undefined) return
    this.cancel(this.timerHandle)
    this.timerHandle = undefined
  }

  private async runSave (): Promise<void> {
    while (this.inFlight !== undefined) await this.inFlight
    if (!this.dirty) return
    this.editedDuringSave = false
    this.inFlight = this.save()
    try {
      await this.inFlight
      this.dirty = this.editedDuringSave
    } finally {
      this.inFlight = undefined
    }
  }
}
