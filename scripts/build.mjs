import { build } from 'esbuild'

await build({
  entryPoints: ['web/src/app.js'],
  bundle: true,
  format: 'esm',
  outfile: 'web/dist/app.js',
  sourcemap: true,
  alias: {
    'node:zlib': './web/src/vendor/zlib-stub.js',
  },
  minify: process.argv.includes('--minify'),
  logLevel: 'info',
})
