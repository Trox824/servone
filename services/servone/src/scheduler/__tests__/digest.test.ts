import type { Doc, Ref } from '@hcengineering/core'
import type { DocNotifyContext } from '@hcengineering/notification'

import {
  DIGEST_LOOKBACK_MS,
  digestSince,
  groupConversations,
  isDigestDue,
  MAX_LINES_PER_CONVERSATION,
  notificationUrl,
  SNIPPET_LENGTH,
  toSnippet,
  type DigestEntry
} from '../digest'
import type { UserPrefs } from '../settings'
import { ict, officeHours } from './fixtures'

const HOUR = 60 * 60_000

function prefs (overrides: Partial<UserPrefs> = {}): UserPrefs {
  return { digest: { isEnabled: true, idleHours: 2, locale: 'en' }, locale: 'en', ...overrides }
}

describe('isDigestDue', () => {
  const wentOffline = ict(0, 9)

  it('waits until the idle time has passed', () => {
    const offline = { online: false, modifiedOn: wentOffline }
    expect(isDigestDue(prefs(), offline, wentOffline + 2 * HOUR - 1, undefined)).toBe(false)
    expect(isDigestDue(prefs(), offline, wentOffline + 2 * HOUR, undefined)).toBe(true)
  })

  it('never sends while the user is online or has no presence yet', () => {
    expect(isDigestDue(prefs(), { online: true, modifiedOn: wentOffline }, wentOffline + 5 * HOUR, undefined)).toBe(
      false
    )
    expect(isDigestDue(prefs(), undefined, wentOffline + 5 * HOUR, undefined)).toBe(false)
  })

  it('sends once per offline stretch', () => {
    const offline = { online: false, modifiedOn: wentOffline }
    const sent = prefs({ digestSentAt: wentOffline + 2 * HOUR })
    expect(isDigestDue(sent, offline, wentOffline + 5 * HOUR, undefined)).toBe(false)
    const nextStretch = { online: false, modifiedOn: wentOffline + 3 * HOUR }
    expect(isDigestDue(sent, nextStretch, wentOffline + 6 * HOUR, undefined)).toBe(true)
  })

  it('skips while paused', () => {
    const offline = { online: false, modifiedOn: wentOffline }
    expect(isDigestDue(prefs(), offline, wentOffline + 3 * HOUR, wentOffline + 4 * HOUR)).toBe(false)
  })

  it('waits for the start of the working day', () => {
    const evening = ict(0, 18)
    const offline = { online: false, modifiedOn: evening }
    const scheduled = prefs({ schedule: officeHours })
    expect(isDigestDue(scheduled, offline, ict(0, 23), undefined)).toBe(false)
    expect(isDigestDue(scheduled, offline, ict(1, 8), undefined)).toBe(true)
  })

  it('is off when the digest is off', () => {
    const offline = { online: false, modifiedOn: wentOffline }
    expect(isDigestDue(prefs({ digest: undefined }), offline, wentOffline + 30 * HOUR, undefined)).toBe(false)
  })
})

describe('digestSince', () => {
  it('starts after the last digest, at most a week back', () => {
    const now = ict(0, 12)
    expect(digestSince(prefs({ digestSentAt: now - HOUR }), now)).toBe(now - HOUR)
    expect(digestSince(prefs(), now)).toBe(now - DIGEST_LOOKBACK_MS)
  })
})

describe('toSnippet', () => {
  it('flattens whitespace', () => {
    expect(toSnippet('  hello\n\n  world  ')).toBe('hello world')
  })

  it('cuts long text to the snippet length', () => {
    const snippet = toSnippet('a'.repeat(500))
    expect(snippet).toHaveLength(SNIPPET_LENGTH)
    expect(snippet.endsWith('…')).toBe(true)
  })
})

function entry (context: string, createdOn: number, text = `text ${createdOn}`): DigestEntry {
  return {
    context: context as Ref<DocNotifyContext>,
    objectId: context as Ref<Doc>,
    objectClass: 'chunter:class:Channel',
    title: `#${context}`,
    sender: 'Bob',
    text,
    createdOn
  }
}

describe('groupConversations', () => {
  it('puts the most recently active conversation first, lines in reading order', () => {
    const groups = groupConversations([entry('a', 3), entry('b', 2), entry('a', 1), entry('b', 5)])
    expect(groups.map((group) => group.title)).toEqual(['#b', '#a'])
    expect(groups[1].lines.map((line) => line.snippet)).toEqual(['text 1', 'text 3'])
  })

  it('keeps the latest lines of a busy conversation and counts the rest', () => {
    const entries = Array.from({ length: MAX_LINES_PER_CONVERSATION + 3 }, (_, index) => entry('a', index))
    const [group] = groupConversations(entries)
    expect(group.lines).toHaveLength(MAX_LINES_PER_CONVERSATION)
    expect(group.lines[0].snippet).toBe('text 3')
    expect(group.moreCount).toBe(3)
  })
})

describe('notificationUrl', () => {
  it('uses the stock inbox route', () => {
    expect(notificationUrl('https://app.servone.vn', 'acme', 'dm1', 'chunter:class:DirectMessage')).toBe(
      'https://app.servone.vn/workbench/acme/notification/dm1|chunter:class:DirectMessage'
    )
  })
})
