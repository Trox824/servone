import { derived, writable } from 'svelte/store'
import { deviceOptionsStore, location } from '../original'

const isListRequested = writable(false)

export function showListPage (): void {
  isListRequested.set(true)
  deviceOptionsStore.update((options) => ({ ...options, navigator: { ...options.navigator, visible: true } }))
}

export function watchPhoneNav (): void {
  deviceOptionsStore.subscribe((options) => {
    if (!options.navigator.visible) isListRequested.set(false)
    document.documentElement.classList.toggle('servone-no-app-menu', !options.navigator.available)
  })
  derived([isListRequested, location, deviceOptionsStore], ([$isListRequested, $location, $device]) => {
    const isAppRoot = $location.path[0] === 'workbench' && $location.path[3] === undefined && ($location.fragment ?? '') === ''
    return $device.isMobile && $device.navigator.visible && ($isListRequested || isAppRoot)
  }).subscribe((isListPage) => {
    document.documentElement.classList.toggle('servone-list-page', isListPage)
  })
}
