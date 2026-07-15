// Generate og-image.png (1200×630) from a branded HTML card.
import { chromium } from '@playwright/test';

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600&display=swap');
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#141414;font-family:Inter;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.glow{position:absolute;width:700px;height:500px;top:-15%;left:25%;background:radial-gradient(ellipse,rgba(201,168,76,0.10) 0%,transparent 65%)}
.wrap{text-align:center;position:relative;z-index:1}
h1{font-family:'Playfair Display';font-size:76px;color:#f0ede6;line-height:1.12}
h1 .gold{color:#C9A84C}
p{font-size:26px;color:#888880;margin-top:26px}
.brand{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:38px}
.brand span{font-family:'Playfair Display';font-size:30px;font-weight:700;color:#C9A84C}
.pill{display:inline-block;margin-top:34px;border:1.5px solid rgba(201,168,76,0.5);border-radius:30px;padding:12px 30px;color:#C9A84C;font-size:20px;font-weight:600}
svg{display:block}
</style></head><body>
<div class="glow"></div>
<div class="wrap">
  <div class="brand">
    <svg width="52" height="52" viewBox="0 0 40 40" fill="none">
      <line x1="20" y1="20" x2="20" y2="8" stroke="#C9A84C" stroke-width="1.3"/><line x1="20" y1="20" x2="31" y2="14" stroke="#C9A84C" stroke-width="1.3"/><line x1="20" y1="20" x2="31" y2="27" stroke="#C9A84C" stroke-width="1.3"/><line x1="20" y1="20" x2="20" y2="33" stroke="#C9A84C" stroke-width="1.3"/><line x1="20" y1="20" x2="9" y2="27" stroke="#C9A84C" stroke-width="1.3"/><line x1="20" y1="20" x2="9" y2="14" stroke="#C9A84C" stroke-width="1.3"/>
      <circle cx="20" cy="8" r="2.2" fill="#1e1e1e" stroke="#C9A84C" stroke-width="1.4"/><circle cx="31" cy="14" r="2.2" fill="#1e1e1e" stroke="#9a9890" stroke-width="1.4"/><circle cx="31" cy="27" r="2.2" fill="#1e1e1e" stroke="#C9A84C" stroke-width="1.4"/><circle cx="20" cy="33" r="2.2" fill="#1e1e1e" stroke="#9a9890" stroke-width="1.4"/><circle cx="9" cy="27" r="2.2" fill="#1e1e1e" stroke="#C9A84C" stroke-width="1.4"/><circle cx="9" cy="14" r="2.2" fill="#1e1e1e" stroke="#9a9890" stroke-width="1.4"/><circle cx="20" cy="20" r="3.2" fill="#C9A84C"/>
    </svg>
    <span>Skill Exchange</span>
  </div>
  <h1>Where AI builders<br><span class="gold">share their edge</span></h1>
  <p>The GitHub for AI skills — buy and sell reusable workflows that power real products</p>
  <div class="pill">Every skill ships with proof it works</div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: 'public/og-image.png' });
await browser.close();
console.log('public/og-image.png written');
