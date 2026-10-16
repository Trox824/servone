const sveltePreprocess = require('svelte-preprocess')

module.exports = {
  preprocess: sveltePreprocess({
    scss: {
      // This is expected as svelte-preprocess hasn't fully migrated to the modern API yet
      silenceDeprecations: ['legacy-js-api']
    },
    // svelte-preprocess 6 + Svelte 5: keep `import { store }` when only `$store` is used.
    typescript: {
      compilerOptions: { verbatimModuleSyntax: true, target: 'ESNext' }
    }
  })
}
