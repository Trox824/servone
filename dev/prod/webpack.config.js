//
// Copyright © 2020 Anticrm Platform Contributors.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Load sass-quiet FIRST to install stderr filter
const sass = require('../../common/scripts/sass-quiet.js')

const Dotenv = require('dotenv-webpack')
const path = require('path')
const CompressionPlugin = require('compression-webpack-plugin')
const DefinePlugin = require('webpack').DefinePlugin
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { Configuration } = require('webpack')
const { servonePlugins, servoneSetupMiddlewares } = require('./servone.webpack.js')

const mode = process.env.NODE_ENV || 'development'
const prod = mode === 'production'
const clientType = process.env.CLIENT_TYPE ?? ''
const devServer = clientType === 'dev-server'
const devServerTest = clientType === 'dev-server-test'
const devServerWorker = clientType === 'dev-worker'
const devServerWorkerLocal = clientType === 'dev-worker-local'
const devProduction = clientType === 'dev-production'
const devProductionHuly = clientType === 'dev-huly'
const devProductionBold = clientType === 'dev-bold'
const dev =
  (process.env.CLIENT_TYPE ?? '') === 'dev' ||
  devServer ||
  devProduction ||
  devProductionHuly ||
  devProductionBold ||
  devServerWorker ||
  devServerWorkerLocal ||
  devServerTest
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')

// servone: DO_VALIDATE=false skips fork-ts-checker in dev (own 2 GB heap per rebuild); servone-ui's svelte-check is the type gate.
const doValidate = process.env.DO_VALIDATE === 'true' || (!prod && process.env.DO_VALIDATE !== 'false')

const useCache = process.env.USE_CACHE === 'true'

// servone: dev maps off by default: with cheap-module maps bundle.js was 42 MB (46% inline maps) + 28 MB vendors per reload.
// SERVONE_SOURCEMAP=1 -> eval-cheap-module-source-map, SERVONE_FULL_SOURCEMAP=1 -> eval-source-map (upstream).
const devSourceMaps = process.env.SERVONE_SOURCEMAP === '1' || process.env.SERVONE_FULL_SOURCEMAP === '1'

const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin

const devProxy = {
  '/account': {
    target: process.env.DEV_ACCOUNT_URL ?? 'http://huly.local:3000',
    changeOrigin: true,
    pathRewrite: { '^/account': '' },
    // servone: account service sets cookie Domain from the proxied Host; a remote backend's `.up.railway.app`
    // cookie is dropped on localhost and the stale one causes a /login loop.
    cookieDomainRewrite: 'localhost',
    logLevel: 'debug'
  },
  '/files': {
    target: 'http://huly.local:8087',
    changeOrigin: true,
    logLevel: 'debug'
  },
  '/api/v1': {
    target: 'http://huly.local:8087',
    changeOrigin: true,
    logLevel: 'debug'
  },
  '/rekoni/recognize': {
    target: 'http://huly.local:4004',
    changeOrigin: true,
    pathRewrite: { '^/rekoni/recognize': '/recognize' },
    logLevel: 'debug'
  }
}

const devProxyTest = {
  '/account': {
    target: 'http://huly.local:3003',
    changeOrigin: true,
    pathRewrite: { '^/account': '' },
    logLevel: 'debug'
  },
  '/files': {
    target: 'http://huly.local:8083',
    changeOrigin: true,
    logLevel: 'debug'
  },
  '/api/v1': {
    target: 'http://huly.local:8083',
    changeOrigin: true,
    logLevel: 'debug'
  },
  '/rekoni/recognize': {
    target: 'http://huly.local:4004',
    changeOrigin: true,
    pathRewrite: { '^/rekoni/recognize': '/recognize' },
    logLevel: 'debug'
  }
}

const devHulyProxy = {
  '/account': {
    target: 'https://account.huly.app/',
    changeOrigin: true,
    pathRewrite: { '^/account': '' },
    logLevel: 'debug'
  },
  '/api/v1': {
    target: 'http://huly.app',
    changeOrigin: true,
    logLevel: 'debug'
  },
  '/files': {
    target: 'https://huly.app/files',
    changeOrigin: true,
    pathRewrite: { '^/files': '' },
    logLevel: 'debug'
  },
  '/rekoni/recognize': {
    target: 'https://rekoni.huly.app',
    changeOrigin: true,
    pathRewrite: { '^/rekoni/recognize': '/recognize' },
    logLevel: 'debug'
  }
}

const devBoldProxy = {
  '/account': {
    target: 'https://account.bold.ru/',
    changeOrigin: true,
    pathRewrite: { '^/account': '' },
    logLevel: 'debug'
  },
  '/files': {
    target: 'https://app.bold.ru/files',
    changeOrigin: true,
    pathRewrite: { '^/files': '' },
    logLevel: 'debug'
  },
  '/api/v1': {
    target: 'http://app.bold.ru',
    changeOrigin: true,
    logLevel: 'debug'
  },
  '/rekoni/recognize': {
    target: 'https://rekoni.bold.ru',
    changeOrigin: true,
    pathRewrite: { '^/rekoni/recognize': '/recognize' },
    logLevel: 'debug'
  }
}

const devFrontProxy = {
  '/account': {
    target: 'https://account.hc.engineering/',
    changeOrigin: true,
    pathRewrite: { '^/account': '' },
    logLevel: 'debug'
  },
  '/files': {
    target: 'https://front.hc.engineering/files',
    changeOrigin: true,
    pathRewrite: { '^/files': '' },
    logLevel: 'debug'
  },
  '/rekoni/recognize': {
    target: 'https://rekoni.hc.enigneering',
    changeOrigin: true,
    pathRewrite: { '^/rekoni/recognize': '/recognize' },
    logLevel: 'debug'
  }
}

const proxy = {
  'dev-worker': devProxy,
  'dev-worker-local': devProxy,
  'dev-server': devProxy,
  'dev-server-test': devProxyTest,
  'dev-production': devFrontProxy,
  'dev-bold': devBoldProxy,
  'dev-huly': devHulyProxy
}

/**
 * @type {Configuration}
 */
module.exports = [
  {
    mode: dev ? 'development' : mode,
    entry: {
      serviceWorker: '@hcengineering/notification/src/serviceWorker.ts'
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /(node_modules|\.webpack)/,
          use: {
            loader: 'esbuild-loader',
            options: {
              target: 'es2021',
              keepNames: true,
              minify: prod,
              sourcemap: !prod
            }
          }
        }
      ]
    },
    output: {
      path: __dirname + '/dist',
      filename: '[name].js',
      chunkFilename: '[name].js',
      publicPath: '/',
      pathinfo: false
    },
    resolve: {
      extensions: ['.ts', '.js'],
      conditionNames: ['svelte', 'browser', 'import']
    }
  },
  {
    cache: useCache
      ? {
          type: 'filesystem',
          allowCollectingMemory: true,
          // servone: default keeps 10 compilations in memory; 1 cuts dev-server growth across rebuilds.
          maxMemoryGenerations: 1,
          cacheLocation: path.resolve(__dirname, '.build_dev')
        }
      : undefined,
    experiments:
      !prod && process.env.SERVONE_LAZY === '1'
        ? {
            lazyCompilation: {
              imports: true,
              entries: false,
              test:
                process.env.SERVONE_EAGER === '0'
                  ? undefined
                  : (module) => {
                      const eager = new RegExp(
                        process.env.SERVONE_EAGER ?? '((workbench|view|tracker)-resources|-assets|[\\\\/]lang[\\\\/])'
                      )
                      return !eager.test(module.nameForCondition() ?? '')
                    }
            }
          }
        : undefined,
    entry: {
      bundle: [
        // servone: SVELTE_TRACE=1 makes `effect_update_depth_exceeded` name the offending component.
        ...(dev && process.env.SVELTE_TRACE === '1' ? ['svelte/internal/flags/tracing'] : []),
        '@hcengineering/theme/styles/global.scss',
        '@servone/theme/styles/index.css',
        ...(dev ? ['./src/main-dev.ts'] : ['./src/main.ts'])
      ]
    },
    ignoreWarnings: [
      {
        message: /a11y-/
      },
      /warning from compiler/,
      (warning) => true
    ],
    resolve: {
      symlinks: true,
      alias: {
        // servone: Svelte 5 ships no `src/runtime`; let the package `exports` map resolve `svelte`.
        // servone: bare `@hcengineering/ui` -> shadcn skin; deep `@hcengineering/ui/src/...` paths still reach the original.
        '@hcengineering/ui$': path.resolve(__dirname, '../../packages/servone-ui/src/index.ts'),
        // servone: shadcn-svelte CLI output imports `$lib/...`.
        $lib: path.resolve(__dirname, '../../packages/servone-ui/src/lib'),
        // servone: side-effect import of a type-only shim; nothing to load at runtime.
        '@hcengineering/platform-rig/profiles/ui/svelte': false
      },
      // servone: shadcn-svelte CLI files use extension-ful TS imports (`./button.svelte`, `$lib/utils.js`).
      extensionAlias: { '.js': ['.ts', '.js'] },
      fallback: {
        crypto: false
      },
      extensions: ['.mjs', '.js', '.svelte', '.ts'],
      mainFields: ['svelte', 'browser', 'module', 'main'],
      // servone: Svelte 5 picks its DEV/prod runtime via `esm-env` export conditions.
      conditionNames: ['svelte', 'browser', 'import', ...(prod ? ['production'] : ['development'])]
    },
    output: {
      path: __dirname + '/dist',
      filename: '[name].[contenthash].js',
      chunkFilename: '[name].[contenthash].js',
      publicPath: '/',
      pathinfo: false
    },
    optimization: prod
      ? {
          minimize: true,
          splitChunks: {
            chunks: 'all'
          }
        }
      : {
          minimize: false,
          mangleExports: false,
          usedExports: false,
          splitChunks: {
            chunks: 'all'
          }
        },
    module: {
      rules: [
        {
          test: /\.m?js$/,
          resolve: {
            fullySpecified: false
          }
        },
        {
          test: /\.ts?$/,
          loader: 'esbuild-loader',
          options: {
            target: 'es2021',
            keepNames: true,
            minify: prod,
            sourcemap: prod || devSourceMaps
          },
          exclude: /node_modules/
        },
        {
          // servone: svelte-loader's emitted `X.svelte.0.css` resolves to the .svelte file, which @xyflow/svelte's
          // `"sideEffects": ["*.css"]` misses, so webpack dropped every component style.
          test: /[\\/]@xyflow[\\/]svelte[\\/].*\.svelte\.\d+\.css$/,
          sideEffects: true
        },
        {
          // servone: rune modules (bits-ui, svelte-toolbelt, @servone/ui) must go through svelte.compileModule.
          test: /\.svelte\.(js|ts)$/,
          use: [
            {
              loader: 'svelte-loader',
              options: { compilerOptions: { dev: !prod } }
            }
          ]
        },
        {
          test: /\.svelte$/,
          use: [
            {
              loader: 'svelte-loader',
              options: {
                compilerOptions: {
                  dev: !prod,
                  // servone: keeps `new Component({ target })` working for upstream call sites (ui Root, text-editor node views).
                  compatibility: { componentApi: 4 }
                },
                emitCss: true,
                // servone: devServer.hot is off, so the HMR wrapper would be dead code.
                hotReload: false,
                preprocess: require('svelte-preprocess')({
                  postcss: true,
                  sourceMap: prod || devSourceMaps,
                  scss: {
                    implementation: sass
                  },
                  // servone: verbatim imports keep `import { store }` used only as `$store`; explicit target stops TS
                  // downleveling object rest in node_modules .svelte (bits-ui), which breaks `$bindable()` in `$props()`.
                  typescript: {
                    compilerOptions: { verbatimModuleSyntax: true, target: 'ESNext' }
                  }
                }),
                hotOptions: {
                  // Prevent preserving local component state
                  preserveLocalState: true,

                  // If this string appears anywhere in your component's code, then local
                  // state won't be preserved, even when noPreserveState is false
                  noPreserveStateKey: '@!hmr',

                  // Prevent doing a full reload on next HMR update after fatal error
                  noReload: true,

                  // Try to recover after runtime errors in component init
                  optimistic: false,

                  // --- Advanced ---

                  // Prevent adding an HMR accept handler to components with
                  // accessors option to true, or to components with named exports
                  // (from <script context="module">). This have the effect of
                  // recreating the consumer of those components, instead of the
                  // component themselves, on HMR updates. This might be needed to
                  // reflect changes to accessors / named exports in the parents,
                  // depending on how you use them.
                  acceptAccessors: true,
                  acceptNamedExports: true
                }
              }
            }
          ]
        },
        {
          test: /\.css$/,
          use: [
            // prod ? MiniCssExtractPlugin.loader :
            'style-loader',
            { loader: 'css-loader', options: { sourceMap: !prod && devSourceMaps } },
            {
              loader: 'postcss-loader',
              // servone: config lookup starts at the processed file's dir, so servone-theme CSS missed this Tailwind config.
              options: { postcssOptions: { config: path.resolve(__dirname, 'postcss.config.js') } }
            }
          ]
        },

        {
          test: /\.scss$/,
          use: [
            // prod ? MiniCssExtractPlugin.loader :
            'style-loader',
            { loader: 'css-loader', options: { sourceMap: !prod && devSourceMaps } },
            'postcss-loader',
            {
              loader: "sass-loader",
              options: {
                api: "modern",
                implementation: sass
              }
            }
          ]
        },

        {
          test: /\.(ttf|otf|eot|woff|woff2)$/,
          use: {
            loader: 'file-loader',
            options: {
              name: 'fonts/[hash:base64:8].[ext]',
              esModule: false
            }
          }
        },
        {
          test: /\.(jpg|png|webp|heic|avif)$/,
          use: {
            loader: 'file-loader',
            options: {
              name: 'img/[contenthash].[ext]',
              esModule: false
            }
          }
        },
        {
          test: /\.(wav|ogg)$/,
          use: {
            loader: 'file-loader',
            options: {
              name: 'snd/[contenthash].[ext]',
              esModule: false
            }
          }
        },
        {
          test: /\.svg$/,
          use: [
            {
              loader: 'file-loader',
              options: {
                name: 'img/[contenthash].[ext]',
                esModule: false
              }
            },
            {
              loader: 'svgo-loader',
              options: {
                plugins: [
                  { name: 'removeHiddenElems', active: false }
                  // { removeHiddenElems: { displayNone: false } },
                  // { cleanupIDs: false },
                  // { removeTitle: true }
                ]
              }
            }
          ]
        }
      ]
    },
    mode,
    plugins: [
      ...servonePlugins(prod),
      ...(prod
        ? [
            new BundleAnalyzerPlugin({
              analyzerMode: 'static',
              openAnalyzer: false
            })
          ]
        : []),
      new HtmlWebpackPlugin({
        meta: {
          viewport: 'width=device-width, initial-scale=1.0'
        }
      }),
      ...(prod ? [new CompressionPlugin(), new CompressionPlugin({ algorithm: 'brotliCompress', filename: '[path][base].br' })] : []),
      // new MiniCssExtractPlugin({
      //   filename: '[name].[id][contenthash].css'
      // }),
      new Dotenv({ path: prod ? '.env-prod' : '.env' }),
      new DefinePlugin({
        'process.env.CLIENT_TYPE': JSON.stringify(process.env.CLIENT_TYPE),
        // servone: PostHog key and host for dev/prod/src/posthog.ts, set as front-image build args.
        'process.env.POSTHOG_KEY': JSON.stringify(process.env.POSTHOG_KEY),
        'process.env.POSTHOG_HOST': JSON.stringify(process.env.POSTHOG_HOST)
      }),
      ...(doValidate ? [new ForkTsCheckerWebpackPlugin()] : [])
    ],
    watchOptions: {
      // for some systems, watching many files can result in a lot of CPU or memory usage
      // https://webpack.js.org/configuration/watch/#watchoptionsignored
      // don't use this pattern, if you have a monorepo with linked packages
      ignored: [
        '**/node_modules',
        '**/.git',
        '**/common/temp',
        '**/.rush',
        '**/.rush/**',
        '**/rush-logs',
        '**/lib/*.js',
        '**/lib/*.js.map',
        '**/types/*.d.ts',
        '**/.git/objects/**',
        '**/node_modules/**',
        '**/desktop/deploy/**',
        '**/dist/**',
        '**/.validate/**',
        '**/.format/**',
        '**/.build_dev/**'
      ],
      aggregateTimeout: 100,
      followSymlinks: false,
      // servone: polling (for Docker/NFS) took 54% of the dev-server main thread idle on macOS; off = fsevents.
      poll: process.env.SERVONE_WATCH_POLL === '1' ? 250 : false
    },
    devtool: prod
      ? 'source-map'
      : process.env.SERVONE_FULL_SOURCEMAP === '1'
        ? 'eval-source-map'
        : process.env.SERVONE_SOURCEMAP === '1'
          ? 'eval-cheap-module-source-map'
          : 'eval',
    devServer: {
      static: {
        directory: path.resolve(__dirname, 'public'),
        publicPath: '/',
        serveIndex: true,
        watch: true
      },
      historyApiFallback: {
        disableDotRule: true
      },
      host: '0.0.0.0',
      allowedHosts: 'all',
      hot: false,
      liveReload: process.env.SERVONE_LIVERELOAD !== '0',
      client: {
        logging: 'info',
        overlay: {
          errors: true,
          warnings: false,
          runtimeErrors: (error) => {
            if (error.message.includes('ResizeObserver')) {
              return false
            }
            return true
          }
        },
        progress: false
      },
      setupMiddlewares: servoneSetupMiddlewares,
      proxy: proxy[clientType]
    }
  }
]
