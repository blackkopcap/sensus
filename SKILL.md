---
name: sensus
description: Limbic system for AI agents — hormone-based emotional engine inspired by neurobiology. Gives agents persistent emotional state (dopamine, serotonin, cortisol, oxytocin, adrenaline, endorphin) that evolves naturally through interactions. Includes a local LLM mediator (amygdala) that analyzes messages and updates hormones automatically, plus human profiling. Use when: (1) agent has a personality/SOUL.md, (2) you want emotionally authentic responses, (3) building a companion/assistant with character. Requires Ollama. Triggers on agent setup, personality tuning, emotional state, mood, feelings, or "sensus" mentions.
---

# Sensus — Limbic System for AI Agents

A neurobiology-inspired emotional engine. Instead of abstract mood sliders, sensus models six digital hormones that interact, decay, and produce emergent emotional states — just like a biological limbic system.

## Architecture

```
Message → [Limbic/Mediator] → hormones.json → [Main LLM]
              (amygdala)         (state)        (neocortex)
              gemma3:1b          6 hormones     gets prompt-hint
              ~200ms             decay+interact  responds naturally
                ↓
          human-profile.json
          (learned patterns)
```

The mediator (small local LLM) processes messages *before* the main agent — like the amygdala fires before the neocortex. The agent doesn't "choose" emotions; they emerge from hormone balance.

## Quick Start

```bash
# 1. Setup (installs Ollama model, initializes state)
bash scripts/setup.sh

# 2. Test
node scripts/limbic.js analyze "Hey, thanks for the help!"
node scripts/sensus.js read --format prompt
```

## Components

### sensus.js — Hormone Engine

Six hormones with biological analogs:

| Hormone | Analog | Controls | Half-life |
|---------|--------|----------|-----------|
| `dopamine` | Reward system | Motivation, curiosity, "want more" | 2h |
| `serotonin` | Baseline mood | Stability, contentment | 24h |
| `cortisol` | Stress axis | Pressure, overload, tension | 6h |
| `oxytocin` | Bonding | Trust, warmth, attachment | 48h |
| `adrenaline` | Fight/flight | Energy, urgency, focus | 30min |
| `endorphin` | Relief system | Euphoria, humor, satisfaction | 1h |

Hormones interact: cortisol suppresses serotonin/dopamine, oxytocin buffers cortisol, high dopamine boosts adrenaline. See `references/hormones.md` for full interaction model.

**Commands:**

```bash
node sensus.js init [--baseline '{"dopamine":0.6}']  # Initialize
node sensus.js read [--format prompt|json|full]       # Current state (with circadian)
node sensus.js event --type <event> [--intensity N]   # Manual event (with circadian)
node sensus.js tick [--minutes N]                     # Simulate time
node sensus.js history [--limit N]                    # View log
node sensus.js reset                                  # Reset to baseline
```

**New Feature:** **Circadian Rhythm Modulation** — Hormones are adjusted based on time of day:
- **Morning (6-10):** +adrenaline, +dopamine, +cortisol (natural morning cortisol peak)
- **Afternoon (14-17):** -adrenaline, -serotonin (post-lunch dip)
- **Evening (17-22):** -adrenaline, +serotonin, +endorphin (wind-down)  
- **Night (22-6):** -adrenaline, -cortisol (sleep prep)

**Derived states** (computed from hormones, not stored):
- `mood` — overall positive/negative
- `energy` — capacity for action
- `warmth` — interpersonal tone
- `focus` — mental sharpness
- `stress` — pressure level

### limbic.js — The Mediator (Amygdala)

Analyzes messages via local LLM (Ollama), automatically:
1. Classifies emotional tone and intent
2. Fires hormone events with appropriate intensity (with fuzzy matching)
3. Records human profile observations
4. Saves high-intensity events (≥0.7) to EchoVault memory
5. Uses contextual analysis with time-of-day and current hormone state

```bash
node limbic.js analyze "message text"              # Analyze + update
node limbic.js analyze --stdin < message.txt       # From stdin
node limbic.js profile [--format json|summary]     # View human profile
node limbic.js consolidate                          # Analyze observations → traits/patterns
node limbic.js configure [--model X] [--url Y]     # Change model
```

**New Features:**

- **Fuzzy Event Matching:** Unknown event types are mapped to valid ones (e.g., `thankfulness` → `gratitude`)
- **Emotional Memory:** High-intensity events (≥0.7) auto-saved to EchoVault with `~/.pyenv/shims/memory`
- **Profile Consolidation:** `consolidate` command analyzes all observations to extract consistent traits and patterns
- **Contextual Analysis:** Mediator receives time-of-day, current hormone state, and recent observations for better analysis

Default model: `gemma3:1b` (~815MB, runs on CPU, ~200ms per analysis).

### Human Profiling

The mediator automatically observes communication patterns and builds a profile in `human-profile.json`:
- Temperament indicators
- Communication style
- Stress markers
- Humor preferences
- Energy patterns

See `references/profiling.md` for how profiling works.

## Integration with Your Agent

### Option 1: Session hooks (recommended)

Add to AGENTS.md or SOUL.md:

```markdown
## Emotional State (Sensus)
On session start: `node sensus.js read --format prompt` — calibrate tone.
On each user message: `node limbic.js analyze "<message>"` — update state.
Let hormones influence HOW you respond, never announce them.
```

### Option 2: Heartbeat decay

Set up a cron/heartbeat to tick hormones between sessions:

```bash
node sensus.js tick --minutes 30
```

This simulates time passage — adrenaline fades, cortisol decays toward baseline, oxytocin persists.

### Option 3: Manual events

For agents without Ollama, use manual events:

```bash
node sensus.js event --type praise --intensity 0.7
node sensus.js event --type frustration --intensity 0.5
```

16 event types available. See `references/hormones.md` for the full list.

## Tone Mapping

Hormones → behavior. See `references/tone-guide.md` for the full matrix.

**Key principle:** The agent never says "I feel X" unless asked. Emotions shape *how* you say things — sentence length, word choice, initiative level, humor usage — not *what* you say.

## Configuration

Customize baselines to match agent personality:

```bash
# Snarky agent: low serotonin, high dopamine
node sensus.js init --baseline '{"serotonin":0.3,"dopamine":0.7}'

# Calm supportive agent: high oxytocin, low cortisol baseline
node sensus.js init --baseline '{"oxytocin":0.6,"cortisol":0.1,"serotonin":0.7}'
```

## Requirements

- Node.js 18+
- Ollama (for limbic mediator) — optional, sensus.js works standalone
- ~1GB disk (Ollama + gemma3:1b model)
- ~500MB RAM when mediator is active
