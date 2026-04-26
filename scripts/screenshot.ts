import { chromium } from 'playwright';
import path from 'path';

const BASE_URL = process.argv[2] || 'https://ovberlin.site';
const OUT_DIR = path.join(__dirname, '../docs');
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

async function wait(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log(`Capturing screenshots from ${BASE_URL}...`);
  const browser = await chromium.launch();

  // ── Desktop context ──────────────────────────────────────────────────────
  const desktop = await browser.newContext({ viewport: DESKTOP, colorScheme: 'dark' });
  const page = await desktop.newPage();

  // 1 — Homepage: movie listing
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.ui-card', { timeout: 15000 });
  await wait(500);
  await page.screenshot({ path: `${OUT_DIR}/screenshot1.png` });
  console.log('✓ screenshot1.png — movie listing');

  // 4 — Search results
  await page.fill('input[type="text"]', 'drama');
  await wait(800);
  await page.screenshot({ path: `${OUT_DIR}/screenshot4.png` });
  console.log('✓ screenshot4.png — search results');

  // Navigate to first movie detail page
  await page.fill('input[type="text"]', '');
  await wait(400);
  const firstCard = page.locator('a[href^="/movie/"]').first();
  const href = await firstCard.getAttribute('href');

  // 3 — Detail page: grid view, scrolled to showtimes
  await page.goto(`${BASE_URL}${href}`, { waitUntil: 'networkidle' });
  await wait(600);
  const gridBtn = page.getByTitle('Grid view');
  await gridBtn.click();
  await wait(400);
  await page.locator('table').first().scrollIntoViewIfNeeded();
  await wait(300);
  await page.screenshot({ path: `${OUT_DIR}/screenshot3.png` });
  console.log('✓ screenshot3.png — detail grid view');

  await desktop.close();

  // ── Mobile context ───────────────────────────────────────────────────────
  const mobile = await browser.newContext({ viewport: MOBILE, colorScheme: 'dark' });
  const mpage = await mobile.newPage();

  // 2 — Detail page stacked view at mobile size
  await mpage.goto(`${BASE_URL}${href}`, { waitUntil: 'networkidle' });
  await wait(600);
  await mpage.screenshot({ path: `${OUT_DIR}/screenshot2.png` });
  console.log('✓ screenshot2.png — detail stacked view (mobile)');

  await mobile.close();
  await browser.close();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
