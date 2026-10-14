/*
 * The tag frame's script (clarity's auth-marketing-tags spec, ADR-0105).
 * Plain ES5, no build step, no inline code (the CSP forbids it).
 *
 * Loads the Google Tag Manager container the app names and feeds its data
 * layer. Marketing configures the vendors' tags in the container; the only
 * things this document knows are the three messages from the app:
 *   { type: 'init', gtmContainerId, page }  load the container
 *   { type: 'page_view', page }              one per public route
 *   { type: 'registration', eventId }        the sign-up conversion, once
 * `page` is { location, title, referrer } of the app's page — this document
 * cannot see its parent's URL, so tags read it from the data layer.
 *
 * Data layer events (what the container's triggers and variables see):
 *   { event: 'page_view', page_location, page_title, page_referrer }
 *   { event: 'sign_up', event_id, method: 'email',
 *     page_location, page_title, page_referrer }
 *
 * Messages are accepted from the embedding window only, and only when it
 * is one of ALLOWED_PARENT_ORIGINS. GitHub Pages sends no headers, so this
 * list — not a frame-ancestors policy — is what keeps a stranger's page
 * from driving this document (loading a container, setting cookies on the
 * site). Anyone may embed it; nobody else can make it do anything.
 */
(function () {
  'use strict';

  // The app origins that may drive this document. Local development is
  // listed because the dev server embeds the published frame; only a page
  // on the developer's own machine can claim those origins.
  var ALLOWED_PARENT_ORIGINS = [
    'https://bm.advise.is',
    // staging app origin — add when known
    'http://127.0.0.1:3001',
    'http://localhost:3001',
  ];

  var loaded = false;
  var lastPage = null;

  function allowedParent(origin) {
    return ALLOWED_PARENT_ORIGINS.indexOf(origin) >= 0;
  }

  function push(event) {
    window.dataLayer.push(event);
  }

  function pageFields(page) {
    page = page || lastPage || {};
    return {
      page_location: page.location,
      page_title: page.title,
      page_referrer: page.referrer,
    };
  }

  function init(containerId, page) {
    if (loaded || typeof containerId !== 'string' || !containerId) return;
    loaded = true;
    lastPage = page || null;
    window.dataLayer = window.dataLayer || [];
    push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src =
      'https://www.googletagmanager.com/gtm.js?id=' +
      encodeURIComponent(containerId);
    document.head.appendChild(s);
  }

  function pageView(page) {
    if (!loaded || !page) return;
    lastPage = page;
    var event = pageFields(page);
    event.event = 'page_view';
    push(event);
  }

  function registration(eventId) {
    if (!loaded) return;
    var event = pageFields(null);
    event.event = 'sign_up';
    event.event_id = eventId;
    event.method = 'email';
    push(event);
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    if (!allowedParent(event.origin)) return;
    var data = event.data;
    if (!data || typeof data.type !== 'string') return;
    if (data.type === 'init') init(data.gtmContainerId, data.page);
    else if (data.type === 'page_view') pageView(data.page);
    else if (data.type === 'registration') registration(data.eventId);
  });
})();
