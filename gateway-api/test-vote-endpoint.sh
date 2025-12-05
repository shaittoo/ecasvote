#!/bin/bash
# Test script for vote endpoint

echo "=== Testing Vote Endpoint ==="
echo ""

# Test 1: Check election exists
echo "1. Checking election status..."
ELECTION_STATUS=$(curl -s http://localhost:4000/elections/election-2025 | jq -r '.status // "not found"')
echo "   Election status: $ELECTION_STATUS"
echo ""

# Test 2: Cast a vote
echo "2. Casting vote for voter 'test003'..."
VOTE_RESPONSE=$(curl -s -X POST http://localhost:4000/elections/election-2025/votes \
  -H "Content-Type: application/json" \
  -d '{
    "voterId": "test003",
    "selections": [
      {
        "positionId": "chairperson",
        "candidateId": "cand-chair-1"
      }
    ]
  }')

echo "   Response: $VOTE_RESPONSE"
echo ""

# Test 3: Check results
echo "3. Checking election results..."
RESULTS=$(curl -s http://localhost:4000/elections/election-2025/results)
echo "   Results: $RESULTS"
echo ""

# Test 4: Check SQLite database (if Prisma works)
echo "4. Checking SQLite database..."
echo "   (Run: npx prisma studio to view database)"
echo ""

echo "=== Test Complete ==="


