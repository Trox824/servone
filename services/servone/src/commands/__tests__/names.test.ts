import { checkCommandName } from '../names'

describe('checkCommandName', () => {
  it('accepts lowercase letters, digits and dashes up to 32 characters', () => {
    expect(checkCommandName('deploy', [])).toBeUndefined()
    expect(checkCommandName('deploy-2', [])).toBeUndefined()
    expect(checkCommandName('a'.repeat(32), [])).toBeUndefined()
  })

  it('refuses empty, too long, uppercase and spaced names', () => {
    expect(checkCommandName('', [])).toBe('invalid_name')
    expect(checkCommandName('a'.repeat(33), [])).toBe('invalid_name')
    expect(checkCommandName('Deploy', [])).toBe('invalid_name')
    expect(checkCommandName('dep loy', [])).toBe('invalid_name')
    expect(checkCommandName('/deploy', [])).toBe('invalid_name')
  })

  it('refuses the built-in command names', () => {
    for (const name of ['issue', 'doc', 'file', 'person', 'new']) {
      expect(checkCommandName(name, [])).toBe('reserved_name')
    }
  })

  it('refuses a name another command already uses', () => {
    expect(checkCommandName('deploy', ['status', 'deploy'])).toBe('name_taken')
  })
})
