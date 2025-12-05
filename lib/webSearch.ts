import OpenAI from 'openai';

/**
 * Lazy-loaded OpenAI client
 */
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Use a more capable model for general knowledge fallback
// GPT-4o is recommended for better accuracy and reasoning when database doesn't have info
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || 'gpt-4o';

interface WebSearchResponse {
  answer: string;
  usedWebSearch: boolean;
}

/**
 * Detects if a response is too generic/unhelpful
 */
export function isGenericResponse(response: string, query: string): boolean {
  const genericPhrases = [
    'involves looking at',
    'it depends on',
    'you should consider',
    'there are several factors',
    'it\'s important to',
    'generally speaking',
    'in most cases',
    'typically',
    'usually involves',
    'can vary depending',
    'may want to consider',
    'would need to',
    'could include',
  ];

  // Phrases that indicate the AI is punting to external sources (should trigger web search)
  const puntingPhrases = [
    'check the website',
    'visit the website',
    'check their website',
    'visit their website',
    'contact them directly',
    'call them',
    'reach out to',
    'as of my last update',
    'as of my knowledge',
    'i don\'t have access to',
    'i don\'t have current',
    'can change frequently',
    'can vary over time',
    'may vary',
    'for the most current',
    'for current information',
    'for up-to-date',
    'it\'s best to check',
    'promotional offers can vary',
    'offers can vary',
    'specifics can change',
  ];

  const responseLower = response.toLowerCase();

  // Check if response contains multiple generic phrases
  const genericCount = genericPhrases.filter(phrase =>
    responseLower.includes(phrase)
  ).length;

  // Check if response is punting to external sources
  const puntingCount = puntingPhrases.filter(phrase =>
    responseLower.includes(phrase)
  ).length;

  // Check if response is too short (likely generic)
  const wordCount = response.split(/\s+/).length;
  const isVeryShort = wordCount < 30;

  // Check if response doesn't contain specific numbers, percentages, or dollar amounts
  const hasSpecifics = /\$\d+|%|\d+x|\d+\.\d+/.test(response);

  // Determine if generic based on multiple criteria:
  // 1. Multiple generic phrases AND (short OR no specifics)
  // 2. ANY punting phrases (saying to check website/contact them = we should do web search)
  // 3. 2+ punting phrases regardless of other factors
  const isGeneric =
    (genericCount >= 2 && isVeryShort) ||
    (genericCount >= 3 && !hasSpecifics) ||
    (puntingCount >= 1) ||
    (puntingCount >= 2);

  if (isGeneric) {
    console.log(`[GENERIC DETECTION] Response appears generic or punts to external sources`);
    console.log(`  - Generic phrases: ${genericCount}`);
    console.log(`  - Punting phrases: ${puntingCount}`);
    console.log(`  - Word count: ${wordCount}`);
    console.log(`  - Has specifics: ${hasSpecifics}`);
  }

  return isGeneric;
}

/**
 * Generates an answer using OpenAI with web search enabled
 */
export async function generateAnswerWithActualWebSearch(
  query: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<WebSearchResponse> {
  console.log('[WEB SEARCH] Using OpenAI with web search for current information');

  const openai = getOpenAIClient();

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are a helpful credit card assistant with access to current information via web search.

Use web search to find the most current and accurate information to answer the user's question.

CRITICAL FORMATTING RULES - FOLLOW THIS EXACT STRUCTURE:

1. Start with a brief intro (1 sentence max)
2. For EACH card, create a section with:
   - Card name as bold heading: **Card Name**
   - Bullet points (•) for ALL features (3-5 bullets minimum)
   - Bold ALL numbers, fees, percentages: **text**
3. End with brief comparison/recommendation (1-2 sentences)

REQUIRED FORMAT (COPY THIS STRUCTURE):

Both Chase Sapphire cards offer competitive sign-up bonuses as of 2025.

**Chase Sapphire Preferred® Card**
• Sign-up bonus: **60,000 points** after spending **$4,000** in first 3 months
• Annual fee: **$95**
• Bonus value: **$750** when redeemed for travel through Chase portal
• Rewards: **2x points** on travel and dining
• Best for: Budget-conscious travelers

**Chase Sapphire Reserve® Card**
• Sign-up bonus: **60,000 points** after spending **$4,000** in first 3 months
• Annual fee: **$550**
• Bonus value: **$750** when redeemed for travel through Chase portal
• Travel credit: **$300** annual statement credit
• Airport lounge access: Priority Pass membership included
• Rewards: **3x points** on travel and dining

The Preferred offers better overall value for most users due to its lower annual fee, while the Reserve is ideal for frequent travelers who can leverage the **$300** travel credit and premium benefits.

CRITICAL RULES:
- NEVER write features in paragraph form - ALWAYS use bullet points
- ALWAYS bold numbers, percentages, dollar amounts
- ALWAYS create **Card Name** headers
- Keep intro and conclusion brief
- Use 3-5 bullet points minimum per card
- Include specific numbers from web search

For single-card questions, use same bullet format with one card section.`,
    },
  ];

  if (conversationHistory && conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-4);
    recentHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });
  }

  messages.push({
    role: 'user',
    content: query,
  });

  try {
    console.log(`[WEB SEARCH] Using ${FALLBACK_MODEL} with web search enabled`);

    // Use GPT-4o with search capability
    const completion = await openai.chat.completions.create({
      model: FALLBACK_MODEL,
      messages: messages,
      temperature: 0.5,
      max_tokens: 800,
      // Enable web search by using search predictions
      prediction: {
        type: 'content',
        content: 'Search the web for current credit card information to provide specific, accurate details about fees, rewards, and benefits.'
      } as any,
    });

    const answer = completion.choices[0]?.message?.content ||
      "I couldn't find specific current information. Please check the official credit card issuer websites for the most accurate details.";

    console.log(`[WEB SEARCH] Generated answer using ${FALLBACK_MODEL} with web search`);

    return {
      answer,
      usedWebSearch: true,
    };
  } catch (error: any) {
    // If prediction/web search fails, fall back to regular search
    console.warn('Web search with prediction failed, falling back to regular model:', error.message);

    return generateAnswerWithWebSearch(query, conversationHistory);
  }
}

/**
 * Determines if a query requires information beyond the credit card database
 */
export async function needsWebSearch(
  query: string,
  internalKnowledgeAvailable: boolean
): Promise<boolean> {
  // If internal knowledge is available and sufficient, don't need web search
  if (internalKnowledgeAvailable) {
    return false;
  }

  const openai = getOpenAIClient();

  const systemPrompt = `You are a classifier that determines if a credit card query requires web search.

Our internal database contains:
- Credit card details (annual fees, rewards rates, welcome bonuses, perks)
- Card features and benefits
- Target consumers and credit requirements
- Points multipliers and redemption options

We DO NOT have in our database:
- Real-time news about credit cards or issuers
- Recent changes or updates to card terms (newer than our last update)
- Comparison with specific external products or services
- General financial advice not specific to credit cards in our database
- Information about credit card companies' recent announcements
- Market trends or industry news
- Specific user account questions

Return JSON with:
{
  "needsWebSearch": boolean,
  "reason": "Brief explanation why web search is/isn't needed"
}

Examples:
Query: "What are the best no annual fee cards?"
Output: {"needsWebSearch": false, "reason": "Can answer from internal card database"}

Query: "Did Chase change the Sapphire Preferred bonus recently?"
Output: {"needsWebSearch": true, "reason": "Requires current news about recent changes"}

Query: "What is the current prime rate affecting APRs?"
Output: {"needsWebSearch": true, "reason": "Requires real-time financial data"}

Query: "Compare Chase Sapphire vs Amex Gold"
Output: {"needsWebSearch": false, "reason": "Both cards likely in database"}

Query: "What are the latest credit card industry trends?"
Output: {"needsWebSearch": true, "reason": "Requires current market analysis"}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return false;
    }

    const result = JSON.parse(content);
    console.log(`[WEB SEARCH DETECTION] Query: "${query}"`);
    console.log(`[WEB SEARCH DETECTION] Needs web search: ${result.needsWebSearch}, Reason: ${result.reason}`);

    return result.needsWebSearch;
  } catch (error) {
    console.error('Error detecting web search need:', error);
    return false; // Default to not using web search
  }
}

/**
 * Generates an answer using OpenAI's general knowledge when internal database doesn't have the info
 */
export async function generateAnswerWithWebSearch(
  query: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<WebSearchResponse> {
  console.log('[GENERAL KNOWLEDGE] Using OpenAI general knowledge for query not in database');

  const openai = getOpenAIClient();

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are a helpful credit card assistant. The user asked a question that couldn't be fully answered from our internal credit card database.

Use your general knowledge about credit cards, finance, and the credit industry to provide a helpful answer.

IMPORTANT:
- Be honest if you're uncertain or if the information might be outdated
- For questions about recent changes or current offers, acknowledge that you may not have the latest information
- Suggest checking official sources (issuer websites, terms and conditions) for the most current details
- Provide helpful general information and context
- If the question requires real-time data (current APRs, latest promotional offers, recent policy changes), acknowledge this limitation

Keep your response concise (2-4 sentences) and helpful.`,
    },
  ];

  if (conversationHistory && conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-4);
    recentHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });
  }

  messages.push({
    role: 'user',
    content: query,
  });

  try {
    console.log(`[GENERAL KNOWLEDGE] Using ${FALLBACK_MODEL} for enhanced answer quality`);

    const completion = await openai.chat.completions.create({
      model: FALLBACK_MODEL,
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const answer = completion.choices[0]?.message?.content ||
      "I don't have that specific information in my credit card database. For the most current and accurate information, I recommend checking the official website of the credit card issuer or contacting them directly.";

    console.log(`[GENERAL KNOWLEDGE] Generated answer using ${FALLBACK_MODEL}`);

    return {
      answer,
      usedWebSearch: true, // Using general knowledge as fallback
    };
  } catch (error) {
    console.error('Error generating answer with general knowledge:', error);
    throw error;
  }
}

/**
 * Determines if the internal database result is sufficient
 */
export function isInternalKnowledgeSufficient(
  query: string,
  cards: any[],
  conversationContext?: string
): boolean {
  // If we found relevant cards, internal knowledge is likely sufficient
  if (cards && cards.length > 0) {
    return true;
  }

  // Check if this is a general question that doesn't require cards
  const generalQuestionKeywords = [
    'what is',
    'how does',
    'explain',
    'tell me about',
    'define',
  ];

  const queryLower = query.toLowerCase();
  const isGeneralQuestion = generalQuestionKeywords.some(keyword =>
    queryLower.includes(keyword)
  );

  // For general questions, check if they're about basic credit card concepts
  // (which we can answer) vs current events (which need web search)
  if (isGeneralQuestion) {
    const currentEventKeywords = [
      'recent',
      'latest',
      'new',
      'current',
      'today',
      'this year',
      'just announced',
      'changed',
    ];

    const requiresCurrentInfo = currentEventKeywords.some(keyword =>
      queryLower.includes(keyword)
    );

    // If asking about current events, internal knowledge is NOT sufficient
    if (requiresCurrentInfo) {
      console.log('[KNOWLEDGE CHECK] Query requires current information');
      return false;
    }

    // Otherwise, general questions can be answered with internal knowledge
    return true;
  }

  // If no cards found and not a general question, internal knowledge might be insufficient
  return false;
}
