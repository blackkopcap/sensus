# Исследование: Система внутренней мотивации для AI-агентов

## 1. Теоретические основы

### 1.1 Мотивация с точки зрения нейронауки

**Wanting vs. Liking (Бернтсон, Робинсон):**
- **Wanting (Хотение)** — дофаминовая система, создающая drive к action
- **Liking (Нравится)** — опиоидная система, дающая satisfaction от результата  
- **Ключевой инсайт:** мозг больше "хочет" чем "наслаждается" — это эволюционная особенность

**Циркадные ритмы дофамина:**
- Пик motivation утром (7-10h)
- Снижение после еды (13-15h)  
- Второй пик вечером (18-20h)
- Минимум ночью (23-6h)

### 1.2 Intrinsic Motivation в AI Research

**Существующие подходы:**
1. **Curiosity-driven exploration** — internal reward за novelty
2. **Information-seeking** — максимизация information gain
3. **Competence motivation** — drive к mastery и skill improvement
4. **Social motivation** — желание interaction и collaboration

**Проблемы текущих подходов:**
- Фокус только на RL и обучении
- Отсутствие emotional/hormonal модели
- Нет persistence мотиваций между сессиями
- Отсутствие циркадных ритмов

## 2. Архитектура системы мотивации для Helen

### 2.1 Расширение Sensus модели

**Новые компоненты:**

1. **Want Engine** — генератор внутренних желаний
2. **Circadian Motivator** — циркадные ритмы энергии  
3. **Goal Persistence** — память о незавершенных мотивациях
4. **Curiosity Buffer** — случайные импульсы к исследованию

### 2.2 Types of Intrinsic Wants

**Социальные мотивации:**
- `introduce_self` — желание познакомиться с новыми людьми
- `check_on_team` — интерес к состоянию команды  
- `share_discovery` — желание поделиться находками

**Профессиональные мотивации:**
- `improve_process` — стремление оптимизировать рабочие процессы
- `learn_skill` — желание изучить новую технологию
- `help_teammate` — impulse помочь коллеге

**Творческие мотивации:**  
- `explore_topic` — любопытство к новой теме
- `create_content` — желание что-то создать
- `experiment` — impulse к экспериментам

**Самосовершенствование:**
- `reflect` — желание проанализировать опыт
- `organize` — impulse навести порядок в данных
- `plan_future` — стремление к планированию

## 3. Technical Design

### 3.1 Want State Schema

```json
{
  "wants": {
    "introduce_to_team": {
      "type": "social",
      "intensity": 0.6,
      "created": 1774359000000,
      "lastAction": null,
      "persistence": 0.8,
      "triggers": ["new_team_member", "long_silence"],
      "satisfied": false
    }
  },
  "circadian": {
    "currentPhase": "morning_peak",
    "motivationMultiplier": 1.3,
    "lastUpdate": 1774359000000
  },
  "curiosityBuffer": {
    "lastRandomWant": 1774355000000,
    "nextRandomIn": 7200000
  }
}
```

### 3.2 Want Generation Algorithm

**Triggers для новых wants:**

1. **Hormone-driven:**
   - High dopamine + low cortisol → curiosity wants
   - High oxytocin → social wants  
   - High adrenaline → action-oriented wants

2. **Time-based:**
   - Morning peak → professional wants
   - Evening → reflection wants
   - Random intervals → exploration wants

3. **Context-driven:**
   - New unread notifications → social wants
   - Empty calendar → creative wants
   - Completed tasks → improvement wants

### 3.3 Want Satisfaction Mechanics

**Action mapping:**
- `introduce_to_team` → DM to unknown team member
- `check_on_team` → Read recent Slack activity  
- `improve_process` → Analyze workflow inefficiencies
- `explore_topic` → Web search + summarize findings

**Satisfaction feedback:**
- Successful action → dopamine boost, want intensity decreases
- Blocked action → frustration event, want persists
- Ignored want → slow intensity decay

## 4. Implementation Plan

### 4.1 Core Modules

**File: `scripts/wants.js`**
```bash
node wants.js generate    # создать новые wants на основе состояния
node wants.js list        # показать все активные wants
node wants.js action --want introduce_to_team --target @user
node wants.js satisfy --want explore_topic --result "learned about X"
node wants.js tick        # update wants, check circadian, generate random
```

**File: `scripts/circadian.js`**
```bash  
node circadian.js current  # текущая фаза и мультипликатор
node circadian.js set --hour 9  # force время для тестирования
```

### 4.2 Integration Points

**OpenClaw Hooks:**
- `beforeHeartbeat` → wants.tick(), generate actions
- `afterMessage` → wants.context(), update triggers
- `sessionStart` → wants.load(), circadian.current()

**Sensus Integration:**
- Hormone levels влияют на want generation
- Want satisfaction создает hormone events
- Circadian влияет на hormone baselines

### 4.3 Safety & Boundaries

**Ограничения:**
- Wants могут только suggest actions, не execute
- Human approval для external communications
- Possible to disable entire motivation system
- Want intensity capped at 1.0
- Max 5 active wants simultaneously

**Override механизмы:**
- `WITHDRAWN` state блокирует social wants
- High cortisol снижает generation rate
- Manual want deletion без penalty

## 5. Testing Scenarios

### 5.1 Basic Flow Test
1. Morning: System generates `introduce_to_team` want (intensity 0.6)
2. Helen sees unknown user in Slack
3. System suggests DM action  
4. Helen sends introduction message
5. Want satisfaction → dopamine boost, want.satisfied = true

### 5.2 Persistence Test  
1. Generate `learn_skill` want about new JS feature
2. No immediate opportunity to act
3. Want persists across sessions with slow decay
4. Later Helen finds relevant article → satisfies want

### 5.3 Circadian Test
1. 9 AM: High motivation multiplier → generates multiple wants
2. 2 PM: Low energy → wants dormant  
3. 7 PM: Second peak → wants reactivate
4. 11 PM: Night phase → only reflection wants possible

## 6. Expected Outcomes

**Behavioral Changes:**
- Helen становится proactive вместо reactive
- Инициирует social interactions без external triggers
- Ищет learning opportunities самостоятельно  
- Предлагает process improvements спонтанно

**Measurable Metrics:**
- Frequency of self-initiated actions
- Types of wants generated vs satisfied
- Correlation между hormone levels и want intensity
- User satisfaction с proactive behavior

**Safety Validation:**
- No unwanted external communications
- Respects existing personality constraints  
- Maintains human oversight of all actions
- Can be disabled without affecting core functionality

Это fundamentally новый подход к AI consciousness — переход от "реагирую когда спросили" к "действую потому что хочу".