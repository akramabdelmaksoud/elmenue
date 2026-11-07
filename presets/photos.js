// Maps a menu item name to a photo in /demo/photos/<key>.jpg (openly licensed, see CREDITS.md there). First matching rule wins.
const DIR = '/demo/photos/';
const pick = (rules, name, fallback) => { for (const [re, key] of rules) if (re.test(name)) return DIR + key + '.jpg'; return fallback; };
module.exports = { pick };
