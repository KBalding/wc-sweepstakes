// scripts/results.js
// Daily WC26 Sweepstakes Slack RESULTS recap.
// Fetches yesterday's played fixtures from openfootball, looks up which
// colleagues own each team, and posts the scores — with spicy banter for
// every colleague clash — to Slack.
//
// Triggered by .github/workflows/daily-results.yml on a daily morning cron.
// Requires SLACK_WEBHOOK env var (set as a GitHub Actions secret).
//
// "Yesterday" is defined as the previous US Eastern match-day, matching the
// bucketing in notify.js: a late kickoff shown at 00:00–03:00 BST belongs to
// the previous evening's session, not the next BST calendar day.

const fs = require('fs');
const path = require('path');

const FIXTURES_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;
// Optional link to the sweepstake site, shown in the footer. Set as a repo
// variable (Settings → Secrets and variables → Actions → Variables → SITE_URL).
const SITE_URL = (process.env.SITE_URL || '').trim();

if (!SLACK_WEBHOOK) {
  console.error('Missing SLACK_WEBHOOK env var. Set it as a repo secret.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// TEAMS — flag, group, tournament outright odds (UK fractional)
// To refresh odds, ask Claude to regenerate this section.
// Kept in sync with scripts/notify.js.
// ─────────────────────────────────────────────────────────────
const TEAMS = {
  // Group A
  'Mexico':              { flag:'🇲🇽', group:'A', odds:'66/1' },
  'South Africa':        { flag:'🇿🇦', group:'A', odds:'250/1' },
  'South Korea':         { flag:'🇰🇷', group:'A', odds:'150/1' },
  'Czech Republic':      { flag:'🇨🇿', group:'A', odds:'200/1' },
  // Group B
  'Canada':              { flag:'🇨🇦', group:'B', odds:'125/1' },
  'Bosnia & Herzegovina':{ flag:'🇧🇦', group:'B', odds:'500/1' },
  'Qatar':               { flag:'🇶🇦', group:'B', odds:'200/1' },
  'Switzerland':         { flag:'🇨🇭', group:'B', odds:'66/1' },
  // Group C
  'Brazil':              { flag:'🇧🇷', group:'C', odds:'8/1' },
  'Morocco':             { flag:'🇲🇦', group:'C', odds:'33/1' },
  'Haiti':               { flag:'🇭🇹', group:'C', odds:'1000/1' },
  'Scotland':            { flag:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', group:'C', odds:'100/1' },
  // Group D
  'USA':                 { flag:'🇺🇸', group:'D', odds:'50/1' },
  'Paraguay':            { flag:'🇵🇾', group:'D', odds:'300/1' },
  'Australia':           { flag:'🇦🇺', group:'D', odds:'150/1' },
  'Turkey':              { flag:'🇹🇷', group:'D', odds:'100/1' },
  // Group E
  'Germany':             { flag:'🇩🇪', group:'E', odds:'14/1' },
  'Curaçao':             { flag:'🇨🇼', group:'E', odds:'1000/1' },
  'Ivory Coast':         { flag:'🇨🇮', group:'E', odds:'200/1' },
  'Ecuador':             { flag:'🇪🇨', group:'E', odds:'80/1' },
  // Group F
  'Netherlands':         { flag:'🇳🇱', group:'F', odds:'20/1' },
  'Japan':               { flag:'🇯🇵', group:'F', odds:'33/1' },
  'Sweden':              { flag:'🇸🇪', group:'F', odds:'66/1' },
  'Tunisia':             { flag:'🇹🇳', group:'F', odds:'300/1' },
  // Group G
  'Belgium':             { flag:'🇧🇪', group:'G', odds:'25/1' },
  'Egypt':               { flag:'🇪🇬', group:'G', odds:'200/1' },
  'Iran':                { flag:'🇮🇷', group:'G', odds:'150/1' },
  'New Zealand':         { flag:'🇳🇿', group:'G', odds:'1000/1' },
  // Group H
  'Spain':               { flag:'🇪🇸', group:'H', odds:'9/2' },
  'Cape Verde':          { flag:'🇨🇻', group:'H', odds:'1000/1' },
  'Saudi Arabia':        { flag:'🇸🇦', group:'H', odds:'250/1' },
  'Uruguay':             { flag:'🇺🇾', group:'H', odds:'50/1' },
  // Group I
  'France':              { flag:'🇫🇷', group:'I', odds:'5/1' },
  'Senegal':             { flag:'🇸🇳', group:'I', odds:'80/1' },
  'Iraq':                { flag:'🇮🇶', group:'I', odds:'500/1' },
  'Norway':              { flag:'🇳🇴', group:'I', odds:'50/1' },
  // Group J
  'Argentina':           { flag:'🇦🇷', group:'J', odds:'9/1' },
  'Algeria':             { flag:'🇩🇿', group:'J', odds:'300/1' },
  'Austria':             { flag:'🇦🇹', group:'J', odds:'100/1' },
  'Jordan':              { flag:'🇯🇴', group:'J', odds:'1000/1' },
  // Group K
  'Portugal':            { flag:'🇵🇹', group:'K', odds:'9/1' },
  'DR Congo':            { flag:'🇨🇩', group:'K', odds:'300/1' },
  'Uzbekistan':          { flag:'🇺🇿', group:'K', odds:'500/1' },
  'Colombia':            { flag:'🇨🇴', group:'K', odds:'33/1' },
  // Group L
  'England':             { flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', group:'L', odds:'7/1' },
  'Croatia':             { flag:'🇭🇷', group:'L', odds:'50/1' },
  'Ghana':               { flag:'🇬🇭', group:'L', odds:'250/1' },
  'Panama':              { flag:'🇵🇦', group:'L', odds:'500/1' },
};

// ─────────────────────────────────────────────────────────────
// BANTER — spicy results commentary. Edit freely.
// {W} = winning colleague, {L} = losing colleague, {WT}/{LT} = their teams.
// One line is picked at random from the pool that fits the scoreline.
// ─────────────────────────────────────────────────────────────
const BANTER = {
  // Won by 3+ goals.
  thrashing: [
    '🪦 RIP {L}’s {LT}. {W} didn’t just win, they sent a message. Awkward standup tomorrow.',
    '💀 {L} got absolutely battered. {W} strolls it — get the coffees in, {L}.',
    '🚨 Somebody check on {L}. {WT} put {LT} to the sword and {W} is insufferable about it.',
    '🧹 Clean sweep for {W}. {L}, maybe don’t open Slack today.',
  ],
  // Won by exactly 2.
  comfortable: [
    '😎 Comfortable in the end for {W}. {L}’s {LT} never really turned up.',
    '✅ {W} had a bit to spare. {L} will say it was closer than the scoreline. It wasn’t.',
    '☕ Two clear goals. {W} collects, {L} pays up.',
  ],
  // Won by exactly 1.
  narrow: [
    '😅 {L} so nearly had it. {W} nicks it and won’t let you forget.',
    '🥶 Heartbreak for {L}. {W} edges a tight one — daylight robbery, frankly.',
    '⚡ Fine margins. {W} takes the bragging rights over {L} by a single goal.',
  ],
  // Draw between two owned teams.
  draw: [
    '🤝 Honours even — {W} and {L} share the spoils. Nobody buys coffee. Disappointing for everyone.',
    '😐 A {WT}–{LT} stalemate. {W} and {L} both claim a moral victory, both are wrong.',
  ],
  // Same person owns both teams.
  selfClash: [
    '🤡 {W} beat… {W}. A truly pointless afternoon’s work.',
    '🪞 {W}’s {WT} beat {W}’s {LT}. The only winner is also the only loser. Poetic.',
  ],
};

// Overlay live odds (refreshed daily by fetch-odds.js into odds.json) onto the
// baseline TEAMS above. Teams the bookmakers don't list keep their fallback odds.
try {
  const oddsPath = path.join(__dirname, '..', 'odds.json');
  if (fs.existsSync(oddsPath)) {
    const live = JSON.parse(fs.readFileSync(oddsPath, 'utf8'));
    for (const [name, o] of Object.entries(live.teams || {})) {
      if (TEAMS[name] && o.odds) TEAMS[name].odds = o.odds;
    }
  }
} catch (e) {
  console.warn('Live odds unavailable, using built-in odds:', e.message);
}

// ─────────────────────────────────────────────────────────────
// PARTICIPANTS — single source of truth, shared with index.html.
// Edit ../participants.json to update the draw results.
// ─────────────────────────────────────────────────────────────
const PARTICIPANTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'participants.json'), 'utf8')
);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Convert openfootball "13:00 UTC-6" + date "2026-06-11" into a BST kickoff
// time plus the US Eastern calendar date the match belongs to (the match-day).
// See notify.js for why we bucket by US Eastern rather than BST.
function toBST(time, date) {
  const m = time.match(/(\d{1,2}):(\d{2})\s+UTC([+-]\d+)/);
  if (!m) return { timeStr: time, matchDay: date };
  const localH = parseInt(m[1]);
  const localM = parseInt(m[2]);
  const offset = parseInt(m[3]);
  const d = new Date(`${date}T${String(localH).padStart(2,'0')}:${String(localM).padStart(2,'0')}:00Z`);
  d.setUTCHours(d.getUTCHours() - offset);
  const timeStr = d.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false });
  const matchDay = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return { timeStr, matchDay };
}

// Yesterday's match day, in US Eastern, as YYYY-MM-DD.
// FORCE_MATCH_DAY (YYYY-MM-DD) overrides it — handy for manually backfilling a
// missed day from the Actions tab.
function getYesterdayMatchDay() {
  const forced = (process.env.FORCE_MATCH_DAY || '').trim();
  if (forced) return forced;
  const now = new Date();
  // Shift back 24h, then read the date in US Eastern. Robust enough at the
  // ~08:00 BST run time, where we're nowhere near a day boundary either side.
  const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return y.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function findOwner(teamName) {
  return PARTICIPANTS.find(p => p.teams.includes(teamName));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function fetchResults(matchDay) {
  const resp = await fetch(FIXTURES_URL);
  if (!resp.ok) throw new Error(`Fetch failed: HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.matches || [])
    .map(raw => {
      const bst = toBST(raw.time || '', raw.date || '');
      const ft = raw.score && Array.isArray(raw.score.ft) ? raw.score.ft : null;
      return {
        teamA: raw.team1,
        teamB: raw.team2,
        group: (raw.group || '').replace(/^Group\s+/i, ''),
        round: raw.round || '',
        time: bst.timeStr,
        matchDay: bst.matchDay,
        scoreA: ft ? ft[0] : null,
        scoreB: ft ? ft[1] : null,
        played: !!ft,
      };
    })
    .filter(f => f.matchDay === matchDay)
    .filter(f => TEAMS[f.teamA] && TEAMS[f.teamB]) // drop knockout placeholders
    .filter(f => f.played); // only matches with a final score
}

// Build the banter line for one result. Returns '' when there's nothing to
// say (e.g. one side is unassigned).
function banterFor(f, pA, pB) {
  // Trim a trailing period off names (e.g. "Amy N.") so banter lines that end
  // in their own punctuation don't read "Amy N..".
  const nm = n => n.replace(/\.$/, '');
  const fill = (s, w, l) => s
    .replaceAll('{W}', nm(w.owner.name))
    .replaceAll('{L}', nm(l.owner.name))
    .replaceAll('{WT}', w.team)
    .replaceAll('{LT}', l.team);

  // Unassigned on either side → state the result, skip the ribbing.
  if (!pA || !pB) return '';

  const a = { owner: pA, team: f.teamA, score: f.scoreA };
  const b = { owner: pB, team: f.teamB, score: f.scoreB };
  const diff = Math.abs(a.score - b.score);

  if (a.score === b.score) {
    // Draw. Order doesn't matter; treat A as {W} slot for templating.
    return fill(pick(BANTER.draw), a, b);
  }

  const winner = a.score > b.score ? a : b;
  const loser  = a.score > b.score ? b : a;

  if (winner.owner.name === loser.owner.name) {
    return fill(pick(BANTER.selfClash), winner, loser);
  }

  const tier = diff >= 3 ? BANTER.thrashing : diff === 2 ? BANTER.comfortable : BANTER.narrow;
  return fill(pick(tier), winner, loser);
}

function buildSlackMessage(results, matchDay) {
  const dateStr = new Date(matchDay + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });

  if (!results.length) {
    return {
      text: `No results to report for ${dateStr}.`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `📋 Results — ${dateStr}`, emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: '🛌 No matches played. A quiet one. Standings unchanged.' } },
      ],
    };
  }

  // Group games before knockouts, then by kickoff time.
  results.sort((a, b) => a.time.localeCompare(b.time));

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📋 Last night’s results — ${dateStr}`, emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*${results.length}* match${results.length === 1 ? '' : 'es'} in the books. The damage report:` }],
    },
    { type: 'divider' },
  ];

  for (const f of results) {
    const tA = TEAMS[f.teamA];
    const tB = TEAMS[f.teamB];
    const pA = findOwner(f.teamA);
    const pB = findOwner(f.teamB);
    const groupLabel = f.group ? `Group ${f.group}` : (f.round || 'Knockout');

    // Bold the winning team's score.
    const aWon = f.scoreA > f.scoreB;
    const bWon = f.scoreB > f.scoreA;
    const sA = aWon ? `*${f.scoreA}*` : `${f.scoreA}`;
    const sB = bWon ? `*${f.scoreB}*` : `${f.scoreB}`;

    const aName = pA ? `(${pA.slack})` : '_(unassigned)_';
    const bName = pB ? `(${pB.slack})` : '_(unassigned)_';

    let line =
      `🟢 *${groupLabel}*\n` +
      `${tA.flag} *${f.teamA}* ${aName}  ${sA}–${sB}  *${f.teamB}* ${tB.flag} ${bName}`;

    const banter = banterFor(f, pA, pB);
    if (banter) line += `\n${banter}`;

    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: line } });
  }

  const footer = '🏆 Bragging rights updated.' +
    (SITE_URL ? `  ·  <${SITE_URL}|See the full board →>` : '');
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: footer }] });

  return {
    text: `Last night's results — ${results.length} match${results.length === 1 ? '' : 'es'}`, // notification fallback
    blocks,
  };
}

async function postToSlack(payload) {
  const resp = await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Slack POST failed: ${resp.status} ${txt}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
(async () => {
  try {
    const matchDay = getYesterdayMatchDay();
    const results = await fetchResults(matchDay);
    console.log(`Found ${results.length} played fixtures for ${matchDay}.`);
    const payload = buildSlackMessage(results, matchDay);
    await postToSlack(payload);
    console.log('✅ Results recap sent.');
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  }
})();
