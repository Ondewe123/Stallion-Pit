#!/usr/bin/env node
/**
 * Stallion Pit UI capture harness.
 *
 * Requires Playwright to be available in the working environment:
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *
 * Auth options:
 * 1) UI_STORAGE_STATE=/path/to/storage-state.json
 * 2) UI_AUDIT_EMAIL + UI_AUDIT_PASSWORD
 *
 * Optional:
 *   UI_BASE_URL=http://127.0.0.1:4173
 *   UI_ROUTE=/
 *   UI_CAPTURE_DIR=artifacts/ui
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const baseURL = process.env.UI_BASE_URL || 'http://127.0.0.1:4173'
const route = process.env.UI_ROUTE || '/'
const outputDir = process.env.UI_CAPTURE_DIR || 'artifacts/ui'
const storageState = process.env.UI_STORAGE_STATE
const email = process.env.UI_AUDIT_EMAIL
const password = process.env.UI_AUDIT_PASSWORD

const viewports = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'tablet-1024x768', width: 1024, height: 768 },
  { name: 'mobile-390x844', width: 390, height: 844 },
]

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error([
    'Playwright is not available in this working environment.',
    'Install it without changing the project lockfile:',
    '  npm install --no-save playwright',
    '  npx playwright install chromium',
  ].join('\n'))
  process.exit(1)
}

await fs.mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })

async function ensureAuthenticated(page) {
  await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'networkidle' })

  if (!page.url().includes('/login')) return

  if (!email || !password) {
    throw new Error(
      'Dashboard redirected to /login. Provide UI_STORAGE_STATE or UI_AUDIT_EMAIL + UI_AUDIT_PASSWORD.'
    )
  }

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
  await page.waitForLoadState('networkidle')
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      ...(storageState ? { storageState } : {}),
    })

    const page = await context.newPage()
    await ensureAuthenticated(page)

    const target = new URL(route, baseURL).toString()
    if (page.url() !== target) {
      await page.goto(target, { waitUntil: 'networkidle' })
    }

    await page.screenshot({
      path: path.join(outputDir, `${viewport.name}.png`),
      fullPage: true,
    })

    const metrics = await page.evaluate(() => {
      const body = document.body
      const main = document.querySelector('.main-content')
      const attention = document.querySelector('.dashboard-priority-section')
      const titlebar = document.querySelector('.dashboard-titlebar')
      const vehicleBar = document.querySelector('.dashboard-vehicle-bar')

      const rect = el => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          height: Math.round(r.height),
          width: Math.round(r.width),
        }
      }

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        documentHeight: Math.round(body.scrollHeight),
        mainScrollHeight: main ? Math.round(main.scrollHeight) : null,
        titlebar: rect(titlebar),
        vehicleBar: rect(vehicleBar),
        attention: rect(attention),
        visibleRows: [...document.querySelectorAll('.dashboard-table tbody tr')]
          .filter(row => {
            const r = row.getBoundingClientRect()
            return r.top < window.innerHeight && r.bottom > 0
          }).length,
      }
    })

    await fs.writeFile(
      path.join(outputDir, `${viewport.name}.json`),
      JSON.stringify(metrics, null, 2)
    )

    console.log(`captured ${viewport.name}`)
    await context.close()
  }
} finally {
  await browser.close()
}
