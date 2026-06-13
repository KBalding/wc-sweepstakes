// scripts/notify.js
// Daily WC26 Sweepstakes Slack alert.
// Fetches today's fixtures from openfootball, looks up which colleagues own
// each team, and posts a head-to-head message to Slack.
//
// Triggered by .github/workflows/daily-alert.yml on a daily cron.
// Requires SLACK_WEBHOOK env var (set as a GitHub Actions secret).

const FIXTURES_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK;

if (!SLACK_WEBHOOK) {
  console.error('Missing SLACK_WEBHOOK env var. Set it as a repo secret.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// TEAMS — flag, group, tournament outright odds (UK fractional)
// To refresh odds, ask Claude to regenerate this section.
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
// PARTICIPANTS — keep in sync with the same array in index.html
// Replace this whole array with your real draw results.
// ─────────────────────────────────────────────────────────────
const PARTICIPANTS = [
  { name:'Sarah M.',   teams:['England'],              slack:'@sarah.m'   },
  { name:'James K.',   teams:['France'],               slack:'@james.k'   },
  { name:'Priya R.',   teams:['Brazil'],               slack:'@priya.r'   },
  { name:'Tom W.',     teams:['Spain'],                slack:'@tom.w'     },
  { name:'Aisling O.', teams:['Argentina'],            slack:'@aisling.o' },
  { name:'Ben F.',     teams:['Portugal'],             slack:'@ben.f'     },
  { name:'Mei L.',     teams:['Germany'],              slack:'@mei.l'     },
  { name:'Raj P.',     teams:['Netherlands'],          slack:'@raj.p'     },
  { name:'Connor B.',  teams:['Belgium'],              slack:'@connor.b'  },
  { name:'Fatima A.',  teams:['Morocco'],              slack:'@fatima.a'  },
  { name:'Jake T.',    teams:['Colombia'],             slack:'@jake.t'    },
  { name:'Lucy D.',    teams:['Japan'],                slack:'@lucy.d'    },
  { name:'Kenny',      teams:['USA'],                  slack:'<@U0BAG7RDPFW>'  },
  { name:'Sophie W.',  teams:['Uruguay'],              slack:'@sophie.w'  },
  { name:'Tariq N.',   teams:['Croatia'],              slack:'@tariq.n'   },
  { name:'Yuki S.',    teams:['Switzerland'],          slack:'@yuki.s'    },
  { name:'Alex B.',    teams:['Mexico'],               slack:'@alex.b'    },
  { name:'Dana H.',    teams:['Sweden'],               slack:'@dana.h'    },
  { name:'Ellie M.',   teams:['Australia'],            slack:'@ellie.m'   },
  { name:'Frank O.',   teams:['Ecuador'],              slack:'@frank.o'   },
  { name:'Grace P.',   teams:['South Korea'],          slack:'@grace.p'   },
  { name:'Harry S.',   teams:['Norway'],               slack:'@harry.s'   },
  { name:'Isla T.',    teams:['Turkey'],               slack:'@isla.t'    },
  { name:'Jordan V.',  teams:['Scotland'],             slack:'@jordan.v'  },
  { name:'Karen W.',   teams:['Canada'],               slack:'@karen.w'   },
  { name:'Leo X.',     teams:['Senegal'],              slack:'@leo.x'     },
  { name:'Mia Y.',     teams:['South Africa'],         slack:'@mia.y'     },
  { name:'Noel Z.',    teams:['Egypt'],                slack:'@noel.z'    },
  { name:'Orla A.',    teams:['Iran'],                 slack:'@orla.a'    },
  { name:'Pete B.',    teams:['Saudi Arabia'],         slack:'@pete.b'    },
  { name:'Quinn C.',   teams:['Ghana'],                slack:'@quinn.c'   },
  { name:'Rosa D.',    teams:['Austria'],              slack:'@rosa.d'    },
  { name:'Sam E.',     teams:['Iraq'],                 slack:'@sam.e'     },
  { name:'Tina F.',    teams:['Paraguay'],             slack:'@tina.f'    },
  { name:'Umar G.',    teams:['Curaçao'],              slack:'@umar.g'    },
  { name:'Vera H.',    teams:['Ivory Coast'],          slack:'@vera.h'    },
  { name:'Will I.',    teams:['Tunisia'],              slack:'@will.i'    },
  { name:'Xara J.',    teams:['Algeria'],              slack:'@xara.j'    },
  { name:'Yasmin K.',  teams:['Uzbekistan','Bosnia & Herzegovina'], slack:'@yasmin.k' },
  { name:'Zach L.',    teams:['Panama','Haiti'],                    slack:'@zach.l'   },
  { name:'Amy N.',     teams:['Czech Republic','Qatar'],            slack:'@amy.n'    },
  { name:'Brian Q.',   teams:['New Zealand','DR Congo'],            slack:'@brian.q'  },
  { name:'Chloe R.',   teams:['Cape Verde','Jordan'],               slack:'@chloe.r'  },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Convert openfootball "13:00 UTC-6" + date "2026-06-11" → {timeStr, dateStr} in BST.
function toBST(time, date) {
  const m = time.match(/(\d{1,2}):(\d{2})\s+UTC([+-]\d+)/);
  if (!m) return { timeStr: time, dateStr: date };
  const localH = parseInt(m[1]);
  const localM = parseInt(m[2]);
  const offset = parseInt(m[3]);
  const d = new Date(`${date}T${String(localH).padStart(2,'0')}:${String(localM).padStart(2,'0')}:00Z`);
  d.setUTCHours(d.getUTCHours() - offset);
  const timeStr = d.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  return { timeStr, dateStr };
}

function getTodayBSTDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

function findOwner(teamName) {
  return PARTICIPANTS.find(p => p.teams.includes(teamName));
}

async function fetchTodayFixtures() {
  const resp = await fetch(FIXTURES_URL);
  if (!resp.ok) throw new Error(`Fetch failed: HTTP ${resp.status}`);
  const data = await resp.json();
  const today = getTodayBSTDate();
  return (data.matches || [])
    .map(raw => {
      const bst = toBST(raw.time || '', raw.date || '');
      return {
        teamA: raw.team1,
        teamB: raw.team2,
        group: (raw.group || '').replace(/^Group\s+/i, ''),
        round: raw.round || '',
        ground: raw.ground || '',
        time: bst.timeStr,
        bstDate: bst.dateStr,
      };
    })
    .filter(f => f.bstDate === today)
    .filter(f => TEAMS[f.teamA] && TEAMS[f.teamB]); // drop knockout placeholders
}

function buildSlackMessage(fixtures) {
  if (!fixtures.length) {
    return {
      text: '🛌 No World Cup fixtures today. Rest day.',
    };
  }

  // Sort by time
  fixtures.sort((a, b) => a.time.localeCompare(b.time));

  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Europe/London',
  });

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `⚔ Today's head-to-heads — ${dateStr}`, emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*${fixtures.length}* fixture${fixtures.length === 1 ? '' : 's'} on the slate. Every match is a colleague clash.` }],
    },
    { type: 'divider' },
  ];

  for (const f of fixtures) {
    const tA = TEAMS[f.teamA];
    const tB = TEAMS[f.teamB];
    const pA = findOwner(f.teamA);
    const pB = findOwner(f.teamB);
    const groupLabel = f.group ? `Group ${f.group}` : (f.round || 'Knockout');
    const venue = f.ground ? ` · 📍 ${f.ground}` : '';

    const aName = pA ? `*${pA.name}* (${pA.slack})` : '_Unassigned_';
    const bName = pB ? `*${pB.name}* (${pB.slack})` : '_Unassigned_';
    const selfClash = pA && pB && pA.name === pB.name ? ' _(self-clash!)_' : '';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `🟢 *${groupLabel}*  ·  🕐 ${f.time} BST${venue}\n` +
          `${aName}  ${tA.flag} *${f.teamA}*  ⚔  *${f.teamB}* ${tB.flag}  ${bName}${selfClash}\n` +
          `_Outright: ${f.teamA} ${tA.odds}  ·  ${f.teamB} ${tB.odds}_`,
      },
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '☕ on the line. Or pride. Or both.' }],
  });

  return {
    text: `Today's head-to-heads — ${fixtures.length} fixture${fixtures.length === 1 ? '' : 's'}`, // fallback for notifications
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
    const fixtures = await fetchTodayFixtures();
    console.log(`Found ${fixtures.length} fixtures for today.`);
    const payload = buildSlackMessage(fixtures);
    await postToSlack(payload);
    console.log('✅ Slack alert sent.');
  } catch (err) {
    console.error('❌ Failed:', err);
    process.exit(1);
  }
})();
