#!/usr/bin/env node
/**
 * Behavioral Analytics — tracks communication patterns, emotional trends,
 * and behavioral markers from messages.
 *
 * Usage:
 *   node behavioral.js track "message text" [--from <name>]
 *   node behavioral.js report [--format json|summary]
 *   node behavioral.js trends [--days 7]
 *   node behavioral.js reset
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'behavioral-data.json');
const MAX_ENTRIES = 1000;

// --- Behavioral Markers ---

const STRESS_MARKERS_RU = ['блин', 'задолбал', 'бесит', 'нахуй', 'пиздец', 'сука', 'ёбан', 'херня', 'заебал', 'дебил'];
const STRESS_MARKERS_EN = ['fuck', 'shit', 'damn', 'wtf', 'ffs', 'omg'];
const UNCERTAINTY_MARKERS = ['...', 'ну', 'наверное', 'не знаю', 'хз', 'может быть', 'possibly', 'maybe', 'idk'];
const POSITIVE_MARKERS = ['спасибо', 'круто', 'отлично', 'класс', 'молодец', 'супер', 'кайф', '❤️', '💜', '👍', '🔥', '😄', '😊', '))', ')))'];
const FATIGUE_PATTERNS = /[а-яa-z]{3,}\1{2,}|(.)\1{3,}/i; // repeated chars = tired typing

// --- Helpers ---

function loadData() {
  if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  return {
    version: 1,
    entries: [],
    dailyStats: {},
    hourlyActivity: {},
    stressTopics: [],
    messageLengths: [],
  };
}

function saveData(data) {
  if (data.entries.length > MAX_ENTRIES) data.entries = data.entries.slice(-MAX_ENTRIES);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function analyzeMessage(text) {
  const now = new Date();
  const hour = now.getHours();
  const day = now.toLocaleDateString('en-US', { weekday: 'short' });
  const dateKey = now.toISOString().slice(0, 10);
  const words = text.split(/\s+/).length;
  const chars = text.length;

  // Behavioral markers
  const lowerText = text.toLowerCase();
  const stressCount = [...STRESS_MARKERS_RU, ...STRESS_MARKERS_EN].filter(m => lowerText.includes(m)).length;
  const uncertaintyCount = UNCERTAINTY_MARKERS.filter(m => lowerText.includes(m)).length;
  const positiveCount = POSITIVE_MARKERS.filter(m => lowerText.includes(m) || text.includes(m)).length;
  const hasTypos = /[а-яa-z]{2,}[A-ZА-Я][а-яa-z]/.test(text); // accidental caps mid-word
  const hasFatigue = FATIGUE_PATTERNS.test(text);
  const exclamationCount = (text.match(/!/g) || []).length;
  const questionCount = (text.match(/\?/g) || []).length;
  const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  const isShort = words <= 3;
  const isLong = words >= 20;

  // Classify energy from message style
  let messageEnergy = 'medium';
  if (isShort && !emojiCount && !exclamationCount) messageEnergy = 'low';
  else if (exclamationCount >= 2 || (isLong && emojiCount > 0)) messageEnergy = 'high';

  // Classify tone
  let tone = 'neutral';
  if (stressCount > 0) tone = 'stressed';
  else if (positiveCount > 1) tone = 'positive';
  else if (uncertaintyCount > 0) tone = 'uncertain';
  else if (exclamationCount >= 3) tone = 'intense';

  return {
    ts: now.toISOString(),
    hour,
    day,
    dateKey,
    words,
    chars,
    stressCount,
    uncertaintyCount,
    positiveCount,
    emojiCount,
    exclamationCount,
    questionCount,
    hasTypos,
    hasFatigue,
    isShort,
    isLong,
    messageEnergy,
    tone,
  };
}

function updateStats(data, entry) {
  // Hourly activity
  const hourKey = String(entry.hour);
  data.hourlyActivity[hourKey] = (data.hourlyActivity[hourKey] || 0) + 1;

  // Daily stats
  if (!data.dailyStats[entry.dateKey]) {
    data.dailyStats[entry.dateKey] = {
      messages: 0, totalWords: 0, stressEvents: 0, positiveEvents: 0,
      avgEnergy: [], tones: {},
    };
  }
  const ds = data.dailyStats[entry.dateKey];
  ds.messages++;
  ds.totalWords += entry.words;
  if (entry.stressCount > 0) ds.stressEvents++;
  if (entry.positiveCount > 0) ds.positiveEvents++;
  ds.avgEnergy.push(entry.messageEnergy === 'high' ? 1 : entry.messageEnergy === 'medium' ? 0.5 : 0);
  ds.tones[entry.tone] = (ds.tones[entry.tone] || 0) + 1;

  // Track message lengths for pattern detection
  data.messageLengths.push(entry.words);
  if (data.messageLengths.length > 200) data.messageLengths = data.messageLengths.slice(-200);

  // Stress topics - save context when stressed
  if (entry.stressCount > 0) {
    data.stressTopics.push({ ts: entry.ts, words: entry.words });
    if (data.stressTopics.length > 50) data.stressTopics = data.stressTopics.slice(-50);
  }

  // Keep only last 30 days of daily stats
  const dates = Object.keys(data.dailyStats).sort();
  if (dates.length > 30) {
    for (const d of dates.slice(0, dates.length - 30)) delete data.dailyStats[d];
  }

  return data;
}

// --- Commands ---

function cmdTrack(args) {
  const message = args.filter(a => !a.startsWith('--')).join(' ');
  if (!message) { console.error('Usage: node behavioral.js track "message"'); process.exit(1); }

  let data = loadData();
  const entry = analyzeMessage(message);
  data.entries.push(entry);
  data = updateStats(data, entry);
  saveData(data);

  console.log(JSON.stringify({
    ok: true,
    analysis: {
      tone: entry.tone,
      energy: entry.messageEnergy,
      words: entry.words,
      stress: entry.stressCount > 0,
      positive: entry.positiveCount > 0,
      uncertain: entry.uncertaintyCount > 0,
      fatigue: entry.hasFatigue,
    },
  }, null, 2));
}

function cmdReport(args) {
  const data = loadData();
  const fmt = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'summary';

  if (fmt === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Summary
  const entries = data.entries;
  const total = entries.length;
  if (total === 0) { console.log('No data yet. Use: node behavioral.js track "message"'); return; }

  // Peak hours
  const hours = Object.entries(data.hourlyActivity).sort((a, b) => b[1] - a[1]);
  const peakHours = hours.slice(0, 3).map(([h, c]) => `${h}:00 (${c})`);

  // Average message length
  const avgWords = Math.round(data.messageLengths.reduce((a, b) => a + b, 0) / data.messageLengths.length);

  // Tone distribution
  const tones = {};
  entries.forEach(e => { tones[e.tone] = (tones[e.tone] || 0) + 1; });
  const toneStr = Object.entries(tones).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}: ${c}`).join(', ');

  // Energy distribution
  const energies = {};
  entries.forEach(e => { energies[e.messageEnergy] = (energies[e.messageEnergy] || 0) + 1; });
  const energyStr = Object.entries(energies).sort((a, b) => b[1] - a[1]).map(([e, c]) => `${e}: ${c}`).join(', ');

  // Short vs long
  const shortCount = entries.filter(e => e.isShort).length;
  const longCount = entries.filter(e => e.isLong).length;

  console.log(`=== Behavioral Report ===
Messages analyzed: ${total}
Average length: ${avgWords} words

Peak activity hours: ${peakHours.join(', ')}

Tone distribution: ${toneStr}
Energy distribution: ${energyStr}

Short messages (≤3 words): ${shortCount} (${Math.round(shortCount/total*100)}%)
Long messages (≥20 words): ${longCount} (${Math.round(longCount/total*100)}%)

Stress events: ${entries.filter(e => e.stressCount > 0).length}
Positive events: ${entries.filter(e => e.positiveCount > 0).length}
Fatigue indicators: ${entries.filter(e => e.hasFatigue).length}
Typo indicators: ${entries.filter(e => e.hasTypos).length}
`);
}

function cmdTrends(args) {
  const data = loadData();
  const dIdx = args.indexOf('--days');
  const days = dIdx !== -1 ? parseInt(args[dIdx + 1]) || 7 : 7;

  const dates = Object.keys(data.dailyStats).sort().slice(-days);
  if (dates.length === 0) { console.log('No daily data yet.'); return; }

  console.log(`=== Trends (last ${days} days) ===\n`);
  for (const date of dates) {
    const ds = data.dailyStats[date];
    const avgE = ds.avgEnergy.length ? (ds.avgEnergy.reduce((a, b) => a + b, 0) / ds.avgEnergy.length).toFixed(2) : '?';
    const avgWords = ds.messages ? Math.round(ds.totalWords / ds.messages) : 0;
    const topTone = Object.entries(ds.tones).sort((a, b) => b[1] - a[1])[0]?.[0] || '?';
    console.log(`${date}: ${ds.messages} msgs, avg ${avgWords} words, energy ${avgE}, tone: ${topTone}, stress: ${ds.stressEvents}, positive: ${ds.positiveEvents}`);
  }
}

function cmdReset() {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
  console.log(JSON.stringify({ ok: true, status: 'reset' }));
}

// --- Main ---
const [,, command, ...args] = process.argv;

switch (command) {
  case 'track':   cmdTrack(args); break;
  case 'report':  cmdReport(args); break;
  case 'trends':  cmdTrends(args); break;
  case 'reset':   cmdReset(); break;
  default:
    console.log(`Behavioral Analytics for Sensus

Usage:
  node behavioral.js track "message"         Track a message
  node behavioral.js report [--format X]     View report (summary|json)
  node behavioral.js trends [--days N]       View daily trends
  node behavioral.js reset                   Clear all data

Tracks: message patterns, stress markers, energy levels,
        activity hours, tone distribution, fatigue indicators.`);
}
