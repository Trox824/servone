<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Component } from '@hcengineering/ui'
  import { component } from '../../calendar-resources/lich/plugin'

  const dispatch = createEventDispatcher()
  dispatch('change', true)
</script>

<Component is={component.Lich} />
