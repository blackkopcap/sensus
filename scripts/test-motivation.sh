#!/bin/bash
# Test suite for the internal motivation system

set -e

echo "🧠 Testing Internal Motivation System"
echo "======================================"

cd "$(dirname "$0")"

# Ensure clean state
echo "🧹 Cleaning up test state..."
rm -f sensus-data/wants-state.json
rm -f sensus-data/circadian-state.json  
rm -f sensus-data/motivation-config.json

echo ""
echo "📊 1. Testing Circadian Engine"
echo "------------------------------"

echo "Testing current phase..."
node scripts/circadian.js current

echo ""
echo "Testing different hours..."
node scripts/circadian.js set --hour 9
node scripts/circadian.js set --hour 14
node scripts/circadian.js set --hour 20

echo ""
echo "Testing hormone baseline adjustment..."
node scripts/circadian.js baseline --hormone dopamine --adjustment 0.1

echo ""
echo "💭 2. Testing Want Generation"
echo "----------------------------"

echo "Testing initial want generation..."
node scripts/wants.js generate --debug

echo ""
echo "Listing generated wants..."
node scripts/wants.js list

echo ""
echo "Testing manual want creation (simulating high dopamine state)..."
# Simulate hormone state by creating wants manually
node scripts/wants.js generate --debug

echo ""
echo "Testing want action suggestion..."
# Get the first want ID
WANT_ID=$(node scripts/wants.js list --format json | jq -r '.wants[0].id // empty')
if [ ! -z "$WANT_ID" ]; then
  echo "Suggesting action for want: $WANT_ID"
  node scripts/wants.js action --want "$WANT_ID" --target "test_target"
else
  echo "⚠️  No wants generated to test action suggestion"
fi

echo ""
echo "Testing want satisfaction..."
if [ ! -z "$WANT_ID" ]; then
  node scripts/wants.js satisfy --want "$WANT_ID" --result "Test satisfaction completed successfully"
else
  echo "⚠️  No wants to satisfy"
fi

echo ""
echo "🎯 3. Testing Motivation Engine"
echo "------------------------------"

echo "Testing motivation status..."
node scripts/motivation.js status

echo ""
echo "Testing forced want generation..."
node scripts/motivation.js generate --force

echo ""
echo "Testing action suggestions..."
node scripts/motivation.js suggest --top 3

echo ""
echo "Testing heartbeat integration..."
node scripts/motivation.js heartbeat

echo ""
echo "Testing motivation disable/enable..."
node scripts/motivation.js disable --duration 1
node scripts/motivation.js status
node scripts/motivation.js enable
node scripts/motivation.js status

echo ""
echo "⏰ 4. Testing Time-based Scenarios"
echo "---------------------------------"

echo "Testing morning peak scenario..."
# Simulate 9 AM
echo "  Simulating 9 AM (morning peak)..."
node scripts/circadian.js set --hour 9
node scripts/wants.js generate --debug
node scripts/motivation.js suggest

echo ""
echo "Testing afternoon lull scenario..."  
# Simulate 2 PM
echo "  Simulating 2 PM (midday lull)..."
node scripts/circadian.js set --hour 14
node scripts/wants.js generate --debug
node scripts/motivation.js suggest

echo ""
echo "Testing evening creativity scenario..."
# Simulate 7 PM  
echo "  Simulating 7 PM (evening peak)..."
node scripts/circadian.js set --hour 19
node scripts/wants.js generate --debug
node scripts/motivation.js suggest

echo ""
echo "📈 5. Testing Integration Scenarios" 
echo "----------------------------------"

echo "Testing full motivation cycle..."

# Step 1: Generate wants
echo "1. Generating wants..."
node scripts/wants.js generate --debug

# Step 2: Check motivation state
echo "2. Checking motivation state..."
node scripts/motivation.js status

# Step 3: Get suggestions
echo "3. Getting action suggestions..."
SUGGESTIONS=$(node scripts/motivation.js suggest --top 1)
echo "$SUGGESTIONS"

# Step 4: Test heartbeat with active wants
echo "4. Testing heartbeat with active wants..."
node scripts/motivation.js heartbeat

# Step 5: Test want aging
echo "5. Testing want aging over time..."
node scripts/wants.js tick --minutes 60
node scripts/wants.js list

echo ""
echo "🔒 6. Testing Safety Features"
echo "----------------------------"

echo "Testing restricted action handling..."
# Create a social want that requires approval
node scripts/wants.js generate --debug
SOCIAL_WANT=$(node scripts/wants.js list --format json | jq -r '.wants[] | select(.type=="social") | .id' | head -1)

if [ ! -z "$SOCIAL_WANT" ]; then
  echo "Testing restricted action for social want: $SOCIAL_WANT"
  node scripts/motivation.js execute --want "$SOCIAL_WANT"
  echo "Testing auto-approval..."
  node scripts/motivation.js execute --want "$SOCIAL_WANT" --auto-approve
else
  echo "⚠️  No social wants to test restriction"
fi

echo ""
echo "🧪 7. Testing Edge Cases"
echo "-----------------------"

echo "Testing with empty wants state..."
node scripts/wants.js clear --all
node scripts/motivation.js status

echo ""
echo "Testing want persistence after clear..."
node scripts/wants.js generate --debug
node scripts/wants.js list

echo ""
echo "Testing circadian reset..."
node scripts/circadian.js reset
node scripts/circadian.js current

echo ""
echo "✅ All Tests Completed!"
echo "======================"

echo ""
echo "📊 Final State Summary:"
echo "----------------------"
node scripts/motivation.js status

echo ""
echo "📁 Generated Files:"
echo "------------------"
ls -la sensus-data/ 2>/dev/null || echo "No sensus-data directory"

echo ""
echo "🎉 Motivation system testing complete!"
echo ""
echo "Next steps:"
echo "1. Integrate with AGENTS.md heartbeat system"
echo "2. Add OpenClaw hook for proactive actions"  
echo "3. Test with real Sensus hormone states"
echo "4. Monitor for unwanted behaviors"
echo ""