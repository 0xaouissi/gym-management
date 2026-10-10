/**
 * Obfuscates the electron-vite production bundle in-place (out/).
 * Runs between "electron-vite build" and "electron-builder" — see package.json script "package:protected".
 */
const fs = require('node:fs')
const path = require('node:path')
const JavaScriptObfuscator = require('javascript-obfuscator')

const root = path.resolve(__dirname, '..')

const buckets = [
  { dir: path.join(root, 'out', 'main'), target: 'node' },
  { dir: path.join(root, 'out', 'preload'), target: 'node' },
  { dir: path.join(root, 'out', 'renderer'), target: 'browser' }
]

const baseOptions = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false,
  selfDefending: false,
  debugProtection: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  simplify: true,
  transformObjectKeys: false,
  splitStrings: false,
  sourceMap: false,
  unicodeEscapeSequence: false
}

function collectJsFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectJsFiles(full))
    else if (/\.(cjs|mjs|js)$/.test(entry.name)) files.push(full)
  }
  return files
}

function detectSourceType(file, code) {
  if (file.endsWith('.mjs')) return 'module'
  return /^\s*(?:import\s|import\(|export\s|export\{|export\*)/m.test(code) ? 'module' : 'script'
}

const kb = (n) => (n / 1024).toFixed(1) + ' KB'

let totalBefore = 0
let totalAfter = 0
let count = 0

for (const bucket of buckets) {
  if (!fs.existsSync(bucket.dir)) {
    console.error(`Missing build output: ${path.relative(root, bucket.dir)} — run "npm run build" first.`)
    process.exit(1)
  }
  for (const file of collectJsFiles(bucket.dir)) {
    const code = fs.readFileSync(file, 'utf8').replace(/\/\/# sourceMappingURL=.*$/gm, '')
    const sourceType = detectSourceType(file, code)
    let obfuscated
    try {
      obfuscated = JavaScriptObfuscator.obfuscate(code, {
        ...baseOptions,
        sourceType,
        target: bucket.target
      }).getObfuscatedCode()
    } catch (error) {
      console.error(`Obfuscation failed for ${path.relative(root, file)}: ${error.message}`)
      process.exit(1)
    }
    fs.writeFileSync(file, obfuscated)
    totalBefore += Buffer.byteLength(code)
    totalAfter += Buffer.byteLength(obfuscated)
    count += 1
    console.log(`  ${path.relative(root, file)}  ${kb(Buffer.byteLength(code))} -> ${kb(Buffer.byteLength(obfuscated))}`)
  }
}

console.log(`Obfuscated ${count} file(s): ${kb(totalBefore)} -> ${kb(totalAfter)} total.`)
