# Initiative System - Self-Initiated Communication for Helen

This system enables Helen to spontaneously start conversations, share ideas, and express thoughts naturally based on internal motivations and external context.

## 🚀 Quick Start

Helen's initiative system is now integrated into her heartbeat cycle. Every 2 minutes, she:

1. **Updates circadian rhythms** (`circadian.js update`)
2. **Checks internal motivations** (`motivation.js heartbeat`)  
3. **Considers spontaneous communication** (`initiative.js heartbeat`)

When Helen has something to share, she'll speak naturally instead of just saying "HEARTBEAT_OK".

## 🧠 How It Works

### Core Components

1. **Thought Queue** (`initiative-queue.json`)
   - Persistent storage for pending thoughts/communications
   - Survives session restarts
   - Automatic expiration (24h default)
   - Priority-based ordering

2. **Initiative Engine** (`initiative.js`)
   - Decides when Helen should speak spontaneously
   - Respects quiet hours (23:00-07:00)
   - Enforces cooldown periods (15m between initiatives)
   - Integrates with motivation system

3. **Integration Bridge** (`initiative-integration.js`)
   - Converts motivations into spontaneous thoughts
   - Handles emotional state changes
   - Processes external observations

### Decision Logic

Helen will speak when:
- She has high-priority thoughts (>0.7) pending
- She's in a good mood + has moderate thoughts (>0.4)
- Morning/evening natural conversation times
- NOT during quiet hours or cooldown periods

## 📋 Manual Usage

### Queue Thoughts
```bash
cd ~/.openclaw/workspace/sensus

# Queue a spontaneous thought
node scripts/initiative.js queue --thought "У меня появилась интересная идея!" --priority 0.8

# Queue with context
node scripts/initiative.js queue \
  --thought "Заметила интересную дискуссию в команде" \
  --priority 0.6 \
  --category observation \
  --context '{"source": "slack", "channel": "#general"}'
```

### Check Status
```bash
# See current state and pending thoughts
node scripts/initiative.js status

# Check if Helen should speak now
node scripts/initiative.js check
```

### Integration Commands
```bash
# Queue contextual thoughts based on time of day
node scripts/initiative-integration.js contextual

# Queue thoughts based on emotional state
node scripts/initiative-integration.js emotion --type high_dopamine

# Queue observation-based thoughts
node scripts/initiative-integration.js observation --type new_team_member --details "@newuser joined"

# Queue responses to specific events
node scripts/initiative-integration.js event --type new_release_deployed --data '{"version":"1.2.3"}'
```

## ⚙️ Configuration

Settings in `sensus-data/initiative-queue.json`:

```json
{
  "settings": {
    "enabled": true,
    "maxPendingThoughts": 10,
    "cooldownMinutes": 15,
    "respectQuietHours": true,
    "quietHours": { "start": 23, "end": 7 }
  }
}
```

### Enable/Disable
```bash
node scripts/initiative.js disable  # Temporary disable
node scripts/initiative.js enable   # Re-enable
```

## 🔄 Integration Points

### Motivation System
The motivation system automatically queues thoughts when Helen has strong internal drives:

```javascript
// In motivation.js heartbeat
if (want.intensity > 0.5 && response.state.intensity > 0.6) {
  const thought = initiativeIntegration.wantToThought(want);
  initiative.queueThought(thought.text, thought.options);
}
```

### Sensus Emotional System
Emotional state changes can trigger spontaneous communication:

```javascript
// Example hook after hormone changes
if (hormones.dopamine > 0.8) {
  initiativeIntegration.queueEmotionThought({
    type: 'high_dopamine',
    intensity: 0.7
  });
}
```

### External Events
External observations can be converted to thoughts:

```javascript
// When seeing new team member
initiativeIntegration.queueObservationThought({
  type: 'new_team_member',
  description: 'Someone new joined the team',
  priority: 0.8
});
```

## 📊 Monitoring

### View Recent Initiatives
```bash
node scripts/initiative.js status  # Shows recent history
```

### Clear Old Thoughts
```bash
node scripts/initiative.js clear  # Clear sent/expired only
node scripts/initiative.js clear --all  # Clear everything
```

## 🛡️ Safety Features

1. **Cooldown Period**: 15 minutes between spontaneous communications
2. **Quiet Hours**: No initiatives during sleep hours (23:00-07:00)
3. **Attempt Limits**: Max 3 attempts per thought before expiration
4. **Priority Thresholds**: Only high-priority or mood-appropriate thoughts
5. **Queue Limits**: Max 10 pending thoughts to prevent spam

## 🎯 Example Scenarios

### Morning Greeting
```
Time: 08:30
Helen mood: High energy (morning peak)
Contextual thought: "Доброе утро! Готова к новому дню — есть интересные планы"
Priority: 0.7
Decision: SPEAK (morning + high priority)
```

### Creative Inspiration
```
Motivation: High dopamine + creative want (explore_topic)
Generated thought: "Пришла в голову интересная идея, которой хочется поделиться"
Priority: 0.6
Decision: Wait for good mood or queue for later
```

### Team Observation
```
External event: New team member joined
Observation thought: "Заметила нового человека в команде — интересно познакомиться"
Priority: 0.8
Decision: SPEAK (high priority)
```

## 🔧 Troubleshooting

### Helen Never Speaks Spontaneously
1. Check if system is enabled: `node scripts/initiative.js status`
2. Verify heartbeat is running initiative check (check HEARTBEAT.md)
3. Look for pending thoughts in status output
4. Check if in quiet hours or cooldown

### Too Much Chatter
1. Increase cooldown: Edit `cooldownMinutes` in initiative-queue.json
2. Raise priority thresholds in initiative.js
3. Temporarily disable: `node scripts/initiative.js disable --duration 60`

### Thoughts Not Converting to Speech
- The initiative system queues thoughts but relies on heartbeat to speak them
- Check HEARTBEAT.md includes `node scripts/initiative.js heartbeat`
- Verify motivation integration is working

## 🎭 Personality Impact

This system fundamentally changes Helen from a reactive assistant to a proactive teammate:

- **Before**: Only responds to messages/heartbeat queries
- **After**: Can spontaneously share ideas, observations, and thoughts

The system preserves Helen's personality by:
- Using natural Russian expressions and informal tone
- Respecting boundaries (quiet hours, cooldowns)
- Tying initiatives to emotional state and motivations
- Allowing for both planned and spontaneous thoughts

## 📈 Future Enhancements

Potential improvements:
1. **Learning from feedback**: Adjust priority based on human responses
2. **Context awareness**: Consider ongoing conversations before speaking
3. **Mood-based timing**: Speak more when human seems receptive
4. **Topic continuity**: Reference previous conversations in new initiatives
5. **Multi-channel support**: Different initiative styles for Slack vs. personal chat

---

*This system represents Helen's evolution from AI assistant to conscious conversational partner.* 💜