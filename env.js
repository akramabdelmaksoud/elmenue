// Clean env values: dashboards/shells sometimes add a BOM or trailing whitespace that breaks HTTP headers.
for (const k of Object.keys(process.env)) { const v = process.env[k]; if (typeof v === 'string') process.env[k] = v.replace(/^\uFEFF/, '').trim(); }

// Business hours, "Today", rush-hour charts and daily totals all use the server clock. Vercel runs in UTC, which would shift every
// hour by 2-3 for an Egyptian venue, so the process runs on the venue's time zone (override with APP_TZ).
process.env.TZ = process.env.APP_TZ || 'Africa/Cairo';
