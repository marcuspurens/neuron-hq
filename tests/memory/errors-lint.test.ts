import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('errors.md lint', () => {
  const content = readFileSync(join(process.cwd(), 'memory/errors.md'), 'utf-8')
  // Split on '## ' at start of line, skip the file header
  const sections = content
    .split(/\n(?=## )/)
    .filter(s => s.startsWith('## '))

  it('every section has a Status line', () => {
    for (const section of sections) {
      const title = section.split('\n')[0].replace('## ', '').trim()
      expect(section, `Section "${title}" missing **Status:**`).toMatch(/\*\*Status:\*\*/)
    }
  })

  it('no duplicate section titles', () => {
    const titles = sections.map(s => s.split('\n')[0].replace('## ', '').trim())
    const seen = new Set<string>()
    for (const title of titles) {
      expect(seen.has(title), `Duplicate section: "${title}"`).toBe(false)
      seen.add(title)
    }
  })

  it('no open warnings that mention the issue is already solved', () => {
    const openSections = sections.filter(s => /\*\*Status:\*\*\s*⚠️/.test(s))
    for (const section of openSections) {
      const title = section.split('\n')[0].replace('## ', '').trim()
      expect(
        section,
        `Section "${title}" is ⚠️ but solution text suggests it is already solved`
      ).not.toMatch(/redan löst|already (fixed|solved|resolved)/i)
    }
  })
})
