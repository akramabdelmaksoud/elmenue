# Feature catalogue

This folder is for deciding what goes in which bundle and at what price.

- **FEATURES_BY_IMPORTANCE.md** - every feature grouped by level (1 core to 4 premium), what it does, what it costs you to run, and which bundle holds it today. Ends with ideas not built yet and questions for setting prices.
- **features.csv** - the same list as a spreadsheet. Open it in Excel and use the last column for your decisions.

To apply a decision: sign in to the super console (admin.tabletab-tt.com), open Bundles, tick the features for each bundle and set the prices. It takes effect within about 20 seconds, no deploy needed. A single café can also be locked or unlocked per feature from its row.

The lists are generated: run `node scripts/gen-features.js` after changing features.js.
