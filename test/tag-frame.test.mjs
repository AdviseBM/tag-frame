/**
 * The frame script in jsdom (clarity's auth-marketing-tags spec, "Frame
 * messages are origin-checked both ways", "The frame page carries its own
 * policy"): a message from a listed parent origin loads the container and
 * feeds the data layer; one from anywhere else does nothing. The page's
 * policy has no inline scripts and names only the vendors' hosts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

const script = readFileSync(
  new URL('../tag-frame/tag-frame.js', import.meta.url),
  'utf8',
);
const html = readFileSync(
  new URL('../tag-frame/index.html', import.meta.url),
  'utf8',
);

const APP = 'https://bm.advise.is';
const page = {
  location: `${APP}/signup?x=1`,
  title: 'Advise BM',
  referrer: '',
};

const frameAt = (url) => {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head></head><body></body></html>',
    {
      url,
      runScripts: 'outside-only',
    },
  );
  dom.window.eval(script);
  const win = dom.window;
  const send = (origin, data) =>
    win.dispatchEvent(
      new win.MessageEvent('message', { data, origin, source: win }),
    );
  // Array.from: jsdom's arrays belong to another realm, which strict deepEqual rejects.
  const events = () => Array.from(win.dataLayer ?? [], (e) => String(e.event));
  const scripts = () => Array.from(win.document.scripts).map((s) => s.src);
  return { win, send, events, scripts };
};

const FRAME_URL = 'https://gh-pages.advise.is/tag-frame/index.html';

describe('tag-frame.js', () => {
  it('loads the container and feeds the data layer for a listed parent', () => {
    const f = frameAt(FRAME_URL);
    f.send(APP, { type: 'init', gtmContainerId: 'GTM-TEST', page });
    f.send(APP, { type: 'page_view', page });
    f.send(APP, { type: 'registration', eventId: 'e-1' });
    assert.deepEqual(f.scripts(), [
      'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
    ]);
    assert.deepEqual(f.events(), ['gtm.js', 'page_view', 'sign_up']);
    const signUp = f.win.dataLayer.find((e) => e.event === 'sign_up');
    assert.equal(signUp.event_id, 'e-1');
    assert.equal(signUp.method, 'email');
    assert.equal(signUp.page_location, page.location);
    assert.equal(signUp.page_title, page.title);
  });

  it('ignores every message from an unlisted origin', () => {
    const f = frameAt(FRAME_URL);
    for (const origin of [
      'https://evil.example',
      'https://advise.is',
      'https://gh-pages.advise.is',
      'https://gh-pages.advise.is.evil.example',
      'http://127.0.0.1:3002',
      'null',
    ]) {
      f.send(origin, { type: 'init', gtmContainerId: 'GTM-TEST', page });
      f.send(origin, { type: 'registration', eventId: 'e-2' });
    }
    assert.deepEqual(f.scripts(), []);
    assert.equal(f.win.dataLayer, undefined);
  });

  it('accepts the app only, even after a stranger tried first', () => {
    const f = frameAt(FRAME_URL);
    f.send('https://evil.example', {
      type: 'init',
      gtmContainerId: 'GTM-EVIL',
      page,
    });
    f.send(APP, { type: 'init', gtmContainerId: 'GTM-TEST', page });
    assert.deepEqual(f.scripts(), [
      'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
    ]);
  });

  it('loads one container only, and nothing before init', () => {
    const f = frameAt(FRAME_URL);
    f.send(APP, { type: 'page_view', page });
    f.send(APP, { type: 'registration', eventId: 'e-0' });
    assert.equal(f.win.dataLayer, undefined);
    f.send(APP, { type: 'init', gtmContainerId: 'GTM-A', page });
    f.send(APP, { type: 'init', gtmContainerId: 'GTM-B', page });
    assert.equal(f.scripts().length, 1);
  });

  it('ignores a message that is not from its parent window', () => {
    const f = frameAt(FRAME_URL);
    const other = new JSDOM('', { url: APP }).window;
    f.win.dispatchEvent(
      new f.win.MessageEvent('message', {
        data: { type: 'init', gtmContainerId: 'GTM-TEST', page },
        origin: APP,
        source: other,
      }),
    );
    assert.deepEqual(f.scripts(), []);
  });

  it("lets the app's dev server embed it", () => {
    const f = frameAt(FRAME_URL);
    f.send('http://127.0.0.1:3001', {
      type: 'init',
      gtmContainerId: 'GTM-DEV',
      page,
    });
    assert.equal(f.scripts().length, 1);
  });

  it("carries a policy with no inline scripts and only the vendors' hosts", () => {
    const match = html.match(
      /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
    );
    assert.ok(match);
    const policy = match[1];
    assert.ok(policy.includes("default-src 'none'"));
    assert.match(
      policy,
      /script-src 'self' https:\/\/www\.googletagmanager\.com https:\/\/connect\.facebook\.net https:\/\/snap\.licdn\.com;/,
    );
    assert.ok(!policy.includes('unsafe-inline'));
    assert.ok(!policy.includes('unsafe-eval'));
    // frame-ancestors is ignored in a meta policy; the script's origin list
    // is the embedding rule, so the page must not pretend otherwise.
    assert.ok(!policy.includes('frame-ancestors'));
    assert.ok(!/<script>[^<]/.test(html));
  });
});
