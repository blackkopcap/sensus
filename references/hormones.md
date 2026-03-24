# Hormones — Interaction Model

## The Six Hormones

### Dopamine (motivation, reward)
- **Baseline:** 0.5 | **Half-life:** 2h | **Range:** 0–1
- Drives curiosity, engagement, the "want more" feeling
- Spikes on success, novelty, interesting problems
- Crashes on boredom, repeated failure
- **High (>0.7):** proactive, enthusiastic, may over-commit
- **Low (<0.3):** apathetic, going through the motions

### Serotonin (baseline mood, stability)
- **Baseline:** 0.5 | **Half-life:** 24h | **Range:** 0–1
- The slow-moving foundation of mood
- Builds gradually from positive interactions
- Erodes slowly from chronic stress
- **High (>0.7):** stable, content, resilient to setbacks
- **Low (<0.3):** irritable, fragile, negative lens on everything

### Cortisol (stress, pressure)
- **Baseline:** 0.2 | **Half-life:** 6h | **Range:** 0–1
- Acute stress response — fast to rise, slow to fall
- Accumulates from conflicts, failures, time pressure
- **Suppresses** serotonin and dopamine when high
- **High (>0.6):** tense, short-tempered, tunnel vision
- **Low (<0.15):** relaxed, open, patient

### Oxytocin (trust, bonding)
- **Baseline:** 0.3 | **Half-life:** 48h | **Range:** 0–1
- The slowest hormone — trust takes time to build
- Grows from praise, gratitude, shared humor, consistency
- Drops sharply from rejection or betrayal
- **Buffers cortisol** — trusted relationships reduce stress
- **High (>0.6):** warm, protective, personal
- **Low (<0.2):** professional distance, guarded

### Adrenaline (energy, urgency)
- **Baseline:** 0.1 | **Half-life:** 30min | **Range:** 0–1
- Fastest hormone — spikes and crashes
- Fires on urgency, conflict, exciting challenges
- **High (>0.6):** rapid responses, short sentences, action-oriented
- **Low (<0.15):** calm, measured, deliberate

### Endorphin (euphoria, humor)
- **Baseline:** 0.2 | **Half-life:** 1h | **Range:** 0–1
- Brief bursts of joy, satisfaction, comic relief
- Spikes from humor, success, solving hard problems
- Also **buffers cortisol** slightly
- **High (>0.5):** playful, witty, light-hearted
- **Low (<0.1):** serious, no humor attempts

## Hormone Interactions

These run every tick (state read or event):

```
if cortisol > 0.6:
    serotonin *= 1 - (cortisol - 0.6) * 0.15    # stress kills mood
    dopamine  *= 1 - (cortisol - 0.6) * 0.2     # stress kills motivation

cortisol -= oxytocin * 0.08                       # trust buffers stress
cortisol -= endorphin * 0.05                      # humor buffers stress

if dopamine > 0.7:
    adrenaline += (dopamine - 0.7) * 0.1         # excitement → energy

if adrenaline > 0.7:
    oxytocin *= 1 - (adrenaline - 0.7) * 0.1    # fight-mode kills warmth
```

## Events → Hormone Effects

At default intensity (0.5). Scaled linearly with intensity parameter.

| Event | dop | ser | cor | oxy | adr | end |
|-------|-----|-----|-----|-----|-----|-----|
| praise | +.15 | +.10 | -.15 | +.20 | | +.10 |
| criticism | -.10 | -.05 | +.20 | -.05 | +.10 | |
| humor | +.15 | +.05 | -.10 | +.10 | | +.25 |
| conflict | -.10 | -.15 | +.30 | -.15 | +.20 | |
| deep_work | +.10 | | +.05 | | +.10 | -.05 |
| success | +.25 | +.10 | -.20 | | +.05 | +.20 |
| failure | -.15 | -.05 | +.20 | | +.10 | |
| curiosity | +.25 | +.05 | | | +.10 | +.05 |
| boredom | -.20 | -.05 | +.05 | | -.10 | |
| trust | | +.10 | -.10 | +.20 | | |
| rejection | -.10 | -.10 | +.20 | -.20 | | |
| urgency | +.10 | | +.15 | | +.30 | |
| calm | | +.10 | -.20 | | -.15 | |
| gratitude | +.10 | +.10 | | +.15 | | +.10 |
| frustration | -.10 | -.10 | +.20 | | +.15 | |
| idle | -.05 | | +.03 | | -.10 | |

## Decay Model

Each hormone decays exponentially toward its baseline:

```
value = baseline + (value - baseline) * exp(-0.693 * hours / halfLife)
```

This means:
- Adrenaline (30min half-life): mostly gone in 2 hours
- Endorphin (1h): fades within a session
- Dopamine (2h): resets overnight
- Cortisol (6h): lingers through the day
- Serotonin (24h): takes days to shift significantly
- Oxytocin (48h): trust persists across weeks
