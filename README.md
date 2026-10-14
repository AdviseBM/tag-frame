# tag-frame

The marketing tag frame of [Clarity](https://github.com/AdviseBM/clarity)
(`bm.advise.is`): one static page, published by GitHub Pages under
`https://gh-pages.advise.is/tag-frame/index.html`, that the app's public pages
(sign-up, sign-in, password reset) embed as a hidden, sandboxed iframe. It
loads marketing's Google Tag Manager container and feeds its data layer.
Nothing of it exists once a user is signed in.

Why a frame on its own origin: the app's origin holds the session and the
customers' data, so no third-party script runs there. `gh-pages.advise.is` is
a different origin (vendor scripts reach nothing of the app) on the same
site (the vendors' cookies on `.advise.is` stay first-party). The decision
is clarity's ADR-0105; the behaviour is its `auth-marketing-tags` spec.

## Contract with the app

The app posts three messages to the frame window, with the frame origin as
the explicit target. The frame accepts them only from its parent window and
only when the parent's origin is in `ALLOWED_PARENT_ORIGINS`
(`public/tag-frame.js`). Anyone may embed the page; nobody else can make
it do anything.

| Message        | Fields                   | When                                       |
| -------------- | ------------------------ | ------------------------------------------ |
| `init`         | `gtmContainerId`, `page` | once, when the frame has loaded            |
| `page_view`    | `page`                   | once per public route, including the first |
| `registration` | `eventId`                | once per successful sign-up                |

`page` is `{ location, title, referrer }` of the app's page: the frame
cannot see its parent's URL. Ad click ids (`gclid`, `gbraid`, `wbraid`,
`fbclid`, `li_fat_id`) arrive in the frame URL's query, where each vendor's
tag reads its own.

## What the container sees

| Data layer event | Fields                                              | Fired                        |
| ---------------- | --------------------------------------------------- | ---------------------------- |
| `gtm.js`         | `gtm.start`                                         | once, as the container loads |
| `page_view`      | `page_location`, `page_title`, `page_referrer`      | once per public route        |
| `sign_up`        | `event_id`, `method: 'email'`, plus the page fields | once per successful sign-up  |

Rules for the container, set by the page's Content-Security-Policy:

- Tags must be **templates** (GA4, Google Ads, LinkedIn Insight, a Meta
  pixel template). Custom HTML tags are inline scripts and are blocked.
- Tags may only reach the vendors' hosts listed in `public/index.html`.
  A blocked request shows as a policy report in the frame's console; the
  fix is one host in the meta tag.
- GA4's configuration tag should send no automatic page view and read
  `page_location` / `page_referrer` from data-layer variables, since the
  frame document's own URL is `gh-pages.advise.is`.

## Publishing

Every push to `master` runs the tests and publishes `public/` as
`/tag-frame/` of the site on GitHub Pages (`.github/workflows/deploy.yml`). The custom domain is not optional:
the Pages default under `github.io` is another site, and the vendors'
cookies would be third-party there.

Setup, once: repository settings → Pages → source "GitHub Actions", custom
domain `gh-pages.advise.is`, "Enforce HTTPS". DNS: `CNAME gh-pages →
advisebm.github.io`.

## Developing

```
npm ci
npm test
```

No build step. The app embeds the published frame in local development
too, which is why the dev server's origins are in `ALLOWED_PARENT_ORIGINS`.
