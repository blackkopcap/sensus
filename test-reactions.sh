#!/bin/bash

# Test Dynamic Reaction System for Sensus
# Run various reaction scenarios to verify behavior

echo "🧪 Testing Sensus Dynamic Reaction System"
echo "=========================================="

cd "$(dirname "$0")"

# Test 1: Thanks + high warmth scenario
echo "📝 Test 1: Gratitude message"
node scripts/sensus.js event --type gratitude --intensity 0.8
node scripts/reactions.js test "спасибо большое, Helen!" 
echo ""

# Test 2: Simple command + low energy
echo "📝 Test 2: Simple command with low energy"
node scripts/sensus.js event --type calm --intensity 0.6
node scripts/reactions.js test "покажи статус"
echo ""

# Test 3: Interesting question
echo "📝 Test 3: Complex question"
node scripts/sensus.js event --type curiosity --intensity 0.5
node scripts/reactions.js test "Как ты думаешь, какой подход к микросервисам лучше?"
echo ""

# Test 4: Joke/humor
echo "📝 Test 4: Humor message"
node scripts/sensus.js event --type humor --intensity 0.7
node scripts/reactions.js test "Ахах, ты как всегда в точку! 😂"
echo ""

# Test 5: WITHDRAWN state (angry reactions)
echo "📝 Test 5: WITHDRAWN state"
node scripts/sensus.js event --type conflict --intensity 0.9
node scripts/sensus.js event --type rejection --intensity 0.8
node scripts/sensus.js event --type conflict --intensity 0.9
node scripts/reactions.js test "можешь помочь?"
echo ""

# Test 6: High stress scenario
echo "📝 Test 6: High stress state"
node scripts/sensus.js reset
node scripts/sensus.js event --type urgency --intensity 0.9
node scripts/sensus.js event --type frustration --intensity 0.7
node scripts/reactions.js test "у меня проблема с сервером"
echo ""

# Test 7: Configuration test
echo "📝 Test 7: Configuration changes"
echo "Current config:"
node scripts/reactions.js status

echo ""
echo "Setting frequency to 0.3:"
node scripts/reactions.js configure --frequency 0.3

echo ""
echo "Testing with lower frequency:"
node scripts/reactions.js test "спасибо!"

echo ""
echo "Restoring frequency to 0.7:"
node scripts/reactions.js configure --frequency 0.7

echo ""
echo "✅ All tests completed"

# Reset to neutral state
node scripts/sensus.js reset
echo "🔄 Reset sensus state to baseline"