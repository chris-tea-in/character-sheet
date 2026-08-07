import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '../..')
const outputDirectory = resolve(projectRoot, 'public/data')
const requiredCatalogs = [
  'races',
  'spells',
  'classes',
  'subclasses',
  'feats',
  'backgrounds',
  'equipment',
  'class-features',
]

let backupDirectory: string | undefined

beforeEach(() => {
  if (!existsSync(outputDirectory)) return

  backupDirectory = mkdtempSync(join(tmpdir(), 'dnd-character-sheet-public-data-'))
  renameSync(outputDirectory, join(backupDirectory, 'data'))
})

afterEach(() => {
  rmSync(outputDirectory, { recursive: true, force: true })
  if (backupDirectory) {
    renameSync(join(backupDirectory, 'data'), outputDirectory)
    rmSync(backupDirectory, { recursive: true, force: true })
    backupDirectory = undefined
  }
})

describe('PUBLIC_BUILD_MODE', () => {
  it('generates a minimal catalog without private source data', () => {
    execFileSync(process.execPath, ['scripts/build-data.js'], {
      cwd: projectRoot,
      env: { ...process.env, PUBLIC_BUILD_MODE: '1' },
      stdio: 'pipe',
    })

    for (const catalog of requiredCatalogs) {
      const output = resolve(outputDirectory, `${catalog}.json`)
      expect(existsSync(output)).toBe(true)
      expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({})
    }
  })
})
