import type { ChangeRecord, DiffLine, RiskLevel } from '@servone/config'
import { text, type StringKey } from './strings'
import { normalizeName } from './type-list'

export interface ConfirmRequest {
  change: ChangeRecord
  phrase: string | undefined
  resolve: (isConfirmed: boolean) => void
}

export interface DiffRow {
  text: string
  risk: RiskLevel
  affectedText: string | undefined
}

export type BadgeTone = 'default' | 'secondary' | 'destructive' | 'outline'

const RISK_KEY: Record<RiskLevel, StringKey> = { safe: 'RiskSafe', destructive: 'RiskDestructive', sensitive: 'RiskSensitive' }
const RISK_TONE: Record<RiskLevel, BadgeTone> = { safe: 'outline', destructive: 'destructive', sensitive: 'secondary' }
const RISK_RANK: Record<RiskLevel, number> = { destructive: 0, sensitive: 1, safe: 2 }

export function riskLabel (risk: RiskLevel): string {
  return text(RISK_KEY[risk])
}

export function riskTone (risk: RiskLevel): BadgeTone {
  return RISK_TONE[risk]
}

export function diffRows (diff: DiffLine[]): DiffRow[] {
  return [...diff]
    .sort((a, b) => RISK_RANK[a.risk] - RISK_RANK[b.risk])
    .map((line) => ({
      text: line.text,
      risk: line.risk,
      affectedText: line.affected !== undefined && line.affected > 0 ? text('AffectedRecords', { count: line.affected }) : undefined
    }))
}

export function isPhraseMatched (typed: string, phrase: string | undefined): boolean {
  if (phrase === undefined) return true
  return normalizeName(typed) === normalizeName(phrase)
}
