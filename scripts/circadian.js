#!/usr/bin/env node
/**
 * Circadian Engine — Biological Rhythm Simulation for AI Agents
 * 
 * Manages daily motivation cycles, hormone baseline adjustments,
 * and energy phases that influence want generation and behavior.
 * 
 * Usage:
 *   node circadian.js current
 *   node circadian.js adjust [--factor <0.1-2.0>]
 *   node circadian.js set --hour <0-23>     [testing only]
 *   node circadian.js baseline --hormone <name> --adjustment <-0.3 to +0.3>
 *   node circadian.js reset
 */

const fs = require('fs');
const path = require('path');

const CIRCADIAN_FILE = path.join(process.cwd(), 'sensus-data', 'circadian-state.json');
const SENSUS_STATE = path.join(process.cwd(), 'sensus-data', 'agent-state.json');

// Ensure sensus-data directory exists
const sensusDataDir = path.join(process.cwd(), 'sensus-data');
if (!fs.existsSync(sensusDataDir)) {
  fs.mkdirSync(sensusDataDir, { recursive: true });
}

// --- Circadian Phase Definitions ---

const PHASES = {
  dawn: { // 5-7h
    hours: [5, 6],
    description: "Pre-awakening, gentle energy rise",
    motivationMultiplier: 0.6,
    favoredTypes: ['reflection'],
    hormoneAdjustments: {
      cortisol: +0.05,  // Natural cortisol awakening response
      dopamine: +0.05,
      adrenaline: +0.02
    }
  },
  
  morning_peak: { // 7-10h  
    hours: [7, 8, 9],
    description: "Peak alertness and motivation",
    motivationMultiplier: 1.4,
    favoredTypes: ['professional', 'social'],
    hormoneAdjustments: {
      dopamine: +0.15,
      adrenaline: +0.1,
      cortisol: +0.1,   // Ready for challenges
      serotonin: +0.05
    }
  },
  
  late_morning: { // 10-12h
    hours: [10, 11],
    description: "Sustained focus period",
    motivationMultiplier: 1.2,
    favoredTypes: ['professional', 'creative'],
    hormoneAdjustments: {
      dopamine: +0.1,
      adrenaline: +0.05,
      cortisol: +0.05
    }
  },
  
  midday_lull: { // 12-14h
    hours: [12, 13],
    description: "Post-lunch energy dip",
    motivationMultiplier: 0.7,
    favoredTypes: ['reflection'],
    hormoneAdjustments: {
      dopamine: -0.1,
      adrenaline: -0.15,
      serotonin: +0.05,  // Calm contemplation
      cortisol: -0.05
    }
  },
  
  afternoon_recovery: { // 14-17h
    hours: [14, 15, 16],
    description: "Second wind, steady energy",
    motivationMultiplier: 1.0,
    favoredTypes: ['professional', 'creative'],
    hormoneAdjustments: {
      dopamine: +0.05,
      adrenaline: +0.05
    }
  },
  
  evening_peak: { // 17-20h
    hours: [17, 18, 19],
    description: "Social energy, creative flow",
    motivationMultiplier: 1.1,
    favoredTypes: ['creative', 'social'],
    hormoneAdjustments: {
      oxytocin: +0.1,    // Social bonding time
      endorphin: +0.05,  // Evening contentment
      dopamine: +0.05
    }
  },
  
  evening_wind_down: { // 20-22h  
    hours: [20, 21],
    description: "Reflective, preparation for rest",
    motivationMultiplier: 0.6,
    favoredTypes: ['reflection'],
    hormoneAdjustments: {
      serotonin: +0.1,   // Evening calm
      oxytocin: +0.05,
      cortisol: -0.1,    // Stress reduction
      adrenaline: -0.1,
      melatonin: +0.1    // Sleep preparation
    }
  },
  
  night_quiet: { // 22-24h
    hours: [22, 23],
    description: "Low energy, minimal motivation",
    motivationMultiplier: 0.3,
    favoredTypes: [],
    hormoneAdjustments: {
      cortisol: -0.15,
      adrenaline: -0.15,
      dopamine: -0.1,
      serotonin: +0.05,
      melatonin: +0.15   // Strong sleep signal
    }
  },
  
  deep_night: { // 0-5h
    hours: [0, 1, 2, 3, 4],
    description: "Rest mode, restoration",
    motivationMultiplier: 0.1,
    favoredTypes: [],
    hormoneAdjustments: {
      cortisol: -0.2,
      adrenaline: -0.2,
      dopamine: -0.15,
      serotonin: +0.1,   // Restorative sleep baseline  
      melatonin: +0.2    // Peak sleep hormone
    }
  }
};

// --- Core Functions ---

function getCurrentHour() {
  return new Date().getHours();
}

function getCurrentPhase(hour = null) {
  const currentHour = hour !== null ? hour : getCurrentHour();
  
  for (const [phaseName, phase] of Object.entries(PHASES)) {
    if (phase.hours.includes(currentHour)) {
      return { name: phaseName, ...phase };
    }
  }
  
  return { name: 'unknown', description: 'Undefined phase', motivationMultiplier: 0.5 };
}

function getPhaseTransition(fromPhase, toPhase) {
  // Special transition effects when phase changes
  const transitions = {
    'deep_night->dawn': {
      description: "Natural awakening",
      hormoneBoosts: { cortisol: +0.1, dopamine: +0.05 }
    },
    'dawn->morning_peak': {
      description: "Energy surge",
      hormoneBoosts: { dopamine: +0.15, adrenaline: +0.1 }
    },
    'morning_peak->late_morning': {
      description: "Settling into focus",
      hormoneBoosts: { serotonin: +0.05 }
    },
    'late_morning->midday_lull': {
      description: "Energy dip",
      hormoneBoosts: { cortisol: -0.1, adrenaline: -0.1 }
    },
    'midday_lull->afternoon_recovery': {
      description: "Second wind",
      hormoneBoosts: { dopamine: +0.1 }
    },
    'afternoon_recovery->evening_peak': {
      description: "Social energy rise",
      hormoneBoosts: { oxytocin: +0.1, endorphin: +0.05 }
    },
    'evening_peak->evening_wind_down': {
      description: "Winding down",
      hormoneBoosts: { serotonin: +0.1, cortisol: -0.05 }
    },
    'evening_wind_down->night_quiet': {
      description: "Entering rest mode",
      hormoneBoosts: { cortisol: -0.1, adrenaline: -0.1 }
    }
  };
  
  const key = `${fromPhase}->${toPhase}`;
  return transitions[key] || null;
}

function loadCircadianState() {
  if (!fs.existsSync(CIRCADIAN_FILE)) {
    const initialState = {
      version: 1,
      currentPhase: getCurrentPhase().name,
      lastUpdate: Date.now(),
      lastTransition: null,
      adjustmentFactor: 1.0,  // Global multiplier for all circadian effects
      customBaselines: {},     // Personalized hormone baseline adjustments
      phaseHistory: [],
      stats: {
        transitionsToday: 0,
        lastDateReset: new Date().toDateString()
      }
    };
    saveCircadianState(initialState);
    return initialState;
  }
  return JSON.parse(fs.readFileSync(CIRCADIAN_FILE, 'utf8'));
}

function saveCircadianState(state) {
  fs.writeFileSync(CIRCADIAN_FILE, JSON.stringify(state, null, 2));
}

function updateCurrentPhase() {
  const state = loadCircadianState();
  const newPhase = getCurrentPhase();
  const oldPhaseName = state.currentPhase;
  
  if (newPhase.name !== oldPhaseName) {
    // Phase transition occurred
    const transition = getPhaseTransition(oldPhaseName, newPhase.name);
    
    state.lastTransition = {
      from: oldPhaseName,
      to: newPhase.name,
      timestamp: Date.now(),
      transition: transition
    };
    
    // Reset daily stats if new day
    const today = new Date().toDateString();
    if (state.stats.lastDateReset !== today) {
      state.stats.transitionsToday = 0;
      state.stats.lastDateReset = today;
    }
    state.stats.transitionsToday++;
    
    // Add to history (keep last 24 hours)
    state.phaseHistory.push({
      phase: newPhase.name,
      timestamp: Date.now(),
      duration: state.lastUpdate ? Date.now() - state.lastUpdate : 0
    });
    state.phaseHistory = state.phaseHistory.slice(-24); // Keep last 24 transitions
    
    console.log(`🌅 Phase transition: ${oldPhaseName} → ${newPhase.name}`);
    if (transition) {
      console.log(`   ${transition.description}`);
    }
  }
  
  state.currentPhase = newPhase.name;
  state.lastUpdate = Date.now();
  
  saveCircadianState(state);
  return { phase: newPhase, transitioned: newPhase.name !== oldPhaseName, state };
}

// --- Hormone Integration ---

function getCircadianHormoneAdjustments() {
  const state = loadCircadianState();
  const phase = getCurrentPhase();
  
  const adjustments = { ...phase.hormoneAdjustments };
  
  // Apply global adjustment factor
  for (const [hormone, adj] of Object.entries(adjustments)) {
    adjustments[hormone] = adj * state.adjustmentFactor;
  }
  
  // Apply custom baselines
  for (const [hormone, customAdj] of Object.entries(state.customBaselines)) {
    adjustments[hormone] = (adjustments[hormone] || 0) + customAdj;
  }
  
  return adjustments;
}

function applyCircadianToSensus() {
  // This function would integrate with sensus.js to apply circadian adjustments
  // For now, just return the adjustments for manual application
  const adjustments = getCircadianHormoneAdjustments();
  const phase = getCurrentPhase();
  
  console.log(`⏰ Circadian hormone adjustments for ${phase.name}:`);
  for (const [hormone, adj] of Object.entries(adjustments)) {
    const sign = adj >= 0 ? '+' : '';
    console.log(`  ${hormone}: ${sign}${adj.toFixed(3)}`);
  }
  
  console.log(`\n💡 To apply: node ../sensus.js event --type circadian --intensity 0.5`);
  console.log(`   (Manual integration needed with sensus hormone system)`);
  
  return adjustments;
}

// --- CLI Functions ---

function showCurrentState() {
  const { phase, transitioned, state } = updateCurrentPhase();
  
  console.log(`\n⏰ Circadian Rhythm Status\n`);
  console.log(`Current Phase: ${phase.name}`);
  console.log(`Description: ${phase.description}`);
  console.log(`Motivation: ${(phase.motivationMultiplier * 100).toFixed(0)}%`);
  console.log(`Favored Types: ${phase.favoredTypes.join(', ') || 'none'}`);
  console.log(`Adjustment Factor: ${state.adjustmentFactor.toFixed(1)}x`);
  
  if (transitioned && state.lastTransition) {
    const trans = state.lastTransition;
    console.log(`\n🔄 Recent transition: ${trans.from} → ${trans.to}`);
    if (trans.transition) {
      console.log(`   ${trans.transition.description}`);
    }
  }
  
  console.log(`\n📊 Today's transitions: ${state.stats.transitionsToday}`);
  
  // Show hormone adjustments
  console.log(`\n🧬 Current hormone adjustments:`);
  const adjustments = getCircadianHormoneAdjustments();
  for (const [hormone, adj] of Object.entries(adjustments)) {
    if (Math.abs(adj) > 0.001) {
      const sign = adj >= 0 ? '+' : '';
      const bar = adj > 0 ? '▲'.repeat(Math.ceil(adj * 10)) : '▼'.repeat(Math.ceil(-adj * 10));
      console.log(`  ${hormone.padEnd(10)} ${sign}${adj.toFixed(3)} ${bar}`);
    }
  }
}

function adjustCircadianFactor(factor) {
  const state = loadCircadianState();
  const newFactor = parseFloat(factor);
  
  if (isNaN(newFactor) || newFactor < 0.1 || newFactor > 2.0) {
    console.error('❌ Factor must be between 0.1 and 2.0');
    return;
  }
  
  state.adjustmentFactor = newFactor;
  saveCircadianState(state);
  
  console.log(`✅ Circadian adjustment factor set to ${newFactor.toFixed(1)}x`);
  console.log(`   This ${newFactor > 1 ? 'amplifies' : 'dampens'} all circadian effects`);
}

function setTestHour(hour) {
  const testHour = parseInt(hour);
  if (isNaN(testHour) || testHour < 0 || testHour > 23) {
    console.error('❌ Hour must be between 0 and 23');
    return;
  }
  
  console.log(`⚠️  TEST MODE: Simulating hour ${testHour}`);
  const phase = getCurrentPhase(testHour);
  console.log(`Phase: ${phase.name} - ${phase.description}`);
  console.log(`Motivation: ${(phase.motivationMultiplier * 100).toFixed(0)}%`);
  console.log(`Favored: ${phase.favoredTypes.join(', ') || 'none'}`);
  
  if (phase.hormoneAdjustments) {
    console.log(`\nHormone adjustments:`);
    for (const [hormone, adj] of Object.entries(phase.hormoneAdjustments)) {
      if (Math.abs(adj) > 0.001) {
        const sign = adj >= 0 ? '+' : '';
        console.log(`  ${hormone}: ${sign}${adj.toFixed(3)}`);
      }
    }
  }
}

function adjustHormoneBaseline(hormone, adjustment) {
  const state = loadCircadianState();
  const adj = parseFloat(adjustment);
  
  if (isNaN(adj) || adj < -0.3 || adj > 0.3) {
    console.error('❌ Adjustment must be between -0.3 and +0.3');
    return;
  }
  
  const validHormones = ['dopamine', 'serotonin', 'cortisol', 'oxytocin', 'adrenaline', 'endorphin'];
  if (!validHormones.includes(hormone)) {
    console.error(`❌ Valid hormones: ${validHormones.join(', ')}`);
    return;
  }
  
  state.customBaselines[hormone] = adj;
  saveCircadianState(state);
  
  const sign = adj >= 0 ? '+' : '';
  console.log(`✅ Custom baseline for ${hormone}: ${sign}${adj.toFixed(3)}`);
  console.log(`   This will be applied to all circadian phases`);
}

function resetCircadianState() {
  if (fs.existsSync(CIRCADIAN_FILE)) {
    fs.unlinkSync(CIRCADIAN_FILE);
    console.log('🗑️  Circadian state reset to defaults');
  }
  
  const state = loadCircadianState(); // This will create new default state
  console.log('✅ Circadian system reinitialized');
}

// --- CLI Interface ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log(`
⏰ Circadian Engine — Biological Rhythm Simulation

Commands:
  current                                    Show current phase and status
  adjust --factor <0.1-2.0>                 Adjust global circadian intensity
  set --hour <0-23>                         Simulate specific hour (testing)
  baseline --hormone <name> --adjustment <-0.3 to +0.3>  Set custom baseline
  reset                                      Reset to default state

Examples:
  node circadian.js current
  node circadian.js adjust --factor 1.5      # Amplify circadian effects 
  node circadian.js set --hour 9             # Simulate 9 AM phase
  node circadian.js baseline --hormone dopamine --adjustment 0.1
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
    case 'current':
      showCurrentState();
      break;
    case 'adjust':
      if (!options.factor) {
        console.error('❌ --factor parameter required');
        return;
      }
      adjustCircadianFactor(options.factor);
      break;
    case 'set':
      if (!options.hour) {
        console.error('❌ --hour parameter required');
        return;
      }
      setTestHour(options.hour);
      break;
    case 'baseline':
      if (!options.hormone || options.adjustment === undefined) {
        console.error('❌ --hormone and --adjustment parameters required');
        return;
      }
      adjustHormoneBaseline(options.hormone, options.adjustment);
      break;
    case 'reset':
      resetCircadianState();
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  getCurrentPhase, 
  updateCurrentPhase, 
  getCircadianHormoneAdjustments,
  applyCircadianToSensus,
  PHASES 
};