import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('npx init writes the shared API-key setup', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'bison-sdk-'))
  try {
    writeFileSync(join(cwd, 'package.json'), '{"dependencies":{"bison-jib-sdk":"^1.0.0"}}')
    const result = Bun.spawnSync(['node', resolve('bin/bison-jib-sdk.js'), 'init'], {
      cwd,
      env: { ...process.env, BISON_API_KEY: 'public_test_key' },
    })
    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(cwd, 'bison.setup.mjs'), 'utf8')).toBe(
      "import { setupBison } from 'bison-jib-sdk'\n\nsetupBison(\"public_test_key\")\nif (typeof customElements !== 'undefined') {\n  const { defineBisonComponents } = await import('bison-jib-sdk/components')\n  defineBisonComponents()\n}\n",
    )
  } finally {
    rmSync(cwd, { recursive: true })
  }
})
