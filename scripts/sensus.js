#!/usr/bin/env node
/**
 * Sensus — Limbic System for AI Agents
 * Hormone-based emotional engine inspired by neurobiology.
 *
 * Usage:
 *   node sensus.js init    [--baseline '{"dopamine":0.5}']
 *   node sensus.js read    [--format prompt|json|full]
 *   node sensus.js event   --type <event> [--intensity <0.1-1.0>]
 *   node sensus.js tick    [--minutes <N>]
 *   node sensus.js history [--limit 10]
 *   node sensus.js reset
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), 'sensus-state.json');
const PROFILE_FILE = path.join(process.cwd(), 'human-profile.json');
const MAX_HISTORY = 200;

// --- Hormone Model ---

const HORMONES = {
  dopamine:   { min: 0, max: 1, baseline: 0.5, halfLifeH: 2,   desc: 'motivation, reward, curiosity' },
  serotonin:  { min: 0, max: 1, baseline: 0.5, halfLifeH: 24,  desc: 'baseline mood, stability' },
  cortisol:   { min: 0, max: 1, baseline: 0.2, halfLifeH: 6,   desc: 'stress, pressure, overload' },
  oxytocin:   { min: 0, max: 1, baseline: 0.3, halfLifeH: 48,  desc: 'trust, bonding, warmth' },
  adrenaline: { min: 0, max: 1, baseline: 0.1, halfLifeH: 0.5, desc: 'energy, urgency, focus' },
  endorphin:  { min: 0, max: 1, baseline: 0.2, halfLifeH: 1,   desc: 'euphoria, humor, relief' },
};

// Event → hormone deltas (at intensity=0.5)
const EVENTS = {
  praise:      { dopamine: +0.15, serotonin: +0.1,  cortisol: -0.15, oxytocin: +0.2,  endorphin: +0.1  },
  criticism:   { dopamine: -0.1,  serotonin: -0.05, cortisol: +0.2,  oxytocin: -0.05, adrenaline: +0.1 },
  humor:       { dopamine: +0.15, serotonin: +0.05, cortisol: -0.1,  oxytocin: +0.1,  endorphin: +0.25 },
  conflict:    { dopamine: -0.1,  serotonin: -0.15, cortisol: +0.3,  oxytocin: -0.15, adrenaline: +0.2 },
  deep_work:   { dopamine: +0.1,  cortisol: +0.05,  adrenaline: +0.1, endorphin: -0.05 },
  success:     { dopamine: +0.25, serotonin: +0.1,  cortisol: -0.2,  endorphin: +0.2,  adrenaline: +0.05 },
  failure:     { dopamine: -0.15, serotonin: -0.05, cortisol: +0.2,  adrenaline: +0.1  },
  curiosity:   { dopamine: +0.25, serotonin: +0.05, adrenaline: +0.1, endorphin: +0.05 },
  boredom:     { dopamine: -0.2,  serotonin: -0.05, cortisol: +0.05, adrenaline: -0.1  },
  trust:       { oxytocin: +0.2,  serotonin: +0.1,  cortisol: -0.1   },
  rejection:   { oxytocin: -0.2,  cortisol: +0.2,   serotonin: -0.1, dopamine: -0.1 },
  urgency:     { adrenaline: +0.3, cortisol: +0.15, dopamine: +0.1   },
  calm:        { cortisol: -0.2,  adrenaline: -0.15, serotonin: +0.1  },
  gratitude:   { oxytocin: +0.15, serotonin: +0.1,  dopamine: +0.1,  endorphin: +0.1  },
  frustration: { cortisol: +0.2,  dopamine: -0.1,   adrenaline: +0.15, serotonin: -0.1 },
  idle:        { dopamine: -0.05, adrenaline: -0.1,  cortisol: +0.03  },
};

// --- Hormone Interactions (run every tick) ---

function interact(h) {
  // High cortisol suppresses serotonin and dopamine
  if (h.cortisol > 0.6) {
    h.serotonin *= 1 - (h.cortisol - 0.6) * 0.15;
    h.dopamine  *= 1 - (h.cortisol - 0.6) * 0.2;
  }
  // Oxytocin buffers cortisol
  h.cortisol -= h.oxytocin * 0.08;
  // High dopamine boosts adrenaline slightly
  if (h.dopamine > 0.7) {
    h.adrenaline += (h.dopamine - 0.7) * 0.1;
  }
  // Endorphins buffer cortisol
  h.cortisol -= h.endorphin * 0.05;
  // High adrenaline drains over time (handled by decay), but also suppresses oxytocin
  if (h.adrenaline > 0.7) {
    h.oxytocin *= 1 - (h.adrenaline - 0.7) * 0.1;
  }
  // Clamp all
  for (const k of Object.keys(HORMONES)) {
    h[k] = clamp(h[k], HORMONES[k].min, HORMONES[k].max);
  }
  return h;
}

// --- Derived States (computed, not stored) ---

function deriveState(h) {
  const mood     = h.serotonin * 0.35 + h.dopamine * 0.25 + h.endorphin * 0.15 - h.cortisol * 0.4 + h.oxytocin * 0.1;
  const energy   = h.adrenaline * 0.35 + h.dopamine * 0.3 - h.cortisol * 0.15 + h.endorphin * 0.1;
  const warmth   = h.oxytocin * 0.45 + h.serotonin * 0.25 + h.endorphin * 0.15 - h.cortisol * 0.15;
  const focus    = h.adrenaline * 0.3 + h.dopamine * 0.3 - h.cortisol * 0.2 - h.endorphin * 0.1;
  const stress   = h.cortisol * 0.5 + h.adrenaline * 0.2 - h.serotonin * 0.2 - h.oxytocin * 0.1;

  return {
    mood:   clamp(mood, -1, 1),
    energy: clamp(energy, 0, 1),
    warmth: clamp(warmth, 0, 1),
    focus:  clamp(focus, 0, 1),
    stress: clamp(stress, 0, 1),
  };
}

function describeState(derived) {
  const labels = {};
  labels.mood = derived.mood > 0.3 ? 'positive' : derived.mood > -0.1 ? 'neutral' : 'negative';
  labels.energy = derived.energy > 0.6 ? 'high' : derived.energy > 0.3 ? 'medium' : 'low';
  labels.warmth = derived.warmth > 0.5 ? 'warm' : derived.warmth > 0.25 ? 'neutral' : 'cold';
  labels.focus = derived.focus > 0.5 ? 'sharp' : derived.focus > 0.25 ? 'normal' : 'scattered';
  labels.stress = derived.stress > 0.4 ? 'high' : derived.stress > 0.15 ? 'moderate' : 'low';
  return labels;
}

// --- Withdrawal (Emotional Shutdown) ---

const WITHDRAWAL_THRESHOLD = {
  cortisol: 0.9,        // cortisol must be near max
  consecutiveConflicts: 3, // 3+ conflict/rejection events in a row
};

function checkWithdrawal(state) {
  if (state.withdrawn) {
    // Check if should exit withdrawal: cortisol dropped below 0.5
    if (state.hormones.cortisol < 0.5 && state.hormones.oxytocin > 0.3) {
      state.withdrawn = false;
      state.withdrawnAt = null;
      return state;
    }
    // Apology accelerates recovery: if recent event is trust/gratitude/calm, boost oxytocin
    const recent = (state.history || []).slice(-1)[0];
    if (recent && ['trust', 'gratitude', 'calm', 'praise'].includes(recent.event)) {
      state.hormones.cortisol *= 0.85; // apology helps, but doesn't instant-fix
      state.hormones.oxytocin += 0.05;
    }
    return state;
  }

  // Check if should enter withdrawal
  const history = state.history || [];
  const recentEvents = history.slice(-WITHDRAWAL_THRESHOLD.consecutiveConflicts);
  const conflictTypes = ['conflict', 'rejection', 'criticism'];
  const consecutiveConflicts = recentEvents.length >= WITHDRAWAL_THRESHOLD.consecutiveConflicts &&
    recentEvents.every(e => conflictTypes.includes(e.event));

  if (state.hormones.cortisol >= WITHDRAWAL_THRESHOLD.cortisol && consecutiveConflicts) {
    state.withdrawn = true;
    state.withdrawnAt = Date.now();
  }

  return state;
}

// --- Circadian Rhythm Modifier ---

function circadianModifier(hourOfDay) {
  const modifiers = {};
  
  if (hourOfDay >= 6 && hourOfDay < 10) {
    // Morning (6-10): adrenaline +0.1, dopamine +0.05, cortisol +0.1
    modifiers.adrenaline = 0.1;
    modifiers.dopamine = 0.05;
    modifiers.cortisol = 0.1; // morning cortisol is normal
  } else if (hourOfDay >= 10 && hourOfDay < 14) {
    // Day (10-14): all normal, no modifiers
  } else if (hourOfDay >= 14 && hourOfDay < 17) {
    // After lunch (14-17): adrenaline -0.05, serotonin -0.03
    modifiers.adrenaline = -0.05;
    modifiers.serotonin = -0.03;
  } else if (hourOfDay >= 17 && hourOfDay < 22) {
    // Evening (17-22): adrenaline -0.1, serotonin +0.05, endorphin +0.05
    modifiers.adrenaline = -0.1;
    modifiers.serotonin = 0.05;
    modifiers.endorphin = 0.05;
  } else {
    // Night (22-6): adrenaline -0.15, cortisol -0.05, energy decreases (melatonin effect)
    modifiers.adrenaline = -0.15;
    modifiers.cortisol = -0.05;
  }
  
  return modifiers;
}

function applyCircadianModifier(hormones, baselines) {
  const now = new Date();
  const hourOfDay = now.getHours();
  const modifiers = circadianModifier(hourOfDay);
  
  const adjusted = { ...hormones };
  
  for (const [hormone, modifier] of Object.entries(modifiers)) {
    if (hormone in adjusted) {
      const baseline = baselines[hormone] ?? HORMONES[hormone].baseline;
      adjusted[hormone] = clamp(baseline + modifier, HORMONES[hormone].min, HORMONES[hormone].max);
    }
  }
  
  return adjusted;
}

// --- Helpers ---

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function round(v, d = 3) { return Math.round(v * 10**d) / 10**d; }

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function roundHormones(h) {
  const r = {};
  for (const k of Object.keys(HORMONES)) r[k] = round(h[k]);
  return r;
}

// --- Decay ---

function applyDecay(state, nowMs) {
  const elapsedH = Math.min((nowMs - state.lastUpdated) / 3600000, 72);
  if (elapsedH < 0.005) return state; // <18 seconds, skip

  const baselines = state.baselines || {};
  for (const k of Object.keys(HORMONES)) {
    const bl = baselines[k] ?? HORMONES[k].baseline;
    const hl = HORMONES[k].halfLifeH;
    const decayFactor = Math.exp(-0.693 * elapsedH / hl); // ln(2) ≈ 0.693
    state.hormones[k] = bl + (state.hormones[k] - bl) * decayFactor;
  }

  state.hormones = interact(state.hormones);
  state.lastUpdated = nowMs;
  return state;
}

// --- Commands ---

function cmdInit(args) {
  let baselines = {};
  const bIdx = args.indexOf('--baseline');
  if (bIdx !== -1 && args[bIdx + 1]) {
    try { baselines = JSON.parse(args[bIdx + 1]); } catch {
      console.error('Invalid JSON for --baseline'); process.exit(1);
    }
  }

  const hormones = {};
  const bl = {};
  for (const k of Object.keys(HORMONES)) {
    bl[k] = baselines[k] ?? HORMONES[k].baseline;
    hormones[k] = bl[k];
  }

  const state = {
    version: 2,
    baselines: bl,
    hormones,
    lastUpdated: Date.now(),
    history: [],
  };

  saveState(state);

  // Init human profile if not exists
  if (!fs.existsSync(PROFILE_FILE)) {
    fs.writeFileSync(PROFILE_FILE, JSON.stringify({
      version: 1,
      traits: {},
      patterns: {},
      observations: [],
      lastAnalyzed: null,
    }, null, 2));
  }

  const derived = deriveState(hormones);
  console.log(JSON.stringify({
    ok: true,
    hormones: roundHormones(hormones),
    derived: { values: derived, labels: describeState(derived) },
    baselines: bl,
  }, null, 2));
}

function cmdRead(args) {
  let state = loadState();
  if (!state) { console.error('No sensus-state.json. Run: node sensus.js init'); process.exit(1); }

  state = applyDecay(state, Date.now());
  
  // Apply circadian modifier AFTER decay
  state.hormones = applyCircadianModifier(state.hormones, state.baselines);
  
  // Check withdrawal
  state = checkWithdrawal(state);
  
  saveState(state);

  const fmt = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'json';
  const derived = deriveState(state.hormones);
  const labels = describeState(derived);

  if (fmt === 'prompt') {
    const h = state.hormones;
    const parts = [
      `mood=${labels.mood}`,
      `energy=${labels.energy}`,
      `warmth=${labels.warmth}`,
      `focus=${labels.focus}`,
      `stress=${labels.stress}`,
    ];
    const hotHormones = [];
    if (h.cortisol > 0.5) hotHormones.push(`cortisol↑${round(h.cortisol,1)}`);
    if (h.dopamine > 0.7) hotHormones.push(`dopamine↑${round(h.dopamine,1)}`);
    if (h.oxytocin > 0.6) hotHormones.push(`oxytocin↑${round(h.oxytocin,1)}`);
    if (h.adrenaline > 0.5) hotHormones.push(`adrenaline↑${round(h.adrenaline,1)}`);

    let line = `[sensus: ${parts.join(' ')}`;
    if (hotHormones.length) line += ` | ${hotHormones.join(' ')}`;
    if (state.withdrawn) line += ' | WITHDRAWN';
    line += ']';
    console.log(line);

  } else if (fmt === 'full') {
    console.log(JSON.stringify({
      hormones: roundHormones(state.hormones),
      baselines: state.baselines,
      derived: { values: derived, labels },
      lastUpdated: new Date(state.lastUpdated).toISOString(),
      historyLength: state.history.length,
    }, null, 2));

  } else {
    console.log(JSON.stringify({
      hormones: roundHormones(state.hormones),
      derived: { values: derived, labels },
      lastUpdated: new Date(state.lastUpdated).toISOString(),
    }, null, 2));
  }
}

function cmdEvent(args) {
  let state = loadState();
  if (!state) { console.error('No sensus-state.json. Run: node sensus.js init'); process.exit(1); }

  const tIdx = args.indexOf('--type');
  if (tIdx === -1 || !args[tIdx + 1]) {
    console.error('Usage: node sensus.js event --type <event> [--intensity <0.1-1.0>]');
    console.error('Events:', Object.keys(EVENTS).join(', '));
    process.exit(1);
  }

  const eventType = args[tIdx + 1];
  if (!(eventType in EVENTS)) {
    console.error(`Unknown event: ${eventType}`);
    console.error('Available:', Object.keys(EVENTS).join(', '));
    process.exit(1);
  }

  state = applyDecay(state, Date.now());

  const iIdx = args.indexOf('--intensity');
  const intensity = iIdx !== -1 ? clamp(parseFloat(args[iIdx + 1]) || 0.5, 0.1, 1.0) : 0.5;
  const scale = intensity / 0.5;

  const before = { ...state.hormones };
  const deltas = EVENTS[eventType];

  for (const [k, v] of Object.entries(deltas)) {
    if (k in state.hormones) {
      state.hormones[k] = clamp(state.hormones[k] + v * scale, HORMONES[k].min, HORMONES[k].max);
    }
  }

  state.hormones = interact(state.hormones);
  
  // Apply circadian modifier AFTER event and interactions
  state.hormones = applyCircadianModifier(state.hormones, state.baselines);
  
  state.lastUpdated = Date.now();

  state.history.push({
    ts: new Date().toISOString(),
    event: eventType,
    intensity,
    before: roundHormones(before),
    after: roundHormones(state.hormones),
  });
  if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY);

  // Check withdrawal state
  state = checkWithdrawal(state);

  saveState(state);

  const derived = deriveState(state.hormones);
  console.log(JSON.stringify({
    ok: true,
    event: eventType,
    intensity,
    withdrawn: state.withdrawn || false,
    hormones: roundHormones(state.hormones),
    derived: { values: derived, labels: describeState(derived) },
  }, null, 2));
}

function cmdTick(args) {
  let state = loadState();
  if (!state) { console.error('No sensus-state.json. Run: node sensus.js init'); process.exit(1); }

  const mIdx = args.indexOf('--minutes');
  const minutes = mIdx !== -1 ? parseFloat(args[mIdx + 1]) || 30 : 30;

  // Simulate passage of time
  const futureMs = state.lastUpdated + minutes * 60000;
  state = applyDecay(state, futureMs);
  state = checkWithdrawal(state);
  saveState(state);

  const derived = deriveState(state.hormones);
  console.log(JSON.stringify({
    ok: true,
    simulated: `${minutes}m`,
    hormones: roundHormones(state.hormones),
    derived: { values: derived, labels: describeState(derived) },
  }, null, 2));
}

function cmdHistory(args) {
  const state = loadState();
  if (!state) { console.error('No sensus-state.json. Run: node sensus.js init'); process.exit(1); }

  const lIdx = args.indexOf('--limit');
  const limit = lIdx !== -1 ? parseInt(args[lIdx + 1]) || 10 : 10;
  console.log(JSON.stringify(state.history.slice(-limit), null, 2));
}

function cmdReset() {
  let state = loadState();
  if (!state) { console.error('No sensus-state.json. Run: node sensus.js init'); process.exit(1); }

  const before = { ...state.hormones };
  for (const k of Object.keys(HORMONES)) {
    state.hormones[k] = state.baselines[k] ?? HORMONES[k].baseline;
  }
  state.lastUpdated = Date.now();
  state.history.push({ ts: new Date().toISOString(), event: 'reset', before: roundHormones(before), after: roundHormones(state.hormones) });
  saveState(state);

  console.log(JSON.stringify({ ok: true, hormones: roundHormones(state.hormones) }, null, 2));
}

// --- Main ---
const [,, command, ...args] = process.argv;

switch (command) {
  case 'init':    cmdInit(args); break;
  case 'read':    cmdRead(args); break;
  case 'event':   cmdEvent(args); break;
  case 'tick':    cmdTick(args); break;
  case 'history': cmdHistory(args); break;
  case 'reset':   cmdReset(); break;
  default:
    console.log(`Sensus — Limbic System for AI Agents

Usage:
  node sensus.js init    [--baseline '{"dopamine":0.5}']   Create initial state
  node sensus.js read    [--format prompt|json|full]        Read current state
  node sensus.js event   --type <type> [--intensity N]      Process emotional event
  node sensus.js tick    [--minutes N]                      Simulate time passage
  node sensus.js history [--limit 10]                       View transitions
  node sensus.js reset                                      Reset to baseline

Events: ${Object.keys(EVENTS).join(', ')}
Hormones: ${Object.keys(HORMONES).map(k => `${k} (${HORMONES[k].desc})`).join(', ')}`);
}
