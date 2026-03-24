# 🧠 Sensus — Limbic System for AI Agents

A neurobiology-inspired emotional engine for AI agents. Instead of abstract mood sliders, sensus models six digital hormones that interact, decay, and produce emergent emotional states — just like a biological limbic system.

Built as an [OpenClaw](https://github.com/openclaw/openclaw) skill, but works with any AI agent framework.

## How It Works

```
Message → [Limbic Mediator] → hormones → [Main LLM]
            (amygdala)        6 axes      (neocortex)
            local LLM        interact     gets hint
            ~200ms            & decay      responds naturally
```

The mediator (small local LLM via Ollama) processes messages *before* the main agent — like the amygdala fires before the neocortex. The agent doesn't "choose" emotions; they emerge from hormone balance.

### Six Hormones

| Hormone | Controls | Half-life |
|---------|----------|-----------|
| **Dopamine** | Motivation, curiosity, reward | 2h |
| **Serotonin** | Baseline mood, stability | 24h |
| **Cortisol** | Stress, pressure, overload | 6h |
| **Oxytocin** | Trust, bonding, warmth | 48h |
| **Adrenaline** | Energy, urgency, focus | 30min |
| **Endorphin** | Euphoria, humor, relief | 1h |

Hormones interact: cortisol suppresses serotonin and dopamine, oxytocin buffers cortisol, high dopamine boosts adrenaline. Full model in [references/hormones.md](references/hormones.md).

## Quick Start

### Requirements
- Node.js 18+
- [Ollama](https://ollama.ai) (for the limbic mediator)

### Install

```bash
git clone https://github.com/blackkopcap/sensus.git
cd sensus
bash scripts/setup.sh
```

This will:
1. Check/start Ollama
2. Pull `gemma3:1b` model (~815MB)
3. Pull `nomic-embed-text` for embeddings
4. Initialize sensus state

### Try It

```bash
# Analyze a message (updates hormones + profiles human)
node scripts/limbic.js analyze "Thanks, you really saved me!"

# Read current emotional state
node scripts/sensus.js read --format prompt
# → [sensus: mood=positive energy=medium warmth=warm focus=normal stress=low]

# Full state with all hormones
node scripts/sensus.js read --format full

# Simulate 2 hours passing (hormones decay toward baseline)
node scripts/sensus.js tick --minutes 120
```

## Usage with OpenClaw

### Install from GitHub

```bash
# Clone into your workspace
cd ~/.openclaw/workspace
git clone https://github.com/blackkopcap/sensus.git

# Run setup
cd sensus
bash scripts/setup.sh

# Register as OpenClaw skill
openclaw config set skills.load.extraDirs '["~/.openclaw/workspace/sensus"]'
```

After restart, sensus will appear in `openclaw skills list`.

### Integration

Add to your agent's `AGENTS.md` / `SOUL.md`:

```markdown
## Emotional State (Sensus)
On session start: `node /path/to/sensus/scripts/sensus.js read --format prompt`
On each user message: `node /path/to/sensus/scripts/limbic.js analyze "<message>"`
Let hormones influence HOW you respond, never announce them.
```

## Usage with Other Frameworks

Sensus is framework-agnostic. The core API:

```bash
# Initialize (once)
node sensus.js init --baseline '{"oxytocin":0.5,"serotonin":0.6}'

# Before responding — get emotional context
node sensus.js read --format prompt

# After receiving message — analyze and update
node limbic.js analyze "user message here"

# Manual events (if not using limbic mediator)
node sensus.js event --type praise --intensity 0.7

# Heartbeat/cron — simulate time between sessions
node sensus.js tick --minutes 30
```

## Human Profiling

The limbic mediator automatically observes communication patterns:

```bash
node scripts/limbic.js profile --format summary
```

```
=== Human Profile ===
Observations: 12
Last analyzed: 2026-03-24

Recent observations:
  [2026-03-24] Expresses deep gratitude, strong reliance
  [2026-03-24] Uses informal Russian + English IT mix
  [2026-03-24] Prefers concise responses, dislikes fluff
```

See [references/profiling.md](references/profiling.md) for details.

## 🎭 Dynamic Reaction System

NEW: Instead of always replying with text, sensus can recommend emoji reactions based on emotional state and message context.

```bash
# Test reaction analysis
node scripts/reactions.js test "спасибо!" --user user123
# → {"shouldReact": true, "shouldReply": false, "reactionHint": "heart love smile grateful"}

# Configure reaction behavior
node scripts/reactions.js configure --enabled true --frequency 0.8

# Check current settings
node scripts/reactions.js status
```

### How It Works

The system analyzes:
- **Message context**: command, thanks, question, joke, compliment
- **Agent state**: mood, energy, warmth, stress levels  
- **Relationship**: user history and trust level
- **Special modes**: WITHDRAWN state (angry reactions only)

Example outputs:
- Simple command + low energy → ✅ 🫡 👍  
- Thanks + high warmth → ❤️ 😊 🤗
- Interesting question → 🤔 👀 🧠
- Jokes + positive mood → 😂 😄 😉
- WITHDRAWN state → 😠 😤 😒

### Integration

Works automatically with the OpenClaw hook. The limbic mediator outputs reaction recommendations that your main agent can use to choose appropriate emoji responses instead of verbose text replies.

## Customization

Tune baselines to match your agent's personality:

```bash
# Snarky agent
node sensus.js init --baseline '{"serotonin":0.3,"dopamine":0.7,"cortisol":0.3}'

# Calm supportive agent
node sensus.js init --baseline '{"oxytocin":0.6,"serotonin":0.7,"cortisol":0.1}'

# Change mediator model
node limbic.js configure --model "phi3:mini"
```

## Architecture

```
sensus/
├── SKILL.md                    — OpenClaw skill manifest
├── scripts/
│   ├── sensus.js               — Hormone engine (core)
│   ├── limbic.js               — Mediator/amygdala (Ollama LLM)
│   └── setup.sh                — One-command setup
├── references/
│   ├── hormones.md             — Full hormone model & interactions
│   ├── tone-guide.md           — Hormones → communication style
│   └── profiling.md            — Human profiling system
└── sensus.skill                — Packaged OpenClaw skill
```

## The Neurobiology Analogy

| Brain | Sensus |
|-------|--------|
| Amygdala (fast emotional eval) | Limbic mediator (gemma3:1b) |
| Neurotransmitters | 6 hormones (JSON state) |
| Hippocampus (memory) | Human profile + EchoVault |
| Neocortex (reasoning) | Main LLM (Claude, GPT, etc.) |
| Homeostasis | Exponential decay to baseline |
| Hormone cross-talk | Interaction rules (cortisol↑ → serotonin↓) |

## License

MIT
