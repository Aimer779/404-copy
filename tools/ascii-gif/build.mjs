import { build } from 'esbuild'

await build({
  entryPoints: ['node_modules/gifuct-js/lib/index.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'vendor/gifuct.mjs',
  legalComments: 'none',
  banner: {
    js: '/* gifuct-js 2.1.2, Copyright (c) 2015 Matt Way, MIT. js-binary-schema-parser 2.0.3, MIT. Bundled for browser ESM. Rebuild: pnpm build */',
  },
})
