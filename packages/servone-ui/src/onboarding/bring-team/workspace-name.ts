const FREE_MAIL_LABELS = new Set([
  'gmail',
  'googlemail',
  'yahoo',
  'ymail',
  'outlook',
  'hotmail',
  'live',
  'msn',
  'icloud',
  'me',
  'mac',
  'proton',
  'protonmail',
  'pm',
  'aol',
  'gmx',
  'yandex',
  'mail',
  'qq',
  '163',
  '126',
  'vnn',
  'zing'
])
const SECOND_LEVEL_LABELS = new Set(['co', 'com', 'org', 'net', 'edu', 'gov'])

export function suggestWorkspaceName (email: string): string {
  const domain = email.split('@')[1]?.toLowerCase()
  if (domain === undefined) return ''
  const labels = domain.split('.')
  const isSecondLevelSuffix = labels.length >= 3 && SECOND_LEVEL_LABELS.has(labels[labels.length - 2])
  const company = labels[labels.length - (isSecondLevelSuffix ? 3 : 2)]
  if (company === undefined || company === '' || FREE_MAIL_LABELS.has(company)) return ''
  return company.charAt(0).toUpperCase() + company.slice(1)
}
