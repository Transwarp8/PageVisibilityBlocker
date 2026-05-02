#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'artifacts');
const REPORT_PATH = path.join(REPORT_DIR, 'integration-test-report.json');
const DEFAULT_CFT_PATH = path.join(
  ROOT,
  'chrome',
  'win64-148.0.7778.97',
  'chrome-win64',
  'chrome.exe'
);

function exists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function findChromeExecutable() {
  const candidates = [
    process.env.PVB_CHROME_PATH,
    DEFAULT_CFT_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }

  throw new Error(
    'No Chrome executable found. Set PVB_CHROME_PATH or install Chrome for Testing with: npx @puppeteer/browsers install chrome@stable'
  );
}

function startStaticServer(rootDir) {
  const server = http.createServer((req, res) => {
    const rawPath = req.url.split('?')[0];
    const safePath = path.normalize(decodeURIComponent(rawPath)).replace(/^([.][.][/\\])+/, '');
    let filePath = path.join(rootDir, safePath === '/' ? '/test.html' : safePath);

    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!exists(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = (
      {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
      }[ext] || 'application/octet-stream'
    );

    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${addr.port}`
      });
    });
    server.on('error', reject);
  });
}

async function waitFor(description, fn, timeoutMs = 15000, intervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${description}`);
}

function parseExtensionId(url) {
  const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(url || '');
  return match ? match[1] : null;
}

function assertResult(results, name, pass, details) {
  results.push({ name, pass, details: details || '' });
}

async function getWorkerAndExtension(browser) {
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && /background\.js$/.test(t.url()),
    { timeout: 20000 }
  );

  const extensionId = parseExtensionId(target.url());
  if (!extensionId) {
    throw new Error(`Could not parse extension id from target URL: ${target.url()}`);
  }

  const worker = await target.worker();
  return { worker, extensionId };
}

async function getStateFromWorker(worker) {
  return worker.evaluate(async () => {
    const storage = await chrome.storage.local.get(['enabled']);
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    return {
      enabled: storage.enabled !== false,
      scripts
    };
  });
}

async function setStateViaPopup(browser, extensionId, enabled) {
  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await popup.waitForSelector('#toggleSwitch');

  const current = await popup.$eval('#toggleSwitch', (el) => el.checked);
  if (current !== enabled) {
    await popup.evaluate((nextEnabled) => {
      const input = document.getElementById('toggleSwitch');
      input.checked = nextEnabled;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, enabled);
  }

  await popup.waitForFunction(
    (expected) => {
      const status = document.getElementById('status');
      if (!status) return false;
      return expected ? /Enabled/.test(status.textContent) : /Disabled/.test(status.textContent);
    },
    { timeout: 20000 },
    enabled
  );

  await popup.close();
}

async function evaluateBehavior(page) {
  return page.evaluate(async () => {
    function isNative(fn) {
      if (typeof fn !== 'function') return false;
      return /\[native code\]/.test(Function.prototype.toString.call(fn));
    }

    function customEventTargetUnaffected() {
      const target = new EventTarget();
      let fired = false;
      target.addEventListener('visibilitychange', () => {
        fired = true;
      });
      target.dispatchEvent(new Event('visibilitychange'));
      return fired;
    }

    function tryHandlerSet(target, prop) {
      if (!(prop in target)) return { supported: false, stored: null };
      target[prop] = function () {};
      return { supported: true, stored: typeof target[prop] === 'function' };
    }

    const hiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    const visDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');

    const aboutBlankFrame = document.createElement('iframe');
    aboutBlankFrame.src = 'about:blank';
    document.body.appendChild(aboutBlankFrame);

    const srcdocFrame = document.createElement('iframe');
    srcdocFrame.srcdoc = '<!doctype html><html><body>srcdoc</body></html>';
    document.body.appendChild(srcdocFrame);

    await new Promise((resolve) => setTimeout(resolve, 500));

    let aboutBlank = null;
    let srcdoc = null;

    try {
      aboutBlank = {
        hidden: aboutBlankFrame.contentWindow.document.hidden,
        visibilityState: aboutBlankFrame.contentWindow.document.visibilityState,
        hasFocus: aboutBlankFrame.contentWindow.document.hasFocus(),
        hiddenGetterNative: isNative(
          Object.getOwnPropertyDescriptor(
            aboutBlankFrame.contentWindow.Document.prototype,
            'hidden'
          ).get
        )
      };
    } catch (e) {
      aboutBlank = { error: e.message };
    }

    try {
      srcdoc = {
        hidden: srcdocFrame.contentWindow.document.hidden,
        visibilityState: srcdocFrame.contentWindow.document.visibilityState,
        hasFocus: srcdocFrame.contentWindow.document.hasFocus(),
        hiddenGetterNative: isNative(
          Object.getOwnPropertyDescriptor(
            srcdocFrame.contentWindow.Document.prototype,
            'hidden'
          ).get
        )
      };
    } catch (e) {
      srcdoc = { error: e.message };
    }

    return {
      documentHidden: document.hidden,
      documentVisibilityState: document.visibilityState,
      documentHasFocus: document.hasFocus(),
      hiddenGetterNative: isNative(hiddenDesc && hiddenDesc.get),
      visibilityGetterNative: isNative(visDesc && visDesc.get),
      hasFocusNative: isNative(Document.prototype.hasFocus),
      webkitHidden: 'webkitHidden' in document ? document.webkitHidden : null,
      webkitVisibilityState:
        'webkitVisibilityState' in document ? document.webkitVisibilityState : null,
      dataPvbPresent: document.documentElement.hasAttribute('data-pvb'),
      customVisibilityEventUnaffected: customEventTargetUnaffected(),
      docOnVis: tryHandlerSet(document, 'onvisibilitychange'),
      winOnVis: tryHandlerSet(window, 'onvisibilitychange'),
      winOnBlur: tryHandlerSet(window, 'onblur'),
      winOnFocus: tryHandlerSet(window, 'onfocus'),
      aboutBlank,
      srcdoc
    };
  });
}

async function runBuiltInTestSuite(page) {
  /*
   * The test harness marks "tab switched" from a timer-gap heuristic
   * (now-lastTime > 200ms). We force such a gap deterministically.
   */
  await page.evaluate(() => {
    const start = Date.now();
    while (Date.now() - start < 400) {
      /* busy wait */
    }
  });

  try {
    await page.waitForFunction(() => !/Waiting/.test(document.getElementById('summary').textContent), {
      timeout: 5000
    });
  } catch {
    await page.evaluate(() => {
      if (typeof tabSwitched !== 'undefined') tabSwitched = true;
      if (typeof render === 'function') render();
    });
  }

  const suite = await page.evaluate(() => {
    const summary = document.getElementById('summary').textContent;
    const rows = Array.from(document.querySelectorAll('#results tr')).map((row) => {
      const cells = row.querySelectorAll('td');
      return {
        name: cells[0] ? cells[0].textContent : '',
        result: cells[1] ? cells[1].textContent : '',
        notes: cells[2] ? cells[2].textContent : ''
      };
    });
    return { summary, rows };
  });

  return suite;
}

(async () => {
  const started = Date.now();
  const results = [];
  let browser;
  let server;
  let origin;

  try {
    if (!exists(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

    const chromePath = findChromeExecutable();
    const staticServer = await startStaticServer(ROOT);
    server = staticServer.server;
    origin = staticServer.origin;

    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--load-extension=${ROOT}`,
        `--disable-extensions-except=${ROOT}`,
        '--no-first-run',
        '--no-default-browser-check'
      ]
    });

    const { worker, extensionId } = await getWorkerAndExtension(browser);

    const initial = await waitFor(
      'initial blocker registration',
      async () => {
        const state = await getStateFromWorker(worker);
        return state.scripts.some((s) => s.id === 'pvb-main-world-blocker') ? state : null;
      },
      20000
    );

    assertResult(results, 'extension id discovered', !!extensionId, extensionId);
    assertResult(results, 'default enabled state is true', initial.enabled === true, JSON.stringify(initial));
    assertResult(
      results,
      'blocker script initially registered',
      initial.scripts.some((s) => s.id === 'pvb-main-world-blocker'),
      JSON.stringify(initial.scripts)
    );

    const page = await browser.newPage();
    await page.goto(`${origin}/test.html`, { waitUntil: 'domcontentloaded' });

    const enabledBehavior = await evaluateBehavior(page);
    assertResult(results, 'enabled: document.hidden forced false', enabledBehavior.documentHidden === false, JSON.stringify(enabledBehavior));
    assertResult(results, 'enabled: visibilityState forced visible', enabledBehavior.documentVisibilityState === 'visible', JSON.stringify(enabledBehavior));
    assertResult(results, 'enabled: hasFocus forced true', enabledBehavior.documentHasFocus === true, JSON.stringify(enabledBehavior));
    assertResult(results, 'enabled: hidden getter is non-native override', enabledBehavior.hiddenGetterNative === false, JSON.stringify(enabledBehavior));
    assertResult(results, 'enabled: visibility getter is non-native override', enabledBehavior.visibilityGetterNative === false, JSON.stringify(enabledBehavior));
    assertResult(results, 'enabled: data-pvb marker absent', enabledBehavior.dataPvbPresent === false, JSON.stringify(enabledBehavior));
    assertResult(results, 'enabled: custom EventTarget visibilitychange still works', enabledBehavior.customVisibilityEventUnaffected === true, JSON.stringify(enabledBehavior));

    if (enabledBehavior.docOnVis.supported) {
      assertResult(results, 'enabled: document.onvisibilitychange setter/getter usable', enabledBehavior.docOnVis.stored === true, JSON.stringify(enabledBehavior.docOnVis));
    }
    if (enabledBehavior.winOnVis.supported) {
      assertResult(results, 'enabled: window.onvisibilitychange setter/getter usable', enabledBehavior.winOnVis.stored === true, JSON.stringify(enabledBehavior.winOnVis));
    }
    if (!enabledBehavior.aboutBlank.error) {
      assertResult(results, 'enabled: about:blank iframe hidden false', enabledBehavior.aboutBlank.hidden === false, JSON.stringify(enabledBehavior.aboutBlank));
      assertResult(results, 'enabled: about:blank iframe visibilityState visible', enabledBehavior.aboutBlank.visibilityState === 'visible', JSON.stringify(enabledBehavior.aboutBlank));
    }
    if (!enabledBehavior.srcdoc.error) {
      assertResult(results, 'enabled: srcdoc iframe hidden false', enabledBehavior.srcdoc.hidden === false, JSON.stringify(enabledBehavior.srcdoc));
      assertResult(results, 'enabled: srcdoc iframe visibilityState visible', enabledBehavior.srcdoc.visibilityState === 'visible', JSON.stringify(enabledBehavior.srcdoc));
    }

    const suiteEnabled = await runBuiltInTestSuite(page);
    const failedEnabledRows = suiteEnabled.rows.filter((r) => r.result.trim() === 'FAIL');
    assertResult(results, 'built-in test suite summary is ALL TESTS PASSED', /ALL TESTS PASSED/.test(suiteEnabled.summary), JSON.stringify(suiteEnabled));
    assertResult(results, 'built-in test suite has zero FAIL rows', failedEnabledRows.length === 0, JSON.stringify(failedEnabledRows));

    await setStateViaPopup(browser, extensionId, false);

    const disabledState = await waitFor(
      'disabled state in worker',
      async () => {
        const state = await getStateFromWorker(worker);
        const hasBlocker = state.scripts.some((s) => s.id === 'pvb-main-world-blocker');
        return state.enabled === false && !hasBlocker ? state : null;
      },
      20000
    );

    assertResult(results, 'disabled: storage enabled=false', disabledState.enabled === false, JSON.stringify(disabledState));
    assertResult(
      results,
      'disabled: blocker script unregistered',
      !disabledState.scripts.some((s) => s.id === 'pvb-main-world-blocker'),
      JSON.stringify(disabledState.scripts)
    );

    const disabledPage = await browser.newPage();
    await disabledPage.goto(`${origin}/test.html?mode=disabled`, { waitUntil: 'domcontentloaded' });

    const disabledBehavior = await evaluateBehavior(disabledPage);
    assertResult(results, 'disabled: hidden getter restored to native', disabledBehavior.hiddenGetterNative === true, JSON.stringify(disabledBehavior));
    assertResult(results, 'disabled: visibility getter restored to native', disabledBehavior.visibilityGetterNative === true, JSON.stringify(disabledBehavior));
    assertResult(results, 'disabled: hasFocus restored to native', disabledBehavior.hasFocusNative === true, JSON.stringify(disabledBehavior));

    await setStateViaPopup(browser, extensionId, true);

    const reenabledState = await waitFor(
      're-enabled state in worker',
      async () => {
        const state = await getStateFromWorker(worker);
        const hasBlocker = state.scripts.some((s) => s.id === 'pvb-main-world-blocker');
        return state.enabled === true && hasBlocker ? state : null;
      },
      20000
    );

    assertResult(results, 're-enabled: storage enabled=true', reenabledState.enabled === true, JSON.stringify(reenabledState));
    assertResult(
      results,
      're-enabled: blocker script registered again',
      reenabledState.scripts.some((s) => s.id === 'pvb-main-world-blocker'),
      JSON.stringify(reenabledState.scripts)
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    const reenabledBehavior = await evaluateBehavior(page);
    assertResult(results, 're-enabled: hidden getter non-native override restored', reenabledBehavior.hiddenGetterNative === false, JSON.stringify(reenabledBehavior));

    await disabledPage.close();
    await page.close();

    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;

    const report = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      chromeExecutable: chromePath,
      extensionRoot: ROOT,
      origin,
      summary: {
        total: results.length,
        passed,
        failed
      },
      results
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    console.log(`Integration test report written: ${REPORT_PATH}`);
    console.log(`Passed: ${passed}/${results.length}`);

    if (failed > 0) {
      console.error('Failed checks:');
      for (const r of results.filter((x) => !x.pass)) {
        console.error(`- ${r.name}`);
      }
      process.exit(1);
    }
  } catch (error) {
    if (!exists(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          fatalError: {
            message: error.message,
            stack: error.stack
          },
          partialResults: results
        },
        null,
        2
      ),
      'utf8'
    );

    console.error(error);
    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
    if (server) {
      try {
        await new Promise((resolve) => server.close(resolve));
      } catch {
        /* ignore */
      }
    }
  }
})();
