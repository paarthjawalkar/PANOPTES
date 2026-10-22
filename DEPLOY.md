# PANOPTES deploy checklist (panoptes-earth.pages.dev)

The public repo intentionally ships `Cesium.Ion.defaultAccessToken = 'REPLACE_WITH_YOUR_CESIUM_ION_TOKEN'`
in app.js. Never commit a real token here. Every wrangler direct upload MUST:

1. Inject the real Cesium ion token into app.js (replace the placeholder) before upload.
   Current token: the URL-restricted "PANOPTES INSIDER web preview and production" token
   (Allowed URLs: panoptes-earth.pages.dev + panoptes-insider.pages.dev).
2. Deploy to a preview branch first: `wrangler pages deploy . --project-name panoptes-earth --branch <name>`.
3. Open the preview in a real browser, wait for the globe to render past the boot screen
   (cold loads can hold the logo 20-30s), check the browser console for errors.
4. Only then promote: `--branch main`.
5. Keep `google06f872776e9943df.html` in every deploy bundle - removing it breaks
   Google Search Console verification.

On 23 Oct 2026 a deploy skipped step 1 and the site sat on the loading screen for all
users until rollback. Do not skip these steps.
