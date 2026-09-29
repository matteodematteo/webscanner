# Create the sales/insert tab and custom-period Sales card

Use this document as an implementation request for the existing Web Barcode
Scanner app. Build the feature described below while preserving the existing
scanner, product lookup, history, and product editing behavior.

## 1. Fourth product-information tab

Add a fourth slide inside `#productInfoSection`, after the three existing slides.
Use the existing slider and navigation dots; its slide index is `3`.

The fourth tab contains exactly two rows of quantities. Each row has four columns:

- First row: **(sales)** today, Last 7 days, Last 30 days, Last 90 days.
- Second row: **(insert)** today, Last 7 days, Last 30 days, Last 90 days.

Place the bold `(sales)` and `(insert)` prefixes in the first column's label.
Do not add separate Sales or Inventory headings above the rows.
“Insert” means incoming inventory entries returned by the stock analysis endpoint.
Display the sum of `quantity`, rather than the number of records or the sales value.

### Layout requirements

- Preserve the original height of the product-information tabs.
- Use the existing field-card styling, two data rows, and the existing 12px row gap.
- Keep labels on one line at 320px, 390px, and desktop widths.
- Use four grid columns; the first can be slightly wider to fit its prefix.
- Position the loading circle inside the fourth slide without adding another row.
- Error text and Retry must also fit inside the existing slide height, using an
  overlay if necessary.

Use this compact CSS as a reference:

```css
.activity-slide { position: relative; }
.activity-loader {
  position: absolute;
  top: 22px;
  right: 10px;
  width: 12px;
  height: 12px;
}
.activity-row + .activity-row { margin-top: 12px; }
.activity-periods {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.activity-periods label {
  font-size: .58rem;
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
}
.activity-error {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 5px 8px 36px;
  overflow: auto;
  background: var(--panel);
  color: var(--danger);
  font-size: .75rem;
}
.activity-retry {
  position: absolute;
  bottom: 0;
  right: 8px;
  padding: 4px 12px;
  min-height: 28px;
}
.activity-loader[hidden], .activity-error[hidden],
.activity-retry[hidden] { display: none; }
```

Use these IDs to integrate with the existing app:

- Fourth slide: `productActivitySlide`.
- Loading circle: `productActivityLoader`.
- Error/status message: `productActivityStatus`.
- Retry button: `productActivityRetryBtn`.
- Sales values: `activitySalesToday`, `activitySales7`, `activitySales30`, `activitySales90`.
- Insert values: `activityInventoryToday`, `activityInventory7`, `activityInventory30`, `activityInventory90`.

Give each value `data-activity-type="sales"` or `data-activity-type="inventory"`,
and `data-period-index="0"`, `"1"`, `"2"`, or `"3"` for the four periods.
Keep `aria-busy` on the slide synchronized with loading and give the spinner an
accessible loading label.

### When to load the fourth tab

Load its sales and inventory data when the fourth tab is opened by clicking its
dot, swiping to it, or restoring the saved slide selection.
Use the newest captured barcode in history, including after restoring saved history.
If history is empty, send no salesperformance request. A new capture while this
tab is active loads that barcode's summary. Scans on tabs one and two do not load
salesperformance data. Older product or discount responses must not change the target.

Fetch the last 90 days once for each data type and calculate all four totals from
those rows. Save one completed 90-day sales result and one completed 90-day insert
result locally, each with its barcode and exact request dates. Re-entering the tab
or reloading the app reuses a matching result. If only one source fails, Retry
requests only that source. Avoid duplicate requests from repeated scroll events,
history renders, or discount responses while loading or after a successful result.
Require the selected slide to have finished moving into view before dispatching.
Cancel requests when the tab is left or hidden, or history becomes empty. Check
visibility and barcode again after awaiting login so a late session refresh
cannot start a request for a hidden tab.

Show `—` before a result is available or when loading fails. A successful empty
result is `0`. Show the spinner while requests are pending; hide it on completion
or failure. Expose Retry after failure. Do not automatically keep retrying a failed
request when a discount response arrives or a scroll event fires.

## 2. Existing Sales card and custom period

The existing card is `#field_sales_quantity_card`. Its value is
`#field_sales_quantity`; its loading circle is `#salesQuantityLoader`.

Load this card when tab three becomes active and visible, using the newest captured
barcode in history and the applied period. A new capture while tab three is active
loads sales for that barcode. Clicking `#salesPeriodApplyBtn` checks the saved
barcode and period first; it sends a request only when there is no matching
completed result. Save one custom-period result and restore its selected dates on
reload for the same newest barcode.
Send no request when history is empty or tab three is hidden or inactive. Cancel
pending work when leaving the tab, and stop its loading circle without showing an error.
The fourth tab's requests must not update this card or its selected period.

Keep the existing period dialog:

- `salesPeriodBtn`: open the dialog; do not send a request.
- `salesPeriodStartInput`: start date, using an HTML date input.
- `salesPeriodEndInput`: end date, using an HTML date input.
- `salesPeriodApplyBtn`: validate the dates, commit the selected period, and load
  sales for the newest barcode in history if tab three is active and visible.
- `salesPeriodAllBtn`: clear both date inputs and keep the dialog open. The user
  must click Apply to request all dates.
- `salesPeriodBackBtn`: close the dialog without requesting data or applying edits.

Start with the last 30 calendar days, including today, as the default form period.
Reject a start date after the end date and retain the previously applied period.
Either boundary may be blank; both blank means all dates.

The period popup also has three quick buttons that only fill its date inputs:
`This month` selects the first day of the current month through today;
`Last 3 months` selects the first day of the month two months ago through today;
`Last year` selects January 1 through December 31 of the previous calendar year.
Use local calendar dates so January and leap-year boundaries work. Back discards
unapplied quick selections; Apply remains the only button that commits the dates.

For a nonempty start date send `YYYY-MM-DD 00:00:00`. For a nonempty end date send
`YYYY-MM-DD 23:59:59`. Also filter returned rows against the selected dates before
summing, so the displayed total respects the period even if upstream returns
extra rows.

Show the card's loading circle while its request is pending. Display `—` before
Apply has produced a result or after failure, and `0` for a valid empty result.

## 3. Request contract

The browser sends JSON using POST to:

`https://salesperformance.mattoteo96.workers.dev/`

Example sales summary request for a reference date of 2026-09-28:

```json
{
  "goodsCode": "3",
  "barcode": "3",
  "cookie": "SESSION=YOUR_SAVED_SESSION",
  "type": "sales",
  "beginDate": "2026-07-01 00:00:00",
  "endDate": "2026-09-28 23:59:59"
}
```

For insert totals, send the same request with `"type": "inventory"`.
For custom-period sales, use `"type": "sales"` and the user's selected boundaries.
Send `Content-Type: application/json` and obtain the cookie through the app's
existing saved-session/login helper. The cookie above is a placeholder.

Always use the displayed product's goods code. Do not hard-code the example `3`
or substitute the ERP record ID for the goods code.

### Worker routing

The supplied HAR demonstrates these GET upstream endpoints:

- Sales: `https://www.lgerp.cc/sellAccountCode/findGoodsAnalyze`.
- Insert: `https://www.lgerp.cc/stock/findGoodsAnalyze`.

Forward `goodsCode`, `person`, `operator`, `beginDate`, and `endDate`
as query parameters. Forward the saved session as the upstream `Cookie` header.
Keep `person` and `operator` empty unless explicitly supplied.
Omit `page` and `rows` from both the browser body and upstream URL; the endpoint
is requested once per activity type and period without pagination parameters.

The Worker defaults to sales when `type` is omitted, preserving older clients.
Allow only the two fixed routes. Handle OPTIONS and return CORS headers on both
successful responses and errors. Treat a login redirect or non-JSON response as
a failure rather than a valid zero quantity.

Successful responses identify the route using `X-Activity-Type` (`sales` or
`inventory`) and `X-Activity-Source` (`/sellAccountCode/findGoodsAnalyze` or
`/stock/findGoodsAnalyze`). Add both names to `Access-Control-Expose-Headers` so
the browser can read them. For insert requests, require both headers to identify
the inventory/stock source before accepting the response. Reject mismatched source
headers and reject sales settlement rows (`invoicesType: "结算记录"`) returned for
an insert request. A valid empty stock result with matching headers is zero.

The original Worker ignored `type` and always used the sales endpoint. That can
make both rows display sales quantities even when the frontend sends two different
request types. Fixing this requires deploying the updated Worker as well as
uploading the app files to GitHub Pages. Never silently count a response from an
older sales-only Worker as insert data. Show an error explaining that the Worker
needs updating, with Retry available after deployment.

### Complete responses and stale responses

Wait for the complete response and calculate totals from all returned records,
including responses larger than 500 or 1000 records. Do not split the request into
pages or cap the number of records used in calculations. Keep the loading circle
visible while the response is pending.

Snapshot product and period before requesting data.
Keep separate request sequences and abort controllers for the custom Sales
card and the fourth tab. Cancel/invalidate previous requests when the product
changes, so a late response cannot populate the new product's values.

### Saved request settings

Use three independent local storage entries for the latest custom-period sales,
90-day summary sales, and 90-day summary inventory requests. Each entry records
`barcode`, `type`, `beginDate`, `endDate`, and `result`. Keep only the most recent
version per entry. The summary requests span 90 days; their one response per source
provides all today, 7, 30, and 90-day values. The custom result is its final
period total. Do not persist cookies or full ERP rows in these entries.

Compare the exact formatted request dates and barcode before using a result.
Restore the last custom period after loading history when its barcode still matches.
Record the latest request settings as it starts, then add the result only on
success. Failed, invalid, aborted, or unverified responses remain retryable;
they must not be mistaken for valid zero quantities. On a new local day, the
summary date boundaries change and both summary sources are requested again.

`refreshCookieBtn` is an explicit exception to the saved-result rule. After a
successful login, if tab three or four is visible and history has a barcode,
send all three requests with the newly returned cookie: custom-period sales,
90-day sales, and 90-day inventory. Replace their saved results on success,
update both tab displays, and keep source verification and approval filtering.
Keep the button disabled until these requests finish. If login fails, history is
empty, or another tab is active when login completes, send no activity request.
Ordinary scans and tab switches still reuse matching saved results.

## 4. Quantity and calendar calculations

Rows in the HAR contain `quantity` and `operatortime`, for example:

```json
{
  "quantity": 3,
  "operatortime": "2026-09-26 09:25:45.0"
}
```

Use the device's local calendar date consistently. Periods include today:

- Today: today's midnight through the end of today.
- Last 7 days: midnight six calendar days before today through the end of today.
- Last 30 days: midnight 29 calendar days before today through the end of today.
- Last 90 days: midnight 89 calendar days before today through the end of today.

Subtract calendar days with `Date.setDate`, rather than fixed 24-hour milliseconds,
so daylight-saving transitions do not move the boundary to the wrong hour.
Normalize ERP timestamps such as `2026-09-26 09:25:45.0` for parsing.
Ignore undated/invalid-date rows when filtering a bounded period and exclude future
rows. Accept decimal quantities, including strings with a decimal comma.
Sum all quantities returned by the relevant endpoint, including negative values.
Exclude unapproved stock entries from every insert total. Read the current status
from `billStatusDesc`, removing HTML tags before interpreting the text:
`未审核` means unapproved and must be excluded; `已审核` means approved.
If the description does not specify approval, `bill_status: 1` (including the string
`"1"`) also means unapproved. Keep rows with no approval information for compatibility.
Do not use `bill_status_toString` or `backStatusDesc` for filtering: they describe
actions and can contain `已审核` on an unapproved record. Apply this filter only to
insert totals after receiving the complete response, leaving sales calculations unchanged.

Format quantities to at most two decimal places and remove unnecessary trailing
zeros. Keep zero distinct from loading, missing data, and errors.

## 5. Integrate with this project

Update these existing files as needed:

- `index.html`: fourth slide, fourth navigation dot, compact styles, and existing
  period-dialog markup.
- `js/dom.js`: cache the new elements.
- `js/state.js`: independent Sales-card and summary state, including the cached
  custom total for rendering without full response rows.
- `js/sales.js`: Worker requests, periods, totals, loading, and retry.
- `js/input-mode.js`: trigger the matching requests for visible slide index 2 or 3,
  cancel inactive requests, and handle hidden product controls and page visibility.
- `js/history.js`: keep the request target synchronized with the newest capture
  and cancel requests when history is emptied.
- `js/app.js`: restore the last custom period after loading history.
- `js/events.js`: custom-period Apply, All clearing inputs, and explicit Retry.
- `js/product.js`: synchronize product responses with the latest captured code
  without starting requests for inactive tabs or an older product.
- `js/config.js`: keep `salesPerformanceProxyEndpoint` set to the Worker URL above.
- `sw.js`: increase the cache version and keep cached script URLs aligned with
  the script versions in `index.html`.

This checkout also contains duplicate assets in `js/js/` and `css/css/`. Keep
affected duplicate implementations consistent while preserving unrelated changes.
Apply CSS changes to the inline styles as well as the matching external CSS files.

## 6. Verification and deployment

Verify the following behaviors:

- Scans on tabs one and two send no salesperformance request. Tab three loads
  sales and tab four loads sales and inserts for the newest captured barcode.
- Opening either sales tab with empty history sends no request, including after
  clearing history while older product data remains on screen.
- Opening the fourth tab loads the correct sales and insert routes and displays a spinner.
- A sales-only Worker returning the same sales payload for both request types
  produces an insert-source error, not duplicated sales totals. After deploying
  the correct Worker, Retry fetches the stock quantities.
- Completed totals remain independent of the custom-period card.
- Clicking Period, changing dates, clicking All, or closing the dialog sends no
  Sales-card request; clicking Apply loads or reuses a matching result while tab
  three is active with history.
- This month, Last 3 months, and Last year fill the correct local date ranges
  without a request; Back discards them and Apply commits them.
- Identical successful barcode/timeframe settings reuse results after tab switches
  and reloads. A changed barcode or date range sends a request. Failed sources
  remain retryable without resending a successful source.
- Clicking the cookie refresh button on either sales tab sends one login request
  followed by all three activity requests with that new cookie, even when all
  three results were already saved. A failed login sends none.
- Leaving or hiding a tab cancels pending requests. Waiting for login must not
  dispatch requests after the tab is left or history becomes empty.
- Boundaries include midnight and the end date, with correct 7/30/90-day totals.
- One request includes all returned records, even above 1000 records, without
  `page` or `rows` parameters; old responses cannot overwrite a new product.
- Failures show Retry and stop loading; empty successful responses show zero.
- Unapproved insert records contribute zero, including the example with quantity 3,
  `bill_status: 1`, `billStatusDesc` containing `未审核`, and action labels containing
  `已审核`. Approved records remain included.
- The fourth tab and its error state do not increase the original tab height.
- Labels fit at 320px, 390px, and desktop widths, and the app still opens offline.

The existing Node checks are `tests/product-activity.cjs`,
`tests/product-activity-browser.cjs`, and `tests/scanner-browser.cjs`.
Browser checks require an available Playwright installation and Chromium.
`HAR_FIXTURE` can point to the supplied HAR for the activity browser check.

For the supplied HAR and a local reference date of **2026-09-28**, the expected
Today / 7 / 30 / 90-day quantities are:

- Sales: **0 / 1 / 18 / 45**.
- Insert, excluding the unapproved quantity-3 record: **0 / 2 / 3 / 4**.

Deploy the Worker code below to the existing Cloudflare **salesperformance**
Worker. Then upload the updated website files to GitHub Pages. The Worker source
and `tests` folder are not required on GitHub Pages; the Worker executes in
Cloudflare. This document describes local source and verification, and does not
confirm that the live Worker has already been deployed.

## 7. Complete Cloudflare Worker source

Paste this code into the existing salesperformance Worker and deploy it.

```javascript
/**
 * Worker for https://salesperformance.mattoteo96.workers.dev/.
 * Browser POST: { goodsCode, cookie, type: "sales" | "inventory",
 *                 beginDate, endDate }.
 * Omitting type preserves the existing sales request contract.
 * Paths match www.examplerequest.har; omit page and rows to request all records.
 */
const UPSTREAM_URLS = {
  sales: "https://www.lgerp.cc/sellAccountCode/findGoodsAnalyze",
  inventory: "https://www.lgerp.cc/stock/findGoodsAnalyze"
};
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Expose-Headers": "X-Activity-Type, X-Activity-Source",
  "Access-Control-Max-Age": "86400"
};

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Request body must be valid JSON" }, 400); }

    const goodsCode = String(body?.goodsCode || body?.barcode || "").trim();
    if (!goodsCode) return json({ error: "goodsCode is required" }, 400);
    const type = body?.type ?? "sales";
    if (type !== "sales" && type !== "inventory") {
      return json({ error: "type must be sales or inventory" }, 400);
    }
    const query = new URLSearchParams({
      goodsCode,
      person: String(body?.person || ""),
      operator: String(body?.operator || ""),
      beginDate: String(body?.beginDate || ""),
      endDate: String(body?.endDate || "")
    });
    const headers = new Headers({
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.lgerp.cc/index"
    });
    const cookie = String(body?.cookie || "").trim();
    if (cookie) headers.set("Cookie", cookie);

    try {
      const upstream = await fetch(`${UPSTREAM_URLS[type]}?${query.toString()}`, {
        method: "GET", headers, redirect: "manual"
      });
      // A login redirect or HTML must not become an apparently valid zero total.
      if (upstream.status >= 300 && upstream.status < 400) {
        return json({ error: "ERP session expired. Refresh your login and retry." }, 401);
      }
      if (!upstream.ok) return json({ error: "Activity endpoint request failed" }, upstream.status);
      let payload;
      try { payload = await upstream.json(); }
      catch { return json({ error: "ERP returned an invalid response. Refresh your login and retry." }, 502); }
      return json(payload, 200, {
        "X-Activity-Type": type,
        "X-Activity-Source": new URL(UPSTREAM_URLS[type]).pathname
      });
    } catch {
      return json({ error: "Unable to reach activity endpoint" }, 502);
    }
  }
};
```
