# Multi-User Support Migration

## Изменения в структуре данных

### Старая структура (одиночный пользователь):
```
sensus/
├── sensus-state.json      ← состояние агента
├── human-profile.json     ← профиль единственного пользователя
├── behavioral-data.json   ← поведенческие данные пользователя
└── scripts/
```

### Новая структура (multi-user):
```
sensus/
├── sensus-data/
│   ├── agent-state.json              ← состояние агента (мигрировано)
│   └── users/
│       ├── <user_id>/
│       │   ├── profile.json          ← per-user профиль
│       │   └── behavioral.json       ← per-user поведенческие данные
│       └── _default/
│           ├── profile.json
│           └── behavioral.json
├── hooks/
│   └── sensus-limbic/
│       ├── HOOK.md                   ← манифест OpenClaw hook
│       └── handler.js                ← обработчик входящих сообщений
└── scripts/
```

## Обратная совместимость

- Если существуют старые файлы (`human-profile.json`, `behavioral-data.json`), они используются для пользователя `_default`
- Состояние агента (`sensus-state.json`) автоматически мигрируется в `sensus-data/agent-state.json`
- Все скрипты без параметра `--user` работают с `_default` пользователем

## Новые возможности

### Limbic Analysis
```bash
# Анализ для конкретного пользователя
node limbic.js analyze "текст сообщения" --user nikita

# Анализ для пользователя по умолчанию
node limbic.js analyze "текст сообщения"

# Профиль конкретного пользователя
node limbic.js profile --user nikita --format summary

# Консолидация профиля пользователя
node limbic.js consolidate --user nikita
```

### Behavioral Analytics
```bash
# Отслеживание для конкретного пользователя
node behavioral.js track "текст сообщения" --user nikita

# Отчет по пользователю
node behavioral.js report --user nikita

# Тренды пользователя
node behavioral.js trends --days 7 --user nikita

# Сброс данных пользователя
node behavioral.js reset --user nikita
```

## OpenClaw Hook

Hook `sensus-limbic` автоматически обрабатывает входящие сообщения (`message:incoming`):

1. Извлекает текст сообщения и user ID из события
2. Запускает `limbic.js analyze` в фоновом режиме (fire-and-forget)
3. Создает пользовательские папки автоматически
4. Не блокирует основной поток сообщений
5. Фильтрует боткоманды и слишком короткие сообщения

### Установка hook в OpenClaw:
```bash
# Скопируйте hooks/sensus-limbic/ в директорию hooks OpenClaw
# или добавьте symlink на папку sensus/hooks/sensus-limbic/
```

## Важные правила

1. **agent-state.json НЕ per-user** — это состояние агента, общее для всех
2. **profile.json и behavioral.json — per-user**
3. **Автоматическое создание директорий** при первом обращении
4. **Никакой автоматической миграции старых данных** — только обратная совместимость
5. **sensus-data/ в .gitignore** для защиты приватных данных

## Тестирование

```bash
# Тест multi-user
node limbic.js analyze "тестовое сообщение" --user test
ls sensus-data/users/test/  # должен появиться behavioral.json

# Тест hook
echo '{"type":"message:incoming","text":"Привет!","userId":"user123"}' | \
  node hooks/sensus-limbic/handler.js

# Тест обратной совместимости
node limbic.js analyze "тест без --user"  # использует старые файлы
```