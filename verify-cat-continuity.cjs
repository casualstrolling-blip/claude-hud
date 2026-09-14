const { chromium } = require('C:/Users/aksha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.join(__dirname, 'online-hud');
const files = new Set(['index.html', 'hud.css', 'hud.js', 'cat-sit.png', 'cat-lie.png', 'cat-rest.webp', 'cat-walk.webp', 'cat-walk-sit.webp']);
const server = http.createServer((req, res) => {
  const name = req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0].slice(1);
  if (!files.has(name)) { res.writeHead(404); return res.end(); }
  const type = name.endsWith('.webp') ? 'image/webp' : name.endsWith('.png') ? 'image/png' : name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'application/javascript' : 'text/html';
  res.writeHead(200, {'Content-Type': type}); res.end(fs.readFileSync(path.join(root, name)));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 393, height: 852}});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const values = [0, 0, .4, .2]; Math.random = () => values.length ? values.shift() : .5;
      const nativeTimeout = window.setTimeout;
      window.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, delay >= 20000 ? 2500 : delay, ...args);
    });
    await page.route('**/api/*', route => route.fulfill({contentType:'application/json',body:JSON.stringify({sessionUtilization:.47,weeklyUtilization:.62})}));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => document.querySelector('#cat-overlay').dataset.phase === 'still');
    const walkStart = await page.evaluate(() => Number(document.querySelector('#cat-still').dataset.catX));
    const before = await page.evaluate(() => ({
      cat: {left:Number(document.querySelector('#cat-still').dataset.catX),height:document.querySelector('#cat-still').getBoundingClientRect().height},
      overlayZ: getComputedStyle(document.querySelector('#cat-still')).zIndex,
      pointerEvents: getComputedStyle(document.querySelector('#cat-still')).pointerEvents,
      scrollHeight: document.documentElement.scrollHeight
    }));
    assert.equal(before.scrollHeight, 852);
    assert.equal(before.overlayZ, '2');
    assert.equal(before.pointerEvents, 'none');
    assert.ok(before.cat.height > 280 && before.cat.height < 315, 'cat should be 75% of prior size');
    const catRect = await page.locator('#cat-still').boundingBox();
    await page.mouse.click(catRect.x + catRect.width / 2, catRect.y + catRect.height / 2);
    await page.waitForFunction(() => document.querySelector('#cat-overlay').dataset.phase === 'motion', {timeout:5000});
    assert.equal(await page.locator('#cat-overlay').getAttribute('data-phase'), 'motion', 'tapping the resting cat should start movement');
    await page.evaluate(() => window.hudScreenOff());
    await page.evaluate(() => window.hudScreenOn());
    await page.waitForFunction(() => document.querySelector('#cat-overlay').dataset.phase === 'still');
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#cat-motion').count(), 0);
    await page.screenshot({path: path.join(__dirname, 'cat-smaller-front.png')});
    const topBefore = crypto.createHash('sha256').update(await page.screenshot({clip:{x:0,y:0,width:393,height:450}})).digest('hex');
    await page.waitForFunction(() => document.querySelector('#cat-overlay').dataset.phase === 'motion', {timeout:30000});
    await page.waitForTimeout(500);
    const clip = {x:0,y:600,width:393,height:240};
    const atStart = crypto.createHash('sha256').update(await page.screenshot({clip})).digest('hex');
    await page.waitForTimeout(2600);
    const mid = crypto.createHash('sha256').update(await page.screenshot({clip})).digest('hex');
    await page.screenshot({path: path.join(__dirname, 'cat-smaller-walking.png')});
    assert.notEqual(mid, atStart, 'the rendered cat frames should advance');
    await page.waitForFunction(() => document.querySelector('#cat-overlay').dataset.phase === 'still', {timeout:15000});
    const after = await page.evaluate(() => ({
      cat: {left:Number(document.querySelector('#cat-still').dataset.catX),height:document.querySelector('#cat-still').getBoundingClientRect().height},
      pose: document.querySelector('#cat-overlay').dataset.pose,
      scrollHeight: document.documentElement.scrollHeight
    }));
    assert.ok(Math.abs(after.cat.left - walkStart) > 20, 'the resting cat should remain at its walked-to position');
    assert.equal(after.scrollHeight, 852);
    await page.waitForTimeout(1000);
    await page.screenshot({path: path.join(__dirname, 'cat-smaller-after-walk.png')});
    const topAfter = crypto.createHash('sha256').update(await page.screenshot({clip:{x:0,y:0,width:393,height:450}})).digest('hex');
    assert.equal(topAfter, topBefore, 'the HUD text above the cat must remain unchanged after walking');
    assert.equal(await page.locator('#cat-motion').count(), 0, 'finished video must be detached to release its compositor');
    await page.locator('[data-select="claude"]').click({force:true});
    assert.equal(await page.locator('body').getAttribute('data-provider'), 'claude', 'cat must not intercept controls');
    await page.evaluate(() => window.hudScreenOff());
    assert.equal(await page.locator('#cat-overlay').getAttribute('data-phase'), 'off');
    assert.equal(await page.locator('#cat-motion').count(), 0);
    for (const [width,height] of [[360,640],[844,390],[1280,720]]) {
      await page.setViewportSize({width,height});
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), height);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({before,atStart,mid,after,errors},null,2));
  } finally {await browser.close();server.close();}
})().catch(error => {console.error(error);server.close();process.exitCode = 1;});
