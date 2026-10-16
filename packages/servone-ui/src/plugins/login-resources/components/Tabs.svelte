<script lang="ts">
  import { getCurrentLocation, Label, navigate } from '@hcengineering/ui'
  import login from '../plugin'
  import { Tabs as TabsRoot, TabsList, TabsTrigger } from '../../../lib/components/ui/tabs'

  export let loginState: 'login' | 'signup' | 'none' = 'none'
  export let signUpDisabled: boolean = false

  function handleValueChange (nextValue: string): void {
    if ((nextValue !== 'login' && nextValue !== 'signup') || nextValue === loginState) return
    const targetLocation = getCurrentLocation()
    targetLocation.path[1] = nextValue
    targetLocation.path.length = 2
    navigate(targetLocation)
  }
</script>

<TabsRoot value={loginState} onValueChange={handleValueChange}>
  <TabsList class="grid w-full {signUpDisabled ? 'grid-cols-1' : 'grid-cols-2'}">
    {#if !signUpDisabled}
      <TabsTrigger value="signup"><Label label={login.string.SignUp} /></TabsTrigger>
    {/if}
    <TabsTrigger value="login"><Label label={login.string.LogIn} /></TabsTrigger>
  </TabsList>
</TabsRoot>
