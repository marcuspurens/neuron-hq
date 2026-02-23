import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('invariants.md lint', () => {
  const content = readFileSync(join(process.cwd(), 'memory/invariants.md'), 'utf-8')

  it('file exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(0)
  })

  it('contains at least 3 INV entries', () => {
    const matches = content.match(/\[INV-/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(3)
  })

  it('every INV entry has correct format [INV-NNN] with 3 digits', () => {
    const entries = content.match(/\[INV-\d+\]/g)
    expect(entries).not.toBeNull()
    for (const entry of entries!) {
      expect(entry).toMatch(/^\[INV-\d{3}\]$/)
    }
  })

  it('every INV entry has a Vaktas av field', () => {
    const sections = content
      .split(/\n(?=## \[INV-)/)
      .filter(s => s.startsWith('## [INV-'))
    expect(sections.length).toBeGreaterThanOrEqual(3)
    for (const section of sections) {
      const title = section.split('\n')[0].trim()
      expect(section, `Section "${title}" missing **Vaktas av:**`).toMatch(/\*\*Vaktas av:\*\*/)
    }
  })
})
