---
name: sensus-limbic
description: Automatically analyze incoming messages through the Sensus limbic system with dynamic reaction support
events: [message:incoming]
metadata:
  openclaw:
    requires:
      bins: [node, ollama]
---

# Sensus Limbic Hook

This hook automatically processes incoming messages through the Sensus limbic system for emotional analysis, human profiling, and intelligent reaction recommendations.

## Features

- Analyzes message sentiment and emotional content
- Updates agent hormonal state based on interaction patterns
- Builds per-user behavioral profiles
- **NEW:** Provides dynamic reaction vs reply recommendations based on emotional state
- Non-blocking fire-and-forget execution
- Supports multi-user contexts

## Requirements

- Node.js runtime
- Ollama local LLM server (for analysis)
- Sensus limbic system installed

## Usage

The hook automatically triggers on `message:incoming` events and:

1. Extracts message text, user ID, and channel info
2. Calls `node limbic.js analyze` for emotional processing (fire-and-forget)
3. Calls `node limbic.js reaction-preference` for reaction analysis
4. Outputs reaction recommendation to main agent via stdout
5. Logs all activities but doesn't interrupt main message flow

## Reaction System

The hook now includes intelligent reaction analysis that considers:

- Agent's emotional state (mood, energy, warmth, stress)
- Message context (command, thanks, question, joke, etc.)
- User relationship history
- WITHDRAWN state (angry reactions only)

### Output Format

When a reaction is recommended, the hook outputs JSON to stdout:

```json
{
  "type": "sensus-reaction-recommendation",
  "channelInfo": {
    "channelId": "channel_id",
    "messageId": "message_id", 
    "platform": "slack|discord|..."
  },
  "userId": "user_id",
  "messageText": "truncated message...",
  "shouldReact": true,
  "shouldReply": false,
  "reactionHint": "heart love smile happy grateful warm",
  "agentState": {
    "mood": "positive",
    "energy": "high",
    "warmth": "warm",
    "stress": "low",
    "withdrawn": false
  }
}
```

## Configuration

The reaction system can be configured via `reaction-config.json`:

```bash
# Configure reaction system
node scripts/reactions.js configure --enabled true --frequency 0.8

# Test reaction analysis
node scripts/reactions.js test "спасибо!" --user user123

# Check status
node scripts/reactions.js status
```

The hook respects existing Sensus configuration and the new reaction settings.