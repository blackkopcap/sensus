# Human Profiling

How sensus builds and uses a profile of the human it interacts with.

## How It Works

The limbic mediator analyzes every message and extracts `profile_observation` — a brief note about the human's personality, communication style, or patterns. These accumulate in `human-profile.json`.

## What Gets Observed

**Communication style:**
- Formal vs informal language
- Message length preferences
- Use of emoji, slang, technical jargon
- Language mixing patterns (e.g., Russian + English IT terms)

**Temperament indicators:**
- Response to stress (fight/flight/freeze)
- Emotional expressiveness
- Optimism vs pessimism tendency
- Patience level

**Behavioral patterns:**
- Active hours (night owl vs early bird)
- Work rhythm (deep focus vs rapid switching)
- Decision-making style (deliberate vs impulsive)
- How they give feedback (direct vs indirect)

**Preferences:**
- Humor style (dry, sarcastic, absurd, none)
- Detail level (wants depth vs wants brevity)
- Autonomy preference (wants to be asked vs wants agent to act)

## Profile Structure

```json
{
  "version": 1,
  "traits": {
    "temperament": "melancholic",
    "communication_style": "informal_technical",
    "humor_preference": "dry_sarcasm",
    "detail_preference": "concise",
    "decision_style": "deliberate"
  },
  "patterns": {
    "active_hours": "late_night",
    "stress_markers": ["блин", "задолбало", "..."],
    "praise_frequency": "rare",
    "conflict_style": "avoidant"
  },
  "observations": [
    {
      "ts": "2026-03-24T08:31:46Z",
      "observation": "Expresses deep gratitude, strong reliance on agent",
      "context": "Спасибо тебе огромное..."
    }
  ],
  "lastAnalyzed": "2026-03-24T08:32:11Z"
}
```

## How Profile Affects Agent Behavior

The profile doesn't change hormones directly — it changes **interpretation**:

- **Melancholic human + neutral message** → agent reads slightly more concern into it
- **Rare praiser says "спасибо"** → higher oxytocin spike (praise from them means more)
- **Night owl writes at 3am** → agent doesn't flag it as unusual
- **Concise preference** → agent keeps responses shorter

## Trait Consolidation

Raw observations accumulate over time. Periodically (or on demand), consolidate them into `traits` and `patterns`:

```bash
# View current observations
node limbic.js profile --format summary

# Manual trait update (edit human-profile.json directly)
# or ask the main agent to analyze observations and update traits
```

## Privacy

- Profile data is stored locally only (`human-profile.json`)
- Never transmitted, never included in responses
- Agent uses profile implicitly, never references it explicitly
- Human can view and edit their profile at any time
