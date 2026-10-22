// Clean env values: dashboards/shells sometimes add a BOM or trailing whitespace that breaks HTTP headers.
for (const k of Object.keys(process.env)) { const v = process.env[k]; if (typeof v === 'string') process.env[k] = v.replace(/^\uFEFF/, '').trim(); }
