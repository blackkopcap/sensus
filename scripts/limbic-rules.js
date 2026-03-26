#!/usr/bin/env node
/**
 * Limbic Rules — Fast rule-based emotional classification
 * Replaces LLM-based limbic.js for speed and accuracy
 * 
 * Usage:
 *   node limbic-rules.js analyze "message text"
 *   node limbic-rules.js analyze --stdin < message.txt
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SENSUS_BIN = path.join(__dirname, 'sensus.js');
const CONFIG_PATH = path.join(__dirname, '..', 'sensus-config.json');

// Load feature flags
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return { features: {} };
  }
}

function isFeatureEnabled(feature) {
  const config = loadConfig();
  return config.features && config.features[feature] === true;
}

// --- Pattern Rules ---

const RULES = [
  // Praise / gratitude
  { pattern: /спасибо|благодар|молодец|круто|отлично|супер|здорово|классн|perfect|great|awesome|nice|well done|good job|умница|браво/i,
    event: 'praise', intensity: 0.6 },
  
  { pattern: /огромное спасибо|ты лучш|невероятн|потрясающ|обожаю|amazing|incredible/i,
    event: 'praise', intensity: 0.9 },

  // Сленговая похвала / одобрение
  { pattern: /красав[аец]|(?<![а-яё])топ(?![а-яё])|(?<![а-яё])огонь(?![а-яё])|респект|жесть|🔥|👍|💪|дай пять|пять!|ну ты даёшь|(?<![а-яё])голд(?![а-яё])|(?<![а-яё])база(?![а-яё])|(?<![а-яё])кайф(?![а-яё])|мощь|шикарн|бомба|(?<![a-z])fire(?![a-z])|(?<![a-z])legend(?![a-z])|(?<![a-z])goat(?![a-z])/i,
    event: 'praise', intensity: 0.5 },

  // Warmth / affection
  { pattern: /обнимаю|❤️|💜|🤗|люблю|скучаю|дорог[ао]й|родн[ао]й|братан|сестра|бро|друг|подруга/i,
    event: 'trust', intensity: 0.5 },

  // Conflict / insults
  { pattern: /идиот|тупая|дура|бесиш|заткни|ненавижу|пошл[аи]? (ты|вы|на)|fuck|shit|damn|убл[юя]док|сука/i,
    event: 'conflict', intensity: 0.9 },

  { pattern: /не нравится|раздражает|достал[аи]?|надоел[аи]?|хватит|стоп/i,
    event: 'conflict', intensity: 0.5 },

  // Criticism
  { pattern: /неправильно|ошибка|ошиблась|косяк|баг|не так|wrong|incorrect|плохо сделала/i,
    event: 'criticism', intensity: 0.6 },

  // Humor / trolling
  { pattern: /😂|🤣|хаха|ахах|лол|lol|lmao|rofl|ржу|угар|прикол|шутк/i,
    event: 'humor', intensity: 0.5 },

  { pattern: /троллиш|тролль|подкол|подстав|развод|впарить/i,
    event: 'humor', intensity: 0.7 },

  // Emotional / personal
  { pattern: /чувству|переживаю|боюсь|тревож|грустн|плач|расплакал|одинок|тоскую|скучаю|больно|страдаю/i,
    event: 'trust', intensity: 0.7 },

  { pattern: /люблю тебя|скучаю по тебе|ты мне нужн|обними|поддержи/i,
    event: 'trust', intensity: 0.9 },

  { pattern: /измен[аи]|развод|расстал|ссор[аи]|скандал|предал/i,
    event: 'conflict', intensity: 0.8 },

  // Frustration (work)
  { pattern: /не работает|сломал|упал|падает|ошибка|error|failed|broken|timeout|crash/i,
    event: 'frustration', intensity: 0.5 },

  { pattern: /задолбал|достали|бесит|утомил|надоел/i,
    event: 'frustration', intensity: 0.7 },

  // Urgency
  { pattern: /срочно|urgent|asap|немедленно|прямо сейчас|горит|критично/i,
    event: 'urgency', intensity: 0.8 },

  // Success
  { pattern: /получилось|заработало|готово|done|fixed|решил[аи]?|победа|ура/i,
    event: 'success', intensity: 0.6 },

  // Curiosity
  { pattern: /интересно|а что если|как думаешь|как считаешь|что скажешь|а можно|расскажи/i,
    event: 'curiosity', intensity: 0.5 },

  // Calm / neutral
  { pattern: /^(ок|хорошо|ладно|понял|принято|ясно|ага|да|нет|ok|okay|sure|fine|got it|норм|пойдёт|пойдет|ясненько|угу)\.?$/i,
    event: 'calm', intensity: 0.2 },

  // Boredom (non-work spam)
  { pattern: /скучно|нечего делать|что делаешь|чем занята|поболтаем|давай поиграем/i,
    event: 'boredom', intensity: 0.5 },
];

// --- Classify ---

const VALID_EVENTS = ['praise','criticism','humor','conflict','deep_work','success','failure','curiosity','boredom','trust','rejection','urgency','calm','gratitude','frustration','idle'];

function classify(message) {
  const events = [];
  const seen = new Set();

  for (const rule of RULES) {
    if (rule.pattern.test(message) && !seen.has(rule.event)) {
      events.push({ type: rule.event, intensity: rule.intensity });
      seen.add(rule.event);
    }
  }

  // Default: short messages with no match = idle, long = fallback to LLM
  if (events.length === 0) {
    if (message.length < 30) {
      events.push({ type: 'idle', intensity: 0.2 });
    } else {
      // Long unmatched message → try Mistral via limbic.js
      try {
        const out = execSync(
          `node "${path.join(__dirname, 'limbic.js')}" analyze ${JSON.stringify(message)}`,
          { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000, stdio: ['pipe','pipe','pipe'] }
        );
        const parsed = JSON.parse(out);
        if (parsed.applied && parsed.applied.length > 0) {
          console.log(JSON.stringify({ ok: true, events: parsed.analysis?.events || [], applied: parsed.applied, state: parsed.state, source: 'mistral' }, null, 2));
          process.exit(0);
        }
      } catch (e) {
        // Mistral unavailable — fallback to idle
      }
      events.push({ type: 'idle', intensity: 0.3 });
    }
  }

  return events;
}

// --- Apply to Sensus ---

function applyEvents(events) {
  const results = [];
  for (const ev of events) {
    try {
      const out = execSync(
        `node "${SENSUS_BIN}" event --type ${ev.type} --intensity ${ev.intensity}`,
        { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 5000 }
      );
      const parsed = JSON.parse(out);
      results.push({ ...ev, result: 'applied', state: parsed });
    } catch (e) {
      results.push({ ...ev, result: 'error', error: e.message });
    }
  }
  return results;
}

// --- Main ---

const args = process.argv.slice(2);
const command = args[0];

if (command === 'analyze') {
  (() => {
  // Check if limbic rules feature is enabled
  if (!isFeatureEnabled('limbicRules')) {
    console.log(JSON.stringify({ ok: false, error: 'limbicRules feature is disabled' }));
    process.exit(0);
  }
  
  let message = args.slice(1).join(' ');
  
  if (args.includes('--stdin')) {
    message = fs.readFileSync(0, 'utf8').trim();
  }

  if (!message) {
    console.error('Usage: node limbic-rules.js analyze "message text"');
    process.exit(1);
  }

  const events = classify(message);
  const applied = applyEvents(events);
  
  // Read final state
  let state;
  try {
    const out = execSync(
      `node "${SENSUS_BIN}" read --format json`,
      { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 5000 }
    );
    state = JSON.parse(out);
  } catch (e) {
    state = null;
  }

  console.log(JSON.stringify({
    ok: true,
    events,
    applied: applied.map(a => ({ type: a.type, intensity: a.intensity, result: a.result })),
    state
  }, null, 2));

  })();
} else {
  console.log(`Limbic Rules — Fast emotional classification

Usage:
  node limbic-rules.js analyze "message text"
  node limbic-rules.js analyze --stdin < message.txt

No LLM required. Pattern-based classification.`);
}
