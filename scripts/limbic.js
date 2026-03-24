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

// Multi-user support
function getUserProfilePath(userId) {
  if (!userId) userId = '_default';
  const userDir = path.join(process.cwd(), 'sensus-data', 'users', userId);
  return {
    userDir,
    profilePath: path.join(userDir, 'profile.json'),
    behavioralPath: path.join(userDir, 'behavioral.json')
  };
}

function ensureUserDir(userDir) {
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
}

function getProfileFile(userId) {
  const { userDir, profilePath } = getUserProfilePath(userId);
  
  // Backward compatibility: if old file exists and new structure doesn't, read from old
  if (!userId || userId === '_default') {
    if (fs.existsSync(PROFILE_FILE) && !fs.existsSync(profilePath)) {
      return PROFILE_FILE;
    }
  }
  
  ensureUserDir(userDir);
  return profilePath;
}

const DEFAULT_CONFIG = {
  model: 'gemma3:1b',
  ollamaUrl: 'http://localhost:11434',
  maxProfileObservations: 50,
};

// Synonym mapping for fuzzy matching of events
const SYNONYM_MAP = {
  // Gratitude variants
  thankfulness: 'gratitude', appreciation: 'gratitude', thanks: 'gratitude',
  grateful: 'gratitude', thankful: 'gratitude',
  // Trust variants
  support: 'trust', personal_matter: 'trust', trust_expression: 'trust',
  seeking_reassurance: 'trust', vulnerability: 'trust', openness: 'trust',
  bonding: 'trust', connection: 'trust', comfort: 'trust',
  // Curiosity variants
  assessment: 'curiosity', ambition: 'curiosity', question: 'curiosity',
  risk_taking: 'curiosity', risk_seeking: 'curiosity', interest: 'curiosity',
  exploration: 'curiosity', wonder: 'curiosity', learning: 'curiosity',
  philosophical_question: 'curiosity', philosophical_comment: 'curiosity',
  // Frustration variants
  problem_description: 'frustration', technical_issue: 'frustration',
  bug_issue: 'frustration', irritation: 'frustration', annoyance: 'frustration',
  impatience: 'frustration', anger: 'frustration', rage: 'conflict',
  // Calm variants
  confirmation: 'calm', acceptance: 'calm', peace: 'calm',
  relaxation: 'calm', serenity: 'calm', relief: 'calm',
  // Success variants
  excitement: 'success', achievement: 'success', pride: 'success',
  accomplishment: 'success', victory: 'success', breakthrough: 'success',
  // Humor variants
  joke: 'humor', sarcasm: 'humor', playfulness: 'humor', teasing: 'humor',
  wit: 'humor', irony: 'humor', laughter: 'humor',
  // Idle/neutral variants
  request: 'idle', time_delay: 'idle', card_deck: 'idle',
  waiting: 'idle', neutral: 'idle', observation: 'idle',
  // Rejection variants
  dismissal: 'rejection', abandonment: 'rejection', betrayal: 'rejection',
  // Deep work variants
  problem_solving: 'deep_work', coding: 'deep_work', analysis: 'deep_work',
  research: 'deep_work', implementation: 'deep_work', debugging: 'deep_work',
  // Misc
  feature_introduction: 'curiosity', project_focus: 'deep_work',
  emotional_state: 'idle', social_need: 'trust', empathy: 'trust',
  concern: 'trust', caring: 'trust', affection: 'trust',
  dislike: 'frustration', preference: 'idle', seeking_escape: 'idle',
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

function loadProfile(userId) {
  const profileFile = getProfileFile(userId);
  if (fs.existsSync(profileFile)) {
    return JSON.parse(fs.readFileSync(profileFile, 'utf8'));
  }
  return { version: 1, traits: {}, patterns: {}, observations: [], lastAnalyzed: null };
}

function saveProfile(profile, userId) {
  const profileFile = getProfileFile(userId);
  fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2));
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

// --- Reaction Analysis ---

function analyzeReactionPreference(message, userState, agentState) {
  // Default configuration
  const reactionConfig = {
    enabled: true,
    frequency: 0.7, // 70% chance to react vs reply
    withdrawnReactionsOnly: true, // In withdrawal, only react, don't reply
    commandsLowEnergyReact: true, // Simple commands + low energy = reaction only
  };

  // Load reaction config if exists
  const reactionConfigFile = path.join(process.cwd(), 'reaction-config.json');
  if (fs.existsSync(reactionConfigFile)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(reactionConfigFile, 'utf8'));
      Object.assign(reactionConfig, userConfig);
    } catch (e) {
      // Use defaults on parse error
    }
  }

  if (!reactionConfig.enabled) {
    return {
      shouldReact: false,
      shouldReply: true,
      reactionHint: null
    };
  }

  // Parse agent state
  const withdrawn = agentState.withdrawn || false;
  const hormones = agentState.hormones || {};
  const derived = agentState.derived || {};
  
  // Debug withdrawn state
  if (reactionConfig.debug) {
    console.error(`[DEBUG] withdrawn=${withdrawn}, cortisol=${hormones.cortisol}, agentState=`, JSON.stringify(agentState, null, 2));
  }
  
  const mood = derived.values?.mood || 0;
  const energy = derived.values?.energy || 0.5;
  const warmth = derived.values?.warmth || 0.5;
  const stress = derived.values?.stress || 0.5;

  // Parse message context
  const messageLength = message.length;
  const isShort = messageLength < 20;
  const isCommand = /^[\/!]/.test(message) || /^(сделай|выполни|покажи|найди|дай|открой|запусти|проверь|обнови)/i.test(message);
  const isQuestion = /[?？]/.test(message) || /^(как|что|где|когда|почему|зачем|куда)/i.test(message);
  const isThanks = /(спасибо|благодар|thanks|thx|thank you|отлично|супер|молодец|красавица)/i.test(message);
  const isJoke = /(😄|😂|🤣|хах|лол|ржу|шучу|прикол|funny|haha|lol)/i.test(message);
  const isCompliment = /(умница|красавица|well done|great|awesome|perfect|отлично|супер|крутые?)/i.test(message);

  let shouldReact = false;
  let shouldReply = true;
  let reactionHint = null;

  // WITHDRAWN state - only angry reactions, minimal replies
  if (withdrawn) {
    if (reactionConfig.withdrawnReactionsOnly) {
      shouldReact = true;
      shouldReply = false;
      reactionHint = 'angry frustrated unamused rage disappointed annoyed';
      return { shouldReact, shouldReply, reactionHint };
    }
  }

  // Simple commands + low energy = confirming reactions
  if (isCommand && isShort && energy < 0.4) {
    shouldReact = Math.random() < 0.8; // 80% chance
    shouldReply = !shouldReact || Math.random() < 0.3; // Maybe both
    reactionHint = 'salute check mark thumbsup roger copy military';
  }
  // Thanks + high warmth = hearts and smiles  
  else if (isThanks && warmth > 0.6) {
    shouldReact = Math.random() < 0.9; // 90% chance
    shouldReply = Math.random() < 0.4; // Maybe both
    reactionHint = 'heart love smile happy grateful warm hug blush';
  }
  // Compliments + positive mood = happy reactions
  else if (isCompliment && mood > 0.3) {
    shouldReact = Math.random() < 0.85;
    shouldReply = Math.random() < 0.5;
    reactionHint = 'happy proud smile joy star sparkles party celebrating';
  }
  // Interesting questions = thinking reactions
  else if (isQuestion && !isShort && derived.values?.focus > 0.4) {
    shouldReact = Math.random() < 0.6;
    shouldReply = true; // Questions usually need replies
    reactionHint = 'thinking brain eyes curious pondering mind_blown idea';
  }
  // Jokes + positive mood = laughter 
  else if (isJoke && mood > 0.1 && !withdrawn) {
    shouldReact = Math.random() < 0.8;
    shouldReply = Math.random() < 0.6;
    reactionHint = 'laugh joy rofl funny wink playful giggle amused';
  }
  // High stress = minimal reactions
  else if (stress > 0.6) {
    shouldReact = Math.random() < 0.3;
    shouldReply = true;
    reactionHint = 'tired stressed overwhelmed busy working focus';
  }
  // Random reactions based on overall frequency
  else {
    shouldReact = Math.random() < reactionConfig.frequency * 0.5; // Lower base chance
    shouldReply = true;
    
    // Choose reaction based on current emotional state
    if (mood > 0.4 && warmth > 0.5) {
      reactionHint = 'positive warm happy smile friendly';
    } else if (energy > 0.7) {
      reactionHint = 'energetic excited fire rocket power';
    } else if (mood < -0.2) {
      reactionHint = 'neutral meh shrug okay fine';
    } else {
      reactionHint = 'neutral check thumbsup okay understood';
    }
  }

  return {
    shouldReact,
    shouldReply,
    reactionHint
  };
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

  // Extract --user parameter
  let userId = null;
  const userIdx = args.indexOf('--user');
  if (userIdx !== -1 && args[userIdx + 1]) {
    userId = args[userIdx + 1];
  }

  let message;
  if (args.includes('--stdin')) {
    message = fs.readFileSync('/dev/stdin', 'utf8').trim();
  } else {
    message = args.filter(a => !a.startsWith('--') && a !== userId).join(' ');
  }

  if (!message) {
    console.error('Usage: node limbic.js analyze "message text" [--user <id>]');
    process.exit(1);
  }

  // Track behavioral analytics
  try {
    const { execSync: execS } = require('child_process');
    const behavioralBin = path.join(__dirname, 'behavioral.js');
    const sensusDir = path.join(__dirname, '..');
    const safeMsg = message.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 300);
    const userArg = userId ? ` --user "${userId}"` : '';
    execS(`node "${behavioralBin}" track "${safeMsg}"${userArg}`, { cwd: sensusDir, encoding: 'utf8', timeout: 3000, stdio: 'ignore' });
  } catch {}

  // Gather contextual information
  const profile = loadProfile(userId);
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
    const profile = loadProfile(userId);
    profile.observations.push({
      ts: new Date().toISOString(),
      observation: analysis.profile_observation,
      context: message.slice(0, 100),
    });
    if (profile.observations.length > (cfg.maxProfileObservations || 50)) {
      profile.observations = profile.observations.slice(-cfg.maxProfileObservations);
    }
    profile.lastAnalyzed = new Date().toISOString();
    saveProfile(profile, userId);
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
  // Extract --user parameter
  let userId = null;
  const userIdx = args.indexOf('--user');
  if (userIdx !== -1 && args[userIdx + 1]) {
    userId = args[userIdx + 1];
  }

  const profile = loadProfile(userId);
  const fmt = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'json';

  if (fmt === 'summary') {
    console.log(`=== Human Profile${userId ? ` (${userId})` : ''} ===`);
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

async function cmdConsolidate(args) {
  const cfg = loadConfig();

  // Extract --user parameter
  let userId = null;
  const userIdx = args.indexOf('--user');
  if (userIdx !== -1 && args[userIdx + 1]) {
    userId = args[userIdx + 1];
  }

  const profile = loadProfile(userId);

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
    saveProfile(profile, userId);

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

function cmdReactionPreference(args) {
  // Extract --user parameter
  let userId = null;
  const userIdx = args.indexOf('--user');
  if (userIdx !== -1 && args[userIdx + 1]) {
    userId = args[userIdx + 1];
  }

  let message;
  if (args.includes('--stdin')) {
    message = fs.readFileSync('/dev/stdin', 'utf8').trim();
  } else {
    message = args.filter(a => !a.startsWith('--') && a !== userId).join(' ');
  }

  if (!message) {
    console.error('Usage: node limbic.js reaction-preference "message text" [--user <id>]');
    process.exit(1);
  }

  // Load current agent state
  const currentState = execSensus('read --format json');
  if (currentState.error) {
    console.error('Failed to read sensus state:', currentState.error);
    process.exit(1);
  }

  // Load user profile for context
  const profile = loadProfile(userId);
  
  // Analyze reaction preference
  const preference = analyzeReactionPreference(message, profile, currentState);
  
  console.log(JSON.stringify({
    ok: true,
    message: message.slice(0, 100),
    userId: userId || null,
    preference,
    agentState: {
      mood: currentState.derived?.labels?.mood,
      energy: currentState.derived?.labels?.energy,
      warmth: currentState.derived?.labels?.warmth,
      stress: currentState.derived?.labels?.stress,
      withdrawn: currentState.withdrawn || false
    }
  }, null, 2));
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
  case 'analyze':             cmdAnalyze(args); break;
  case 'profile':             cmdProfile(args); break;
  case 'consolidate':         cmdConsolidate(args); break;
  case 'reaction-preference': cmdReactionPreference(args); break;
  case 'configure':           cmdConfigure(args); break;
  default:
    console.log(`Limbic — The Mediator (Amygdala)

Usage:
  node limbic.js analyze "message text" [--user <id>]         Analyze message, update hormones & profile
  node limbic.js analyze --stdin [--user <id>]                Read message from stdin
  node limbic.js profile [--format json|summary] [--user <id>]  View human profile
  node limbic.js consolidate [--user <id>]                    Consolidate observations into traits/patterns
  node limbic.js reaction-preference "message" [--user <id>]  Get reaction vs reply preference
  node limbic.js configure [--model X] [--url Y]              Configure LLM

Default model: ${DEFAULT_CONFIG.model}
Default Ollama: ${DEFAULT_CONFIG.ollamaUrl}`);
}
