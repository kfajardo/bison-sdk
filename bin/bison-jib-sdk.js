#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const [, , command, ...args] = process.argv

if (command !== 'init') {
  console.error('Usage: BISON_API_KEY=... npx bison-jib-sdk init')
  process.exitCode = 1
} else {
  const flag = args.indexOf('--api-key')
  const apiKey = (flag >= 0 ? args[flag + 1] : process.env.BISON_API_KEY)?.trim()
  if (!apiKey) {
    console.error('BISON_API_KEY or --api-key is required')
    process.exitCode = 1
  } else {
    const packagePath = resolve('package.json')
    const outputPath = resolve('bison.setup.mjs')
    if (!existsSync(packagePath)) {
      console.error('Run this command from a JavaScript project containing package.json')
      process.exitCode = 1
    } else if (existsSync(outputPath)) {
      console.error('bison.setup.mjs already exists; remove it before re-running init')
      process.exitCode = 1
    } else {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
      const installed = ['dependencies', 'devDependencies', 'optionalDependencies']
        .some((group) => pkg[group]?.['bison-jib-sdk'])
      if (!installed) {
        const result = spawnSync('npm', ['install', 'bison-jib-sdk'], { stdio: 'inherit' })
        if (result.status !== 0) process.exit(result.status ?? 1)
      }
      writeFileSync(outputPath, `import { setupBison } from 'bison-jib-sdk'\n\nsetupBison(${JSON.stringify(apiKey)})\nif (typeof customElements !== 'undefined') {\n  const { defineBisonComponents } = await import('bison-jib-sdk/components')\n  defineBisonComponents()\n}\n`, { flag: 'wx', mode: 0o600 })
      console.log('Created bison.setup.mjs. Import it once before using the SDK or querying a Bison component.')
    }
  }
}
