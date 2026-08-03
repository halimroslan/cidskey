// CIDS Suites Pro — ASIE Model Playwright Proxy Server
// Uses real Chromium browser to interact with asiemodel.net (bypasses Cloudflare)
// Deployed on Render.com (free tier)

const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3001;

// ===== BROWSER MANAGEMENT =====
let browserInstance = null;

// Stealth init script — runs in every new page BEFORE any other JS.
// Goal: hide Playwright/automation fingerprints from Cloudflare bot detection.
const STEALTH_INIT_SCRIPT = `
  // 1) Hide webdriver flag (default in headless Chromium is true)
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // 2) Patch navigator.permissions to look normal
  const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
  if (originalQuery) {
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  }

  // 3) Patch navigator.plugins so it doesn't look like a headless browser
  Object.defineProperty(navigator, 'plugins', {
    get: () => [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', length: 1 },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', length: 1 },
      { name: 'Native Client', filename: 'internal-nacl-plugin', length: 2 },
    ],
  });

  // 4) Patch navigator.languages
  Object.defineProperty(navigator, 'languages', { get: () => ['ms-MY', 'ms', 'en-US', 'en'] });

  // 5) Patch WebGL vendor/renderer to look like real Chrome
  const getParameter = WebGLRendering.prototype.getParameter;
  WebGLRendering.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return 'Intel Inc.';
    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
    return getParameter.call(this, parameter);
  };

  // 6) Chrome runtime object
  window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
`;

const STEALTH_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',  // hide navigator.webdriver
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
];

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('[Browser] Launching Chromium (stealth mode)...');
    browserInstance = await chromium.launch({
      headless: true,
      args: STEALTH_LAUNCH_ARGS,
    });
    console.log('[Browser] Chromium ready.');
  }
  return browserInstance;
}

// Apply stealth to every new page (called after context is created)
async function applyStealth(context) {
  await context.addInitScript(STEALTH_INIT_SCRIPT);
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

// ===== ASIE LOGIN =====
async function loginASIE(page, username, password) {
  console.log(`[ASIE] Logging in as ${username}...`);
  await page.goto('https://asiemodel.net/model/main.php?cb=ms', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check if login page appears
  const emailInput = page.locator('input[type="email"], input[name="email"], input[name="username"], input[name="login"], input[placeholder="Login"], input[placeholder="Username"]').first();
  
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('[ASIE] Login page detected. Filling credentials...');
    await emailInput.fill(username);
    const pwdInput = page.locator('input[type="password"], input[name="password"]').first();
    if (await pwdInput.isVisible()) {
      await pwdInput.fill(password);
      await page.locator('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Login")').first().click();
    }
    await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
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

  let context, page;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'ms-MY',
      timezoneId: 'Asia/Kuala_Lumpur',
    });
    await applyStealth(context);
    page = await context.newPage();

    const loggedIn = await loginASIE(page, credentials.username, credentials.password);
    if (!loggedIn) return res.json({ success: false, error: 'Login ASIE gagal.' });

    // Navigate to RPT search page
    await page.goto('https://asiemodel.net/model/search9.php?action=search_yearly', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Extract RPT links
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
    if (context) await context.close().catch(() => {});
  }
});

// ===== GET SCHEDULE =====
app.post('/get-schedule', async (req, res) => {
  resetIdleTimer();
  const { credentials } = req.body;
  if (!credentials?.username || !credentials?.password) return res.status(400).json({ success: false, error: 'Kredensial diperlukan.' });

  let context, page;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'ms-MY',
      timezoneId: 'Asia/Kuala_Lumpur',
    });
    await applyStealth(context);
    page = await context.newPage();

    const loggedIn = await loginASIE(page, credentials.username, credentials.password);
    if (!loggedIn) return res.json({ success: false, error: 'Login ASIE gagal.' });

    await page.goto('https://asiemodel.net/model/teachers9.php?action=waktumengajar', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

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
    if (context) await context.close().catch(() => {});
  }
});

// ===== SUBMIT RPH (FULL FLOW — mirrors APK's rph-submitter.js) =====
app.post('/submit-rph', async (req, res) => {
  resetIdleTimer();
  const { credentials, lessons, miwDate, apiKey, bbm } = req.body;
  if (!credentials?.username || !credentials?.password) return res.status(400).json({ success: false, error: 'Kredensial diperlukan.' });

  // SSE-like JSON streaming for progress
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  
  function send(data) {
    try { res.write(JSON.stringify(data) + '\n'); } catch {}
  }

  let context, page;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'ms-MY',
      timezoneId: 'Asia/Kuala_Lumpur',
    });
    await applyStealth(context);
    page = await context.newPage();

    // Handle dialogs globally
    page.on('dialog', async dialog => { try { await dialog.accept(); } catch {} });

    send({ type: 'log', message: '🚀 Melancarkan pelayar...' });

    const loggedIn = await loginASIE(page, credentials.username, credentials.password);
    if (!loggedIn) { send({ type: 'error', message: 'Login ASIE gagal.' }); res.end(); return; }
    send({ type: 'log', message: '✅ Login ASIE berjaya!' });

    for (let lessonIdx = 0; lessonIdx < lessons.length; lessonIdx++) {
      const lesson = lessons[lessonIdx];
      send({ type: 'log', message: `⏳ [${lessonIdx + 1}/${lessons.length}] Memproses ${lesson.subject_text || lesson.subject_id} - ${lesson.session_text || lesson.class_id}...` });

      try {
        // 1. Navigate to eRPH
        await page.goto('https://asiemodel.net/model/main.php?cb=ms', { waitUntil: 'domcontentloaded' });
        await page.getByRole('link', { name: 'eRPH' }).click();
        await page.getByRole('link', { name: 'Buka Rekod' }).click();
        await page.waitForTimeout(1500);

        // 2. Select Class Level
        const classOptions = await page.locator('#select_classlevel option').evaluateAll(opts => opts.map(o => ({ value: o.value, text: o.text.trim() })));
        let matchedClassValue = null;
        const targetClassId = lesson.class_id;
        const fallbackClassVal = targetClassId.includes('-') ? targetClassId.split('-')[1] : targetClassId;
        
        let exactMatch = classOptions.find(o => o.value === targetClassId) || classOptions.find(o => o.value === fallbackClassVal);
        if (exactMatch) {
          matchedClassValue = exactMatch.value;
        } else {
          let fuzzy = '';
          if (fallbackClassVal.startsWith('form')) fuzzy = 'tingkatan ' + fallbackClassVal.replace('form', '');
          else if (fallbackClassVal.startsWith('year')) fuzzy = 'tahun ' + fallbackClassVal.replace('year', '');
          if (fuzzy) {
            const fm = classOptions.find(o => o.text.toLowerCase().includes(fuzzy));
            if (fm) matchedClassValue = fm.value;
          }
        }

        if (!matchedClassValue) {
          send({ type: 'log', message: `⚠️ Aras kelas ${targetClassId} tidak dijumpai. Melangkau...`, level: 'warn' });
          continue;
        }
        await page.locator('#select_classlevel').selectOption(matchedClassValue);
        await page.waitForTimeout(2500);

        // 3. Select Subject
        const subjectOptions = await page.locator('#select_subject option').evaluateAll(opts => opts.map(o => ({ value: o.value, text: o.text.trim() })));
        let matchedSubject = null;
        const targetId = lesson.subject_id;
        matchedSubject = subjectOptions.find(o => o.value === targetId)?.value;

        if (!matchedSubject) {
          const subjectTextAI = (lesson.subject_text || '').toLowerCase();
          const fm = subjectOptions.find(o => {
            const t = o.text.toLowerCase();
            if (subjectTextAI && t.includes(subjectTextAI)) return true;
            if (targetId.includes('melayu') && t.includes('melayu')) return true;
            if ((targetId.includes('sains') || targetId.includes('science')) && t.includes('sains')) return true;
            if ((targetId.includes('matematik') || targetId.includes('mathematics')) && t.includes('matematik')) return true;
            if (targetId.includes('inggeris') && t.includes('inggeris')) return true;
            if (targetId.includes('english') && t.includes('inggeris')) return true;
            if (targetId.includes('sejarah') && t.includes('sejarah')) return true;
            if (targetId.includes('arab') && t.includes('arab')) return true;
            return false;
          });
          if (fm) matchedSubject = fm.value;
        }

        if (!matchedSubject) {
          send({ type: 'log', message: `⚠️ Subjek ${targetId} tidak dijumpai. Melangkau...`, level: 'warn' });
          continue;
        }

        await page.locator('#select_subject').selectOption(matchedSubject);
        const selectedSubjectText = await page.locator('#select_subject option:checked').textContent();
        const finalSubjectText = selectedSubjectText.trim();

        // 4. Click Cari
        await page.getByRole('button', { name: 'Cari' }).click();
        await page.waitForTimeout(3000);

        // 5. Click MIW link for the date
        send({ type: 'log', message: `📅 Mencari MIW untuk tarikh: ${miwDate}` });
        
        // Select correct month tab
        const dateParts = miwDate?.match(/(\d{2})-(\d{2})-(\d{4})/);
        if (dateParts) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const targetMonth = monthNames[parseInt(dateParts[2], 10) - 1];
          try {
            const monthLink = page.getByRole('link', { name: targetMonth, exact: true });
            await monthLink.waitFor({ state: 'visible', timeout: 3000 });
            await monthLink.click();
            await page.waitForTimeout(2000);
          } catch {}
        }

        const miwLink = page.locator('tr').filter({ hasText: miwDate }).getByRole('link', { name: 'MIW' }).first();
        await miwLink.click();
        await page.waitForTimeout(3000);
        const miwUrl = page.url();

        // 6. Delete old RPH if exists
        try {
          let hapusBtn = page.getByText('Hapus RPH', { exact: false }).first();
          while (await hapusBtn.isVisible({ timeout: 2000 })) {
            await hapusBtn.click();
            await page.waitForTimeout(1500);
            const yaBtn = page.getByRole('button', { name: 'YA', exact: false }).first();
            if (await yaBtn.isVisible({ timeout: 2000 })) await yaBtn.click();
            await page.waitForTimeout(4000);
            hapusBtn = page.getByText('Hapus RPH', { exact: false }).first();
          }
        } catch {}

        // 7. Open timetable popup
        await page.waitForTimeout(1500);
        await page.locator('img[src="/images/database_table.png"]').first().click();
        await page.waitForTimeout(2000);
        await page.locator('li.period').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

        // 8. Find matching slot
        const allClassSlots = page.locator('li.period.subject').filter({ hasText: lesson.session_text });
        const slotCount = await allClassSlots.count();

        if (slotCount === 0) {
          send({ type: 'log', message: `⚠️ Tiada slot jadual dijumpai untuk ${lesson.session_text}. Melangkau...`, level: 'warn' });
          await page.keyboard.press('Escape');
          continue;
        }

        // Click first matching slot
        await allClassSlots.first().click({ force: true });
        await page.waitForTimeout(1500);

        // 9. Handle checkboxes (tick all)
        await page.evaluate(() => {
          const allCbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
          allCbs.forEach(cb => { if (!cb.checked && !cb.disabled) { cb.click(); cb.checked = true; } });
        });
        await page.waitForTimeout(1500);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);

        // 10. Close popups and click Cipta RPH
        await page.evaluate(() => {
          document.querySelectorAll('[id^="popup_"]').forEach(p => p.style.display = 'none');
          document.querySelectorAll('.fancybox-overlay').forEach(o => o.style.display = 'none');
        });
        await page.waitForTimeout(500);

        let btnName = '';
        if (await page.getByRole('button', { name: 'Cipta RPH' }).isVisible({ timeout: 2000 }).catch(() => false)) btnName = 'Cipta RPH';
        else if (await page.getByRole('button', { name: 'Sunting RPH' }).isVisible({ timeout: 2000 }).catch(() => false)) btnName = 'Sunting RPH';

        if (!btnName) {
          send({ type: 'log', message: `⚠️ Butang Cipta/Sunting RPH tidak dijumpai. Melangkau...`, level: 'warn' });
          continue;
        }

        await Promise.all([
          page.waitForNavigation({ timeout: 45000 }).catch(() => {}),
          page.getByRole('button', { name: btnName }).click()
        ]);
        send({ type: 'log', message: `✅ Masuk mod ${btnName}.` });
        await page.waitForTimeout(2000);

        // 11. Wait for Rich Text Editor iframes
        await page.waitForSelector('iframe[title="Rich Text Area"]', { state: 'attached', timeout: 30000 });
        await page.waitForTimeout(1500);

        // 12. Extract syllabus info for AI
        const pageText = await page.locator('body').innerText();
        const extractText = (start, end) => {
          const regex = new RegExp(`${start}[\\s\\S]*?(?=${end}|$)`, 'i');
          const match = pageText.match(regex);
          return match ? match[0].replace(new RegExp(start, 'i'), '').trim() : '';
        };
        lesson.bidang = extractText('Bidang Pembelajaran', 'Tajuk Pembelajaran');
        lesson.tajuk = extractText('Tajuk Pembelajaran', 'Standard Kandungan');
        lesson.kandungan = extractText('Standard Kandungan', 'Standard Pembelajaran');
        const stdMatch = pageText.match(/Standard Pembelajaran([\s\S]*?)(Objektif|Kriteria|Aktiviti|$)/i);
        lesson.standard = stdMatch ? stdMatch[1].trim() : '';

        // 13. Generate RPH via AI
        send({ type: 'log', message: '🤖 Menjana RPH menggunakan AI...' });
        let aiText = '';
        const isExam = pageText.toUpperCase().includes('PEPERIKSAAN');

        if (isExam) {
          aiText = generateExamRPH();
        } else {
          aiText = await generateRPHWithAI(lesson, lessonIdx, apiKey, bbm);
        }

        // 14. Inject AI text into Aktiviti iframe
        const findIframeIndex = await page.evaluate(() => {
          const iframes = Array.from(document.querySelectorAll('iframe[title="Rich Text Area"]'));
          for (let j = 0; j < iframes.length; j++) {
            let parent = iframes[j].parentElement;
            let distance = 0;
            while (parent && distance < 30) {
              if (parent.tagName === 'TR') {
                const firstTd = parent.querySelector('td, th');
                if (firstTd) {
                  const text = firstTd.innerText ? firstTd.innerText.toUpperCase().trim() : '';
                  if (text === 'AKTIVITI' || text.startsWith('AKTIVITI\n') || text === 'AKTIVITI PEMBELAJARAN') return { index: j, found: true };
                }
              }
              parent = parent.parentElement;
              distance++;
            }
          }
          return { index: 0, found: false };
        });

        if (findIframeIndex.found || findIframeIndex.index >= 0) {
          const idx = findIframeIndex.index;
          // Enable checkbox for this row
          await page.evaluate(i => {
            const iframes = Array.from(document.querySelectorAll('iframe[title="Rich Text Area"]'));
            const iframe = iframes[i];
            if (iframe) { let p = iframe.parentElement; let d = 0; while (p && d < 30) { if (p.tagName === 'TR') { const cb = p.querySelector('input[type="checkbox"]'); if (cb && !cb.checked) { cb.click(); cb.checked = true; } break; } p = p.parentElement; d++; } }
          }, idx);
          
          // Set content via TinyMCE/CKEditor
          await page.evaluate(({i, txt}) => {
            if (typeof tinymce !== 'undefined' && tinymce.editors?.length > i) { tinymce.editors[i].setContent(txt); tinymce.editors[i].save(); }
            else if (typeof CKEDITOR !== 'undefined') { const ins = Object.values(CKEDITOR.instances); if (ins.length > i) ins[i].setData(txt); }
          }, { i: idx, txt: aiText });

          // Fallback innerHTML
          const richBody = page.locator('iframe[title="Rich Text Area"]').nth(idx).contentFrame().locator('body');
          await richBody.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
          await richBody.evaluate((el, content) => { el.innerHTML = content; el.dispatchEvent(new Event('input', { bubbles: true })); }, aiText).catch(() => {});
        }

        // 15. Fill Menilai/Refleksi
        const totalStudents = parseInt(lesson.student_count, 10) || 30;
        const minR = Math.max(3, Math.floor(totalStudents * 0.1));
        const maxR = Math.min(15, Math.ceil(totalStudents * 0.25));
        const yRand = Math.floor(Math.random() * (maxR - minR + 1)) + minR;
        const xTotal = Math.max(0, totalStudents - yRand);
        let menilaiText = `<p>${xTotal} orang murid mencapai dan menguasai semua Objektif Pembelajaran ditetapkan oleh Standard Pembelajaran. ${yRand} orang murid perlu penerangan lanjutan dan telah diberi pentaksiran lisan serta diberi bimbingan bagi mencapai dan menguasai semua Objektif Pembelajaran pada hari ini.</p>`;

        const menilaiIdx = await page.evaluate(() => {
          const iframes = Array.from(document.querySelectorAll('iframe[title="Rich Text Area"]'));
          for (let j = 0; j < iframes.length; j++) {
            let p = iframes[j].parentElement; let d = 0;
            while (p && d < 15) { if (p.innerText?.toUpperCase().includes('MENILAI')) return j; p = p.parentElement; d++; }
          }
          return 1;
        });

        await page.evaluate(({idx, text}) => {
          if (typeof tinymce !== 'undefined' && tinymce.editors?.length > idx) { tinymce.editors[idx].setContent(text); tinymce.editors[idx].save(); }
        }, { idx: menilaiIdx, text: menilaiText });

        const menilaiBody = page.locator('iframe[title="Rich Text Area"]').nth(menilaiIdx).contentFrame().locator('body');
        await menilaiBody.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
        await menilaiBody.evaluate((el, c) => { el.innerHTML = c; el.dispatchEvent(new Event('input', { bubbles: true })); }, menilaiText).catch(() => {});

        // 16. Save RPH
        send({ type: 'log', message: '💾 Menyimpan RPH...' });
        await Promise.all([
          page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
          page.getByRole('button', { name: 'Simpan RPH' }).click().catch(() => {})
        ]);

        send({ type: 'log', message: `✅ [${lessonIdx + 1}/${lessons.length}] RPH berjaya disimpan!`, level: 'success' });

      } catch (classError) {
        send({ type: 'log', message: `❌ Ralat untuk ${lesson.session_text}: ${classError.message}`, level: 'error' });
      }
    }

    send({ type: 'complete', message: '🎉 Proses RPH selesai!' });
    res.end();

  } catch (error) {
    send({ type: 'error', message: error.message });
    res.end();
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
});

// ===== DELETE RPH =====
app.post('/delete-rph', async (req, res) => {
  resetIdleTimer();
  const { credentials, month, year } = req.body;
  if (!credentials?.username || !credentials?.password) return res.status(400).json({ success: false, error: 'Kredensial diperlukan.' });

  let context, page;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'ms-MY',
      timezoneId: 'Asia/Kuala_Lumpur',
    });
    await applyStealth(context);
    page = await context.newPage();
    page.on('dialog', async d => { try { await d.accept(); } catch {} });

    const loggedIn = await loginASIE(page, credentials.username, credentials.password);
    if (!loggedIn) return res.json({ success: false, error: 'Login ASIE gagal.' });

    // Navigate to eRPH -> search weekly
    await page.goto('https://asiemodel.net/model/main.php?cb=ms', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'eRPH' }).click();
    await page.getByRole('link', { name: 'Carian' }).click().catch(() => {});
    await page.waitForTimeout(2000);

    // Find and delete RPH entries
    const deleteLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="action=delete"]');
      return Array.from(links).map(a => a.getAttribute('href'));
    });

    let deleted = 0, failed = 0;
    for (const link of deleteLinks) {
      try {
        const fullUrl = link.startsWith('http') ? link : 'https://asiemodel.net/model/' + link;
        await page.goto(fullUrl, { timeout: 10000 });
        await page.waitForTimeout(2000);
        // Accept any confirmation dialog
        const yaBtn = page.getByRole('button', { name: 'YA' }).first();
        if (await yaBtn.isVisible({ timeout: 2000 }).catch(() => false)) await yaBtn.click();
        await page.waitForTimeout(2000);
        deleted++;
      } catch { failed++; }
    }

    res.json({ success: true, total: deleteLinks.length, deleted, failed });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
});

// ===== AI GENERATION HELPERS =====
function generateExamRPH() {
  return `<p><strong>Fasa 1: Pelibatan (Engage)</strong><br>Guru memulakan sesi dengan memberi ucapan motivasi ringkas kepada pelajar.</p>
<p><strong>Fasa 2: Penerokaan (Explore)</strong><br>Guru mengedarkan kertas soalan dan jawapan kepada setiap pelajar.</p>
<p><strong>Fasa 3: Penerangan (Explain)</strong><br>Pelajar diberi penjelasan tentang arahan soalan.</p>
<p><strong>Fasa 4: Pengembangan (Elaborate)</strong><br>Peperiksaan dimulakan. Pelajar menjawab soalan.</p>
<p><strong>Fasa 5: Penilaian (Evaluate)</strong><br>Guru mengutip kertas jawapan dan soalan.</p>`;
}

async function generateRPHWithAI(lesson, sessionIndex, apiKey, bbm) {
  if (!apiKey) return '<p>Sila sediakan API Key untuk menjana RPH.</p>';

  const bbmText = bbm?.length > 0 ? bbm.join(', ') : 'Buku teks, Lembaran kerja';
  const prompt = `Anda adalah pakar pedagogi Malaysia. Jana aktiviti RPH 5E Bybee dalam HTML:
Subjek: ${lesson.subject_text || lesson.bidang || 'Tidak dinyatakan'}
Kelas: ${lesson.session_text || 'Tidak dinyatakan'}
Bidang: ${lesson.bidang || ''}
Tajuk: ${lesson.tajuk || ''}
Standard Kandungan: ${lesson.kandungan || ''}
Standard Pembelajaran: ${lesson.standard || ''}
Sesi ke: ${sessionIndex + 1}
BBM: ${bbmText}

Gunakan format HTML sahaja (tiada markdown). Jana 5 fasa: Engage, Explore, Explain, Elaborate, Evaluate.
Setiap fasa mesti ada sekurang-kurangnya 3 aktiviti bernombor.
Tulis dalam Bahasa Melayu. JANGAN sertakan tajuk RPH, tarikh, atau maklumat borang.`;

  const MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      let text = result.response.text();
      text = text.replace(/```html/gi, '').replace(/```/g, '').trim();
      if (text) return text;
    } catch (err) {
      if (err.message?.includes('429')) {
        console.log(`[AI] ${modelName} rate limited, trying next...`);
        continue;
      }
      throw err;
    }
  }
  return '<p>Gagal menjana RPH — kuota AI habis.</p>';
}

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`[CIDS ASIE Proxy] Running on port ${PORT}`);
  console.log(`[CIDS ASIE Proxy] Health check: http://localhost:${PORT}/health`);
});
