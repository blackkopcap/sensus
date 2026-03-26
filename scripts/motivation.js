#!/usr/bin/env node
/**
 * Motivation Engine — Core Integration Module
 * 
 * Combines wants, circadian rhythms, and sensus hormones into
 * a unified motivation system that can drive proactive behavior.
 * 
 * Usage:
 *   node motivation.js status
 *   node motivation.js generate [--force]
 *   node motivation.js suggest [--top <N>]
 *   node motivation.js execute --want <id> [--auto-approve]
 *   node motivation.js heartbeat
 *   node motivation.js disable [--duration <minutes>]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import our modules
const wants = require('./wants.js');
const { getCurrentPhase, getCircadianHormoneAdjustments } = require('./circadian.js');

const MOTIVATION_CONFIG = path.join(process.cwd(), 'sensus-data', 'motivation-config.json');

// Ensure sensus-data directory exists
const sensusDataDir = path.join(process.cwd(), 'sensus-data');
if (!fs.existsSync(sensusDataDir)) {
  fs.mkdirSync(sensusDataDir, { recursive: true });
}

// --- Configuration & State ---

function loadMotivationConfig() {
  if (!fs.existsSync(MOTIVATION_CONFIG)) {
    const defaultConfig = {
      version: 1,
      enabled: true,
      disabledUntil: null,
      safetyMode: true,           // Requires approval for external actions
      autoGenerate: true,         // Auto-generate wants during heartbeats
      maxActiveWants: 5,
      executionCooldown: 300000,  // 5 minutes between auto-executions
      lastExecution: 0,
      allowedActions: [           // Actions that can be auto-executed
        'review_team_activity',
        'organize_and_categorize', 
        'analyze_and_learn',
        'deep_dive_research'
      ],
      restrictedActions: [        // Actions requiring human approval
        'send_introduction_dm',
        'share_in_channel',
        'offer_assistance'
      ],
      preferences: {
        morningFocus: ['professional', 'social'],
        afternoonFocus: ['creative', 'professional'],
        eveningFocus: ['creative', 'reflection'],
        nightFocus: ['reflection']
      },
      stats: {
        sessionsActive: 0,
        wantsGenerated: 0,
        actionsExecuted: 0,
        actionsSuggested: 0,
        lastActive: null
      }
    };
    saveMotivationConfig(defaultConfig);
    return defaultConfig;
  }
  return JSON.parse(fs.readFileSync(MOTIVATION_CONFIG, 'utf8'));
}

function saveMotivationConfig(config) {
  fs.writeFileSync(MOTIVATION_CONFIG, JSON.stringify(config, null, 2));
}

function isMotivationEnabled() {
  const config = loadMotivationConfig();
  if (!config.enabled) return false;
  if (config.disabledUntil && Date.now() < config.disabledUntil) return false;
  return true;
}

// --- Core Motivation Logic ---

function assessMotivationalState() {
  const circadianPhase = getCurrentPhase();
  const hormoneAdjustments = getCircadianHormoneAdjustments();
  
  // Load current sensus state
  let sensusState = null;
  try {
    const sensusFile = path.join(process.cwd(), 'sensus-data', 'agent-state.json');
    if (fs.existsSync(sensusFile)) {
      sensusState = JSON.parse(fs.readFileSync(sensusFile, 'utf8'));
    }
  } catch (e) {
    console.warn('⚠️  Could not load sensus state:', e.message);
  }
  
  // Calculate overall motivation intensity
  let motivationIntensity = circadianPhase.motivationMultiplier;
  
  if (sensusState && sensusState.hormones) {
    const h = sensusState.hormones;
    
    // Boost motivation based on hormone levels
    motivationIntensity *= (1 + h.dopamine * 0.3);      // Dopamine drives action
    motivationIntensity *= (1 - h.cortisol * 0.4);      // Stress reduces motivation
    motivationIntensity *= (1 + h.adrenaline * 0.2);    // Energy boosts drive
    
    // Reduce if withdrawn (high cortisol + low oxytocin)
    if (h.cortisol > 0.6 && h.oxytocin < 0.3) {
      motivationIntensity *= 0.3; // Significant reduction in withdrawn state
    }
  }
  
  return {
    phase: circadianPhase,
    hormones: sensusState?.hormones,
    intensity: Math.max(0.1, Math.min(2.0, motivationIntensity)),
    hormoneAdjustments,
    isWithdrawn: sensusState?.hormones?.cortisol > 0.6 && sensusState?.hormones?.oxytocin < 0.3
  };
}

function generateMotivationalResponse() {
  if (!isMotivationEnabled()) {
    return { enabled: false, reason: 'Motivation system disabled' };
  }
  
  const config = loadMotivationConfig();
  const state = assessMotivationalState();
  
  // Generate wants based on current state
  const wantResult = wants.generateWants({ debug: false });
  
  // Get current active wants
  const wantsState = wants.loadWantsState ? wants.loadWantsState() : { wants: {} };
  const activeWants = Object.values(wantsState.wants || {}).filter(w => !w.satisfied);
  
  // Filter wants by current circadian phase preferences
  const phaseTime = getCurrentTimeOfDay();
  const favoredTypes = config.preferences[phaseTime] || [];
  const phaseFavoredWants = activeWants.filter(w => 
    favoredTypes.includes(w.type) && w.intensity > 0.3
  );
  
  // Sort by intensity and phase relevance
  const prioritizedWants = phaseFavoredWants.sort((a, b) => {
    const aScore = a.intensity * (favoredTypes.includes(a.type) ? 1.5 : 1);
    const bScore = b.intensity * (favoredTypes.includes(b.type) ? 1.5 : 1);
    return bScore - aScore;
  });
  
  config.stats.wantsGenerated += wantResult.added || 0;
  config.stats.lastActive = Date.now();
  saveMotivationConfig(config);
  
  return {
    enabled: true,
    state,
    activeWants: prioritizedWants.slice(0, 3), // Top 3 wants
    totalActive: activeWants.length,
    generated: wantResult.added || 0,
    suggestions: prioritizedWants.slice(0, 1) // Top suggestion
  };
}

function getCurrentTimeOfDay() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morningFocus';
  if (hour >= 12 && hour < 17) return 'afternoonFocus';  
  if (hour >= 17 && hour < 22) return 'eveningFocus';
  return 'nightFocus';
}

// --- Action Execution ---

function suggestActions(topN = 3) {
  const response = generateMotivationalResponse();
  
  if (!response.enabled) {
    console.log('🚫 Motivation system disabled');
    return [];
  }
  
  const suggestions = [];
  
  for (const want of response.activeWants.slice(0, topN)) {
    const suggestion = generateActionForWant(want);
    if (suggestion) {
      suggestions.push({
        want,
        suggestion,
        priority: calculateActionPriority(want, response.state),
        canAutoExecute: canAutoExecute(suggestion.action)
      });
    }
  }
  
  return suggestions.sort((a, b) => b.priority - a.priority);
}

function generateActionForWant(want) {
  // This would integrate with wants.js suggestAction
  const actionMap = {
    'social.check_on_team': {
      action: 'review_team_activity',
      description: 'Check recent team activity and mood',
      command: 'message read --channel "#тесты" --limit 20',
      external: false
    },
    'professional.learn_skill': {
      action: 'deep_dive_research',
      description: 'Research emerging technology or best practice',
      command: `web_search "latest ${want.subtype || 'development'} trends" --count 5`,
      external: false
    },
    'creative.explore_topic': {
      action: 'deep_dive_research', 
      description: 'Explore curious topic or concept',
      command: `web_search "${want.description || 'interesting technology'}" --count 5`,
      external: false
    },
    'reflection.organize_knowledge': {
      action: 'organize_and_categorize',
      description: 'Review and organize recent learnings',
      command: 'review daily memory files and update summaries',
      external: false
    },
    'social.introduce_to_team': {
      action: 'send_introduction_dm',
      description: 'Introduce self to unknown team member',
      command: 'message send --target "<user>" --message "Introduction"',
      external: true
    }
  };
  
  const key = `${want.type}.${want.subtype}`;
  return actionMap[key] || {
    action: 'generic_action',
    description: want.description,
    command: `# Action for ${want.type}.${want.subtype}`,
    external: false
  };
}

function calculateActionPriority(want, state) {
  let priority = want.intensity;
  
  // Boost priority based on phase alignment
  if (state.phase.favoredTypes.includes(want.type)) {
    priority *= 1.3;
  }
  
  // Boost for high-motivation states
  priority *= state.intensity;
  
  // Age factor (older wants get slight priority boost)
  const ageHours = (Date.now() - want.created) / (60 * 60 * 1000);
  priority *= (1 + Math.min(ageHours / 24, 0.5)); // Up to 50% boost for day-old wants
  
  return priority;
}

function canAutoExecute(action) {
  const config = loadMotivationConfig();
  
  if (!config.safetyMode) return true;
  if (config.allowedActions.includes(action)) return true;
  if (config.restrictedActions.includes(action)) return false;
  
  // Default to safe (no auto-execution for unknown actions)
  return false;
}

function executeWantAction(wantId, options = {}) {
  const config = loadMotivationConfig();
  
  // Check cooldown
  if (Date.now() - config.lastExecution < config.executionCooldown) {
    console.log('⏰ Action execution on cooldown');
    return false;
  }
  
  // Load want
  const wantsState = wants.loadWantsState ? wants.loadWantsState() : { wants: {} };
  const want = wantsState.wants[wantId];
  
  if (!want) {
    console.error(`❌ Want not found: ${wantId}`);
    return false;
  }
  
  if (want.satisfied) {
    console.error(`❌ Want already satisfied: ${wantId}`);
    return false;
  }
  
  const actionSuggestion = generateActionForWant(want);
  
  if (actionSuggestion.external && !options.autoApprove && config.safetyMode) {
    console.log(`🔒 External action requires approval: ${actionSuggestion.description}`);
    console.log(`Command: ${actionSuggestion.command}`);
    console.log(`To approve: node motivation.js execute --want ${wantId} --auto-approve`);
    return false;
  }
  
  console.log(`🎯 Executing want: ${want.description}`);
  console.log(`Action: ${actionSuggestion.description}`);
  
  // For safe actions, we can simulate execution
  if (!actionSuggestion.external) {
    console.log(`✅ Simulated execution: ${actionSuggestion.command}`);
    
    // Mark want as satisfied
    wants.satisfyWant(wantId, `Auto-executed: ${actionSuggestion.description}`);
    
    // Update stats
    config.lastExecution = Date.now();
    config.stats.actionsExecuted++;
    saveMotivationConfig(config);
    
    return true;
  }
  
  console.log(`⚠️  External action execution not implemented for safety`);
  return false;
}

// --- Heartbeat Integration ---

function motivationHeartbeat() {
  if (!isMotivationEnabled()) {
    return 'HEARTBEAT_OK';
  }
  
  const response = generateMotivationalResponse();
  const config = loadMotivationConfig();
  
  config.stats.sessionsActive++;
  saveMotivationConfig(config);
  
  if (response.suggestions.length === 0) {
    return 'HEARTBEAT_OK';
  }
  
  const topSuggestion = response.suggestions[0];
  const want = topSuggestion.want;
  
  // Convert wants to initiative thoughts instead of immediate actions
  try {
    // Check if initiative system exists
    const initiativeIntegration = require('./initiative-integration.js');
    
    // For high-intensity wants, queue a thought for potential communication
    if (want.intensity > 0.5 && response.state.intensity > 0.6) {
      const thought = initiativeIntegration.wantToThought(want);
      
      // Use the queueThought function from initiative.js
      const initiative = require('./initiative.js');
      const thoughtId = initiative.queueThought(thought.text, {
        priority: thought.priority,
        category: thought.category,
        context: thought.context
      });
      
      if (thoughtId) {
        console.log(`💭 Queued initiative thought from motivation: ${want.description}`);
        config.stats.actionsSuggested++;
        saveMotivationConfig(config);
        return `Motivation generated thought: ${thought.text.substring(0, 50)}...`;
      }
    }
    
    // For lower intensity wants, just execute safe internal actions
    if (want.intensity > 0.6 && response.state.intensity > 0.8) {
      const actionSuggestion = generateActionForWant(want);
      
      if (canAutoExecute(actionSuggestion.action)) {
        console.log(`🤖 Proactive action: ${actionSuggestion.description}`);
        executeWantAction(want.id, { autoApprove: false });
        return `Executed proactive action: ${actionSuggestion.description}`;
      }
    }
    
  } catch (e) {
    // Fallback to old behavior if initiative system not available
    console.warn('Initiative system not available, using legacy behavior:', e.message);
    
    if (want.intensity > 0.6 && response.state.intensity > 0.8) {
      const actionSuggestion = generateActionForWant(want);
      console.log(`💭 Motivation impulse: ${want.description}`);
      config.stats.actionsSuggested++;
      saveMotivationConfig(config);
      return `Internal motivation: ${want.description}`;
    }
  }
  
  return 'HEARTBEAT_OK';
}

// --- CLI Functions ---

function showMotivationStatus() {
  const enabled = isMotivationEnabled();
  const config = loadMotivationConfig();
  const response = enabled ? generateMotivationalResponse() : { enabled: false };
  
  console.log(`\n🧠 Motivation System Status\n`);
  console.log(`Enabled: ${enabled ? '✅ Yes' : '❌ No'}`);
  
  if (!enabled) {
    if (config.disabledUntil) {
      const remaining = Math.ceil((config.disabledUntil - Date.now()) / 60000);
      console.log(`Disabled for: ${remaining} more minutes`);
    }
    return;
  }
  
  const state = response.state;
  console.log(`Phase: ${state.phase.name} (${state.phase.description})`);
  console.log(`Motivation Intensity: ${(state.intensity * 100).toFixed(0)}%`);
  console.log(`Withdrawn Mode: ${state.isWithdrawn ? '⚠️  Yes' : '✅ No'}`);
  
  if (response.activeWants.length > 0) {
    console.log(`\n💭 Current Active Wants (${response.totalActive} total):\n`);
    
    for (const want of response.activeWants) {
      const intensityBar = '█'.repeat(Math.round(want.intensity * 5)) + '░'.repeat(5 - Math.round(want.intensity * 5));
      const age = Math.round((Date.now() - want.created) / (60 * 1000));
      
      console.log(`${want.type.padEnd(12)} ${intensityBar} ${want.intensity.toFixed(2)}`);
      console.log(`  ${want.description}`);
      console.log(`  Age: ${age}m | ID: ${want.id.slice(-8)}`);
      console.log('');
    }
  } else {
    console.log(`\n💤 No active wants - peaceful state`);
  }
  
  console.log(`📊 Stats: ${config.stats.wantsGenerated} wants generated, ${config.stats.actionsExecuted} actions executed`);
}

function disableMotivation(durationMinutes = 60) {
  const config = loadMotivationConfig();
  config.enabled = false;
  config.disabledUntil = Date.now() + (durationMinutes * 60 * 1000);
  saveMotivationConfig(config);
  
  console.log(`🚫 Motivation system disabled for ${durationMinutes} minutes`);
}

function enableMotivation() {
  const config = loadMotivationConfig();
  config.enabled = true;
  config.disabledUntil = null;
  saveMotivationConfig(config);
  
  console.log(`✅ Motivation system enabled`);
}

// --- CLI Interface ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log(`
🧠 Motivation Engine — Internal Drive System

Commands:
  status                           Show current motivational state
  generate [--force]               Force want generation
  suggest [--top <N>]             Show top action suggestions
  execute --want <id> [--auto-approve]  Execute want action
  heartbeat                       Run motivation heartbeat check
  disable [--duration <minutes>]  Temporarily disable system
  enable                          Re-enable system

Examples:
  node motivation.js status
  node motivation.js suggest --top 5
  node motivation.js execute --want want_123abc --auto-approve
  node motivation.js disable --duration 30
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
      showMotivationStatus();
      break;
    case 'generate':
      const result = wants.generateWants({ debug: true });
      console.log(`✅ Generated ${result.added} new wants`);
      break;
    case 'suggest':
      const suggestions = suggestActions(parseInt(options.top) || 3);
      console.log(`\n💡 Top Action Suggestions:\n`);
      suggestions.forEach((s, i) => {
        console.log(`${i + 1}. ${s.suggestion.description}`);
        console.log(`   Want: ${s.want.description} (intensity: ${s.want.intensity.toFixed(2)})`);
        console.log(`   Priority: ${s.priority.toFixed(2)} | Auto-execute: ${s.canAutoExecute ? '✅' : '❌'}`);
        console.log(`   Command: ${s.suggestion.command}`);
        console.log('');
      });
      break;
    case 'execute':
      if (!options.want) {
        console.error('❌ --want parameter required');
        return;
      }
      executeWantAction(options.want, options);
      break;
    case 'heartbeat':
      const heartbeatResult = motivationHeartbeat();
      console.log(heartbeatResult);
      break;
    case 'disable':
      disableMotivation(parseInt(options.duration) || 60);
      break;
    case 'enable':
      enableMotivation();
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  assessMotivationalState,
  generateMotivationalResponse,
  suggestActions,
  executeWantAction,
  motivationHeartbeat,
  isMotivationEnabled
};