import { type IntlString, getMetadata } from '@hcengineering/platform'
import ui from '../original'

export interface UiLanguage {
  id: string
  label: IntlString
  logo: string
}

export function configuredLanguages (): UiLanguage[] {
  const all: UiLanguage[] = [
    { id: 'vi', label: 'ui:string:Vietnamese' as IntlString, logo: '&#x1F1FB;&#x1F1F3;' },
    { id: 'en', label: ui.string.English, logo: '&#x1F1FA;&#x1F1F8;' },
    { id: 'pl', label: ui.string.Polish, logo: '&#x1F1F5;&#x1F1F1;' },
    { id: 'pt', label: ui.string.Portuguese, logo: '&#x1F1F5;&#x1F1F9;' },
    { id: 'pt-br', label: ui.string.PortugueseBrazil, logo: '&#x1F1E7;&#x1F1F7;' },
    { id: 'es', label: ui.string.Spanish, logo: '&#x1F1EA;&#x1F1F8;' },
    { id: 'ru', label: ui.string.Russian, logo: '&#x1F1F7;&#x1F1FA;' },
    { id: 'zh', label: ui.string.Chinese, logo: '&#x1F1E8;&#x1F1F3;' },
    { id: 'fr', label: ui.string.French, logo: '&#x1F1EB;&#x1F1F7;' },
    { id: 'it', label: ui.string.Italian, logo: '&#x1F1EE;&#x1F1F9;' },
    { id: 'cs', label: ui.string.Czech, logo: '&#x1F1E8;&#x1F1FF;' },
    { id: 'de', label: ui.string.German, logo: '&#x1F1E9;&#x1F1EA;' },
    { id: 'ja', label: ui.string.Japanese, logo: '&#x1F1EF;&#x1F1F5;' },
    { id: 'ko', label: ui.string.Korean, logo: '&#x1F1F0;&#x1F1F7;' },
    { id: 'tr', label: ui.string.Turkish, logo: '&#x1F1F9;&#x1F1F7;' }
  ]
  const configured = new Set(getMetadata(ui.metadata.Languages))
  return all.filter((lang) => configured.has(lang.id))
}
