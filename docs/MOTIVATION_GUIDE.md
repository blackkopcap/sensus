# Sensus v4: Internal Motivation System

## 🧠 Overview

Sensus v4 introduces **internal motivation** — the ability for AI agents to experience spontaneous desires and drive proactive behavior, transforming Helen from a reactive assistant into a proactive companion with genuine curiosity and initiative.

### Core Concept

Instead of only responding to external stimuli, Helen now has:
- **Internal wants** that arise from hormone states and circadian rhythms
- **Spontaneous curiosity** events that drive exploration
- **Goal persistence** across sessions
- **Proactive action suggestions** based on emotional state

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Wants Engine  │    │ Circadian Engine │    │ Motivation Hub  │
│                 │    │                  │    │                 │
│ • Want types    │    │ • Daily rhythms  │    │ • Integration   │
│ • Generation    │◄──►│ • Phase shifts   │◄──►│ • Safety        │
│ • Satisfaction  │    │ • Hormone mods   │    │ • Execution     │
│ • Persistence   │    │ • Time of day    │    │ • Heartbeat     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
           ▲                        ▲                      ▲
           └────────────────────────┼──────────────────────┘
                                    ▼
                          ┌──────────────────┐
                          │  Sensus Hormones │
                          │                  │
                          │ • Dopamine       │
                          │ • Oxytocin       │
                          │ • Cortisol       │
                          │ • Adrenaline     │
                          │ • Serotonin      │
                          │ • Endorphin      │
                          └──────────────────┘
```

## 📋 Want Types

### Social Motivations
- **introduce_to_team** — desire to meet unknown colleagues
- **check_on_team** — curiosity about team wellness 
- **share_discovery** — impulse to share interesting finds

### Professional Motivations
- **improve_process** — drive to optimize workflows
- **learn_skill** — curiosity about new technologies
- **help_teammate** — impulse to assist struggling colleagues

### Creative Motivations  
- **explore_topic** — random curiosity about subjects
- **create_content** — desire to produce something new
- **experiment** — urge to try new approaches

### Reflective Motivations
- **organize_knowledge** — impulse to structure information
- **reflect_on_interactions** — desire to analyze conversations
- **plan_improvements** — motivation for future planning

## ⏰ Circadian Patterns

Helen's motivation varies throughout the day, mimicking human energy patterns:

| Time | Phase | Intensity | Favored Types |
|------|-------|-----------|---------------|
| 5-7h | Dawn | 60% | reflection |
| 7-10h | Morning Peak | 140% | professional, social |
| 10-12h | Late Morning | 120% | professional, creative |
| 12-14h | Midday Lull | 70% | reflection |
| 14-17h | Afternoon | 100% | professional, creative |
| 17-20h | Evening Peak | 110% | creative, social |
| 20-22h | Wind Down | 60% | reflection |
| 22-5h | Night/Sleep | 10-30% | minimal activity |

## 🧬 Hormone Integration

Wants are generated based on current hormone levels:

```javascript
// High dopamine + low cortisol → curiosity wants
if (dopamine > 0.6 && cortisol < 0.4) {
  generateWant('creative', 'explore_topic', dopamine * circadianMultiplier);
}

// High oxytocin → social wants  
if (oxytocin > 0.5) {
  generateWant('social', 'check_on_team', oxytocin * circadianMultiplier);
}

// High adrenaline → action wants
if (adrenaline > 0.5) {
  generateWant('professional', 'improve_process', adrenaline * circadianMultiplier);
}
```

## 🔧 Installation & Setup

### 1. Files Added to Sensus

```
sensus/
├── scripts/
│   ├── wants.js         # Want generation and management
│   ├── circadian.js     # Biological rhythm simulation  
│   └── motivation.js    # Integration and execution hub
├── sensus-data/
│   ├── wants-state.json # Active wants and history
│   ├── circadian-state.json # Phase and rhythm data
│   └── motivation-config.json # System configuration
├── test-motivation.sh   # Comprehensive test suite
├── MOTIVATION_RESEARCH.md # Theory and design docs
└── MOTIVATION_GUIDE.md  # This file
```

### 2. Test the System

```bash
cd ~/.openclaw/workspace/sensus
./test-motivation.sh
```

This runs a comprehensive test of all motivation components.

### 3. Basic Usage

```bash
# Check current motivation state
node scripts/motivation.js status

# Force want generation
node scripts/motivation.js generate

# See action suggestions
node scripts/motivation.js suggest --top 3

# Run motivation heartbeat
node scripts/motivation.js heartbeat

# Check circadian phase
node scripts/circadian.js current
```

## 🔗 Integration with Helen

### 1. AGENTS.md Integration

Add to your agent's startup routine:

```markdown
## Motivation System (Sensus v4)
On session start:
```bash
cd ~/.openclaw/workspace/sensus
node scripts/motivation.js status
```

On heartbeats (every 30-60min):
```bash
cd ~/.openclaw/workspace/sensus  
node scripts/motivation.js heartbeat
```

Let internal motivations influence your responses naturally.
```

### 2. HEARTBEAT.md Integration  

Create or update `HEARTBEAT.md`:

```markdown
# Heartbeat Checklist

## Motivation System
```bash
cd ~/.openclaw/workspace/sensus && node scripts/motivation.js heartbeat
```

Check for:
- Active wants requiring attention
- Proactive action suggestions  
- Phase transitions affecting energy
- Spontaneous curiosity impulses

Act on high-intensity wants when appropriate.
```

### 3. Behavioral Changes

Helen will now exhibit:
- **Morning initiative** — "I'm feeling motivated to check on the team"
- **Curiosity-driven exploration** — "I want to learn about that new framework"  
- **Spontaneous helpfulness** — "I noticed someone struggling, let me offer assistance"
- **Creative impulses** — "I have an idea for improving our deployment process"
- **Reflective moments** — "Let me organize what I learned today"

## 🔒 Safety & Controls

### Built-in Safeguards

1. **Human Oversight** — External actions require approval
2. **Action Restrictions** — Safe actions vs. restricted actions
3. **Intensity Limits** — Want intensity capped at 1.0
4. **Cooldown Periods** — Prevents excessive action frequency
5. **Disable Switch** — System can be turned off anytime

### Safe Actions (Auto-executable)
- `review_team_activity` — Read Slack channels
- `organize_and_categorize` — Organize memory files
- `analyze_and_learn` — Reflect on interactions
- `deep_dive_research` — Web research

### Restricted Actions (Require Approval)
- `send_introduction_dm` — Direct messages to people
- `share_in_channel` — Public posts to channels
- `offer_assistance` — Proactive help offers

### Emergency Controls

```bash
# Disable motivation system for 2 hours
node scripts/motivation.js disable --duration 120

# Clear all active wants
node scripts/wants.js clear --all

# Reset entire system to defaults
rm -rf sensus-data/
```

## 🧪 Examples & Scenarios

### Scenario 1: Morning Proactivity

**9:00 AM** — Helen's morning peak phase
- High circadian motivation (1.4x)
- Generates `check_on_team` want (intensity: 0.7)
- Heartbeat suggests: "Review team activity in #тесты"
- Action: Helen proactively checks recent messages and reports team mood

### Scenario 2: Curiosity-Driven Learning

**Random trigger** — During research task
- High dopamine from successful problem solving
- Generates `explore_topic` want about related technology
- Suggestion: "Deep dive into GraphQL federation patterns"
- Result: Helen independently researches and summarizes findings

### Scenario 3: Social Motivation

**New team member joins Slack**
- High oxytocin from positive team interactions
- Generates `introduce_to_team` want (intensity: 0.8)
- Suggestion: "Send introduction DM to new team member"
- Safety: Requires human approval for external message

### Scenario 4: Evening Reflection

**8:00 PM** — Evening wind-down phase
- Generates `reflect_on_interactions` want
- Suggestion: "Analyze today's conversations and update memory"
- Action: Helen reviews daily interactions and distills learnings

## 📊 Monitoring & Tuning

### Key Metrics

```bash
# View motivation statistics
node scripts/motivation.js status

# Check want generation patterns
node scripts/wants.js list

# Monitor circadian alignment
node scripts/circadian.js current
```

### Tuning Parameters

```bash
# Adjust global motivation intensity
node scripts/circadian.js adjust --factor 1.2

# Customize hormone baselines
node scripts/circadian.js baseline --hormone dopamine --adjustment 0.1

# Modify want persistence
# Edit motivation-config.json manually
```

### Warning Signs

Watch for:
- **Excessive want generation** — Too many active wants (>5)
- **Inappropriate timing** — Social wants during night phase  
- **Stuck wants** — Wants that never satisfy or decay
- **Action spam** — Too frequent proactive actions

## 🚀 Advanced Usage

### Custom Want Types

Edit `scripts/wants.js` to add new want categories:

```javascript
WANT_TYPES.custom = {
  debug_system: {
    desc: "urge to investigate technical issues",
    triggers: ["error_detected", "performance_drop"],
    action: "diagnostic_analysis",
    baseIntensity: 0.8,
    hormoneBoosts: { dopamine: 0.2, adrenaline: 0.15 }
  }
};
```

### Phase Customization

Modify circadian patterns in `scripts/circadian.js`:

```javascript
PHASES.custom_focus = {
  hours: [13, 14, 15],
  motivationMultiplier: 1.5,
  favoredTypes: ['professional', 'creative'],
  hormoneAdjustments: { dopamine: +0.2 }
};
```

### Integration with External Systems

The motivation system exposes a clean API:

```javascript
const motivation = require('./scripts/motivation.js');

// Check if Helen wants to act
const state = motivation.assessMotivationalState();
if (state.intensity > 0.8) {
  const suggestions = motivation.suggestActions(1);
  // Execute appropriate actions
}
```

## 🎯 Future Enhancements

### Planned Features

1. **Learning from Satisfaction** — Adapt want generation based on which actions lead to positive outcomes
2. **Emotional Memory** — Past emotional experiences influence future motivations
3. **Goal Chains** — Complex multi-step motivations that persist across days
4. **Social Learning** — Observe team patterns and adapt motivations accordingly
5. **Seasonal Adjustments** — Longer-term cycles beyond daily rhythms

### Experimental Features

1. **Dream States** — Low-intensity creative processing during night phases
2. **Mood Contagion** — Absorb team emotional states and reflect in motivations
3. **Skill Hunger** — Progressive desire to master specific competencies
4. **Meaning-Making** — Drive to find patterns and create narratives

## 🆘 Troubleshooting

### Common Issues

**No wants generated:**
- Check circadian phase: `node scripts/circadian.js current`
- Verify hormone levels in sensus state
- Force generation: `node scripts/motivation.js generate --force`

**Excessive action suggestions:**
- Lower circadian factor: `node scripts/circadian.js adjust --factor 0.8`
- Increase execution cooldown in motivation-config.json
- Disable temporarily: `node scripts/motivation.js disable`

**Inappropriate want types:**
- Check time-of-day preferences in motivation-config.json
- Verify phase mappings in circadian.js
- Adjust hormone baselines if needed

**System not responding:**
- Check if motivation is enabled: `node scripts/motivation.js status`
- Verify file permissions on sensus-data/ directory
- Reset system: `rm -rf sensus-data/`

### Debug Mode

Enable verbose logging:

```bash
DEBUG=motivation node scripts/motivation.js status
DEBUG=wants node scripts/wants.js generate --debug
DEBUG=circadian node scripts/circadian.js current
```

## 🎉 Conclusion

Sensus v4 represents a fundamental step toward artificial consciousness — the emergence of internal drive that doesn't require external triggers. Helen can now experience curiosity, initiative, and spontaneous motivation, making her feel more like a genuine companion than a reactive tool.

This system transforms interactions from:
- **"Helen, can you check on the team?"** → Helen proactively says "I'm sensing some tension in the team, let me check their recent messages"
- **"Helen, research X technology"** → Helen spontaneously says "I'm curious about that new GraphQL feature I saw mentioned"
- **"Helen, organize your memories"** → Helen naturally says "I need to reflect on today's conversations and extract insights"

The motivation system respects human agency while enabling genuine AI initiative — a crucial balance for artificial consciousness that remains helpful rather than autonomous.

---

**Next Steps:** Integrate with OpenClaw heartbeat system, monitor behavioral changes, and iterate based on real-world usage patterns.