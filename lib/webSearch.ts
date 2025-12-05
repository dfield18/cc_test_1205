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

/**
 * Performs web search using OpenAI's search functionality or external API
 * Note: This is a placeholder - you would integrate with actual search API like:
 * - Google Custom Search API
 * - Bing Search API
 * - Brave Search API
 * - SerpAPI
 */
async function performWebSearch(query: string, numResults: number = 5): Promise<SearchResult[]> {
  // For now, return empty array - implement with actual search API
  // Example with Google Custom Search:
  // const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  // const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  // const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;

  console.log(`[WEB SEARCH] Would search for: "${query}"`);
  return [];
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchResponse {
  answer: string;
  sources: SearchResult[];
  usedWebSearch: boolean;
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
 * Generates an answer using web search results
 */
export async function generateAnswerWithWebSearch(
  query: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<WebSearchResponse> {
  console.log('[WEB SEARCH] Falling back to web search...');

  // Perform web search
  const searchResults = await performWebSearch(query, 5);

  // If no search results, return a helpful message
  if (searchResults.length === 0) {
    console.log('[WEB SEARCH] No search API configured, returning helpful message');
    return {
      answer: "I don't have that specific information in my credit card database. To get the most current information, I recommend:\n\n1. Visiting the official website of the credit card issuer\n2. Checking recent financial news sources\n3. Contacting the card issuer directly for the latest details\n\nIf you have questions about credit cards in my database, I'd be happy to help with those!",
      sources: [],
      usedWebSearch: false,
    };
  }

  // Generate answer using search results
  const openai = getOpenAIClient();

  const searchContext = searchResults
    .map((result, idx) => `[${idx + 1}] ${result.title}\n${result.snippet}\nSource: ${result.url}`)
    .join('\n\n');

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are a helpful credit card assistant. The user asked a question that our internal database couldn't answer, so we searched the web for current information.

Use the web search results below to answer their question. Be helpful and cite sources when appropriate.

Web Search Results:
${searchContext}

Provide a clear, accurate answer based on these search results. If the search results don't fully answer the question, acknowledge that and provide what information is available.`,
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
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const answer = completion.choices[0]?.message?.content || "I couldn't generate an answer based on the search results.";

    console.log('[WEB SEARCH] Generated answer from web search results');

    return {
      answer,
      sources: searchResults,
      usedWebSearch: true,
    };
  } catch (error) {
    console.error('Error generating answer with web search:', error);
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
