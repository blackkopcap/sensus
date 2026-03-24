#!/usr/bin/env node
/**
 * Limbic — The Mediator (Amygdala)
 * Analyzes incoming messages via local LLM, updates hormones,
 * and profiles the human over time.
 *
 * Usage:
 *   node limbic.js analyze "message text here"
 *   node limbic.js analyze --stdin < message.txt
 *   node limbic.js profile [--format json|summary]
 *   node limbic.js configure [--model <name>] [--url <ollama_url>]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const CONFIG_FILE = path.join(process.cwd(), 'limbic-config.json');
const PROFILE_FILE = path.join(process.cwd(), 'human-profile.json');
const SENSUS_BIN = path.join(__dirname, 'sensus.js');

const DEFAULT_CONFIG = {
  model: 'gemma3:1b',
  ollamaUrl: 'http://localhost:11434',
  maxProfileObservations: 50,
};

// Synonym mapping for fuzzy matching of events
const SYNONYM_MAP = {
  thankfulness: 'gratitude',
  request: 'idle',
  assessment: 'curiosity', 
  ambition: 'curiosity',
  problem_description: 'frustration',
  time_delay: 'idle',
  confirmation: 'calm',
  support: 'trust',
  personal_matter: 'trust',
  question: 'curiosity',
  risk_taking: 'curiosity',
  card_deck: 'idle',
  trust_expression: 'trust',
  seeking_reassurance: 'trust',
  appreciation: 'gratitude',
  excitement: 'success',
  bug_issue: 'frustration',
  risk_seeking: 'curiosity',
  problem_solving: 'deep_work',
  technical_issue: 'frustration'
};

// Valid event types from sensus.js
const VALID_EVENTS = [
  'praise', 'criticism', 'humor', 'conflict', 'deep_work', 'success', 'failure', 
  'curiosity', 'boredom', 'trust', 'rejection', 'urgency', 'calm', 'gratitude', 
  'frustration', 'idle'
];

const SYSTEM_PROMPT = `You are an emotional analysis module (limbic system) for an AI agent.
Given a human's message, output ONLY valid JSON with these fields:

{
  "events": [{"type": "<event>", "intensity": <0.1-1.0>}],
  "human_signals": {
    "emotional_tone": "<word>",
    "energy_level": "<low|medium|high>",
    "intent": "<seeking_help|venting|casual|urgent|playful|informational>",
    "stress_indicators": <true|false>,
    "warmth_toward_agent": "<cold|neutral|warm>"
  },
  "profile_observation": "<brief trait observation or null>"
}

Event types: praise, criticism, humor, conflict, deep_work, success, failure, curiosity, boredom, trust, rejection, urgency, calm, gratitude, frustration, idle

Rules:
- Multiple events are allowed (e.g. humor + praise)
- Intensity: 0.1=barely, 0.5=moderate, 1.0=extreme
- profile_observation: note personality traits, communication patterns, preferences. null if nothing notable.
- Be concise. Output ONLY JSON, no markdown, no explanation.`;

// --- Helpers ---

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function loadProfile() {
  if (fs.existsSync(PROFILE_FILE)) {
    return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  }
  return { version: 1, traits: {}, patterns: {}, observations: [], lastAnalyzed: null };
}

function saveProfile(profile) {
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2));
}

function ollamaGenerate(cfg, prompt) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${cfg.ollamaUrl}/api/generate`);
    const mod = url.protocol === 'https:' ? https : http;

    const body = JSON.stringify({
      model: cfg.model,
      prompt,
      system: SYSTEM_PROMPT,
      stream: false,
      options: { temperature: 0.1, num_predict: 512 },
    });

    const req = mod.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(j.response || '');
        } catch { reject(new Error(`Ollama parse error: ${data.slice(0, 200)}`)); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')); });
    req.write(body);
    req.end();
  });
}

function execSensus(args) {
  const { execSync } = require('child_process');
  try {
    const out = execSync(`node "${SENSUS_BIN}" ${args}`, { cwd: process.cwd(), encoding: 'utf8', timeout: 5000 });
    return JSON.parse(out);
  } catch (e) {
    return { error: e.message };
  }
}

function saveEmotionalMemory(eventType, description, intensity) {
  const { execSync } = require('child_process');
  try {
    const home = process.env.HOME || '/Users/' + process.env.USER;
    const memoryBin = path.join(home, '.pyenv/shims/memory');
    const safeDesc = description.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 200);
    const safeTitle = `Emotional event: ${eventType}`;
    execSync(`"${memoryBin}" save --title "${safeTitle}" --what "${safeDesc}" --category context --tags "sensus,emotion,${eventType}" --project openclaw`, {
      encoding: 'utf8', timeout: 10000, stdio: 'ignore'
    });
    return true;
  } catch (e) {
    // Don't break the main flow if memory CLI is unavailable
    console.error(`[limbic] Failed to save emotional memory: ${e.message}`);
    return false;
  }
}

function parseJSON(text) {
  // Try to extract JSON from response (model might add markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  // Try cleaning
  try { return JSON.parse(text.trim()); } catch {}
  return null;
}

function normalizeEventType(eventType) {
  // Check if event type is valid
  if (VALID_EVENTS.includes(eventType)) {
    return eventType;
  }
  
  // Check synonym map
  if (SYNONYM_MAP[eventType]) {
    return SYNONYM_MAP[eventType];
  }
  
  // Unknown event type
  return null;
}

// --- Commands ---

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';  
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function getCurrentHormoneState() {
  try {
    const state = execSensus('read --format prompt');
    if (state && !state.error) {
      // Extract sensus prompt line 
      return state;
    }
  } catch (e) {
    // Ignore errors
  }
  return 'unknown';
}

function getRecentObservations(profile, count = 3) {
  if (!profile.observations || profile.observations.length === 0) {
    return [];
  }
  return profile.observations.slice(-count).map(obs => obs.observation);
}

async function cmdAnalyze(args) {
  const cfg = loadConfig();

  let message;
  if (args.includes('--stdin')) {
    message = fs.readFileSync('/dev/stdin', 'utf8').trim();
  } else {
    message = args.filter(a => !a.startsWith('--')).join(' ');
  }

  if (!message) {
    console.error('Usage: node limbic.js analyze "message text"');
    process.exit(1);
  }

  // Track behavioral analytics
  try {
    const { execSync: execS } = require('child_process');
    const behavioralBin = path.join(__dirname, 'behavioral.js');
    const sensusDir = path.join(__dirname, '..');
    const safeMsg = message.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 300);
    execS(`node "${behavioralBin}" track "${safeMsg}"`, { cwd: sensusDir, encoding: 'utf8', timeout: 3000, stdio: 'ignore' });
  } catch {}

  // Gather contextual information
  const profile = loadProfile();
  const timeOfDay = getTimeOfDay();
  const hormoneState = getCurrentHormoneState();
  const recentObservations = getRecentObservations(profile);
  
  // Build context prefix
  const contextParts = [`time=${timeOfDay}`];
  
  if (typeof hormoneState === 'string' && hormoneState !== 'unknown') {
    contextParts.push(`state=${hormoneState}`);
  }
  
  if (recentObservations.length > 0) {
    contextParts.push(`recent_traits: ${recentObservations.join(', ')}`);
  }
  
  const contextPrefix = `[context: ${contextParts.join(', ')}]`;
  
  // Call Ollama with enhanced prompt
  let analysis;
  try {
    const enhancedMessage = `${contextPrefix} Analyze this message:\n"${message}"`;
    const raw = await ollamaGenerate(cfg, enhancedMessage);
    analysis = parseJSON(raw);
    if (!analysis) {
      console.error('Failed to parse LLM response:', raw.slice(0, 300));
      process.exit(1);
    }
  } catch (e) {
    console.error(`Ollama error: ${e.message}`);
    console.error(`Is Ollama running? Model "${cfg.model}" pulled?`);
    process.exit(1);
  }

  // Apply events to sensus with fuzzy matching
  const eventResults = [];
  if (analysis.events && Array.isArray(analysis.events)) {
    for (const ev of analysis.events) {
      if (ev.type && ev.intensity) {
        const normalizedType = normalizeEventType(ev.type);
        
        if (normalizedType) {
          const r = execSensus(`event --type ${normalizedType} --intensity ${ev.intensity}`);
          
          // Save to emotional memory if intensity >= 0.7 (strong emotion)
          if (ev.intensity >= 0.7) {
            const description = `Strong ${normalizedType} event (intensity: ${ev.intensity}) from message: "${message.slice(0, 100)}"`;
            saveEmotionalMemory(normalizedType, description, ev.intensity);
          }
          
          eventResults.push({ 
            originalType: ev.type, 
            normalizedType, 
            intensity: ev.intensity,
            result: r.ok ? 'applied' : r.error 
          });
        } else {
          // Unknown event type - skip and log to stderr
          console.error(`[limbic] Unknown event type "${ev.type}" - skipping`);
          eventResults.push({ 
            originalType: ev.type, 
            normalizedType: null,
            intensity: ev.intensity,
            result: 'skipped_unknown' 
          });
        }
      }
    }
  }

  // Update human profile
  if (analysis.profile_observation && analysis.profile_observation !== 'null') {
    const profile = loadProfile();
    profile.observations.push({
      ts: new Date().toISOString(),
      observation: analysis.profile_observation,
      context: message.slice(0, 100),
    });
    if (profile.observations.length > (cfg.maxProfileObservations || 50)) {
      profile.observations = profile.observations.slice(-cfg.maxProfileObservations);
    }
    profile.lastAnalyzed = new Date().toISOString();
    saveProfile(profile);
  }

  // Read current state
  const currentState = execSensus('read --format json');

  console.log(JSON.stringify({
    ok: true,
    analysis: {
      events: analysis.events || [],
      human_signals: analysis.human_signals || {},
      profile_observation: analysis.profile_observation || null,
    },
    applied: eventResults,
    state: currentState,
  }, null, 2));
}

function cmdProfile(args) {
  const profile = loadProfile();
  const fmt = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'json';

  if (fmt === 'summary') {
    console.log('=== Human Profile ===');
    console.log(`Observations: ${profile.observations.length}`);
    console.log(`Last analyzed: ${profile.lastAnalyzed || 'never'}`);
    if (profile.traits && Object.keys(profile.traits).length) {
      console.log('\nTraits:');
      for (const [k, v] of Object.entries(profile.traits)) {
        console.log(`  ${k}: ${v}`);
      }
    }
    if (profile.observations.length) {
      console.log('\nRecent observations:');
      for (const obs of profile.observations.slice(-5)) {
        console.log(`  [${obs.ts.slice(0, 10)}] ${obs.observation}`);
      }
    }
  } else {
    console.log(JSON.stringify(profile, null, 2));
  }
}

async function cmdConsolidate() {
  const cfg = loadConfig();
  const profile = loadProfile();

  if (!profile.observations || profile.observations.length === 0) {
    console.log(JSON.stringify({ ok: true, message: 'No observations to consolidate' }, null, 2));
    return;
  }

  const consolidationPrompt = `You are analyzing a human's communication patterns and traits based on observations.

Observations:
${profile.observations.map(obs => `- [${obs.ts.slice(0, 10)}] ${obs.observation}`).join('\n')}

Based on these observations, update the profile with consistent traits and patterns. Output ONLY valid JSON:

{
  "traits": {
    "communication_style": "<formal|informal|technical|casual>",
    "emotional_baseline": "<stable|volatile|optimistic|pessimistic>", 
    "decision_making": "<analytical|intuitive|careful|impulsive>",
    "stress_response": "<calm|reactive|withdrawn|aggressive>",
    "humor_preference": "<dry|playful|sarcastic|none>",
    "energy_pattern": "<consistent|variable|morning_person|night_owl>"
  },
  "patterns": {
    "common_topics": ["<topic1>", "<topic2>"],
    "interaction_frequency": "<high|medium|low>",
    "feedback_style": "<direct|diplomatic|encouraging|critical>",
    "problem_solving_approach": "<methodical|creative|collaborative|independent>"
  }
}`;

  try {
    const raw = await ollamaGenerate(cfg, consolidationPrompt);
    const analysis = parseJSON(raw);
    
    if (!analysis) {
      console.error('Failed to parse consolidation response:', raw.slice(0, 300));
      process.exit(1);
    }

    // Update profile with consolidated traits and patterns
    if (analysis.traits) {
      profile.traits = { ...profile.traits, ...analysis.traits };
    }
    if (analysis.patterns) {
      profile.patterns = { ...profile.patterns, ...analysis.patterns };
    }
    
    profile.lastConsolidated = new Date().toISOString();
    saveProfile(profile);

    console.log(JSON.stringify({
      ok: true,
      message: 'Profile consolidated',
      observations_processed: profile.observations.length,
      traits_updated: Object.keys(analysis.traits || {}).length,
      patterns_updated: Object.keys(analysis.patterns || {}).length
    }, null, 2));

  } catch (e) {
    console.error(`Consolidation error: ${e.message}`);
    process.exit(1);
  }
}

function cmdConfigure(args) {
  const cfg = loadConfig();

  const mIdx = args.indexOf('--model');
  if (mIdx !== -1 && args[mIdx + 1]) cfg.model = args[mIdx + 1];

  const uIdx = args.indexOf('--url');
  if (uIdx !== -1 && args[uIdx + 1]) cfg.ollamaUrl = args[uIdx + 1];

  saveConfig(cfg);
  console.log(JSON.stringify({ ok: true, config: cfg }, null, 2));
}

// --- Main ---

const [,, command, ...args] = process.argv;

switch (command) {
  case 'analyze':     cmdAnalyze(args); break;
  case 'profile':     cmdProfile(args); break;
  case 'consolidate': cmdConsolidate(); break;
  case 'configure':   cmdConfigure(args); break;
  default:
    console.log(`Limbic — The Mediator (Amygdala)

Usage:
  node limbic.js analyze "message text"       Analyze message, update hormones & profile
  node limbic.js analyze --stdin              Read message from stdin
  node limbic.js profile [--format json|summary]  View human profile
  node limbic.js consolidate                  Consolidate observations into traits/patterns
  node limbic.js configure [--model X] [--url Y]  Configure LLM

Default model: ${DEFAULT_CONFIG.model}
Default Ollama: ${DEFAULT_CONFIG.ollamaUrl}`);
}
