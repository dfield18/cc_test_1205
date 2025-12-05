# General Knowledge Fallback System

## Overview

The chatbot now uses a **two-tier knowledge system**:
1. **Primary**: Internal credit card database (Google Sheets)
2. **Fallback**: OpenAI's general knowledge for information outside the database

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
                Check if needs general knowledge fallback
                    ↓
                    ├─→ YES: Use OpenAI General Knowledge
                    └─→ NO: "No cards match criteria"
```

### General Knowledge Fallback Detection

The system detects when to use OpenAI's general knowledge by analyzing if the query requires:

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

❌ **NOT in Database (uses general knowledge fallback):**
- Questions requiring information beyond the database
- General credit card concepts not tied to specific cards in database
- Queries where no matching cards exist
- Questions about credit card topics outside current database scope

## Implementation Details

### Key Functions

#### `needsWebSearch(query, internalKnowledgeAvailable)`
- Uses GPT-4o-mini to classify if query needs general knowledge fallback
- Returns boolean + reason
- Fast classification (~200ms)

#### `generateAnswerWithWebSearch(query, conversationHistory)`
- Uses OpenAI's general knowledge to answer queries outside database
- Generates helpful answers with appropriate caveats about currency of information
- Returns answer + usedWebSearch flag
- Acknowledges limitations for queries requiring real-time data

#### `isInternalKnowledgeSufficient(query, cards, context)`
- Checks if found cards are sufficient to answer query
- Detects queries about current events
- Returns boolean

### Integration Points

1. **`generateGeneralAnswer()`** - Line 839
   - Checks if general knowledge fallback needed before answering general questions

2. **`generateRecommendations()`** - Lines 1428, 1463
   - Falls back to general knowledge if no cards match filters
   - Falls back to general knowledge if no similar cards found

## Example Queries

### Uses Internal Database

```
✓ "Cards with no annual fee"
✓ "Best travel rewards cards"
✓ "What is cash back?"
✓ "Compare Chase Sapphire vs Amex Gold"
✓ "Business cards with welcome bonus"
```

### Falls Back to General Knowledge

```
⚡ "Did Chase change Sapphire Preferred benefits recently?"
   → Uses general knowledge, notes information may not be current
⚡ "What are the latest credit card offers for January 2025?"
   → Uses general knowledge, recommends checking issuer websites
⚡ "How does credit card interest work?"
   → Uses general knowledge to explain concepts
⚡ "What should I know about credit scores?"
   → Uses general knowledge for financial education
```

## How General Knowledge Fallback Works

The system uses **OpenAI's GPT-4o** (by default) with general knowledge about credit cards and finance when the internal database doesn't have sufficient information. GPT-4o is used instead of GPT-3.5-turbo to provide higher quality, more accurate answers for questions outside the database.

**Model Configuration:**
- Default: `gpt-4o` (superior reasoning and knowledge)
- Configurable via `FALLBACK_MODEL` environment variable
- Alternative options: `gpt-4`, `gpt-4-turbo`, or `gpt-3.5-turbo` (for cost savings)

### Key Features

1. **Honest about Limitations**
   - Acknowledges when information might be outdated
   - Recommends checking official sources for current data
   - Transparent about what it knows vs. what requires real-time data

2. **Helpful Context**
   - Provides general education about credit card concepts
   - Explains financial terms and processes
   - Offers guidance on where to find current information

3. **Concise Responses**
   - Keeps answers brief (2-4 sentences)
   - Focuses on being helpful without over-promising accuracy
   - Suggests next steps for users seeking current information

### Example Response

**Query:** "Did Chase change the Sapphire Preferred welcome bonus recently?"

**Response:**
> "While I don't have access to real-time updates about specific card changes, welcome bonuses for premium cards like the Chase Sapphire Preferred can vary based on promotions and market conditions. For the most current welcome bonus offer, I recommend visiting Chase's official website or calling their customer service. Card issuers often run limited-time promotional offers that may differ from standard bonuses."

## Benefits

1. **High-Quality Answers**: Uses GPT-4o for superior reasoning and accuracy on complex questions
2. **Comprehensive Coverage**: Answers both database queries and general questions
3. **Intelligent Routing**: Only uses general knowledge when database lacks information
4. **Cost Efficient**: Uses existing OpenAI API, no additional search API costs
5. **Transparent**: Logs which model is used for each fallback response
6. **Honest Communication**: Acknowledges limitations about currency of information
7. **Educational**: Provides helpful context and learning opportunities
8. **Configurable**: Adjust model choice via environment variable based on quality/cost preferences

## Monitoring

Check server logs for these indicators:

```
[WEB SEARCH DETECTION] Query: "..."
[WEB SEARCH DETECTION] Needs web search: true, Reason: "..."
[GENERAL ANSWER] Query requires general knowledge, using OpenAI fallback
[NO CARDS FOUND] Falling back to OpenAI general knowledge
[NO SIMILAR CARDS] Falling back to OpenAI general knowledge
[GENERAL KNOWLEDGE] Using OpenAI general knowledge for query not in database
[GENERAL KNOWLEDGE] Using gpt-4o for enhanced answer quality
[GENERAL KNOWLEDGE] Generated answer using gpt-4o
```

**Model Selection Logs:**
The system now logs which specific model is used for each general knowledge response, making it easy to track quality vs. cost trade-offs.

## Configuration

### Environment Variable

Set the `FALLBACK_MODEL` environment variable in your `.env.local` file:

```bash
# Default (recommended for best quality)
FALLBACK_MODEL=gpt-4o

# Alternative options
FALLBACK_MODEL=gpt-4           # Slightly older, still excellent
FALLBACK_MODEL=gpt-4-turbo     # Good balance of speed and quality
FALLBACK_MODEL=gpt-3.5-turbo   # Most cost-effective
```

### Cost Comparison

**Pricing per 1M tokens (approximate):**
- `gpt-4o`: $2.50 input / $10.00 output - **Best quality**
- `gpt-4-turbo`: $10.00 input / $30.00 output - High quality
- `gpt-3.5-turbo`: $0.50 input / $1.50 output - Most economical

**Recommendation:** Use `gpt-4o` (default) for production. The general knowledge fallback is used infrequently (only when database doesn't have info), so the extra cost is minimal while providing significantly better answers.

### When to Consider Different Models

- **Use GPT-4o (default)**: Production environments, customer-facing applications, when answer quality is critical
- **Use GPT-4-turbo**: Similar quality to GPT-4o, good alternative
- **Use GPT-3.5-turbo**: Development/testing environments, high-volume fallback scenarios, cost-sensitive deployments

## Future Enhancements

1. Fine-tune a custom model on credit card domain knowledge
2. Integrate real-time data feeds from card issuers
3. Add user preference for detail level in general knowledge responses
4. Implement confidence scores for general knowledge answers
5. Create a feedback loop to improve answer quality
