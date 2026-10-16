import type { FormDefinition, FormField } from '@servone/forms'
import { missingRequired } from '../builder'

const field = (id: string, label: string): FormField => ({ id, label, isRequired: true, kind: 'text', target: { to: 'append' } })
const definition: FormDefinition = {
  version: 1,
  fields: [field('position', 'Position'), field('email', 'Email'), field('phone', 'Phone')]
}

describe('missingRequired', () => {
  it('lists only the empty required questions, in form order', () => {
    const problems = new Map([
      ['phone', 'required' as const],
      ['email', 'invalid_email' as const],
      ['position', 'required' as const]
    ])
    expect(missingRequired(definition, problems, 'en')).toBe('Position and Phone')
  })

  it('joins in the viewer language', () => {
    const problems = new Map([
      ['position', 'required' as const],
      ['email', 'required' as const],
      ['phone', 'required' as const]
    ])
    expect(missingRequired(definition, problems, 'vi')).toBe('Position, Email và Phone')
  })

  it('is undefined when nothing required is empty', () => {
    expect(missingRequired(definition, new Map(), 'en')).toBeUndefined()
  })
})
