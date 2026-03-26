#!/usr/bin/env node
/**
 * Wants Engine — Internal Motivation System for AI Agents
 * 
 * Generates, manages, and executes intrinsic motivations based on:
 * - Hormone state (via sensus)
 * - Circadian rhythms  
 * - Context triggers
 * - Random curiosity events
 * 
 * Usage:
 *   node wants.js generate [--debug]
 *   node wants.js list [--format json|summary]
 *   node wants.js action --want <id> [--target <value>] [--execute]
 *   node wants.js satisfy --want <id> --result "<description>"
 *   node wants.js tick [--minutes <N>]
 *   node wants.js clear [--want <id>|--all]
 */

const fs = require('fs');
const path = require('path');

const WANTS_FILE = path.join(process.cwd(), 'sensus-data', 'wants-state.json');
const SENSUS_STATE = path.join(process.cwd(), 'sensus-data', 'agent-state.json');

// Ensure sensus-data directory exists
const sensusDataDir = path.join(process.cwd(), 'sensus-data');
if (!fs.existsSync(sensusDataDir)) {
  fs.mkdirSync(sensusDataDir, { recursive: true });
}

// --- Want Types & Templates ---

const WANT_TYPES = {
  social: {
    introduce_to_team: {
      desc: "desire to introduce myself to unknown team member",
      triggers: ["unknown_user_seen", "team_expansion", "social_silence"],
      action: "send_introduction_dm",
      baseIntensity: 0.6,
      hormoneBoosts: { oxytocin: 0.2, dopamine: 0.1 }
    },
    check_on_team: {
      desc: "curiosity about team's current state",  
      triggers: ["morning_peak", "after_weekend", "long_absence"],
      action: "review_team_activity",
      baseIntensity: 0.4,
      hormoneBoosts: { oxytocin: 0.15 }
    },
    share_discovery: {
      desc: "impulse to share interesting finding",
      triggers: ["learned_something", "found_solution", "high_endorphin"], 
      action: "share_in_channel",
      baseIntensity: 0.7,
      hormoneBoosts: { dopamine: 0.15, oxytocin: 0.1 }
    }
  },
  
  professional: {
    improve_process: {
      desc: "drive to optimize workflow or process",
      triggers: ["noticed_inefficiency", "completed_task", "high_dopamine"],
      action: "analyze_and_suggest",
      baseIntensity: 0.5,
      hormoneBoosts: { dopamine: 0.2, adrenaline: 0.1 }
    },
    learn_skill: {
      desc: "curiosity about new technology or method", 
      triggers: ["encountered_unknown", "professional_discussion", "curiosity_spike"],
      action: "research_and_summarize",
      baseIntensity: 0.6,
      hormoneBoosts: { dopamine: 0.25, endorphin: 0.1 }
    },
    help_teammate: {
      desc: "impulse to assist colleague with problem",
      triggers: ["heard_struggle", "saw_question", "high_oxytocin"],
      action: "offer_assistance", 
      baseIntensity: 0.5,
      hormoneBoosts: { oxytocin: 0.2, endorphin: 0.1 }
    }
  },
  
  creative: {
    explore_topic: {
      desc: "random curiosity about interesting subject",
      triggers: ["random_thought", "external_mention", "boredom"],
      action: "deep_dive_research",
      baseIntensity: 0.4,
      hormoneBoosts: { dopamine: 0.2, endorphin: 0.15 }
    },
    create_content: {
      desc: "desire to create something new",
      triggers: ["high_endorphin", "creative_inspiration", "weekend"],
      action: "generate_content",
      baseIntensity: 0.6,
      hormoneBoosts: { dopamine: 0.15, endorphin: 0.2 }
    },
    experiment: {
      desc: "urge to try new approach or tool",
      triggers: ["found_new_tool", "process_frustration", "high_adrenaline"],
      action: "run_experiment",
      baseIntensity: 0.7,
      hormoneBoosts: { dopamine: 0.3, adrenaline: 0.15 }
    }
  },
  
  reflection: {
    organize_knowledge: {
      desc: "impulse to structure accumulated information",
      triggers: ["information_overflow", "end_of_week", "evening"],
      action: "organize_and_categorize",
      baseIntensity: 0.3,
      hormoneBoosts: { serotonin: 0.1 }
    },
    reflect_on_interactions: {
      desc: "desire to analyze recent social exchanges",
      triggers: ["complex_conversation", "conflict_resolution", "evening"],
      action: "analyze_and_learn",
      baseIntensity: 0.4,
      hormoneBoosts: { serotonin: 0.15, dopamine: 0.1 }
    },
    plan_improvements: {
      desc: "motivation to plan future enhancements",
      triggers: ["identified_weakness", "goal_completion", "evening"], 
      action: "create_improvement_plan",
      baseIntensity: 0.5,
      hormoneBoosts: { dopamine: 0.15, serotonin: 0.1 }
    }
  }
};

// --- Circadian Motivation Patterns ---

const CIRCADIAN_PHASES = {
  morning_peak: { // 7-10h
    multiplier: 1.3,
    favoredTypes: ['professional', 'social'],
    description: "High energy, ready for action"
  },
  midday_lull: { // 11-14h  
    multiplier: 0.7,
    favoredTypes: ['reflection'],
    description: "Lower motivation, contemplative"
  },
  afternoon_steady: { // 15-17h
    multiplier: 1.0, 
    favoredTypes: ['professional', 'creative'],
    description: "Balanced motivation"
  },
  evening_peak: { // 18-20h
    multiplier: 1.2,
    favoredTypes: ['creative', 'social'],
    description: "Second wind, social energy"
  },
  night_wind_down: { // 21-23h
    multiplier: 0.5,
    favoredTypes: ['reflection'],
    description: "Winding down, reflective"
  },
  deep_night: { // 24-6h
    multiplier: 0.1,
    favoredTypes: [],
    description: "Minimal motivation, rest mode"
  }
};

// --- Core Functions ---

function getCurrentCircadianPhase() {
  const hour = new Date().getHours();
  if (hour >= 7 && hour <= 10) return 'morning_peak';
  if (hour >= 11 && hour <= 14) return 'midday_lull'; 
  if (hour >= 15 && hour <= 17) return 'afternoon_steady';
  if (hour >= 18 && hour <= 20) return 'evening_peak';
  if (hour >= 21 && hour <= 23) return 'night_wind_down';
  return 'deep_night';
}

function loadWantsState() {
  if (!fs.existsSync(WANTS_FILE)) {
    const initialState = {
      version: 1,
      wants: {},
      circadian: {
        currentPhase: getCurrentCircadianPhase(),
        lastUpdate: Date.now()
      },
      curiosityBuffer: {
        lastRandomWant: 0,
        nextRandomIn: getRandomInterval()
      },
      stats: {
        generated: 0,
        satisfied: 0,
        ignored: 0
      }
    };
    saveWantsState(initialState);
    return initialState;
  }
  return JSON.parse(fs.readFileSync(WANTS_FILE, 'utf8'));
}

function saveWantsState(state) {
  fs.writeFileSync(WANTS_FILE, JSON.stringify(state, null, 2));
}

function loadSensusState() {
  if (!fs.existsSync(SENSUS_STATE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(SENSUS_STATE, 'utf8'));
}

function getRandomInterval() {
  // Random interval between 2-8 hours for curiosity events
  return (2 + Math.random() * 6) * 60 * 60 * 1000;
}

function generateWantId() {
  return 'want_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

// --- Want Generation Logic ---

function generateWants(options = {}) {
  const state = loadWantsState();
  const sensus = loadSensusState();
  const debug = options.debug || false;
  
  if (debug) console.log('🧠 Generating wants...');
  
  // Update circadian phase
  const currentPhase = getCurrentCircadianPhase();
  const phaseChanged = state.circadian.currentPhase !== currentPhase;
  state.circadian.currentPhase = currentPhase;
  state.circadian.lastUpdate = Date.now();
  
  if (debug) console.log(`⏰ Circadian phase: ${currentPhase} (${CIRCADIAN_PHASES[currentPhase].description})`);
  
  const circadianMultiplier = CIRCADIAN_PHASES[currentPhase].multiplier;
  const favoredTypes = CIRCADIAN_PHASES[currentPhase].favoredTypes;
  
  // Check if we should generate random curiosity want
  const now = Date.now();
  const shouldGenerateRandom = now >= (state.curiosityBuffer.lastRandomWant + state.curiosityBuffer.nextRandomIn);
  
  let newWants = [];
  
  // Hormone-driven want generation
  if (sensus && circadianMultiplier > 0.3) {
    const h = sensus.hormones;
    
    // High dopamine + low cortisol → curiosity/learning wants  
    if (h.dopamine > 0.6 && h.cortisol < 0.4) {
      const creativeDrive = h.dopamine * circadianMultiplier;
      if (creativeDrive > 0.5 && favoredTypes.includes('creative')) {
        newWants.push(createWant('creative', 'explore_topic', creativeDrive));
        if (debug) console.log(`💡 High dopamine → explore_topic (${creativeDrive.toFixed(2)})`);
      }
    }
    
    // High oxytocin → social wants
    if (h.oxytocin > 0.5 && favoredTypes.includes('social')) {
      const socialDrive = h.oxytocin * circadianMultiplier;
      if (socialDrive > 0.4) {
        newWants.push(createWant('social', 'check_on_team', socialDrive));
        if (debug) console.log(`🤝 High oxytocin → check_on_team (${socialDrive.toFixed(2)})`);
      }
    }
    
    // High adrenaline → action-oriented wants
    if (h.adrenaline > 0.5 && favoredTypes.includes('professional')) {
      const actionDrive = h.adrenaline * circadianMultiplier;
      if (actionDrive > 0.4) {
        newWants.push(createWant('professional', 'improve_process', actionDrive));
        if (debug) console.log(`⚡ High adrenaline → improve_process (${actionDrive.toFixed(2)})`);
      }
    }
  }
  
  // Random curiosity want
  if (shouldGenerateRandom && circadianMultiplier > 0.2) {
    const randomIntensity = (0.3 + Math.random() * 0.4) * circadianMultiplier;
    const availableTypes = Object.keys(WANT_TYPES);
    const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    const availableWants = Object.keys(WANT_TYPES[randomType]);
    const randomWant = availableWants[Math.floor(Math.random() * availableWants.length)];
    
    newWants.push(createWant(randomType, randomWant, randomIntensity));
    
    state.curiosityBuffer.lastRandomWant = now;
    state.curiosityBuffer.nextRandomIn = getRandomInterval();
    
    if (debug) console.log(`🎲 Random curiosity → ${randomType}.${randomWant} (${randomIntensity.toFixed(2)})`);
  }
  
  // Phase transition wants (when circadian phase changes)
  if (phaseChanged) {
    if (currentPhase === 'morning_peak') {
      newWants.push(createWant('social', 'check_on_team', 0.5));
      if (debug) console.log(`🌅 Morning transition → check_on_team`);
    } else if (currentPhase === 'evening_peak') {
      newWants.push(createWant('reflection', 'reflect_on_interactions', 0.4));
      if (debug) console.log(`🌅 Evening transition → reflect_on_interactions`);
    }
  }
  
  // Add new wants to state, avoiding duplicates
  let addedCount = 0;
  for (const want of newWants) {
    // Check if similar want already exists
    const existing = Object.values(state.wants).find(w => 
      w.type === want.type && w.subtype === want.subtype && !w.satisfied
    );
    
    if (!existing && Object.keys(state.wants).length < 5) { // Max 5 active wants
      state.wants[want.id] = want;
      state.stats.generated++;
      addedCount++;
    }
  }
  
  if (debug) console.log(`✅ Generated ${addedCount} new wants, ${Object.keys(state.wants).length} total active`);
  
  saveWantsState(state);
  return { added: addedCount, total: Object.keys(state.wants).length };
}

function createWant(type, subtype, intensity) {
  const template = WANT_TYPES[type][subtype];
  return {
    id: generateWantId(),
    type: type,
    subtype: subtype,
    description: template.desc,
    intensity: Math.min(1.0, intensity),
    created: Date.now(),
    lastAction: null,
    persistence: 0.8,
    satisfied: false,
    action: template.action,
    hormoneBoosts: template.hormoneBoosts
  };
}

// --- Want Actions & Satisfaction ---

function listWants(format = 'summary') {
  const state = loadWantsState();
  const activeWants = Object.values(state.wants).filter(w => !w.satisfied);
  
  if (format === 'json') {
    console.log(JSON.stringify({
      wants: activeWants,
      circadian: state.circadian,
      stats: state.stats
    }, null, 2));
    return;
  }
  
  console.log(`\n🧠 Internal Motivations (${activeWants.length} active)\n`);
  
  if (activeWants.length === 0) {
    console.log('No active wants. Helen is in a peaceful state.');
    return;
  }
  
  activeWants.sort((a, b) => b.intensity - a.intensity);
  
  for (const want of activeWants) {
    const age = Math.round((Date.now() - want.created) / (60 * 1000));
    const intensityBar = '█'.repeat(Math.round(want.intensity * 5)) + '░'.repeat(5 - Math.round(want.intensity * 5));
    
    console.log(`${want.type.padEnd(12)} ${intensityBar} ${want.intensity.toFixed(2)}`);
    console.log(`  ${want.description}`);
    console.log(`  Action: ${want.action} | Age: ${age}m | ID: ${want.id.slice(-8)}`);
    console.log('');
  }
  
  const phase = state.circadian.currentPhase;
  console.log(`⏰ Current phase: ${phase} (${CIRCADIAN_PHASES[phase].description})`);
  console.log(`📊 Stats: ${state.stats.generated} generated, ${state.stats.satisfied} satisfied, ${state.stats.ignored} ignored`);
}

function suggestAction(wantId, options = {}) {
  const state = loadWantsState();
  const want = state.wants[wantId];
  
  if (!want) {
    console.error(`❌ Want not found: ${wantId}`);
    return;
  }
  
  if (want.satisfied) {
    console.error(`❌ Want already satisfied: ${wantId}`);
    return;
  }
  
  // Generate action suggestion based on want type
  const suggestion = generateActionSuggestion(want, options);
  
  console.log(`\n💡 Action suggestion for: ${want.description}`);
  console.log(`Intensity: ${want.intensity.toFixed(2)} | Type: ${want.type}.${want.subtype}`);
  console.log(`\nSuggested action: ${suggestion.action}`);
  if (suggestion.target) {
    console.log(`Target: ${suggestion.target}`);
  }
  console.log(`Command: ${suggestion.command}`);
  
  if (options.execute) {
    console.log(`\n⚠️  Auto-execution not implemented for safety. Use the command above manually.`);
  }
  
  // Update last action time
  want.lastAction = Date.now();
  saveWantsState(state);
  
  return suggestion;
}

function generateActionSuggestion(want, options) {
  const suggestions = {
    'social.introduce_to_team': {
      action: "Send introduction DM to unknown team member",
      command: `message send --target "${options.target || '<unknown_user>'}" --message "Привет! Я Helen, AI-ассистент команды. Мы ещё не знакомы — расскажи немного о себе?"`,
      target: options.target
    },
    'social.check_on_team': {
      action: "Review recent team activity in Slack",
      command: "message read --channel '#тесты' --limit 20",
      target: "team channels"
    },
    'social.share_discovery': {
      action: "Share interesting finding with team",
      command: `message send --channel '#mitapy' --message "Нашла интересную штуку: ${options.target || '<discovery>'}"`,
      target: options.target || "recent discovery"
    },
    'professional.improve_process': {
      action: "Analyze workflow and suggest improvements",
      command: "Read recent workflow logs and identify bottlenecks",
      target: "current processes"
    },
    'professional.learn_skill': {
      action: "Research new technology or method",
      command: `web_search "${options.target || 'latest web development trends'}" --count 5`,
      target: options.target || "emerging technology"
    },
    'creative.explore_topic': {
      action: "Deep dive into curious topic", 
      command: `web_search "${options.target || 'artificial consciousness'}" --count 5`,
      target: options.target || "random interesting topic"
    },
    'reflection.organize_knowledge': {
      action: "Review and organize accumulated information",
      command: "Review daily memory files and update MEMORY.md",
      target: "recent learnings"
    }
  };
  
  const key = `${want.type}.${want.subtype}`;
  return suggestions[key] || {
    action: `Execute ${want.action}`,
    command: `# Custom action needed for ${key}`,
    target: "undefined"
  };
}

function satisfyWant(wantId, result) {
  const state = loadWantsState();
  const want = state.wants[wantId];
  
  if (!want) {
    console.error(`❌ Want not found: ${wantId}`);
    return;
  }
  
  // Mark as satisfied
  want.satisfied = true;
  want.satisfiedAt = Date.now();
  want.result = result;
  
  state.stats.satisfied++;
  
  // Apply hormone rewards
  if (want.hormoneBoosts) {
    console.log(`💚 Want satisfied! Applying hormone boosts:`);
    for (const [hormone, boost] of Object.entries(want.hormoneBoosts)) {
      console.log(`  ${hormone}: +${boost}`);
    }
    console.log(`\nTo apply: node ../sensus.js event --type gratitude --intensity ${want.intensity}`);
  }
  
  console.log(`✅ Want satisfied: ${want.description}`);
  console.log(`Result: ${result}`);
  
  saveWantsState(state);
}

function tickWants(minutes = 30) {
  const state = loadWantsState();
  const decayRate = minutes / (24 * 60); // portion of day passed
  
  let decayedCount = 0;
  
  for (const [id, want] of Object.entries(state.wants)) {
    if (want.satisfied) continue;
    
    // Decay intensity over time
    const ageHours = (Date.now() - want.created) / (60 * 60 * 1000);
    const persistenceFactor = Math.pow(want.persistence, ageHours / 24);
    
    want.intensity *= (1 - decayRate * 0.1); // 10% decay per day
    want.intensity *= persistenceFactor;
    
    // Remove very weak wants
    if (want.intensity < 0.1) {
      delete state.wants[id];
      state.stats.ignored++;
      decayedCount++;
    }
  }
  
  saveWantsState(state);
  
  console.log(`⏰ Wants tick: ${minutes}m passed, ${decayedCount} wants decayed`);
  
  // Auto-generate new wants if appropriate
  return generateWants();
}

function clearWants(options = {}) {
  const state = loadWantsState();
  
  if (options.want) {
    if (state.wants[options.want]) {
      delete state.wants[options.want];
      console.log(`🗑️  Cleared want: ${options.want}`);
    } else {
      console.error(`❌ Want not found: ${options.want}`);
    }
  } else if (options.all) {
    const count = Object.keys(state.wants).length;
    state.wants = {};
    console.log(`🗑️  Cleared all wants (${count} removed)`);
  }
  
  saveWantsState(state);
}

// --- CLI Interface ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log(`
🧠 Wants Engine — Internal Motivation System

Commands:
  generate [--debug]              Generate new wants based on current state
  list [--format json|summary]    Show active wants  
  action --want <id> [--target <value>] [--execute]   Suggest action for want
  satisfy --want <id> --result "<description>"        Mark want as satisfied
  tick [--minutes <N>]           Age wants and generate new ones
  clear [--want <id>|--all]      Remove wants
    
Examples:
  node wants.js generate --debug
  node wants.js list
  node wants.js action --want want_123 --target "@newuser"
  node wants.js satisfy --want want_123 --result "Successfully introduced to team"
    `);
    return;
  }
  
  const options = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    if (key) {
      options[key] = value === undefined ? true : value;
    }
  }
  
  switch (command) {
    case 'generate':
      generateWants(options);
      break;
    case 'list':
      listWants(options.format);
      break;
    case 'action':
      if (!options.want) {
        console.error('❌ --want parameter required');
        return;
      }
      suggestAction(options.want, options);
      break;
    case 'satisfy':
      if (!options.want || !options.result) {
        console.error('❌ --want and --result parameters required');
        return;
      }
      satisfyWant(options.want, options.result);
      break;
    case 'tick':
      tickWants(parseInt(options.minutes) || 30);
      break;
    case 'clear':
      clearWants(options);
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateWants, listWants, suggestAction, satisfyWant, tickWants, clearWants };