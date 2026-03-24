#!/usr/bin/env node
/**
 * Reactions — Dynamic Reaction System for Sensus
 * Configure and manage the emoji reaction system.
 *
 * Usage:
 *   node reactions.js configure [--enabled true|false] [--frequency 0.7] [--withdrawn-only true|false]
 *   node reactions.js test "message text" [--user <id>]
 *   node reactions.js status
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(process.cwd(), 'reaction-config.json');
const LIMBIC_BIN = path.join(__dirname, 'limbic.js');

const DEFAULT_CONFIG = {
  enabled: true,
  frequency: 0.7,
  withdrawnReactionsOnly: true,
  commandsLowEnergyReact: true,
  debug: false,
  categories: {
    angry: ["angry", "rage", "unamused", "disappointed", "annoyed", "frustrated"],
    confirming: ["salute", "check", "white_check_mark", "thumbsup", "roger", "ok_hand"],
    loving: ["heart", "two_hearts", "heartpulse", "sparkling_heart", "purple_heart", "smile", "smiling_face_with_3_hearts"],
    happy: ["smile", "grin", "joy", "star2", "sparkles", "tada", "partying_face"],
    thinking: ["thinking_face", "brain", "eyes", "mag", "bulb", "exploding_head"],
    laughing: ["joy", "rofl", "laughing", "sweat_smile", "wink", "stuck_out_tongue_winking_eye"],
    tired: ["tired_face", "weary", "sleeping", "yawn", "coffee", "hourglass_flowing_sand"],
    positive: ["thumbsup", "smile", "slightly_smiling_face", "relaxed", "ok_hand"],
    energetic: ["fire", "rocket", "zap", "muscle", "star-struck", "boom"],
    neutral: ["neutral_face", "shrug", "ok_hand", "white_check_mark", "eyes"]
  }
};

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (e) {
      console.error(`[reactions] Failed to parse config: ${e.message}`);
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function cmdConfigure(args) {
  const config = loadConfig();
  let changed = false;

  // --enabled true|false
  const enabledIdx = args.indexOf('--enabled');
  if (enabledIdx !== -1 && args[enabledIdx + 1]) {
    config.enabled = args[enabledIdx + 1].toLowerCase() === 'true';
    changed = true;
  }

  // --frequency 0.0-1.0
  const freqIdx = args.indexOf('--frequency');
  if (freqIdx !== -1 && args[freqIdx + 1]) {
    const freq = parseFloat(args[freqIdx + 1]);
    if (freq >= 0 && freq <= 1) {
      config.frequency = freq;
      changed = true;
    } else {
      console.error('Frequency must be between 0.0 and 1.0');
      process.exit(1);
    }
  }

  // --withdrawn-only true|false
  const withdrawnIdx = args.indexOf('--withdrawn-only');
  if (withdrawnIdx !== -1 && args[withdrawnIdx + 1]) {
    config.withdrawnReactionsOnly = args[withdrawnIdx + 1].toLowerCase() === 'true';
    changed = true;
  }

  // --commands-react true|false
  const commandsIdx = args.indexOf('--commands-react');
  if (commandsIdx !== -1 && args[commandsIdx + 1]) {
    config.commandsLowEnergyReact = args[commandsIdx + 1].toLowerCase() === 'true';
    changed = true;
  }

  // --debug true|false
  const debugIdx = args.indexOf('--debug');
  if (debugIdx !== -1 && args[debugIdx + 1]) {
    config.debug = args[debugIdx + 1].toLowerCase() === 'true';
    changed = true;
  }

  if (changed) {
    saveConfig(config);
    console.log(JSON.stringify({
      ok: true,
      message: 'Configuration updated',
      config
    }, null, 2));
  } else {
    console.log(JSON.stringify({
      ok: true,
      message: 'Current configuration',
      config
    }, null, 2));
  }
}

function cmdTest(args) {
  // Extract --user parameter
  let userId = null;
  const userIdx = args.indexOf('--user');
  if (userIdx !== -1 && args[userIdx + 1]) {
    userId = args[userIdx + 1];
  }

  let message = args.filter(a => !a.startsWith('--') && a !== userId).join(' ');
  if (!message) {
    console.error('Usage: node reactions.js test "message text" [--user <id>]');
    process.exit(1);
  }

  // Call limbic reaction-preference
  const { execSync } = require('child_process');
  try {
    const userArg = userId ? ` --user "${userId}"` : '';
    const cmd = `node "${LIMBIC_BIN}" reaction-preference "${message}"${userArg}`;
    const result = execSync(cmd, { 
      cwd: process.cwd(), 
      encoding: 'utf8', 
      timeout: 10000 
    });
    
    const analysis = JSON.parse(result);
    console.log(JSON.stringify({
      ok: true,
      test: {
        message: message.slice(0, 100),
        userId: userId || null,
        result: analysis
      }
    }, null, 2));
    
  } catch (error) {
    console.error(`Test failed: ${error.message}`);
    process.exit(1);
  }
}

function cmdStatus() {
  const config = loadConfig();
  
  console.log(JSON.stringify({
    ok: true,
    status: {
      enabled: config.enabled,
      frequency: config.frequency,
      withdrawnReactionsOnly: config.withdrawnReactionsOnly,
      commandsLowEnergyReact: config.commandsLowEnergyReact,
      debug: config.debug,
      categoriesCount: Object.keys(config.categories || {}).length
    }
  }, null, 2));
}

// Main
const [,, command, ...args] = process.argv;

switch (command) {
  case 'configure': cmdConfigure(args); break;
  case 'test':      cmdTest(args); break;
  case 'status':    cmdStatus(); break;
  default:
    console.log(`Reactions — Dynamic Reaction System for Sensus

Usage:
  node reactions.js configure [options]       Configure reaction system
  node reactions.js test "message" [--user <id>]  Test reaction analysis
  node reactions.js status                    Show current status

Configure options:
  --enabled true|false           Enable/disable reaction system (default: true)
  --frequency 0.0-1.0           Base frequency for reactions (default: 0.7)
  --withdrawn-only true|false   Only react (no replies) when withdrawn (default: true)
  --commands-react true|false   React to simple commands when low energy (default: true)
  --debug true|false            Enable debug output (default: false)

Examples:
  node reactions.js configure --enabled true --frequency 0.8
  node reactions.js test "спасибо!" --user user123
  node reactions.js status`);
    break;
}