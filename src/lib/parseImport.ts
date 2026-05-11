import JSZip from 'jszip'
import Papa from 'papaparse'

export interface ExtractedCandidate {
  filename: string
  resumeText: string
}

async function parsePdf(buffer: Buffer): Promise<string> {
  // Use the internal module path to avoid pdf-parse loading its test files in Next.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse')
  const data = await pdfParse(buffer)
  return data.text as string
}

function parseCsv(content: string): ExtractedCandidate[] {
  const result = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true })
  const rows = result.data
  if (!rows.length) return []

  const headers = Object.keys(rows[0]).map(h => h.toLowerCase())
  const textKey = Object.keys(rows[0]).find((_, i) =>
    headers[i].includes('resume') || headers[i].includes('text') || headers[i].includes('cover')
  )
  const nameKey = Object.keys(rows[0]).find((_, i) =>
    headers[i] === 'name' || headers[i].includes('full name')
  )

  if (!textKey) {
    // No resume column — treat full row as a single blob
    return [{ filename: 'candidates.csv', resumeText: content }]
  }

  return rows
    .map((row, i) => ({
      filename: (nameKey && row[nameKey]) ? row[nameKey] : `candidate_${i + 1}`,
      resumeText: row[textKey] || '',
    }))
    .filter(c => c.resumeText.trim().length > 50)
}

export async function parseImportFile(buffer: Buffer, filename: string): Promise<ExtractedCandidate[]> {
  const ext = filename.toLowerCase().split('.').pop() || ''

  switch (ext) {
    case 'pdf': {
      const text = await parsePdf(buffer)
      return text.trim().length >= 50 ? [{ filename, resumeText: text }] : []
    }
    case 'zip': {
      const zip = await JSZip.loadAsync(buffer)
      const candidates: ExtractedCandidate[] = []
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue
        const entryExt = path.toLowerCase().split('.').pop() || ''
        const content = await entry.async('nodebuffer')
        if (entryExt === 'pdf') {
          try {
            const text = await parsePdf(content)
            if (text.trim().length >= 50) candidates.push({ filename: path, resumeText: text })
          } catch { /* skip unparseable PDFs */ }
        } else if (entryExt === 'txt') {
          const text = content.toString('utf-8')
          if (text.trim().length >= 50) candidates.push({ filename: path, resumeText: text })
        }
      }
      return candidates
    }
    case 'csv':
    case 'xlsx':
      return parseCsv(buffer.toString('utf-8'))
    case 'txt':
      return [{ filename, resumeText: buffer.toString('utf-8') }]
    default:
      throw new Error(`Unsupported file type: .${ext}`)
  }
}

export function extractNameFromText(text: string, fallback: string): string {
  const nameMatch = text.match(/^name[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/im)
  if (nameMatch) return nameMatch[1].trim()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (const line of lines.slice(0, 6)) {
    if (/^[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}$/.test(line)) return line
  }
  return fallback.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
}

export function extractEmailFromText(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  return match ? match[0] : null
}
