const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  // Navigate to local index
  await page.goto(`file://${path.resolve(__dirname, 'viewer/index.html')}`);

  // Wait for load
  await page.waitForTimeout(1000);

  // Check for file input
  const fileInput = await page.$('#accdb-file-input');
  if (fileInput) {
      await fileInput.setInputFiles('BUD-16-SYS-009-26-03-26.ACCDB');
      await page.waitForTimeout(4000); // Give it time to parse the huge file

      // Check summary tab
      const summaryTabBtn = page.locator('button.tab-btn:has-text("SUMMARY")');
      if (await summaryTabBtn.count() > 0) {
        await summaryTabBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'verification/summary_tab_computed.png', fullPage: true });
        console.log('Saved verification/summary_tab_computed.png');
      }

      // Check stress tab
      const stressTabBtn = page.locator('button.tab-btn:has-text("STRESS")');
      if (await stressTabBtn.count() > 0) {
        await stressTabBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'verification/stress_tab_computed.png', fullPage: true });
        console.log('Saved verification/stress_tab_computed.png');
      }

      // Check debug tab
      const debugTabBtn = page.locator('button.tab-btn:has-text("DEBUG")');
      if (await debugTabBtn.count() > 0) {
        await debugTabBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'verification/debug_tab_computed.png', fullPage: true });
        console.log('Saved verification/debug_tab_computed.png');
      }
  }

  await browser.close();
})();
