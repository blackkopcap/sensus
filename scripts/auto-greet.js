#!/usr/bin/env node
/**
 * Auto-Greet — Automatically greet new Slack users who come online
 * 
 * Checks tracked users' presence. If someone is online but has no profile
 * in sensus-data/users/, sends them a DM greeting.
 * 
 * Usage: node auto-greet.js
 * Called from heartbeat.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OPENCLAW_CONFIG = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
const SENSUS_CONFIG = path.join(__dirname, '..', 'sensus-config.json');

// Load feature flags
function loadSensusConfig() {
  try {
    return JSON.parse(fs.readFileSync(SENSUS_CONFIG, 'utf8'));
  } catch (e) {
    return { features: {} };
  }
}

function isFeatureEnabled(feature) {
  const config = loadSensusConfig();
  return config.features && config.features[feature] === true;
}
const USERS_DIR = path.join(process.env.HOME, '.openclaw', 'workspace', 'sensus', 'sensus-data', 'users');
const STATE_FILE = path.join(process.env.HOME, '.openclaw', 'workspace', 'sensus', 'sensus-data', 'auto-greet-state.json');
const BOT_USER_ID = 'U0AMFUEU0AZ';

// Known users we should NOT greet (ourselves, Nikita)
const SKIP_USERS = new Set([BOT_USER_ID, 'U07EMF8UVQW']);

function getSlackToken() {
  try {
    const cfg = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf8'));
    return cfg.channels?.slack?.botToken;
  } catch (e) {
    return null;
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {}
  return { greeted: {}, lastCheck: 0 };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function hasProfile(userId) {
  return fs.existsSync(path.join(USERS_DIR, userId, 'profile.json'));
}

function slackApi(method, token, params = {}) {
  return new Promise((resolve, reject) => {
    const isPost = Object.keys(params).length > 0 && method !== 'users.getPresence' && method !== 'users.info';
    const qs = !isPost ? '?' + new URLSearchParams(params).toString() : '';
    
    const options = {
      hostname: 'slack.com',
      path: `/api/${method}${qs}`,
      method: isPost ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (isPost) req.write(JSON.stringify(params));
    req.end();
  });
}

async function getWorkspaceMembers(token) {
  // Get members from conversations we're in
  try {
    const r = await slackApi('users.list', token, { limit: 200 });
    if (r.ok) return r.members.filter(m => !m.is_bot && !m.deleted && m.id !== 'USLACKBOT').map(m => m.id);
  } catch (e) {}
  return [];
}

async function main() {
  // Check if autoGreet feature is enabled
  if (!isFeatureEnabled('autoGreet')) {
    console.log('Auto-greet feature is disabled');
    return;
  }

  const token = getSlackToken();
  if (!token) { console.log('No Slack token'); return; }

  const state = loadState();
  const now = Date.now();
  
  // Don't check more than once per 15 min
  if (now - state.lastCheck < 14 * 60 * 1000) {
    console.log('Too soon since last check, skipping');
    return;
  }

  // Work hours only (9-19)
  const hour = new Date().getHours();
  if (hour < 9 || hour >= 19) {
    console.log('Outside work hours');
    return;
  }

  state.lastCheck = now;

  // Get all workspace members
  const members = await getWorkspaceMembers(token);
  
  let greeted = 0;
  
  for (const uid of members) {
    if (SKIP_USERS.has(uid)) continue;
    if (hasProfile(uid)) continue;
    if (state.greeted[uid]) continue; // Already greeted
    
    // Check if online
    try {
      const presence = await slackApi('users.getPresence', token, { user: uid });
      if (presence.presence !== 'active') continue;
      
      // Get user info
      const info = await slackApi('users.info', token, { user: uid });
      if (!info.ok) continue;
      
      const name = info.user.real_name || info.user.name;
      
      // Send greeting
      const msg = await slackApi('chat.postMessage', token, {
        channel: uid,
        text: `Привет! 👋 Я Helen, AI-ассистент команды Green API. Если будут вопросы или нужна помощь — пиши!`
      });
      
      if (msg.ok) {
        state.greeted[uid] = { name, greetedAt: new Date().toISOString() };
        greeted++;
        console.log(`✅ Greeted ${name} (${uid})`);
        
        // Max 3 greetings per run to avoid spam
        if (greeted >= 3) break;
      }
      
      // Small delay between messages
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (e) {
      console.error(`Error checking ${uid}:`, e.message);
    }
  }

  saveState(state);
  
  if (greeted > 0) {
    console.log(`Greeted ${greeted} new users`);
  } else {
    console.log('No new users to greet');
  }
}

main().catch(e => console.error('Auto-greet error:', e.message));
