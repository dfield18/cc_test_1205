# Web Search Fallback System

## Overview

The chatbot now uses a **two-tier knowledge system**:
1. **Primary**: Internal credit card database (Google Sheets)
2. **Fallback**: Web search for information outside the database

## How It Works

### Decision Flow

```
User Query
    ↓
Check if cards are needed
    ↓
    ├─→ General Question
    │       ↓
    │   Check if requires current info
    │       ↓
    │       ├─→ YES: Web Search
    │       └─→ NO: Internal Knowledge
    │
    └─→ Card Recommendations
            ↓
        Extract Filters
            ↓
        Apply Pre-filtering
            ↓
        Vector Search
            ↓
            ├─→ Cards Found: Return Recommendations
            └─→ No Cards Found
                    ↓
                Check if needs web search
                    ↓
                    ├─→ YES: Web Search
                    └─→ NO: "No cards match criteria"
```

### Web Search Detection

The system detects when web search is needed by analyzing if the query requires:

1. **Real-time information**
   - "Did Chase change the Sapphire bonus recently?"
   - "What is the current prime rate?"
   - "Latest credit card industry trends"

2. **Recent updates**
   - "New credit card offers this month"
   - "Recent changes to Amex Platinum benefits"

3. **External market data**
   - "Current inflation impact on rewards"
   - "Credit card market analysis 2025"

### What's in Internal Database

✅ **Available in Database:**
- Credit card details (fees, rewards, perks)
- Card features and benefits
- Target consumers
- Credit requirements
- Welcome bonuses
- Points multipliers

❌ **NOT in Database (requires web search):**
- Real-time news and announcements
- Recent changes to card terms
- Market trends and analysis
- Current economic indicators
- Company announcements

## Implementation Details

### Key Functions

#### `needsWebSearch(query, internalKnowledgeAvailable)`
- Uses GPT-4o-mini to classify if query needs web search
- Returns boolean + reason
- Fast classification (~200ms)

#### `generateAnswerWithWebSearch(query, conversationHistory)`
- Performs web search (when search API is configured)
- Generates answer using search results
- Returns answer + sources + usedWebSearch flag

#### `isInternalKnowledgeSufficient(query, cards, context)`
- Checks if found cards are sufficient to answer query
- Detects queries about current events
- Returns boolean

### Integration Points

1. **`generateGeneralAnswer()`** - Line 839
   - Checks if web search needed before answering general questions

2. **`generateRecommendations()`** - Lines 1428, 1463
   - Falls back to web search if no cards match filters
   - Falls back to web search if no similar cards found

## Example Queries

### Uses Internal Database

```
✓ "Cards with no annual fee"
✓ "Best travel rewards cards"
✓ "What is cash back?"
✓ "Compare Chase Sapphire vs Amex Gold"
✓ "Business cards with welcome bonus"
```

### Falls Back to Web Search

```
⚡ "Did Chase change Sapphire Preferred benefits recently?"
⚡ "What are the latest credit card offers for January 2025?"
⚡ "Current prime rate affecting APRs"
⚡ "Recent credit card industry news"
⚡ "New card launches this month"
```

## Web Search API Integration

Currently, the `performWebSearch()` function is a **placeholder**. To enable actual web search, integrate one of:

### Option 1: Google Custom Search API
```typescript
const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
```

### Option 2: Brave Search API
```typescript
const response = await fetch(
  `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`,
  { headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY } }
);
```

### Option 3: SerpAPI
```typescript
const response = await fetch(
  `https://serpapi.com/search?q=${encodeURIComponent(query)}&api_key=${process.env.SERPAPI_KEY}`
);
```

### Option 4: Bing Search API
```typescript
const response = await fetch(
  `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}`,
  { headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_SEARCH_KEY } }
);
```

## Without Search API

If no search API is configured, the system returns a helpful message:

> "I don't have that specific information in my credit card database. To get the most current information, I recommend:
>
> 1. Visiting the official website of the credit card issuer
> 2. Checking recent financial news sources
> 3. Contacting the card issuer directly for the latest details
>
> If you have questions about credit cards in my database, I'd be happy to help with those!"

## Benefits

1. **Comprehensive Coverage**: Answers both database queries and current events
2. **Intelligent Routing**: Only uses web search when necessary
3. **Cost Efficient**: Minimizes expensive web search API calls
4. **Transparent**: Logs when web search is used
5. **Graceful Degradation**: Works without search API configured

## Monitoring

Check logs for these indicators:

```
[WEB SEARCH DETECTION] Query: "..."
[WEB SEARCH DETECTION] Needs web search: true, Reason: "..."
[GENERAL ANSWER] Query requires web search, falling back to web search
[NO CARDS FOUND] Falling back to web search
[NO SIMILAR CARDS] Falling back to web search
[WEB SEARCH] Would search for: "..."
```

## Future Enhancements

1. Cache web search results (TTL: 1 hour)
2. Combine internal cards + web search for hybrid answers
3. User preference for web search frequency
4. Real-time card data updates from issuer websites
5. News aggregation for credit card updates
