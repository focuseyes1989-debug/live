# Live match catalog Worker

From this directory, run `npx wrangler login` and `npx wrangler deploy` in the Cloudflare account that will host the catalog. Open the deployed `/matches.json` endpoint and check for an HTTP 200 JSON response with `updated`, `matches`, and `upcoming`.

Set the `SUTBONG_CATALOG_URL` GitHub Actions repository variable to the full deployed HTTPS URL ending in `/matches.json`. Run the **Publish live website** workflow to activate it. The Worker permits browser requests from the GitHub Pages origin and caches the catalog for 20 seconds. If it fails, the website uses its published snapshot and existing score fallback.
