// scripts/fetch-odds.js
// Fetches live World Cup 2026 outright-winner odds from The Odds API and writes
// odds.json (consumed by both index.html and scripts/notify.js).
//
// Run by .github/workflows/update-odds.yml on a daily cron.
// Requires ODDS_API_KEY (set as a repo secret). Get a free key at
// https://the-odds-api.com (500 req/month tier is ample for a daily refresh).
//
// Design: odds.json carries ONLY the live-derived fields per team. The static
// TEAMS objects in index.html / notify.js remain the baseline + fallback, so
// any team the API doesn't list simply keeps its existing hardcoded odds.

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ODDS_API_KEY;
if (!API_KEY) {
  console.error('Missing ODDS_API_KEY env var. Set it as a repo secret.');
  process.exit(1);
}

// The Odds API — outright (futures) market for the World Cup.
const SPORT = 'soccer_fifa_world_cup_winner';
const ODDS_URL =
  `https://api.the-odds-api.com/v4/sports/${SPORT}/odds` +
  `?regions=uk&markets=outrights&oddsFormat=decimal&apiKey=${API_KEY}`;

// Our canonical roster (the 48 team names used across the app).
const ROSTER = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'teams.roster.json'), 'utf8')
);

// The Odds API sometimes labels teams differently from us. Map their name → ours.
// Add entries here if the daily run logs an unmatched favourite.
const NAME_ALIASES = {
  'USA': 'USA',
  'United States': 'USA',
  'South Korea': 'South Korea',
  'Korea Republic': 'South Korea',
  'Ivory Coast': 'Ivory Coast',
  "Cote d'Ivoire": 'Ivory Coast',
  'Czechia': 'Czech Republic',
  'Czech Republic': 'Czech Republic',
  'Turkey': 'Turkey',
  'Türkiye': 'Turkey',
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'Bosnia & Herzegovina': 'Bosnia & Herzegovina',
};

function canonicalName(apiName) {
  if (NAME_ALIASES[apiName]) return NAME_ALIASES[apiName];
  if (ROSTER.includes(apiName)) return apiName;
  return null; // unmatched — caller logs it, team keeps its fallback odds
}

// Decimal (e.g. 9.0) → UK fractional string (e.g. "8/1").
function decimalToFractional(dec) {
  const frac = dec - 1;
  // Try common bookmaker denominators for a clean fraction.
  const denoms = [1, 2, 3, 4, 5, 6, 7, 8];
  let best = { num: Math.round(frac), den: 1, err: Infinity };
  for (const den of denoms) {
    const num = Math.round(frac * den);
    if (num === 0) continue;
    const err = Math.abs(frac - num / den);
    if (err < best.err - 1e-9) best = { num, den, err };
  }
  // Reduce.
  const g = gcd(best.num, best.den);
  return `${best.num / g}/${best.den / g}`;
}

function decimalToAmerican(dec) {
  if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
  return `${Math.round(-100 / (dec - 1))}`;
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

async function main() {
  const resp = await fetch(ODDS_URL);
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Odds API failed: ${resp.status} ${txt}`);
  }
  const events = await resp.json();

  // The outrights market lives in the first event's bookmaker → market → outcomes.
  // Average the decimal price across bookmakers for each team for stability.
  const priceSums = {};   // canonicalName → { sum, n }
  let unmatched = new Set();

  for (const ev of events) {
    for (const bk of ev.bookmakers || []) {
      for (const mk of bk.markets || []) {
        if (mk.key !== 'outrights') continue;
        for (const oc of mk.outcomes || []) {
          const name = canonicalName(oc.name);
          if (!name) { unmatched.add(oc.name); continue; }
          if (!priceSums[name]) priceSums[name] = { sum: 0, n: 0 };
          priceSums[name].sum += oc.price;
          priceSums[name].n += 1;
        }
      }
    }
  }

  const teams = {};
  // Raw implied probabilities (1/decimal), then normalise so they sum to 100%.
  const rawImplied = {};
  for (const [name, { sum, n }] of Object.entries(priceSums)) {
    const dec = sum / n;
    rawImplied[name] = 1 / dec;
    teams[name] = { _dec: dec };
  }
  const impliedTotal = Object.values(rawImplied).reduce((a, b) => a + b, 0) || 1;

  for (const [name, t] of Object.entries(teams)) {
    const dec = t._dec;
    delete t._dec;
    t.odds_frac = decimalToFractional(dec);   // used by index.html
    t.odds_us = decimalToAmerican(dec);        // used by index.html
    t.odds = t.odds_frac;                       // used by notify.js (Slack)
    t.win_pct = +((rawImplied[name] / impliedTotal) * 100).toFixed(1);
  }

  const out = {
    generated: new Date().toISOString(),
    source: 'the-odds-api.com · outrights · uk · averaged across books',
    matched: Object.keys(teams).length,
    teams,
  };

  fs.writeFileSync(
    path.join(__dirname, '..', 'odds.json'),
    JSON.stringify(out, null, 2) + '\n'
  );

  console.log(`✅ Wrote odds.json — ${out.matched} teams matched from API.`);
  if (unmatched.size) {
    console.log(`ℹ️  ${unmatched.size} API team(s) not matched (kept fallback odds): ${[...unmatched].join(', ')}`);
    console.log('   Add aliases in NAME_ALIASES if any of these should map to a roster team.');
  }
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
