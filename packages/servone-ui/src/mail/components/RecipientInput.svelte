<script lang="ts">
  import contact, { getName, type Person } from '@hcengineering/contact'
  import { getCurrentAccount, SortingOrder, type Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { MAIL_MESSAGE_CLASS, mailboxSpaceId, parseAddress } from '@servone/mail'
  import { createEventDispatcher } from 'svelte'
  import { parseAddressList } from '../lib/compose'
  import { text } from '../plugin'

  export let label: string
  export let addresses: string[] = []
  export let inputId: string

  const MAX_SUGGESTIONS = 8
  const PAST_CORRESPONDENT_SCAN_LIMIT = 500
  const SUGGESTION_DEBOUNCE_MS = 200

  const dispatch = createEventDispatcher<{ change: string[] }>()

  let typed = ''
  let suggestions: string[] = []
  let activeIndex = -1
  let debounceHandle: number | undefined
  let latestRequest = 0
  let inputEl: HTMLInputElement

  function commit (addressList: string[]): void {
    if (addressList.length === 0) return
    const emails = new Set(addresses.map((address) => parseAddress(address).email))
    const additions = addressList.filter((address) => {
      const email = parseAddress(address).email
      if (email === '' || emails.has(email)) return false
      emails.add(email)
      return true
    })
    if (additions.length === 0) return
    addresses = [...addresses, ...additions]
    dispatch('change', addresses)
  }

  function removeAt (index: number): void {
    addresses = addresses.filter((_, i) => i !== index)
    dispatch('change', addresses)
  }

  function closeSuggestions (): void {
    latestRequest++
    suggestions = []
    activeIndex = -1
  }

  async function loadSuggestions (query: string): Promise<void> {
    if (query.trim() === '') {
      closeSuggestions()
      return
    }
    const request = ++latestRequest
    const client = getClient()
    const lowerQuery = query.toLowerCase()

    const channels = await client.findAll(
      contact.class.Channel,
      { provider: contact.channelProvider.Email, value: { $like: `%${query}%` } },
      { limit: MAX_SUGGESTIONS }
    )
    const hierarchy = client.getHierarchy()
    const people = await client.findAll(contact.class.Person, { _id: { $in: channels.map((channel) => channel.attachedTo as Ref<Person>) } })
    if (request !== latestRequest) return
    const peopleById = new Map(people.map((person) => [person._id, person]))

    const seenEmails = new Set<string>()
    const fromContacts: string[] = []
    for (const channel of channels) {
      const person = peopleById.get(channel.attachedTo as Ref<Person>)
      const name = person !== undefined ? getName(hierarchy, person) : ''
      const email = channel.value
      if (seenEmails.has(email)) continue
      seenEmails.add(email)
      fromContacts.push(name !== '' ? `${name} <${email}>` : email)
    }

    const space = mailboxSpaceId(getCurrentAccount().uuid)
    const recent = await client.findAll(MAIL_MESSAGE_CLASS, { space }, {
      limit: PAST_CORRESPONDENT_SCAN_LIMIT,
      sort: { mailSentAt: SortingOrder.Descending },
      projection: { mailFrom: 1, mailTo: 1 }
    })
    if (request !== latestRequest) return
    const fromPast: string[] = []
    for (const message of recent) {
      if (fromContacts.length + fromPast.length >= MAX_SUGGESTIONS) break
      for (const address of [message.mailFrom, ...message.mailTo]) {
        const email = parseAddress(address).email
        if (email === '' || seenEmails.has(email)) continue
        if (!address.toLowerCase().includes(lowerQuery)) continue
        seenEmails.add(email)
        fromPast.push(address)
      }
    }

    suggestions = [...fromContacts, ...fromPast].slice(0, MAX_SUGGESTIONS)
    activeIndex = suggestions.length > 0 ? 0 : -1
  }

  function scheduleSuggestions (query: string): void {
    if (debounceHandle !== undefined) window.clearTimeout(debounceHandle)
    debounceHandle = window.setTimeout(() => {
      debounceHandle = undefined
      loadSuggestions(query).catch(() => { closeSuggestions() })
    }, SUGGESTION_DEBOUNCE_MS)
  }

  function handleInput (): void {
    scheduleSuggestions(typed)
  }

  function selectSuggestion (address: string): void {
    commit([address])
    typed = ''
    closeSuggestions()
    inputEl?.focus()
  }

  function handlePaste (event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? ''
    const parsed = parseAddressList(text)
    if (parsed.length <= 1) return
    event.preventDefault()
    commit(parsed)
    typed = ''
    closeSuggestions()
  }

  function handleKeydown (event: KeyboardEvent): void {
    if ((event.key === ',' || event.key === ';' || event.key === 'Enter') && suggestions.length === 0) {
      event.preventDefault()
      commit(parseAddressList(typed))
      typed = ''
      closeSuggestions()
      return
    }
    if (event.key === 'Enter' && activeIndex >= 0 && activeIndex < suggestions.length) {
      event.preventDefault()
      selectSuggestion(suggestions[activeIndex])
      return
    }
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault()
      activeIndex = (activeIndex + 1) % suggestions.length
      return
    }
    if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault()
      activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length
      return
    }
    if (event.key === 'Escape' && suggestions.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      closeSuggestions()
      return
    }
    if (event.key === 'Backspace' && typed === '' && addresses.length > 0) {
      removeAt(addresses.length - 1)
    }
  }
</script>

<div class="recipient-input">
  <span class="recipient-input__label" id="{inputId}-label">{label}</span>
  <div class="recipient-input__field">
    {#each addresses as address, index (address)}
      <span class="recipient-input__chip">
        {address}
        <button type="button" class="recipient-input__chip-remove" aria-label={text('RemoveRecipient', { address })} on:click={() => removeAt(index)}>×</button>
      </span>
    {/each}
    <input
      bind:this={inputEl}
      id={inputId}
      class="recipient-input__text"
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={suggestions.length > 0}
      aria-labelledby="{inputId}-label"
      aria-controls={suggestions.length > 0 ? `${inputId}-listbox` : undefined}
      aria-activedescendant={activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
      bind:value={typed}
      on:input={handleInput}
      on:keydown={handleKeydown}
      on:paste={handlePaste}
      on:blur={() => { commit(parseAddressList(typed)); typed = '' }}
    />
  </div>
  {#if suggestions.length > 0}
    <ul class="recipient-input__suggestions" role="listbox" id="{inputId}-listbox">
      {#each suggestions as suggestion, index (suggestion)}
        <!-- Focus stays on the input (aria-activedescendant), so options are not tab stops; mousedown keeps it there. -->
        <!-- svelte-ignore a11y-interactive-supports-focus -->
        <li
          id="{inputId}-option-{index}"
          role="option"
          aria-selected={index === activeIndex}
          class="recipient-input__suggestion"
          class:recipient-input__suggestion--active={index === activeIndex}
          on:mousedown|preventDefault={() => { selectSuggestion(suggestion) }}
        >
          {suggestion}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .recipient-input {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .recipient-input__label {
    flex-shrink: 0;
    color: var(--theme-halfcontent-color);
    font-size: 14px;
    font-weight: 400;
  }
  .recipient-input__field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .recipient-input__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 8px;
    background: var(--theme-bg-accent-color);
    color: var(--theme-content-color);
    font-size: 13px;
  }
  /* 24px hit area; negative margins keep the chip at its text height. */
  .recipient-input__chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin: -2px -6px -2px -4px;
    border: none;
    border-radius: 8px;
    background: none;
    cursor: pointer;
    color: var(--theme-halfcontent-color);
    padding: 0;
    line-height: 1;
  }
  /* The composer modal renders outside .mail-app, and the global button reset removes the outline. */
  .recipient-input__chip-remove:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  .recipient-input:focus-within {
    border-bottom-color: var(--ring);
  }
  .recipient-input__text {
    flex: 1;
    min-width: 120px;
    border: none;
    outline: none;
    background: transparent;
    font: inherit;
    color: var(--theme-content-color);
    font-size: 14px;
  }
  .recipient-input__suggestions {
    position: absolute;
    z-index: 1;
    top: 100%;
    left: 0;
    right: 0;
    margin: 2px 0 0;
    padding: 4px;
    list-style: none;
    background: var(--theme-popup-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: 8px;
    box-shadow: var(--theme-popup-shadow);
    max-height: 200px;
    overflow-y: auto;
  }
  .recipient-input__suggestion {
    padding: 6px 8px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--theme-content-color);
  }
  .recipient-input__suggestion--active,
  .recipient-input__suggestion:hover {
    background: var(--theme-bg-accent-color);
  }
</style>
