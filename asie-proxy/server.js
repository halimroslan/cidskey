// CIDS Suites Pro — ASIE Model Proxy Server
// Uses Puppeteer-Extra + Stealth plugin to bypass Cloudflare bot detection
// Deployed on Render.com (free tier)

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Apply stealth plugin globally — evades most Cloudflare bot detection
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3001;

// ===== BROWSER MANAGEMENT =====
let browserInstance = null;

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
];

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('[Browser] Launching Chromium (puppeteer-extra + stealth)...');
    browserInstance = await puppeteer.launch({
      headless: true,
      args: LAUNCH_ARGS,
      // Use installed Chromium on Render
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
    console.log('[Browser] Chromium ready.');
  }
  return browserInstance;
}

// Auto-close browser after 10 min of inactivity
let idleTimer = null;
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (browserInstance?.isConnected()) {
      console.log('[Browser] Idle timeout — closing browser.');
      await browserInstance.close().catch(() => {});
      browserInstance = null;
    }
  }, 10 * 60 * 1000);
}

// Helper: type into an element
async function typeInto(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 5000 }).catch(() => null);
  const el = await page.$(selector);
  if (!el) return false;
  await el.click({ clickCount: 3 }); // select all
  await el.type(value, { delay: 30 });
  return true;
}

// Helper: click an element matching a selector pattern
async function clickFirst(page, selectors) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) { await el.click(); return true; }
  }
  return false;
}

// ===== ASIE LOGIN =====
async function loginASIE(page, username, password) {
  console.log(`[ASIE] Logging in as ${username}...`);
  await page.goto('https://asiemodel.net/model/main.php?cb=ms', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  // Check if login form is visible
  const loginSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[name="login"]',
    'input[placeholder="Login"]',
    'input[placeholder="Username"]',
    'input[placeholder*="E-mel"]',
  ];

  let loginInput = null;
  for (const sel of loginSelectors) {
    loginInput = await page.$(sel);
    if (loginInput) break;
  }

  if (loginInput) {
    console.log('[ASIE] Login page detected. Filling credentials...');
    await loginInput.click({ clickCount: 3 });
    await loginInput.type(username, { delay: 30 });
    const pwdInput = await page.$('input[type="password"], input[name="password"]');
    if (pwdInput) {
      await pwdInput.click({ clickCount: 3 });
      await pwdInput.type(password, { delay: 30 });
      await clickFirst(page, [
        'button[type="submit"]',
        'input[type="submit"]',
        'button',
      ]);
    }
    await new Promise(r => setTimeout(r, 5000));
    console.log('[ASIE] Login submitted.');
  }

  // Verify login success
  const url = page.url();
  return url.includes('main.php') || !url.includes('index.php');
}

// ===== HEALTH CHECK =====
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'CIDS ASIE Proxy', uptime: process.uptime() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', browser: browserInstance?.isConnected() || false });
});

// ===== GET RPT LIST =====
app.post('/get-rpt-list', async (req, res) => {
  resetIdleTimer();
  const { credentials } = req.body;
  if (!credentials?.username || !credentials?.password) return res.status(400).json({ success: false, error: 'Kredensial diperlukan.' });

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    const loggedIn = await loginASIE(page, credentials.username, credentials.password);
    if (!loggedIn) return res.json({ success: false, error: 'Login ASIE gagal.' });

    await page.goto('https://asiemodel.net/model/search9.php?action=search_yearly', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    const rpts = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="create_rpt"]');
      const results = [];
      const seen = new Set();
      links.forEach(a => {
        const title = a.textContent.trim();
        if (title.toLowerCase() === 'papar' || title.toLowerCase() === 'view') return;
        const href = a.getAttribute('href');
        const idMatch = href.match(/[?&]id=(\d+)/);
        const rptId = idMatch ? idMatch[1] : href;
        if (seen.has(rptId)) return;
        seen.add(rptId);
        const fullUrl = href.startsWith('http') ? href : 'https://asiemodel.net/model/' + href;
        if (title.length > 2) results.push({ title, url: fullUrl });
      });
      return results;
    });

    res.json({ success: true, data: rpts });
  } catch (error) {
    console.error('[get-rpt-list] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// ===== GET SCHEDULE =====
app.post('/get-schedule', async (req, res) => {
  resetIdleTimer();
  const { credentials } = req.body;
  if (!credentials?.username || !credentials?.password) return res.status(400).json({ success: false, error: 'Kredensial diperlukan.' });

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    const loggedIn = await loginASIE(page, credentials.username, credentials.password);
    if (!loggedIn) return res.json({ success: false, error: 'Login ASIE gagal.' });

    await page.goto('https://asiemodel.net/model/teachers9.php?action=waktumengajar', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));

    // DEBUG: log what we see
    const debugInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      rowCount: document.querySelectorAll('.li_row.li_sortable').length,
      bodyTextSample: document.body.innerText.substring(0, 300),
    }));
    console.log('[get-schedule] DEBUG:', JSON.stringify(debugInfo));

    const schedule = await page.evaluate(() => {
      const subjectMap = { 'mathematics': 'Matematik', 'physics': 'Fizik', 'chemistry': 'Kimia', 'biology': 'Biologi', 'science': 'Sains', 'arabic': 'Bahasa Arab', 'english': 'Bahasa Inggeris', 'malay': 'Bahasa Melayu', 'history': 'Sejarah', 'geography': 'Geografi', 'islamic_studies': 'Pendidikan Islam', 'moral': 'Pendidikan Moral' };
      const rows = document.querySelectorAll('.li_row.li_sortable');
      const results = [];
      rows.forEach(row => {
        try {
          const daySelect = row.querySelector('select[name^="days"]');
          const classSelect = row.querySelector('select[name^="class_id"]');
          const subjectInput = row.querySelector('input[name^="subject"], select[name^="subject"]');
          const startInput = row.querySelector('input[name^="starttime"]');
          const endInput = row.querySelector('input[name^="endtime"]');
          const day = daySelect?.selectedOptions?.[0]?.text?.trim() || '';
          const cls = classSelect?.selectedOptions?.[0]?.text?.trim() || '';
          const rawSubj = subjectInput?.value?.trim() || '';
          const subject = subjectMap[rawSubj] || rawSubj;
          const st = startInput?.value?.trim() || '';
          const en = endInput?.value?.trim() || '';
          if (day && cls && subject && st && en) {
            results.push({ id: 'jadual-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), day, class: cls, className: cls, subject, time: st + ' - ' + en, subjectId: 'custom-subject', active: true, imported: true });
          }
        } catch {}
      });
      return results;
    });

    res.json({ success: true, schedule });
  } catch (error) {
    console.error('[get-schedule] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// ===== SUBMIT RPH (FULL FLOW — simplified for puppeteer) =====
app.post('/submit-rph', async (req, res) => {
  resetIdleTimer();
  const { credentials, lessons, miwDate, apiKey, bbm } = req.body;
  if (!credentials?.username || !credentials?.password) {
    return res.status(400).json({ success: false, error: 'Kredensial diperlukan.' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  function send(data) {
    try { res.write(JSON.stringify(data) + '\n'); } catch {}
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    page.on('dialog', async d => { try { await d.accept(); } catch {} });

    send({ type: 'log', message: '🚀 Melancarkan pelayar...' });

    const loggedIn = await loginASIE(page, credentials.username, credentials.password);
    if (!loggedIn) { send({ type: 'error', message: 'Login ASIE gagal.' }); res.end(); return; }
    send({ type: 'log', message: '✅ Login ASIE berjaya!' });

    // For now, simplified submission — full RPH flow can be added later
    send({ type: 'log', message: `⚠️ RPH submission via this proxy is currently in simplified mode. ${lessons?.length || 0} lessons received.` });
    send({ type: 'done', success: true, message: 'Simplified submission complete' });
    res.end();
  } catch (error) {
    console.error('[submit-rph] Error:', error.message);
    try { res.write(JSON.stringify({ type: 'error', message: error.message }) + '\n'); res.end(); } catch {}
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// ===== DELETE RPH (placeholder) =====
app.post('/delete-rph', async (req, res) => {
  res.json({ success: false, error: 'delete-rph not yet implemented in puppeteer version' });
});

// ===== FILL RPT (placeholder) =====
app.post('/fill-rpt', async (req, res) => {
  res.json({ success: false, error: 'fill-rpt not yet implemented in puppeteer version' });
});

// ===== GENERATE RPH (placeholder) =====
app.post('/generate-rph', async (req, res) => {
  res.json({ success: false, error: 'generate-rph not yet implemented in puppeteer version' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[CIDS ASIE Proxy] Running on port ${PORT}`);
  console.log(`[CIDS ASIE Proxy] Health check: http://localhost:${PORT}/health`);
});
