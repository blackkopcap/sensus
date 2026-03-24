#!/usr/bin/env node
/**
 * Activity Monitor — System activity tracking for sensus
 * DISABLED BY DEFAULT. Must be explicitly enabled.
 *
 * Usage:
 *   node activity.js enable          Enable monitoring
 *   node activity.js disable         Disable monitoring
 *   node activity.js status          Show current status
 *   node activity.js snapshot        Take one snapshot now
 *   node activity.js analyze         Analyze recent activity → sensus events
 *   node activity.js log [--limit N] Show activity log
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_FILE = path.join(process.cwd(), 'activity-config.json');
const LOG_FILE = path.join(process.cwd(), 'activity-log.json');
const SENSUS_BIN = path.join(__dirname, 'sensus.js');
const MAX_LOG = 500;

const DEFAULT_CONFIG = {
  enabled: false,
  intervalMinutes: 5,
  trackApps: true,
  trackGit: true,
  trackIdleTime: true,
};

// --- App Categories ---
const APP_CATEGORIES = {
  // Work
  'Code': 'coding', 'Visual Studio Code': 'coding', 'GoLand': 'coding',
  'WebStorm': 'coding', 'IntelliJ': 'coding', 'Rider': 'coding',
  'Terminal': 'coding', 'iTerm2': 'coding', 'Warp': 'coding',
  // Communication
  'Slack': 'communication', 'Telegram': 'communication', 'Discord': 'communication',
  'WhatsApp': 'communication', 'Messages': 'communication', 'Mail': 'communication',
  // Browsers (ambiguous)
  'Safari': 'browsing', 'Google Chrome': 'browsing', 'Firefox': 'browsing',
  'Arc': 'browsing', 'Brave Browser': 'browsing',
  // Work tools
  'Postman': 'work_tools', 'Docker Desktop': 'work_tools',
  'Figma': 'work_tools', 'Notion': 'work_tools',
  // Entertainment
  'Spotify': 'entertainment', 'Music': 'entertainment',
  'YouTube': 'entertainment', 'Steam': 'entertainment',
  'Netflix': 'entertainment', 'Twitch': 'entertainment',
  // System
  'Finder': 'system', 'System Preferences': 'system',
  'Activity Monitor': 'system',
};

// --- Helpers ---

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function loadLog() {
  if (fs.existsSync(LOG_FILE)) return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  return [];
}

function saveLog(log) {
  if (log.length > MAX_LOG) log = log.slice(-MAX_LOG);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

function getActiveApp() {
  try {
    const script = 'tell application "System Events" to get name of first application process whose frontmost is true';
    return execSync(`osascript -e '${script}'`, { encoding: 'utf8', timeout: 3000 }).trim();
  } catch { return null; }
}

function getIdleTime() {
  try {
    const out = execSync('ioreg -c IOHIDSystem | grep HIDIdleTime', { encoding: 'utf8', timeout: 3000 });
    const match = out.match(/= (\d+)/);
    if (match) return Math.floor(parseInt(match[1]) / 1000000000); // ns → seconds
  } catch {}
  return 0;
}

function getRecentGitActivity() {
  try {
    // Check common project dirs for recent commits
    const home = process.env.HOME || '/Users/' + process.env.USER;
    const dirs = ['Projects', 'GolandProjects'].map(d => path.join(home, d));
    let recentCommits = 0;

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const subdirs = fs.readdirSync(dir).slice(0, 20);
      for (const sub of subdirs) {
        const gitDir = path.join(dir, sub, '.git');
        if (!fs.existsSync(gitDir)) continue;
        try {
          const out = execSync(
            `git -C "${path.join(dir, sub)}" log --oneline --since="1 hour ago" --format="%H" 2>/dev/null | wc -l`,
            { encoding: 'utf8', timeout: 3000 }
          );
          recentCommits += parseInt(out.trim()) || 0;
        } catch {}
      }
    }
    return recentCommits;
  } catch { return 0; }
}

// --- Commands ---

function cmdEnable() {
  const cfg = loadConfig();
  cfg.enabled = true;
  saveConfig(cfg);
  console.log(JSON.stringify({ ok: true, status: 'enabled', config: cfg }, null, 2));
}

function cmdDisable() {
  const cfg = loadConfig();
  cfg.enabled = false;
  saveConfig(cfg);
  console.log(JSON.stringify({ ok: true, status: 'disabled' }, null, 2));
}

function cmdStatus() {
  const cfg = loadConfig();
  const log = loadLog();
  console.log(JSON.stringify({
    enabled: cfg.enabled,
    config: cfg,
    logEntries: log.length,
    lastSnapshot: log.length ? log[log.length - 1].ts : null,
  }, null, 2));
}

function cmdSnapshot() {
  const cfg = loadConfig();

  const snapshot = {
    ts: new Date().toISOString(),
    hour: new Date().getHours(),
  };

  if (cfg.trackApps) {
    const app = getActiveApp();
    snapshot.activeApp = app;
    snapshot.appCategory = APP_CATEGORIES[app] || 'other';
  }

  if (cfg.trackIdleTime) {
    snapshot.idleSeconds = getIdleTime();
    snapshot.isAfk = snapshot.idleSeconds > 300; // 5 min
  }

  if (cfg.trackGit) {
    snapshot.recentCommits = getRecentGitActivity();
  }

  const log = loadLog();
  log.push(snapshot);
  saveLog(log);

  console.log(JSON.stringify(snapshot, null, 2));
}

function cmdAnalyze() {
  const log = loadLog();
  if (log.length < 3) {
    console.log(JSON.stringify({ ok: true, message: 'Not enough data yet (need 3+ snapshots)' }, null, 2));
    return;
  }

  const recent = log.slice(-12); // last hour at 5min intervals
  const events = [];

  // Analyze patterns
  const categories = recent.map(s => s.appCategory).filter(Boolean);
  const codingCount = categories.filter(c => c === 'coding').length;
  const entertainmentCount = categories.filter(c => c === 'entertainment').length;
  const afkCount = recent.filter(s => s.isAfk).length;
  const commits = recent.reduce((sum, s) => sum + (s.recentCommits || 0), 0);

  // Deep work: mostly coding, few context switches
  if (codingCount >= recent.length * 0.7) {
    events.push({ type: 'deep_work', intensity: Math.min(0.3 + codingCount * 0.05, 0.8) });
  }

  // Boredom: lots of browsing/entertainment, no coding
  if (entertainmentCount >= recent.length * 0.5 && codingCount === 0) {
    events.push({ type: 'boredom', intensity: 0.3 });
  }

  // Success: commits detected
  if (commits > 0) {
    events.push({ type: 'success', intensity: Math.min(0.3 + commits * 0.1, 0.7) });
  }

  // Idle: mostly AFK
  if (afkCount >= recent.length * 0.6) {
    events.push({ type: 'idle', intensity: 0.3 });
  }

  // Late night work: coding after 23:00
  const lateWork = recent.filter(s => s.hour >= 23 && s.appCategory === 'coding').length;
  if (lateWork > 0) {
    events.push({ type: 'deep_work', intensity: 0.5 });
    // Also increase cortisol slightly — late work = stress
  }

  // Apply events to sensus
  for (const ev of events) {
    try {
      execSync(`node "${SENSUS_BIN}" event --type ${ev.type} --intensity ${ev.intensity}`, {
        cwd: process.cwd(), encoding: 'utf8', timeout: 5000
      });
    } catch {}
  }

  console.log(JSON.stringify({
    ok: true,
    analyzed: recent.length,
    patterns: { codingCount, entertainmentCount, afkCount, commits, lateWork },
    events,
  }, null, 2));
}

function cmdLog(args) {
  const log = loadLog();
  const lIdx = args.indexOf('--limit');
  const limit = lIdx !== -1 ? parseInt(args[lIdx + 1]) || 10 : 10;
  console.log(JSON.stringify(log.slice(-limit), null, 2));
}

// --- Main ---
const [,, command, ...args] = process.argv;

switch (command) {
  case 'enable':   cmdEnable(); break;
  case 'disable':  cmdDisable(); break;
  case 'status':   cmdStatus(); break;
  case 'snapshot': cmdSnapshot(); break;
  case 'analyze':  cmdAnalyze(); break;
  case 'log':      cmdLog(args); break;
  default:
    const cfg = loadConfig();
    console.log(`Activity Monitor for Sensus [${cfg.enabled ? 'ENABLED' : 'DISABLED'}]

Usage:
  node activity.js enable      Enable monitoring
  node activity.js disable     Disable monitoring
  node activity.js status      Current status
  node activity.js snapshot    Take one snapshot
  node activity.js analyze     Analyze recent → sensus events
  node activity.js log [--limit N]  View log

⚠️  Disabled by default. Tracks active app, idle time, git activity.
    No keylogging, no screen capture, no file contents.`);
}
