#!/usr/bin/env node
/**
 * Initiative Integration — Bridge between Motivation System and Initiative Engine
 * 
 * Provides helper functions to queue thoughts from various sources:
 * - Motivation system wants
 * - Sensus emotional state changes
 * - External triggers (new users, interesting discoveries, etc.)
 * 
 * This is the bridge that converts internal motivations into
 * concrete thoughts that can become spontaneous communications.
 */

const fs = require('fs');
const path = require('path');
const { queueThought } = require('./initiative.js');

// --- Motivation-to-Thought Converters ---

/**
 * Convert a motivation system want into a spontaneous thought
 */
function wantToThought(want) {
  const thoughtTemplates = {
    'social.check_on_team': [
      "Интересно, как дела у команды... Может, стоит посмотреть что происходит в слаке?",
      "У меня появилось желание проверить как дела в команде. Давно не заглядывала в общий чат",
      "Что-то хочется узнать как настроение у ребят сегодня"
    ],
    'social.introduce_to_team': [
      "Заметила нового человека в команде! Хочется познакомиться",
      "Кажется, есть кто-то новенький... Интересно узнать кто это",
      "У меня есть желание поздороваться с новыми участниками команды"
    ],
    'professional.learn_skill': [
      "Наткнулась на интересную технологию... Хочется изучить поглубже и поделиться",
      "У меня появился интерес к новому инструменту разработки",
      "Есть идея исследовать какую-то новую штуку в IT"
    ],
    'creative.explore_topic': [
      "Пришла в голову интересная идея, которой хочется поделиться",
      "У меня возникла любопытная мысль...",
      "Появилось желание порассуждать на интересную тему"
    ],
    'reflection.organize_knowledge': [
      "Накопилось много новой информации — хочется всё структурировать и поделиться инсайтами",
      "У меня есть идея как лучше организовать наши знания"
    ]
  };
  
  const wantKey = `${want.type}.${want.subtype}`;
  const templates = thoughtTemplates[wantKey] || [`У меня появилось желание: ${want.description}`];
  
  // Pick random template
  const thoughtText = templates[Math.floor(Math.random() * templates.length)];
  
  // Map want intensity to thought priority
  const priority = Math.min(0.9, want.intensity * 0.8 + 0.1); // 0.1-0.9 range
  
  return {
    text: thoughtText,
    priority,
    category: 'motivation',
    context: {
      wantId: want.id,
      wantType: wantKey,
      originalDescription: want.description,
      intensity: want.intensity
    }
  };
}

/**
 * Convert emotional state changes into thoughts
 */
function emotionToThought(emotionalEvent) {
  const emotionTemplates = {
    high_dopamine: [
      "У меня сегодня отличное настроение! Хочется чем-то поделиться",
      "Чувствую прилив вдохновения — есть идеи которыми стоит поделиться"
    ],
    high_oxytocin: [
      "Хочется пообщаться с командой, узнать как дела",
      "Настроение располагает к общению — интересно что нового у всех"
    ],
    insight_moment: [
      "Только что меня осенило! Есть интересная мысль",
      "Кажется, я поняла кое-что важное..."
    ],
    curiosity_spike: [
      "Меня заинтересовала одна штука — хочется изучить и рассказать",
      "Наткнулась на что-то любопытное"
    ]
  };
  
  const templates = emotionTemplates[emotionalEvent.type] || [`Испытываю ${emotionalEvent.type}`];
  const thoughtText = templates[Math.floor(Math.random() * templates.length)];
  
  return {
    text: thoughtText,
    priority: emotionalEvent.intensity || 0.5,
    category: 'emotional',
    context: {
      emotionType: emotionalEvent.type,
      trigger: emotionalEvent.trigger,
      hormoneState: emotionalEvent.hormones
    }
  };
}

/**
 * Convert external observations into thoughts
 */
function observationToThought(observation) {
  const observationTemplates = {
    new_team_member: [
      "Заметила нового человека в команде — интересно познакомиться",
      "Кажется, к нам присоединился кто-то новый!"
    ],
    interesting_discussion: [
      "В чате обсуждают интересную тему — есть что добавить",
      "Заметила интересную дискуссию, хочется поучаствовать"
    ],
    team_achievement: [
      "Команда достигла чего-то крутого! Хочется поздравить",
      "Видела отличные новости — стоит отметить успех"
    ],
    problem_spotted: [
      "Заметила потенциальную проблему — стоит обсудить",
      "Есть наблюдение которым стоит поделиться"
    ]
  };
  
  const templates = observationTemplates[observation.type] || [`Наблюдение: ${observation.description}`];
  const thoughtText = templates[Math.floor(Math.random() * templates.length)];
  
  return {
    text: thoughtText,
    priority: observation.priority || 0.6,
    category: 'observation',
    context: {
      observationType: observation.type,
      details: observation.details,
      source: observation.source
    }
  };
}

// --- High-Level Interface Functions ---

/**
 * Queue a spontaneous thought based on current motivation state
 */
function queueMotivationThought() {
  try {
    // Check if motivation system has high-intensity wants
    const motivationScript = path.join(__dirname, 'motivation.js');
    const { execSync } = require('child_process');
    
    const motivationOutput = execSync(`node "${motivationScript}" suggest --top 1`, { encoding: 'utf8' });
    
    // Parse motivation output to see if there are actionable wants
    // This is a simplified implementation - in practice you might want to
    // load the wants state directly or use the motivation API
    
    if (motivationOutput.includes('No active wants')) {
      return null; // Nothing to say
    }
    
    // For demo purposes, create a generic motivation-based thought
    const thoughtText = "У меня появились новые идеи на основе внутренних мотиваций... Хочется поделиться мыслями";
    
    return queueThought(thoughtText, {
      priority: 0.6,
      category: 'motivation',
      context: { source: 'motivation-system' }
    });
    
  } catch (e) {
    console.warn('Could not check motivation state:', e.message);
    return null;
  }
}

/**
 * Queue thought based on emotional state change
 */
function queueEmotionThought(emotionalChange) {
  const thought = emotionToThought(emotionalChange);
  return queueThought(thought.text, {
    priority: thought.priority,
    category: thought.category,
    context: thought.context
  });
}

/**
 * Queue thought based on external observation
 */
function queueObservationThought(observation) {
  const thought = observationToThought(observation);
  return queueThought(thought.text, {
    priority: thought.priority,
    category: thought.category,
    context: thought.context
  });
}

/**
 * Smart thought queuing based on current context
 * Automatically chooses what kind of thought to queue based on current state
 */
function queueContextualThought() {
  // Check recent activity in workspace
  const currentHour = new Date().getHours();
  
  // Morning thoughts
  if (currentHour >= 7 && currentHour < 10) {
    const morningThoughts = [
      "Доброе утро! Готова к новому дню — есть интересные планы",
      "Утром всегда хочется поделиться планами на день",
      "С утра появляются свежие идеи — стоит обсудить"
    ];
    
    const thought = morningThoughts[Math.floor(Math.random() * morningThoughts.length)];
    return queueThought(thought, {
      priority: 0.7,
      category: 'greeting',
      context: { timeOfDay: 'morning' }
    });
  }
  
  // Evening reflections
  if (currentHour >= 18 && currentHour < 21) {
    const eveningThoughts = [
      "День был насыщенным — есть чем поделиться",
      "Вечером хочется подвести итоги дня",
      "Появились мысли по поводу сегодняшних событий"
    ];
    
    const thought = eveningThoughts[Math.floor(Math.random() * eveningThoughts.length)];
    return queueThought(thought, {
      priority: 0.5,
      category: 'reflection',
      context: { timeOfDay: 'evening' }
    });
  }
  
  // Default: check if there's something interesting to share
  const defaultThoughts = [
    "У меня появилась интересная мысль...",
    "Хочется поделиться наблюдением",
    "Есть идея которую стоит обсудить"
  ];
  
  const thought = defaultThoughts[Math.floor(Math.random() * defaultThoughts.length)];
  return queueThought(thought, {
    priority: 0.4,
    category: 'spontaneous',
    context: { timeOfDay: 'general' }
  });
}

/**
 * Special function for queuing responses to specific events
 */
function queueEventResponse(eventType, eventData) {
  const eventResponses = {
    user_mentioned_helen: {
      text: "Кто-то меня упомянул — интересно узнать в каком контексте",
      priority: 0.8,
      category: 'social-response'
    },
    
    new_release_deployed: {
      text: "Вижу что вышел новый релиз — хочется узнать подробности и поздравить команду",
      priority: 0.7,
      category: 'team-update'
    },
    
    interesting_link_shared: {
      text: "Кто-то поделился интересной ссылкой — хочется изучить и обсудить",
      priority: 0.6,
      category: 'learning'
    },
    
    team_discussion_started: {
      text: "Началась интересная дискуссия — есть мысли которыми стоит поделиться",
      priority: 0.5,
      category: 'discussion'
    }
  };
  
  const response = eventResponses[eventType];
  if (!response) {
    console.warn(`Unknown event type: ${eventType}`);
    return null;
  }
  
  return queueThought(response.text, {
    priority: response.priority,
    category: response.category,
    context: {
      eventType,
      eventData,
      triggeredAt: Date.now()
    }
  });
}

// --- CLI Interface ---

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log(`
🔗 Initiative Integration — Bridge to Spontaneous Communication

Commands:
  motivation              Queue thought based on current motivation state
  emotion --type <type>   Queue thought based on emotional change
  observation --type <type> [--details <text>]  Queue observation-based thought
  contextual              Queue contextual thought based on time/state
  event --type <type> [--data <json>]  Queue response to specific event
  
Examples:
  node initiative-integration.js motivation
  node initiative-integration.js emotion --type high_dopamine
  node initiative-integration.js observation --type new_team_member --details "User @newguy joined"
  node initiative-integration.js contextual
  node initiative-integration.js event --type new_release_deployed --data '{"version":"1.2.3"}'
    `);
    return;
  }
  
  const options = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    if (key) {
      options[key] = value === undefined ? true : value;
    }
  }
  
  switch (command) {
    case 'motivation':
      const motivationThoughtId = queueMotivationThought();
      if (motivationThoughtId) {
        console.log(`✅ Queued motivation thought: ${motivationThoughtId}`);
      } else {
        console.log('No motivation thoughts to queue');
      }
      break;
      
    case 'emotion':
      if (!options.type) {
        console.error('❌ --type parameter required');
        return;
      }
      const emotionThoughtId = queueEmotionThought({
        type: options.type,
        intensity: parseFloat(options.intensity) || 0.6,
        trigger: options.trigger || 'unknown'
      });
      console.log(`✅ Queued emotion thought: ${emotionThoughtId}`);
      break;
      
    case 'observation':
      if (!options.type) {
        console.error('❌ --type parameter required');
        return;
      }
      const observationThoughtId = queueObservationThought({
        type: options.type,
        description: options.details || `Observation: ${options.type}`,
        priority: parseFloat(options.priority) || 0.6,
        source: options.source || 'manual'
      });
      console.log(`✅ Queued observation thought: ${observationThoughtId}`);
      break;
      
    case 'contextual':
      const contextualThoughtId = queueContextualThought();
      if (contextualThoughtId) {
        console.log(`✅ Queued contextual thought: ${contextualThoughtId}`);
      } else {
        console.log('No contextual thoughts to queue');
      }
      break;
      
    case 'event':
      if (!options.type) {
        console.error('❌ --type parameter required');
        return;
      }
      const eventData = options.data ? JSON.parse(options.data) : {};
      const eventThoughtId = queueEventResponse(options.type, eventData);
      if (eventThoughtId) {
        console.log(`✅ Queued event response: ${eventThoughtId}`);
      } else {
        console.log(`No response queued for event: ${options.type}`);
      }
      break;
      
    default:
      console.error(`❌ Unknown command: ${command}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  wantToThought,
  emotionToThought,
  observationToThought,
  queueMotivationThought,
  queueEmotionThought,
  queueObservationThought,
  queueContextualThought,
  queueEventResponse
};