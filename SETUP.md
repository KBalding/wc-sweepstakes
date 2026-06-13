# Ometis WC26 Sweepstakes — Setup Guide

A lightweight, self-hosted web app for your World Cup 2026 sweepstakes, with automatic daily Slack alerts for every head-to-head clash. Free to run, zero infrastructure.

## What you get

- **Web app** hosted free on GitHub Pages
- **Live fixtures** pulled automatically from openfootball — no manual updates needed for the whole tournament
- **Daily Slack alerts** via GitHub Actions — runs at 9am BST every match day, posts each head-to-head clash with both colleagues tagged
- **No backend, no API keys, no recurring costs**

## Files

You should have:

```
worldcup-sweepstakes.html  ← rename to index.html in your repo
daily-alert.yml            ← goes to .github/workflows/
notify.js                  ← goes to scripts/
```

---

## Setup — 15 minutes total

### Part 1: Create the GitHub repo

1. Create a new GitHub repo. Public or private both work for GitHub Pages on free accounts (private requires GitHub Pro for Pages, but Actions runs on private free repos either way — see the alternative at the end if you need fully-private hosting).
2. Suggest: name it `wc26-sweepstakes` or similar.
3. Upload the three files into the structure below:

```
your-repo/
├── index.html
├── scripts/
│   └── notify.js
└── .github/
    └── workflows/
        └── daily-alert.yml
```

Just `worldcup-sweepstakes.html` → rename to `index.html` and drop it at the root. The other two go in folders as shown.

### Part 2: Customise with your real participants

Both `index.html` and `scripts/notify.js` contain the same `PARTICIPANTS` array. Find it (search for `const PARTICIPANTS`), replace it with your actual draw results.

**Important:**
- Team names must match exactly the keys in `TEAMS` (e.g. `"Czech Republic"` not `"Czechia"`, `"Bosnia & Herzegovina"` not `"Bosnia"`, `"Ivory Coast"` not `"Côte d'Ivoire"`).
- Slack handles are `@username` format — used as the visible label. For actual `@` mentions that ping people, swap to Slack user IDs like `<@U01ABC123>` (find a user's ID by clicking their profile → ⋮ → Copy member ID).

### Part 3: Enable GitHub Pages

1. In your repo, go to **Settings** → **Pages**.
2. Under "Source", select **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)`. Save.
4. Wait ~30 seconds. Your URL appears at the top — something like `https://yourname.github.io/wc26-sweepstakes/`.

That URL is what you share with your colleagues. Pin it in the Slack channel.

### Part 4: Create the Slack webhook

1. Create a Slack channel for the sweepstakes (e.g. `#wc26-sweepstakes`), invite everyone.
2. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
3. Name: "WC26 Sweepstakes Bot". Pick your workspace. Create.
4. Left sidebar → **Incoming Webhooks** → toggle **On**.
5. Scroll down → **Add New Webhook to Workspace** → choose your sweepstakes channel → **Allow**.
6. Copy the webhook URL — looks like `https://hooks.slack.com/services/T.../B.../xxx`. Keep it private.

### Part 5: Add the webhook to GitHub

1. In your GitHub repo, go to **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret**.
3. Name: `SLACK_WEBHOOK`
4. Value: paste your webhook URL.
5. Add secret.

### Part 6: Test it

1. In your repo, go to the **Actions** tab.
2. Click **Daily WC26 Slack alert** on the left.
3. Click **Run workflow** → **Run workflow** (manual trigger).
4. Wait ~10 seconds — you should see a green ✓ when it finishes.
5. Check your Slack channel. You should see today's fixtures posted, or "🛌 No fixtures today" if it's a rest day.

If something fails, click into the failed run to see the logs.

---

## Daily operation

From now until July 19, the workflow runs automatically at 09:00 BST every day. The job:

1. Fetches the latest fixtures from openfootball (which auto-updates as knockout pairings are decided)
2. Filters to today's matches in BST
3. Looks up which colleague owns each team
4. Posts a formatted Slack message with all head-to-heads

The web app (`index.html`) also pulls fixtures live every time someone visits, so it's always current. No daily redeploys needed.

---

## Updating odds during the tournament

The tournament outright odds are hardcoded in both `index.html` and `scripts/notify.js` (in the `TEAMS` object).

When you want them refreshed (e.g. after the group stage, before knockouts), just message Claude:

> "Refresh the WC26 odds based on current bookmaker prices"

You'll get an updated `TEAMS` block. Paste it into both files, commit, and the new odds are live within seconds (GitHub Pages auto-deploys).

---

## Optional: real Slack @mentions

By default the bot writes participants as plain text like `@sarah.m`. This is visible but doesn't ping/notify the person.

To make real Slack mentions that actually notify people:

1. In Slack, click a person's name → ⋮ icon → **Copy member ID** (looks like `U01ABC123`).
2. In `notify.js`, change their `slack` field to the Slack mention format:
   ```js
   { name: "Sarah M.", teams: ["England"], slack: "<@U01ABC123>" },
   ```
3. Same in `index.html` if you want the website to display the link as well.

Now the daily Slack alert actually pings the colleagues whose teams are playing.

---

## Troubleshooting

**"No fixtures today" but you know there are matches.**
The cron runs in UTC. Matches that kick off after midnight UK time on the same calendar day might be classified as tomorrow. Solution: manually trigger the workflow at the time you actually want the alert to fire.

**Slack message looks weird in the channel.**
Make sure the webhook is pointing to the right channel. Re-do Part 5 with a fresh webhook.

**Fixtures look wrong on the web app.**
Hard refresh the page (Cmd/Ctrl+Shift+R). The openfootball JSON updates as the tournament progresses, but your browser may have cached the old version.

**Need to change the trigger time.**
Edit `.github/workflows/daily-alert.yml`. The `cron: '0 8 * 6,7 *'` is "08:00 UTC every day in June/July". Change the `8` to your preferred UTC hour. Remember UK is UTC+1 during summer (BST).

---

## Total ongoing cost

**£0** — GitHub Pages and Actions are free for this usage level, openfootball is free public-domain data, Slack webhooks are free.

Enjoy the tournament 🏆
