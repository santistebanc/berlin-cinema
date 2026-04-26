import { chromium } from 'playwright';
import path from 'path';

const BASE_URL = process.argv[2] || 'https://ovberlin.site';
const OUT_DIR = path.join(__dirname, '../docs');
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 600 };

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

  // Navigate to first movie detail page
  const firstCard = page.locator('main a[href^="/"]').first();
  const href = await firstCard.getAttribute('href');

  // 2 — Cinema popup with map (desktop)
  await page.goto(`${BASE_URL}${href}`, { waitUntil: 'networkidle' });
  await wait(600);
  const cinemaBtn = page.locator('tr button[title]').first();
  await cinemaBtn.scrollIntoViewIfNeeded();
  await wait(300);
  await cinemaBtn.click();
  await wait(2000); // wait for map iframe to load
  await page.screenshot({ path: `${OUT_DIR}/screenshot2.png` });
  console.log('✓ screenshot2.png — cinema popup with map');

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

  // 4 — Detail page stacked view at mobile size
  await mpage.goto(`${BASE_URL}${href}`, { waitUntil: 'networkidle' });
  await wait(600);
  await mpage.screenshot({ path: `${OUT_DIR}/screenshot4.png` });
  console.log('✓ screenshot4.png — detail stacked view (mobile)');

  // 5 — Search autocomplete (mobile)
  await mpage.goto(BASE_URL, { waitUntil: 'networkidle' });
  await mpage.waitForSelector('.ui-card', { timeout: 15000 });
  await wait(400);
  await mpage.fill('input[type="text"]', 'love');
  await wait(900);
  await mpage.screenshot({ path: `${OUT_DIR}/screenshot5.png` });
  console.log('✓ screenshot5.png — search autocomplete (mobile)');

  await mobile.close();
  await browser.close();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
