import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mergeIpcCsvFiles } from '../src/lib/ipc/csvMerge.js'

function arg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}

function fail(message) {
  console.error('\nX ' + message + '\n')
  process.exit(1)
}

const oldDiagrams = arg('--old-diagrams')
const oldParts = arg('--old-parts')
const newDiagrams = arg('--new-diagrams')
const newParts = arg('--new-parts')
const outDiagrams = arg('--out-diagrams')
const outParts = arg('--out-parts')

if (!oldDiagrams || !oldParts || !newDiagrams || !newParts || !outDiagrams || !outParts) {
  fail('Usage: node scripts/merge-ipc-csv.mjs --old-diagrams <csv> --old-parts <csv> --new-diagrams <csv> --new-parts <csv> --out-diagrams <csv> --out-parts <csv>')
}

for (const file of [oldDiagrams, oldParts, newDiagrams, newParts]) {
  if (!existsSync(file)) fail(`Missing input file: ${file}`)
}

const result = mergeIpcCsvFiles([
  {
    diagramsCsv: readFileSync(oldDiagrams, 'utf8'),
    partsCsv: readFileSync(oldParts, 'utf8'),
  },
  {
    diagramsCsv: readFileSync(newDiagrams, 'utf8'),
    partsCsv: readFileSync(newParts, 'utf8'),
  },
])

mkdirSync(dirname(outDiagrams), { recursive: true })
mkdirSync(dirname(outParts), { recursive: true })
writeFileSync(outDiagrams, result.diagramsCsv)
writeFileSync(outParts, result.partsCsv)

console.log('Merged IPC CSV files')
console.log(`Input diagrams: ${result.summary.inputDiagramRows}`)
console.log(`Output diagrams: ${result.summary.outputDiagramRows}`)
console.log(`Input parts: ${result.summary.inputPartRows}`)
console.log(`Output parts: ${result.summary.outputPartRows}`)
