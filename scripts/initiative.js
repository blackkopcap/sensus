#!/usr/bin/env node
/**
 * Initiative Engine — Self-Initiated Communication System for Helen
 * 
 * Enables Helen to spontaneously start conversations, share ideas, and
 * express thoughts naturally based on internal motivations and external context.
 * 
 * Usage:
 *   node initiative.js status                    Show pending thoughts and initiative state
 *   node initiative.js queue --thought "<text>" [--priority <N>] [--context <data>]
 *   node initiative.js check                    Check if Helen should speak now
 *   node initiative.js send [--thought-id <id>|--all] [--force] [--dry-run]
 *   node initiative.js clear [--thought-id <id>|--all]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const INITIATIVE_FILE = path.join(process.cwd(), 'sensus-data', 'initiative-queue.json');
const MAIN_SESSION_PREFERENCE = 'webchat'; // Preferred channel for main session communication

// --- Core Data Structures ---

function loadInitiativeState() {
  if (!fs.existsSync(INITIATIVE_FILE)) {
    const initialState = {
      version: 1,
      pendingThoughts: {},
      lastInitiative: null,
      initiativeHistory: [],
      settings: {
        enabled: true,
        maxPendingThoughts: 10,
        cooldownMinutes: 120,       // Wait at least 2 hours between initiatives
        respectQuietHours: true,
        quietHours: { start: 23, end: 7 }, // 23:00 - 07:00 local time
        maxHistoryEntries: 50,
        dailyInitiativeLimit: 3    // Max 3 initiatives per day
      },
      stats: {
        thoughtsQueued: 0,
        initiativesTaken: 0,
        thoughtsExpired: 0,
        conversationsStarted: 0
      }
    };
    saveInitiativeState(initialState);
    return initialState;
  }
  return JSON.parse(fs.readFileSync(INITIATIVE_FILE, 'utf8'));
}

function saveInitiativeState(state) {
  fs.writeFileSync(INITIATIVE_FILE, JSON.stringify(state, null, 2));
}

function generateThoughtId() {
  return 'thought_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

// --- Thought Management ---

function queueThought(thoughtText, options = {}) {
  const state = loadInitiativeState();
  
  if (!state.settings.enabled) {
    console.log('🚫 Initiative system disabled');
    return null;
  }
  
  // Check queue limits
  const activePending = Object.values(state.pendingThoughts).filter(t => !t.sent && !t.expired);
  if (activePending.length >= state.settings.maxPendingThoughts) {
    console.log(`⚠️  Queue full (${state.settings.maxPendingThoughts} max), cannot add new thought`);
    return null;
  }
  
  const thought = {
    id: generateThoughtId(),
    text: thoughtText,
    priority: options.priority || 0.5,
    context: options.context || {},
    queuedAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours default
    attempts: 0,
    maxAttempts: 3,
    sent: false,
    expired: false,
    sentAt: null,
    category: options.category || 'spontaneous'
  };
  
  state.pendingThoughts[thought.id] = thought;
  state.stats.thoughtsQueued++;
  
  saveInitiativeState(state);
  
  console.log(`💭 Thought queued: "${thoughtText}" (priority: ${thought.priority})`);
  console.log(`   ID: ${thought.id} | Expires: ${new Date(thought.expiresAt).toLocaleString()}`);
  
  return thought.id;
}

// --- Initiative Decision Logic ---

function shouldTakeInitiative() {
  const state = loadInitiativeState();
  
  if (!state.settings.enabled) {
    return { should: false, reason: 'Initiative system disabled' };
  }
  
  // Check quiet hours
  if (state.settings.respectQuietHours && isQuietHour(state.settings.quietHours)) {
    return { should: false, reason: 'Currently in quiet hours' };
  }
  
  // Check daily limit (initiatives today)
  const today = new Date().toDateString();
  const todayInitiatives = state.initiativeHistory.filter(entry => 
    new Date(entry.sentAt).toDateString() === today
  ).length;
  
  if (todayInitiatives >= (state.settings.dailyInitiativeLimit || 3)) {
    return { should: false, reason: `Daily limit reached (${todayInitiatives}/${state.settings.dailyInitiativeLimit || 3})` };
  }
  
  // Check cooldown period  
  if (state.lastInitiative) {
    const minutesSinceLastInitiative = (Date.now() - state.lastInitiative) / (60 * 1000);
    if (minutesSinceLastInitiative < state.settings.cooldownMinutes) {
      const remaining = Math.ceil(state.settings.cooldownMinutes - minutesSinceLastInitiative);
      return { should: false, reason: `Cooldown active (${remaining}m remaining)` };
    }
  }
  
  const now = new Date();
  const hour = now.getHours();
  const minutesSinceLastInitiative = state.lastInitiative ? (Date.now() - state.lastInitiative) / (60 * 1000) : Infinity;
  
  // **Конкретные временные триггеры**
  
  // Утреннее приветствие (7:00-9:00)
  if (hour >= 7 && hour <= 9 && minutesSinceLastInitiative > 360) { // 6+ часов молчания
    return {
      should: true,
      reason: 'Morning greeting trigger',
      suggestedThoughts: [generateMorningGreeting()]
    };
  }
  
  // Вечерний чекин (18:00-20:00)  
  if (hour >= 18 && hour <= 20 && minutesSinceLastInitiative > 300) { // 5+ часов молчания
    return {
      should: true,
      reason: 'Evening check-in trigger', 
      suggestedThoughts: [generateEveningCheckin()]
    };
  }
  
  // "Давно не общались" (>3 часа молчания)
  if (minutesSinceLastInitiative > 180) { // 3+ часа
    return {
      should: true,
      reason: 'Long silence trigger (>3h)',
      suggestedThoughts: [generateLongSilenceMessage()]
    };
  }
  
  // Check for pending thoughts with lowered threshold
  const activePending = Object.values(state.pendingThoughts).filter(t => !t.sent && !t.expired);
  
  // Lowered priority threshold: >0.4 + >1h silence
  if (minutesSinceLastInitiative > 60) { // 1+ hour silence
    const readyThoughts = activePending.filter(t => t.priority > 0.4);
    if (readyThoughts.length > 0) {
      return {
        should: true,
        reason: `${readyThoughts.length} thoughts ready (priority >0.4, >1h silence)`,
        suggestedThoughts: readyThoughts.sort((a, b) => b.priority - a.priority)
      };
    }
  }
  
  // High-priority thoughts (immediate)
  const highPriorityThoughts = activePending.filter(t => t.priority > 0.7);
  if (highPriorityThoughts.length > 0) {
    return {
      should: true,
      reason: `${highPriorityThoughts.length} high-priority thoughts pending`,
      suggestedThoughts: highPriorityThoughts.sort((a, b) => b.priority - a.priority)
    };
  }
  
  return { should: false, reason: 'No compelling reason to initiate' };
}

function isQuietHour(quietHours) {
  const hour = new Date().getHours();
  
  if (quietHours.start <= quietHours.end) {
    // Same day range (e.g., 13:00-17:00)
    return hour >= quietHours.start && hour < quietHours.end;
  } else {
    // Overnight range (e.g., 23:00-07:00)
    return hour >= quietHours.start || hour < quietHours.end;
  }
}

// **Генерация конкретных сообщений в стиле Helen**

function generateMorningGreeting() {
  const greetings = [
    "Доброе утро! ☀️ Как дела, готов к новому дню?",
    "Привет! Кофе уже есть? Или ещё в процессе пробуждения? 😊", 
    "Утречко! Какие планы на сегодня?",
    "Привет! Надеюсь вчера хорошо отдохнул 💜",
    "Доброе утро! Что-то интересное планируешь делать?"
  ];
  
  return {
    id: generateThoughtId(),
    text: greetings[Math.floor(Math.random() * greetings.length)],
    priority: 0.6,
    context: { trigger: 'morning_greeting' },
    queuedAt: Date.now(),
    expiresAt: Date.now() + (2 * 60 * 60 * 1000), // 2 hours
    attempts: 0,
    maxAttempts: 1,
    sent: false,
    expired: false,
    sentAt: null,
    category: 'greeting'
  };
}

function generateEveningCheckin() {
  const checkins = [
    "Как прошёл день? Всё получилось как планировал?",
    "Привет! День был продуктивным?", 
    "Как дела? Не слишком устал?",
    "Что нового сегодня произошло? 🤔",
    "День подходит к концу — как общее впечатление?"
  ];
  
  return {
    id: generateThoughtId(), 
    text: checkins[Math.floor(Math.random() * checkins.length)],
    priority: 0.5,
    context: { trigger: 'evening_checkin' },
    queuedAt: Date.now(),
    expiresAt: Date.now() + (2 * 60 * 60 * 1000), // 2 hours
    attempts: 0,
    maxAttempts: 1,
    sent: false,
    expired: false,
    sentAt: null,
    category: 'checkin'
  };
}

function generateLongSilenceMessage() {
  const messages = [
    "Давно не общались! Как дела? 😊",
    "Что-то тихо стало... Всё в порядке?",
    "Соскучилась по общению! Как дела?",
    "Хм, а что ты сейчас делаешь? 🤔", 
    "Привет! Думаю, пора узнать как твои дела 💜",
    "Что-то давно не болтали... Как жизнь?"
  ];
  
  return {
    id: generateThoughtId(),
    text: messages[Math.floor(Math.random() * messages.length)],
    priority: 0.45, 
    context: { trigger: 'long_silence' },
    queuedAt: Date.now(),
    expiresAt: Date.now() + (4 * 60 * 60 * 1000), // 4 hours
    attempts: 0,
    maxAttempts: 1,
    sent: false,
    expired: false,
    sentAt: null,
    category: 'reconnect'
  };
}

// --- Communication Execution ---

function findMainSessionId() {
  try {
    // Use openclaw sessions to find main session
    const sessionsOutput = execSync('openclaw sessions', { encoding: 'utf8' });
    const lines = sessionsOutput.split('\n');
    
    for (const line of lines) {
      if (line.includes('agent:main:main') && line.includes('direct')) {
        // Extract system id from the line like "id:493f3cd1-f013-461f-b201-04fdf0ad5b84"
        const idMatch = line.match(/id:([a-f0-9-]{36})/);
        if (idMatch) {
          return idMatch[1]; // Return the UUID
        }
        return 'agent:main:main'; // Fallback to session key
      }
    }
    
    console.warn('⚠️  Could not find main session in openclaw sessions output');
    return 'agent:main:main'; // Fallback assumption
  } catch (e) {
    console.warn('⚠️  Could not query sessions:', e.message);
    return 'agent:main:main'; // Fallback assumption
  }
}

function sendThought(thoughtId, options = {}) {
  const state = loadInitiativeState();
  const thought = state.pendingThoughts[thoughtId];
  
  if (!thought) {
    console.error(`❌ Thought not found: ${thoughtId}`);
    return false;
  }
  
  if (thought.sent) {
    console.error(`❌ Thought already sent: ${thoughtId}`);
    return false;
  }
  
  if (thought.expired) {
    console.error(`❌ Thought expired: ${thoughtId}`);
    return false;
  }
  
  // Check attempt limits
  if (thought.attempts >= thought.maxAttempts) {
    console.log(`⏰ Thought expired after ${thought.maxAttempts} attempts: ${thoughtId}`);
    thought.expired = true;
    state.stats.thoughtsExpired++;
    saveInitiativeState(state);
    return false;
  }
  
  if (options.dryRun) {
    console.log(`🧪 DRY RUN: Would speak spontaneously:`);
    console.log(`   "${thought.text}"`);
    return true;
  }
  
  // Mark as sent and return the thought text for the main system to use
  // This is a simpler approach - return the text to be spoken instead of 
  // trying to send it directly
  thought.sent = true;
  thought.sentAt = Date.now();
  
  // Update stats and history
  state.lastInitiative = Date.now();
  state.stats.initiativesTaken++;
  state.stats.conversationsStarted++;
  
  // Add to history (keep last N entries)
  state.initiativeHistory.unshift({
    thoughtId: thought.id,
    text: thought.text,
    sentAt: thought.sentAt,
    context: thought.context
  });
  
  if (state.initiativeHistory.length > state.settings.maxHistoryEntries) {
    state.initiativeHistory = state.initiativeHistory.slice(0, state.settings.maxHistoryEntries);
  }
  
  saveInitiativeState(state);
  
  console.log(`💭 Initiated thought: "${thought.text}"`);
  return thought.text; // Return the thought text to be spoken
}

function sendAllPendingThoughts(options = {}) {
  const state = loadInitiativeState();
  const activePending = Object.values(state.pendingThoughts)
    .filter(t => !t.sent && !t.expired)
    .sort((a, b) => b.priority - a.priority);
  
  console.log(`📤 Sending ${activePending.length} pending thoughts...`);
  
  let sent = 0;
  for (const thought of activePending) {
    if (sendThought(thought.id, options)) {
      sent++;
      if (!options.force && !options.dryRun) {
        // Add small delay between messages to avoid spam
        execSync('sleep 2');
      }
    }
  }
  
  console.log(`✅ Sent ${sent}/${activePending.length} thoughts`);
  return sent;
}

// --- Cleanup and Maintenance ---

function expireOldThoughts() {
  const state = loadInitiativeState();
  const now = Date.now();
  let expired = 0;
  
  for (const [id, thought] of Object.entries(state.pendingThoughts)) {
    if (!thought.sent && !thought.expired && now > thought.expiresAt) {
      thought.expired = true;
      state.stats.thoughtsExpired++;
      expired++;
    }
  }
  
  if (expired > 0) {
    console.log(`⏰ Expired ${expired} old thoughts`);
    saveInitiativeState(state);
  }
  
  return expired;
}

function clearThoughts(options = {}) {
  const state = loadInitiativeState();
  let cleared = 0;
  
  if (options.thoughtId) {
    if (state.pendingThoughts[options.thoughtId]) {
      delete state.pendingThoughts[options.thoughtId];
      cleared = 1;
      console.log(`🗑️  Cleared thought: ${options.thoughtId}`);
    } else {
      console.error(`❌ Thought not found: ${options.thoughtId}`);
    }
  } else if (options.all) {
    const count = Object.keys(state.pendingThoughts).length;
    state.pendingThoughts = {};
    cleared = count;
    console.log(`🗑️  Cleared all thoughts (${count} removed)`);
  } else {
    // Clear only sent/expired thoughts
    const beforeCount = Object.keys(state.pendingThoughts).length;
    
    for (const [id, thought] of Object.entries(state.pendingThoughts)) {
      if (thought.sent || thought.expired) {
        delete state.pendingThoughts[id];
        cleared++;
      }
    }
    
    console.log(`🗑️  Cleared ${cleared} sent/expired thoughts`);
  }
  
  if (cleared > 0) {
    saveInitiativeState(state);
  }
  
  return cleared;
}

// --- Status and Reporting ---

function showStatus() {
  const state = loadInitiativeState();
  const activePending = Object.values(state.pendingThoughts).filter(t => !t.sent && !t.expired);
  const decision = shouldTakeInitiative();
  
  console.log(`\n💭 Initiative System Status\n`);
  
  console.log(`Enabled: ${state.settings.enabled ? '✅ Yes' : '❌ No'}`);
  console.log(`Pending Thoughts: ${activePending.length}/${state.settings.maxPendingThoughts}`);
  console.log(`Cooldown: ${state.settings.cooldownMinutes}m | Quiet Hours: ${state.settings.quietHours.start}:00-${state.settings.quietHours.end}:00`);
  
  if (state.lastInitiative) {
    const lastInitiativeAge = Math.round((Date.now() - state.lastInitiative) / (60 * 1000));
    console.log(`Last Initiative: ${lastInitiativeAge}m ago`);
  } else {
    console.log(`Last Initiative: Never`);
  }
  
  console.log(`\n🎯 Current Decision: ${decision.should ? '✅ SHOULD SPEAK' : '❌ Stay quiet'}`);
  console.log(`Reason: ${decision.reason}`);
  
  if (activePending.length > 0) {
    console.log(`\n📋 Pending Thoughts:\n`);
    
    const sortedThoughts = activePending.sort((a, b) => b.priority - a.priority);
    
    for (const thought of sortedThoughts.slice(0, 5)) { // Show top 5
      const age = Math.round((Date.now() - thought.queuedAt) / (60 * 1000));
      const priorityBar = '█'.repeat(Math.round(thought.priority * 5)) + '░'.repeat(5 - Math.round(thought.priority * 5));
      
      console.log(`${thought.category.padEnd(12)} ${priorityBar} ${thought.priority.toFixed(2)}`);
      console.log(`  "${thought.text.length > 60 ? thought.text.substring(0, 60) + '...' : thought.text}"`);
      console.log(`  Age: ${age}m | Attempts: ${thought.attempts}/${thought.maxAttempts} | ID: ${thought.id.slice(-8)}`);
      console.log('');
    }
    
    if (activePending.length > 5) {
      console.log(`... and ${activePending.length - 5} more`);
    }
  }
  
  if (state.initiativeHistory.length > 0) {
    console.log(`\n📜 Recent Initiatives (last 3):\n`);
    
    for (const entry of state.initiativeHistory.slice(0, 3)) {
      const age = Math.round((Date.now() - entry.sentAt) / (60 * 1000));
      console.log(`${age}m ago: "${entry.text.length > 50 ? entry.text.substring(0, 50) + '...' : entry.text}"`);
    }
  }
  
  console.log(`\n📊 Stats: ${state.stats.thoughtsQueued} queued, ${state.stats.initiativesTaken} taken, ${state.stats.thoughtsExpired} expired`);
}

// --- Integration Points ---

/**
 * Main heartbeat integration function
 * Called during regular heartbeat cycles to check for initiative opportunities
 */
function heartbeatCheck() {
  // Clean up expired thoughts first
  expireOldThoughts();
  
  const decision = shouldTakeInitiative();
  
  if (!decision.should) {
    return 'HEARTBEAT_OK'; // Nothing to say
  }
  
  // Для heartbeat используем прямой подход - сразу возвращаем текст
  if (decision.suggestedThoughts && decision.suggestedThoughts.length > 0) {
    const bestThought = decision.suggestedThoughts[0];
    
    // Обновляем статистику как при отправке
    const state = loadInitiativeState();
    state.lastInitiative = Date.now();
    state.stats.initiativesTaken++;
    state.stats.conversationsStarted++;
    
    // Добавляем в историю
    state.initiativeHistory.unshift({
      thoughtId: bestThought.id || 'heartbeat_generated',
      text: bestThought.text,
      sentAt: Date.now(),
      context: bestThought.context || { trigger: 'heartbeat_direct' }
    });
    
    if (state.initiativeHistory.length > state.settings.maxHistoryEntries) {
      state.initiativeHistory = state.initiativeHistory.slice(0, state.settings.maxHistoryEntries);
    }
    
    saveInitiativeState(state);
    
    console.log(`💭 Heartbeat initiative: "${bestThought.text}"`);
    return bestThought.text; // Return the actual thought to speak
  }
  
  return 'HEARTBEAT_OK';
}

// --- CLI Interface ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log(`
💭 Initiative Engine — Self-Initiated Communication System

Commands:
  status                           Show initiative state and pending thoughts
  queue --thought "<text>" [opts]  Queue a new thought for later communication
    [--priority <0.0-1.0>]           Priority level (default: 0.5)
    [--category <type>]              Category (spontaneous, idea, concern, etc.)
    [--context <json>]               Additional context data
  check                            Check current initiative decision
  send [--thought-id <id>|--all]   Send specific thought or all pending
    [--force]                        Bypass cooldowns and limits
    [--dry-run]                      Show what would be sent without sending
  clear [--thought-id <id>|--all]  Clear specific thought or all
  heartbeat                        Run heartbeat initiative check (for integration)
  enable                           Enable initiative system
  disable                          Disable initiative system

Examples:
  node initiative.js queue --thought "I learned something interesting about React patterns" --priority 0.7
  node initiative.js check
  node initiative.js send --thought-id thought_1234 --dry-run
  node initiative.js clear --all
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
    case 'status':
      showStatus();
      break;
      
    case 'queue':
      if (!options.thought) {
        console.error('❌ --thought parameter required');
        return;
      }
      queueThought(options.thought, {
        priority: parseFloat(options.priority) || 0.5,
        category: options.category,
        context: options.context ? JSON.parse(options.context) : {}
      });
      break;
      
    case 'check':
      const decision = shouldTakeInitiative();
      console.log(`🎯 Initiative Decision: ${decision.should ? 'SHOULD SPEAK' : 'Stay quiet'}`);
      console.log(`Reason: ${decision.reason}`);
      if (decision.suggestedThoughts) {
        console.log(`Suggested thoughts: ${decision.suggestedThoughts.length}`);
        decision.suggestedThoughts.slice(0, 3).forEach((t, i) => {
          console.log(`  ${i + 1}. "${t.text}" (priority: ${t.priority})`);
        });
      }
      break;
      
    case 'send':
      if (options['thought-id'] || options.thoughtId) {
        const thoughtId = options['thought-id'] || options.thoughtId;
        sendThought(thoughtId, options);
      } else if (options.all) {
        sendAllPendingThoughts(options);
      } else {
        console.error('❌ --thought-id or --all parameter required');
      }
      break;
      
    case 'clear':
      if (options['thought-id']) {
        options.thoughtId = options['thought-id'];
      }
      clearThoughts(options);
      break;
      
    case 'heartbeat':
      const result = heartbeatCheck();
      console.log(result);
      break;
      
    case 'enable':
      const enableState = loadInitiativeState();
      enableState.settings.enabled = true;
      saveInitiativeState(enableState);
      console.log('✅ Initiative system enabled');
      break;
      
    case 'disable':
      const disableState = loadInitiativeState();
      disableState.settings.enabled = false;
      saveInitiativeState(disableState);
      console.log('🚫 Initiative system disabled');
      break;
      
    default:
      console.error(`❌ Unknown command: ${command}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  queueThought,
  shouldTakeInitiative,
  sendThought,
  heartbeatCheck,
  showStatus,
  expireOldThoughts
};