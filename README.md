# LG Insights — Vercel web app

Revenue and sold-items workspace for LG ERP. The interface uses plain HTML/CSS/JavaScript and a Vercel Node function. No frontend build step or Worker is required.

## Deploy or update

Keep these files in the same GitHub repository and preserve the paths:

- `index.html`
- `styles.css`
- `app.js`
- `vercel.json`
- `api/proxy.js`

In Vercel, use Framework Preset **Other**, leave Build Command and Output Directory unset, and select the repository folder containing `index.html`, `vercel.json`, and `api/` as the Root Directory. Push the files and wait for the new deployment to become Ready.

`vercel.json` explicitly routes `/api/erp` and every `/api/erp/...` path to `api/proxy.js`. The old `api/erp/[...path].js` catch-all file should be removed from GitHub: this plain Vercel project does not use Next.js catch-all routing. `worker.js` is unused.

After deployment, open `https://lginside.vercel.app/api/erp`. The expected response is **LG Insights proxy is running.** Then refresh the app and connect your account.

If this health URL returns Vercel's 404, check that both `vercel.json` and `api/proxy.js` are present in the deployed repository and that the Vercel Root Directory is correct. A missing route produces a deployment error in the app and does not trigger a pointless re-login. An upstream ERP 404 is identified separately by the proxy response header.

## Session and reports

The **Login** button opens the account form even while connected. The last successfully used shop key and login name are saved in localStorage and prefilled when the form opens. Editing or closing the form does not change the active account. Submitting a successful login updates the saved identity; switching accounts clears the previous reports. The active shop key and login name appear at the bottom left on desktop and mobile.

Cookies are stored locally in an HttpOnly same-origin browser cookie for up to 30 days; ERP expiry still applies. Refreshing preserves the connection. Credentials stay in this tab's session storage to reconnect automatically and replay a failed report once, preserving its dates and page. Parallel failed requests share one recovery login. Successful logins also persist shop key, login name and password in localStorage (saved logins), so an expired session re-logs in and replays the failed request automatically without asking again.

Revenue includes a smaller, regular-weight profit margin alongside Reported profit. Profit per receipt means **Reported profit divided by Total receipts**. Average receipt shows receivable divided by total receipts. The date presets include Last 3 months (the same date three calendar months ago through today, clamped to the month end) and Current year (January 1 through today). Presets turn green whenever both date inputs exactly match their range, including dates entered manually. Financial display uses EUR.

## Verification

The Sold items section has **Products**, **Suppliers**, and **Goods received** tabs. Products and Suppliers share the same loaded item report. Suppliers groups the matching Products rows by their Supplier / memeberid value and sums their Total (`price`) column, including refunds. The summary includes all matching rows across local pages and follows the Products search and supplier filters. Missing supplier values appear as Unassigned supplier. Only suppliers present in those product rows are shown, including groups whose totals equal €0.00.

Click the Supplier or Total sales header to switch between ascending and descending order. Supplier search, totals, statistics, CSV, and JSON follow the displayed summary. Switching tabs, searching, and sorting make no requests. Run report in either tab loads the same Products data and refreshes both views. There is no supplier-directory request, extra sales-page fetching, or supplier exclusion setting.

**Goods received** loads an annual purchasing report and annual supplier sales using the normal ERP login. Choose a year and click Load annual report. The app posts the year's dates with `flag=5` to `/tempdesign/previewStockBillReport`, then retrieves the returned filename under `/generic/web/` through the existing proxy. It reads the structured supplier cells across all HTML report pages and checks them against the original grand totals. It also requests sold items from `/sellAccountCode/statisticsGoodsSupplierInfo` using the same `flag=11`, `page=1`, `rows=200`, and 30-day date ranges as Products. There is no extra page fetching. Sales sum `price` by supplier directly from each response, including refunds and products whose barcode appears under different suppliers. They cover January 1 through December 31 of the selected year and do not use the current Products filters.

The three rightmost columns show Annual sales, Profit (€), and Profit (%). Click Profit (€) to sort by the numeric profit amount, or Profit (%) to sort independently by the percentage; each header toggles highest/lowest order. Profit amount is **annual sales minus total purchases**. Profit ratio is **(annual sales − total purchases) / total purchases × 100**, available only for positive purchases. The default order is Profit (€), highest to lowest. When sorting by Profit (%), undefined ratios stay last in either sort direction. This comparison does not adjust for opening/closing inventory. Supplier matching normalizes case, spacing, and Unicode and checks both Italian and Chinese purchase names. Suppliers without sales show €0.00. Unmatched or ambiguous sales remain visible as separate rows with €0 purchases and an undefined ratio, so sales are counted once. Totals, search, sorting, and CSV/JSON exports include both new columns; the total ratio uses combined profit divided by combined purchases rather than averaging supplier ratios. Both purchases and sales must finish successfully before replacing the previous comparison. Cancellation or either source failing preserves the previous data; account changes clear it. No manually supplied session cookies are stored in the app.

Successful sales requests cache compact supplier totals in memory for each API base, account, and exact request period. Goods received reuses sales periods already loaded in Products/Suppliers or an earlier annual comparison and fetches only missing periods. Product search and supplier filters do not affect this cached source data. A full-year report already loaded in Products/Suppliers requires no duplicate sales requests for that year; partially overlapping ranges reuse only identical periods. The purchasing preview and HTML still refresh on Load annual report. Run report in Products/Suppliers explicitly refreshes its sales periods and replaces their cached totals. Reloading the page, clearing reports, or disconnecting clears the cache; different accounts and years remain separate.

Run `node tests/goods-received-browser.mjs` for the preview POST and HTML GET, full-year sales coverage, cached period reuse across tabs, year/account isolation, explicit source refresh, HTML totals validation, supplier matching/refunds, profit-ratio ordering, search/sort, exports, session recovery, cancellation of either source, and desktop/mobile layout. The normal test uses only synthetic API responses. Set `GOODS_RECEIVED_SAMPLE_URL` to optionally verify the purchase parser against an existing report HTML URL without generating a new report.

Run `node tests/supplier-sales-browser.mjs` for shared product data, local grouping across pages, sorting, search and supplier filters, totals, exports, report refresh, failure/cancellation, and desktop/mobile layouts. The test uses synthetic data and makes no requests to LG ERP. It requires Playwright and a browser; on Windows it uses Microsoft Edge. Set `PLAYWRIGHT_MODULE_PATH` or `BROWSER_EXECUTABLE` to override their locations if needed.

Run `node tests/proxy-session.mjs` for named-function routing, multi-segment report paths, cookie persistence, and logout checks. Run `python tests/session-browser.py` for synthetic browser integration checks, including refresh, automatic login/retry, missing-route behavior, pagination, and profit metrics. Browser checks require Playwright and Microsoft Edge; the app itself has no frontend dependencies.

## Report requests

Revenue sends one request for the full selected date range, including yearly reports. There is no date splitting or merging of revenue responses. Totals and group series come directly from LG ERP; average receipt, average item price, profit per receipt, and profit margin are calculated from those totals. Loading time depends on LG ERP's response time.

Sold items uses one classic request for the full selected date range, requesting `page=1` and `rows=200`. There is no date splitting, automatic page fetching, or client barcode aggregation. LG ERP's returned rows are stored in memory and displayed in local pages of 100 records. Next and Previous never send requests. The page count comes from the filtered returned rows, so the final page disables Next. Run report starts again at page one.

Row numbers appear on the left and continue across local pages. Quantity, Single item price, and Total are separate columns. The sold-items HAR confirms that Total uses `price` and Single item price uses `yesMoney` directly, without division. For example, quantity 2 has `price=130` and `yesMoney=65`. The Total loaded summary sums `price`. The original unverified source-total field remains hidden. Product search matches barcode and product name without case sensitivity. The supplier dropdown contains the sorted unique nonblank values from the Supplier column across all loaded rows, plus All suppliers. Its search field narrows the menu options without changing supplier selections. Multiple suppliers can be checked; rows from any selected supplier are included and combined with product search. The menu stays open while choosing suppliers, and All suppliers clears the selections. Both report filters update the page count and return to page one. Sorting also applies to all filtered rows. Statistics cover the loaded report, CSV exports all filtered rows across pages and visible data columns, and JSON exports the original response. Cancel or a failed request preserves the previous report. Failed requests retain one automatic login/replay attempt.

Run `node tests/item-aggregation.mjs` for calendar presets and single-request yearly, quarterly, and daily revenue reports. Run `python tests/items-browser.py` for one-request sold-item loading, local 100-row pagination without requests, filtered page counts, row numbering, exports, cancellation, failure isolation, and mobile layout. Session browser checks also cover one-request annual revenue, saved account identity, account switching, and Login without disconnecting.
