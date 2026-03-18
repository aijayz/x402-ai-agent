import { renderMermaidASCII } from 'beautiful-mermaid'
import fs from 'fs'
import path from 'path'

const diagrams = [
  'payment-gap.mmd',
  'http-flow.mmd',
  'architecture.mmd',
  'payment-flow.mmd'
]

const diagramsDir = './slides/diagrams'

for (const diagram of diagrams) {
  const inputPath = path.join(diagramsDir, diagram)
  const mmdContent = fs.readFileSync(inputPath, 'utf-8')

  try {
    const ascii = renderMermaidASCII(mmdContent)
    console.log(`\n=== ${diagram} ===\n`)
    console.log(ascii)
  } catch (error) {
    console.error(`Error rendering ${diagram}:`, error.message)
  }
}