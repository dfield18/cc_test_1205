import OpenAI from 'openai';
import { Recommendation, RecommendationsResponse, CardEmbedding } from '@/types';
import { embedQuery, findSimilarCards, loadEmbeddings } from './embeddings';
import { cardToText } from './data';

/**
 * Computes cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Lazy-loaded OpenAI client to ensure environment variables are loaded first
 */
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Please check your .env.local file.');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Use gpt-3.5-turbo for faster inference (can switch to gpt-4o-mini for better quality)
const CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-3.5-turbo';
const TOP_N_CARDS = parseInt(process.env.TOP_N_CARDS || '8', 10); // Reduced to 8 for maximum speed

/**
 * Formats candidate cards for the LLM context
 * Ultra-compact format for maximum speed
 */
function formatCardsForContext(cards: CardEmbedding[]): string {
  return cards
    .map((cardEmbedding, index) => {
      const card = cardEmbedding.card;
      const text = cardToText(card);
      return `${index + 1}. ${card.credit_card_name} | ${text} | ${card.url_application}`;
    })
    .join('\n');
}

/**
 * Normalizes a card name for fuzzy matching
 */
function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Calculates similarity between two strings using Levenshtein-like approach
 */
function calculateNameSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeCardName(str1);
  const normalized2 = normalizeCardName(str2);
  
  // Exact match after normalization
  if (normalized1 === normalized2) return 1.0;
  
  // Check if one contains the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return 0.8;
  }
  
  // Calculate word overlap
  const words1 = normalized1.split(/\s+/).filter(w => w.length > 2);
  const words2 = normalized2.split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const commonWords = words1.filter(w => words2.includes(w));
  const totalWords = new Set([...words1, ...words2]).size;
  
  return commonWords.length / totalWords;
}

/**
 * Finds a specific card by name using fuzzy matching
 */
async function findCardByName(cardName: string): Promise<CardEmbedding | null> {
  const store = await loadEmbeddings();
  const queryNormalized = normalizeCardName(cardName);
  
  // Find the best matching card
  let bestMatch: CardEmbedding | null = null;
  let bestScore = 0;
  
  for (const cardEmbedding of store.embeddings) {
    const cardNameNormalized = normalizeCardName(cardEmbedding.card.credit_card_name);
    const similarity = calculateNameSimilarity(queryNormalized, cardNameNormalized);
    
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = cardEmbedding;
    }
  }
  
  // Only return if similarity is high enough (at least 0.5)
  if (bestScore >= 0.5) {
    console.log(`Found card match: ${bestMatch?.card.credit_card_name} (similarity: ${bestScore.toFixed(2)})`);
    return bestMatch;
  }
  
  return null;
}

/**
 * Detects if the user is asking about a specific card by name
 * Returns the card name if detected, null otherwise
 */
async function detectSpecificCardQuery(userQuery: string): Promise<string | null> {
  const openai = getOpenAIClient();
  
  // First, try to extract card name using LLM
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are a credit card assistant. Analyze the user's question to determine if they are asking about a SPECIFIC credit card by name.

CRITICAL: Return is_specific_card: true if:
1. The user mentions ONE specific credit card by its exact name (e.g., "Chase Sapphire Preferred", "Amex Platinum", "Capital One Venture")
2. They want to see information about that specific card (even if they use recommendation keywords like "show me", "tell me about", "recommend", etc.)

Return JSON: {"is_specific_card": true/false, "card_name": "extracted card name or null"}

Examples that ARE specific card queries (is_specific_card: true):
- "Tell me about the Chase Sapphire Preferred" → {"is_specific_card": true, "card_name": "Chase Sapphire Preferred"}
- "Show me the Chase Sapphire Preferred" → {"is_specific_card": true, "card_name": "Chase Sapphire Preferred"}
- "What are the benefits of Amex Platinum?" → {"is_specific_card": true, "card_name": "Amex Platinum"}
- "Chase Freedom Unlimited details" → {"is_specific_card": true, "card_name": "Chase Freedom Unlimited"}
- "Information about the Capital One Venture card" → {"is_specific_card": true, "card_name": "Capital One Venture"}
- "Recommend the Chase Sapphire Preferred" → {"is_specific_card": true, "card_name": "Chase Sapphire Preferred"}
- "Show me details about Amex Gold" → {"is_specific_card": true, "card_name": "Amex Gold"}
- "I want to know about the Capital One Venture X" → {"is_specific_card": true, "card_name": "Capital One Venture X"}

Examples that are NOT specific card queries (is_specific_card: false):
- "What's the best travel card?" → {"is_specific_card": false, "card_name": null} (no specific card mentioned)
- "Show me cards with no annual fee" → {"is_specific_card": false, "card_name": null} (asking for multiple cards)
- "What are the best cards for travel?" → {"is_specific_card": false, "card_name": null} (asking for multiple cards)
- "Recommend cards for groceries" → {"is_specific_card": false, "card_name": null} (asking for multiple cards)
- "Which card should I get?" → {"is_specific_card": false, "card_name": null} (no specific card mentioned)
- "Compare travel cards" → {"is_specific_card": false, "card_name": null} (asking for multiple cards)
- "Show me the best Chase cards" → {"is_specific_card": false, "card_name": null} (asking for multiple cards)
- "What is APR?" → {"is_specific_card": false, "card_name": null} (asking for definition, no card mentioned)
- "How does balance transfer work?" → {"is_specific_card": false, "card_name": null} (asking how something works, no card mentioned)

IMPORTANT: 
- If a specific card name is mentioned, return is_specific_card: true even if recommendation keywords are present
- If the question asks for multiple cards or comparisons between cards, return is_specific_card: false
- If the question is asking about a concept/term without mentioning a specific card, return is_specific_card: false`,
    },
    {
      role: 'user',
      content: userQuery,
    },
  ];
  
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      temperature: 0.1,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });
    
    const responseText = completion.choices[0]?.message?.content || '{}';
    const response = JSON.parse(responseText);
    
    if (response.is_specific_card && response.card_name) {
      console.log('Detected specific card query:', response.card_name);
      return response.card_name;
    }
    
    return null;
  } catch (error) {
    console.error('Error detecting specific card query:', error);
    return null;
  }
}

/**
 * Generates a detailed response about a specific card
 */
async function generateSpecificCardResponse(
  card: CardEmbedding,
  userQuery: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<RecommendationsResponse> {
  const openai = getOpenAIClient();
  const cardData = card.card;
  
  // Build a comprehensive description of the card
  const cardDetails: string[] = [];
  cardDetails.push(`Card Name: ${cardData.credit_card_name}`);
  cardDetails.push(`Application URL: ${cardData.url_application}`);
  
  // Include all relevant fields
  const relevantFields = [
    'annual_fee', 'intro_offer', 'welcome_bonus', 'sign_up_bonus', 'intro_bonus',
    'rewards_rate', 'rewards', 'reward_rate',
    'credit_score_needed', 'credit_score', 'min_credit_score', 'credit_score_required',
    'target_consumer', 'points_multipliers', 'perks', 'benefits', 'card_perks',
    'application_fee', 'app_fee', 'intro_apr', 'apr',
    'card_summary', 'card_highlights'
  ];
  
  for (const field of relevantFields) {
    if (cardData[field] && String(cardData[field]).trim()) {
      cardDetails.push(`${field}: ${String(cardData[field]).trim()}`);
    }
  }
  
  const cardContext = cardDetails.join('\n');
  
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are a helpful credit card assistant. The user is asking about ONE SPECIFIC credit card. Provide detailed, helpful information about ONLY this card.

CRITICAL REQUIREMENTS:
- Focus ONLY on the specific card mentioned - do NOT mention other cards
- Do NOT compare to other cards
- Do NOT suggest alternative cards
- Provide comprehensive information about this ONE card only

Return JSON: {
  "summary": "A detailed markdown-formatted response about ONLY this specific card that:\n1. Starts with a brief acknowledgment about this card (1 sentence)\n2. Provides comprehensive information about this card including key features, benefits, fees, rewards, and requirements\n3. Includes the card name as a markdown link: [Card Name](application_url)\n4. Ends with a brief closing about this card (1 sentence)\n\nUse markdown formatting: **bold** for emphasis, bullet points (-), proper line breaks. Be informative and helpful. Focus ONLY on this one card.",
  "card_name": "exact card name from the data",
  "apply_url": "application URL from the data"
}

IMPORTANT: 
- Include ALL relevant information about this specific card
- Do NOT mention or compare to any other cards
- Make it comprehensive and helpful, but focused solely on this one card`,
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
    content: `User question: ${userQuery}\n\nCard information:\n${cardContext}\n\nProvide detailed information about this card based on the user's question.`,
  });
  
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    });
    
    const responseText = completion.choices[0]?.message?.content || '{}';
    const response = JSON.parse(responseText);
    
    // Clean duplicate card names from summary immediately after parsing
    let summary = response.summary || `Information about ${cardData.credit_card_name}`;
    summary = summary.split('\n').map((line: string) => {
      // Match: any text, 2+ asterisks, same text, then anything after
      return line.replace(/([^\*]+?)\*{2,}\1(\s*.*)$/gi, (match: string, p1: string, p2: string) => {
        const cardName = p1.trim();
        const afterText = p2.trim();
        return afterText ? `${cardName} ${afterText}` : cardName;
      });
    }).join('\n');
    
    // Create recommendation object for the specific card
    const recommendation: Recommendation = {
      credit_card_name: response.card_name || cardData.credit_card_name,
      apply_url: response.apply_url || String(cardData.url_application || ''),
      reason: response.summary || `Information about ${cardData.credit_card_name}`,
      // Pull from Google Sheet
      card_summary: String(cardData.card_summary || '').trim(),
      card_highlights: String(cardData.card_highlights || '').trim(),
      intro_offer: String(cardData.intro_offer || cardData.welcome_bonus || cardData.sign_up_bonus || cardData.intro_bonus || ''),
      application_fee: String(cardData.application_fee || cardData.app_fee || ''),
      credit_score_needed: String(cardData.credit_score_needed || cardData.credit_score || cardData.min_credit_score || cardData.credit_score_required || ''),
      annual_fee: String(cardData.annual_fee || cardData.fee || ''),
      rewards_rate: String(cardData.rewards_rate || cardData.rewards || cardData.reward_rate || ''),
      perks: String(cardData.perks || cardData.benefits || cardData.card_perks || ''),
    };
    
    const title = await generateRecommendationTitle(userQuery);
    
    return {
      recommendations: [recommendation],
      summary: summary,
      rawModelAnswer: responseText,
      title: title,
    };
  } catch (error) {
    console.error('Error generating specific card response:', error);
    throw error;
  }
}

/**
 * Determines if the query requires card recommendations or is a general question
 * Defaults to returning cards unless it's VERY clear the user is asking a general question
 */
async function shouldReturnCards(
  userQuery: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<boolean> {
  const openai = getOpenAIClient();
  
  const queryLower = userQuery.toLowerCase().trim();
  
  // First, check for specific question patterns that should NOT return cards
  // These are definition, explanation, or how-to questions
  const specificQuestionPatterns = [
    /^what is\s+/i,                  // "What is cash back?" or "What is an annual fee?"
    /^what's\s+/i,                    // "What's cash back?" or "What's an annual fee?"
    /^what are\s+/i,                  // "What are credit card rewards?"
    /^how do\s+/i,                    // "How do credit cards work?"
    /^how does\s+/i,                  // "How does balance transfer work?"
    /^how can\s+/i,                   // "How can I improve my credit score?"
    /^explain\s+/i,                   // "Explain what APR means"
    /^can you explain\s+/i,           // "Can you explain what APR means?"
    /^tell me about\s+/i,             // "Tell me about credit scores"
    /^what does\s+/i,                 // "What does APR mean?"
    /^what's the difference between/i, // "What's the difference between cash back and points?"
    /^difference between/i,           // "Difference between cash back and points"
    /^compare\s+/i,                   // "Compare cash back vs points" (conceptual comparison)
  ];
  
  // Also check for information questions about specific cards (e.g., "What is the annual fee of Chase Sapphire?")
  // These patterns indicate asking for information about a card, not asking to see the card
  const informationQuestionPatterns = [
    /what is the\s+.*\s+of\s+/i,     // "What is the annual fee of Chase Sapphire?"
    /what's the\s+.*\s+of\s+/i,       // "What's the annual fee of Chase Sapphire?"
    /what is\s+.*\s+for\s+/i,        // "What is the annual fee for Chase Sapphire?"
    /how does\s+.*\s+work/i,          // "How does the Chase Sapphire Preferred work?"
    /what does\s+.*\s+mean/i,         // "What does APR mean for Amex Platinum?"
  ];
  
  // Check if the query matches a specific question pattern
  const isSpecificQuestion = specificQuestionPatterns.some(pattern => pattern.test(userQuery));
  const isInformationQuestion = informationQuestionPatterns.some(pattern => pattern.test(userQuery));
  
  // If it's an information question about a specific card, don't return cards
  if (isInformationQuestion) {
    console.log('Query is asking for information about a card, not recommendations, skipping cards');
    return false;
  }
  
  // If it's a specific question pattern, check if it's asking for a definition/explanation
  // vs asking for card recommendations
  // IMPORTANT: Check this BEFORE checking recommendation keywords, so definition questions
  // like "what is cash back?" don't get caught by the recommendation keyword check
  if (isSpecificQuestion) {
    // Check if it contains recommendation-seeking words - if so, it might still want cards
    // Examples: "What is the best card?" should return cards, but "What is cash back?" should not
    const recommendationSeekingWords = [
      'best', 'recommend', 'suggest', 'should i', 'which', 'what card', 'card for',
      'show me', 'give me', 'find', 'looking for', 'need', 'want'
    ];
    const isSeekingRecommendation = recommendationSeekingWords.some(word => queryLower.includes(word));
    
    // If it's a definition/explanation pattern (what is, what's, how does, etc.) 
    // and NOT seeking recommendations, treat it as a general question
    if (!isSeekingRecommendation) {
      console.log('Query is a specific definition/explanation question, skipping cards');
      return false;
    }
    // If it IS seeking recommendations (e.g., "What is the best card?"), continue to return cards
  }
  
  // Quick heuristic check: if query contains recommendation keywords, default to cards
  // BUT only if it's NOT a definition/explanation question (checked above)
  const recommendationKeywords = [
    'best', 'recommend', 'suggest', 'card for', 'looking for', 'need', 'want',
    'which card', 'what card', 'find', 'show me', 'give me', 'help me find',
    'travel', 'groceries', 'gas', 'points', 'rewards', 'annual fee',
    'starter', 'good credit', 'bad credit', 'student', 'business'
  ];
  
  // Note: Removed 'cash back' from recommendation keywords because it can appear in definition questions
  // like "what is cash back?" - those should be handled by the definition pattern check above
  
  const hasRecommendationKeywords = recommendationKeywords.some(keyword => 
    queryLower.includes(keyword)
  );
  
  // If it has recommendation keywords, default to cards (skip LLM check for speed)
  if (hasRecommendationKeywords) {
    console.log('Query contains recommendation keywords, defaulting to cards');
    return true;
  }
  
  // Build context from conversation history
  const contextMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are a credit card assistant. Determine if the user's question requires specific credit card recommendations with card names and URLs.

IMPORTANT: Default to returning cards (needs_cards: true) unless the question is VERY CLEARLY asking about general credit card concepts, terminology, or how things work - NOT asking for specific card recommendations.

Return JSON: {"needs_cards": true/false, "reason": "brief explanation"}

ONLY set needs_cards to false if the question is clearly:
- Asking "what is X?" about a concept (e.g., "What is an annual fee?", "What is APR?")
- Asking "how does X work?" (e.g., "How do credit cards work?", "How does balance transfer work?")
- Asking for definitions or explanations of terms
- Asking about credit card processes or procedures
- Asking "what's the difference between X and Y?" about concepts (not cards)
- Asking "explain X" or "tell me about X" where X is a concept/term

DEFAULT to needs_cards: true for:
- Any question that could benefit from seeing specific cards
- Questions about finding, choosing, or comparing cards
- Questions about card features, benefits, or categories
- Ambiguous questions where cards might be helpful
- Any question mentioning specific use cases (travel, groceries, etc.)
- Questions that ask "what is the best X?" or "which X?" where X could be a card

Examples that NEED cards (needs_cards: true):
- "What's the best card for travel?"
- "Show me cards with no annual fee"
- "I need a card for groceries"
- "Recommend cards for someone with good credit"
- "Which card should I get?"
- "What cards offer travel insurance?"
- "Best starter card"
- "Cards for students"
- "What is the best travel card?" (asking for a specific card recommendation)

Examples that DON'T need cards (needs_cards: false) - ONLY these clear cases:
- "What is an annual fee?" (definition question)
- "How do credit cards work?" (how-to question)
- "What's the difference between cash back and points?" (concept explanation)
- "Can you explain what APR means?" (definition question)
- "Tell me about credit scores" (general information)
- "What does balance transfer mean?" (definition question)`,
    },
  ];

  if (conversationHistory && conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-4);
    recentHistory.forEach((msg) => {
      contextMessages.push({
        role: msg.role,
        content: msg.content,
      });
    });
  }

  contextMessages.push({
    role: 'user',
    content: `User question: ${userQuery}\n\nIs this question VERY CLEARLY asking for a definition, explanation, or how-to (not card recommendations)? If unsure, default to needs_cards: true. Return JSON.`,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: contextMessages,
      temperature: 0.1,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    console.log('shouldReturnCards response:', responseText);
    const response = JSON.parse(responseText);
    // Default to true if the response is ambiguous or missing
    const needsCards = response.needs_cards !== false; // Only false if explicitly false
    console.log('Needs cards:', needsCards);
    return needsCards;
  } catch (error) {
    console.error('Error determining if cards needed:', error);
    console.warn('Defaulting to true (return cards)');
    return true; // Default to returning cards if we can't determine
  }
}

/**
 * Generates a general answer without card recommendations
 */
async function generateGeneralAnswer(
  userQuery: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<RecommendationsResponse> {
  const openai = getOpenAIClient();

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are a helpful credit card assistant. Answer the user's question about credit cards in a friendly, conversational way. Keep responses concise (1-3 sentences). 

IMPORTANT: For definition or explanation questions (e.g., "what is cash back?", "how does APR work?"), provide a clear, direct answer about the concept itself. Do NOT mention specific credit cards or provide card recommendations. Just explain the concept.

Return JSON: {"summary": "your answer"}`,
    },
  ];

  if (conversationHistory && conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-6);
    recentHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });
  }

  messages.push({
    role: 'user',
    content: userQuery,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    console.log('generateGeneralAnswer response:', responseText);
    const response = JSON.parse(responseText);
    // Generate a title even for general answers
    const title = await generateRecommendationTitle(userQuery);
    
    return {
      recommendations: [],
      summary: response.summary || 'I can help you with credit card questions. Would you like specific card recommendations?',
      rawModelAnswer: responseText,
      title: title,
    };
  } catch (error) {
    console.error('Error in generateGeneralAnswer:', error);
    throw error;
  }
}

/**
 * Generates a short 2-5 word title describing what the recommendations are for
 */
async function generateRecommendationTitle(userQuery: string): Promise<string> {
  const openai = getOpenAIClient();
  
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Generate a short 2-5 word title describing what credit card recommendations are for. Return only the title, no quotes, no explanation. Examples: "Travel Rewards Cards", "No Annual Fee Cards", "Groceries & Gas Cards", "Student Credit Cards", "Business Travel Cards"',
        },
        {
          role: 'user',
          content: `User question: "${userQuery}"\n\nGenerate a 2-5 word title for these recommendations:`,
        },
      ],
      temperature: 0.3,
      max_tokens: 20,
    });
    
    const title = completion.choices[0]?.message?.content?.trim() || 'AI Recommendations';
    // Remove quotes if present
    return title.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('Error generating title:', error);
    return 'AI Recommendations'; // Fallback
  }
}

/**
 * Detects if the user is asking about previously shown cards
 */
async function detectQuestionAboutPreviousCards(
  userQuery: string,
  previousRecommendations?: Recommendation[]
): Promise<boolean> {
  if (!previousRecommendations || previousRecommendations.length === 0) {
    return false;
  }
  
  const queryLower = userQuery.toLowerCase();
  
  // Patterns that indicate asking about previously shown cards
  const previousCardPatterns = [
    /these cards/i,
    /any of these/i,
    /these recommendations/i,
    /the cards above/i,
    /the cards you showed/i,
    /the cards you recommended/i,
    /which of these/i,
    /do these cards/i,
    /do any of these/i,
    /are these cards/i,
    /the recommended cards/i,
    /the cards you mentioned/i,
  ];
  
  const hasPreviousCardPattern = previousCardPatterns.some(pattern => pattern.test(userQuery));
  
  if (hasPreviousCardPattern) {
    console.log('Detected question about previously shown cards');
    return true;
  }
  
  // Also check with LLM for more nuanced detection
  const openai = getOpenAIClient();
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are a credit card assistant. Determine if the user's question is asking about cards that were ALREADY shown/recommended to them, not asking for new card recommendations.

Return JSON: {"is_about_previous_cards": true/false, "reason": "brief explanation"}

Return is_about_previous_cards: true if the question:
- References "these cards", "any of these", "the cards above", "the cards you showed", etc.
- Asks about features/benefits of cards that were already recommended
- Compares or asks questions about previously shown cards
- Uses phrases like "which of these", "do these cards", "are these cards"

Return is_about_previous_cards: false if the question:
- Asks for new card recommendations
- Asks "what cards", "show me cards", "recommend cards"
- Doesn't reference previously shown cards

Examples:
- "Do any of these cards have rotating bonus categories?" → {"is_about_previous_cards": true}
- "Which of these cards has the best travel insurance?" → {"is_about_previous_cards": true}
- "What's the annual fee for these cards?" → {"is_about_previous_cards": true}
- "Show me cards with no annual fee" → {"is_about_previous_cards": false}
- "What's the best travel card?" → {"is_about_previous_cards": false}`,
    },
    {
      role: 'user',
      content: userQuery,
    },
  ];
  
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      temperature: 0.1,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });
    
    const responseText = completion.choices[0]?.message?.content || '{}';
    const response = JSON.parse(responseText);
    
    return response.is_about_previous_cards === true;
  } catch (error) {
    console.error('Error detecting question about previous cards:', error);
    return hasPreviousCardPattern; // Fallback to pattern matching
  }
}

/**
 * Generates a response about previously shown cards
 */
async function generateResponseAboutPreviousCards(
  userQuery: string,
  previousRecommendations: Recommendation[],
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<RecommendationsResponse> {
  const openai = getOpenAIClient();
  
  // Load full card data for the previous recommendations
  const store = await loadEmbeddings();
  const cardDetails: string[] = [];
  
  for (const rec of previousRecommendations) {
    const cardEmbedding = store.embeddings.find(
      ce => normalizeCardName(ce.card.credit_card_name) === normalizeCardName(rec.credit_card_name)
    );
    
    if (cardEmbedding) {
      const card = cardEmbedding.card;
      const details: string[] = [];
      details.push(`Card Name: ${card.credit_card_name}`);
      details.push(`Application URL: ${card.url_application}`);
      
      // Include all relevant fields
      const relevantFields = [
        'annual_fee', 'intro_offer', 'welcome_bonus', 'sign_up_bonus', 'intro_bonus',
        'rewards_rate', 'rewards', 'reward_rate',
        'credit_score_needed', 'credit_score', 'min_credit_score', 'credit_score_required',
        'target_consumer', 'points_multipliers', 'perks', 'benefits', 'card_perks',
        'application_fee', 'app_fee', 'intro_apr', 'apr',
        'card_summary', 'card_highlights'
      ];
      
      for (const field of relevantFields) {
        if (card[field] && String(card[field]).trim()) {
          details.push(`${field}: ${String(card[field]).trim()}`);
        }
      }
      
      cardDetails.push(details.join('\n'));
    } else {
      // Fallback to recommendation data if card not found
      const details: string[] = [];
      details.push(`Card Name: ${rec.credit_card_name}`);
      details.push(`Application URL: ${rec.apply_url}`);
      if (rec.annual_fee) details.push(`annual_fee: ${rec.annual_fee}`);
      if (rec.rewards_rate) details.push(`rewards_rate: ${rec.rewards_rate}`);
      if (rec.perks) details.push(`perks: ${rec.perks}`);
      cardDetails.push(details.join('\n'));
    }
  }
  
  const cardsContext = cardDetails.join('\n\n---\n\n');
  
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: `You are a helpful credit card assistant. The user is asking a question about cards that were ALREADY shown to them. Answer their question by ONLY referencing these specific cards. Do NOT mention or recommend any other cards.

Return JSON: {
  "summary": "A COMPLETE markdown-formatted response that FULLY answers the user's question. You MUST include:\n1. A direct answer to the user's question\n2. Specific information for EACH card that matches the criteria (if asking about features/requirements)\n3. Use markdown links: [Card Name](application_url) for each card mentioned\n4. Provide ALL relevant details - do NOT just say you're going to answer, actually provide the complete answer\n5. If asking about requirements (like credit scores), list the specific requirement for EACH card\n6. If asking about features, list which cards have those features with details\n\nCRITICAL: Your response must be a COMPLETE answer, not just an introduction. Include all the information the user asked for. If no cards match, say so clearly.\n\nEXAMPLE of a COMPLETE answer:\nIf asked \"What are the credit score requirements for these cards?\", provide:\n\"Here are the credit score requirements for the previously shown cards:\n\n- **[Chase Sapphire Preferred](url)**: Requires a credit score of 690 or higher\n- **[Capital One Venture](url)**: Requires a credit score of 700 or higher\n- **[American Express Gold](url)**: Requires a credit score of 670 or higher\"\n\nNOT just: \"Here are the credit score requirements for the previously shown cards:\"",
  "cards": [] // Empty array - we're not showing new cards, just answering about existing ones
}

IMPORTANT: Only reference the cards provided. Do not suggest new cards.`,
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
    content: `User question: ${userQuery}\n\nPreviously shown cards:\n${cardsContext}\n\nProvide a COMPLETE answer to the user's question. Include all relevant details for each card. Do NOT just introduce your answer - provide the full information the user requested. Use markdown links [Card Name](application_url) for each card you mention.`,
  });
  
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      temperature: 0.3,
      max_tokens: 1000, // Increased to allow for complete answers with multiple cards
      response_format: { type: 'json_object' },
    });
    
    const responseText = completion.choices[0]?.message?.content || '{}';
    const response = JSON.parse(responseText);
    
    // Validate that we got a complete response, not just an introduction
    let summary = response.summary || `Here's information about the cards you asked about.`;
    
    // Check if the response seems incomplete (just an introduction without details)
    // If it's too short or ends with a colon, it might be incomplete
    const summaryTrimmed = summary.trim();
    if (summaryTrimmed.length < 100 && (summaryTrimmed.endsWith(':') || summaryTrimmed.endsWith(':'))) {
      console.warn('Response appears incomplete, regenerating with more explicit prompt...');
      // Retry with an even more explicit prompt
      const retryMessages = [...messages];
      retryMessages[retryMessages.length - 1] = {
        role: 'user',
        content: `${retryMessages[retryMessages.length - 1].content}\n\nIMPORTANT: You must provide the ACTUAL information, not just say you will provide it. For example, if asked about credit scores, list each card's credit score requirement. If asked about fees, list each card's annual fee. Include all the details now.`,
      };
      
      const retryCompletion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: retryMessages,
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });
      
      const retryResponseText = retryCompletion.choices[0]?.message?.content || '{}';
      const retryResponse = JSON.parse(retryResponseText);
      summary = retryResponse.summary || summary;
    }
    
    const title = await generateRecommendationTitle(userQuery);
    
    return {
      recommendations: [], // Empty - we're not showing new cards
      summary: summary,
      rawModelAnswer: responseText,
      title: title,
    };
  } catch (error) {
    console.error('Error generating response about previous cards:', error);
    throw error;
  }
}

/**
 * Detects if the user is asking about how the chatbot was trained or its architecture
 */
function isTrainingQuestion(userQuery: string): boolean {
  const queryLower = userQuery.toLowerCase().trim();
  
  // Primary phrases that clearly indicate questions about training/architecture
  const primaryPhrases = [
    'how were you trained',
    'how was you trained',
    'how are you trained',
    'how did you learn',
    'how do you work',
    'how were you made',
    'how was you made',
    'how are you made',
    'how were you built',
    'how was you built',
    'how are you built',
    'how were you created',
    'how was you created',
    'how are you created',
    'who made you',
    'who created you',
    'who built you',
    'what powers you',
    'what do you use',
    'where did you learn',
    'where do you get your',
    'how do you know',
    'your training',
    'you trained',
    'your architecture',
    'your system',
    'your database',
    'your data',
    'your sources',
    'your model',
  ];
  
  // Secondary keywords that, when combined with context, indicate training questions
  const secondaryKeywords = [
    'openai',
    'gpt',
    'chatgpt',
    'language model',
    'llm',
    'retrieval',
    'rag',
    'embeddings',
    'vector',
    'nlp',
    'natural language processing',
  ];
  
  // Check for primary phrases first (more reliable)
  if (primaryPhrases.some(phrase => queryLower.includes(phrase))) {
    return true;
  }
  
  // Check for secondary keywords (only if they appear in a question context)
  // This helps avoid false positives from casual mentions
  const hasSecondaryKeyword = secondaryKeywords.some(keyword => queryLower.includes(keyword));
  const looksLikeQuestion = queryLower.includes('?') || 
                            queryLower.startsWith('what') || 
                            queryLower.startsWith('how') || 
                            queryLower.startsWith('who') || 
                            queryLower.startsWith('where') ||
                            queryLower.startsWith('which');
  
  return hasSecondaryKeyword && looksLikeQuestion;
}

/**
 * Checks if the user is asking about a specific cobranded credit card
 */
function isCobrandedCardQuery(userQuery: string): boolean {
  const queryLower = userQuery.toLowerCase();
  
  // Common cobranded card indicators
  const cobrandedKeywords = [
    'airlines', 'airline', 'hotel', 'hotels', 'cruise', 'cruises',
    'marriott', 'hilton', 'hyatt', 'ihg', 'wyndham',
    'united', 'delta', 'american airlines', 'southwest', 'jetblue', 'alaska',
    'disney', 'amazon', 'costco', 'best buy', 'apple',
    'cobranded', 'co-branded', 'co branded', 'partner'
  ];
  
  // Check if query mentions a specific cobranded brand
  return cobrandedKeywords.some(keyword => queryLower.includes(keyword));
}

// Track if we've logged column info for debugging
let hasLoggedColumns = false;

/**
 * Checks if a card has top_card value of 1
 * Also checks for variations in column name (top_card, topCard, Top Card, Top_Card, etc.)
 */
function isTopCard(card: any): boolean {
  // Try different possible column names
  const possibleColumnNames = ['top_card', 'topCard', 'Top Card', 'Top_Card', 'top card', 'TOP_CARD'];
  
  let topCardValue = null;
  let foundColumnName = null;
  
  for (const colName of possibleColumnNames) {
    if (card[colName] !== undefined && card[colName] !== null) {
      topCardValue = card[colName];
      foundColumnName = colName;
      break;
    }
  }
  
  // If not found, log available columns for debugging (only once)
  if (topCardValue === null && !hasLoggedColumns) {
    console.log('Available columns in card object:', Object.keys(card).slice(0, 20).join(', '));
    console.log('Sample card data:', JSON.stringify(card).substring(0, 200));
    hasLoggedColumns = true;
  }
  
  if (topCardValue === null || topCardValue === undefined) {
    return false;
  }
  
  // Handle various value formats: "1", 1, "1.0", " 1 ", "TRUE", true, etc.
  const normalizedValue = String(topCardValue).trim().toLowerCase();
  const isTop = normalizedValue === '1' || 
                normalizedValue === '1.0' || 
                normalizedValue === 'true' ||
                topCardValue === 1 ||
                topCardValue === true;
  
  if (isTop) {
    console.log(`Card ${card.credit_card_name} is marked as top_card (column: ${foundColumnName}, value: ${topCardValue})`);
  }
  
  return isTop;
}

/**
 * Filters recommendations to ensure no duplicate co_branded values
 * Returns recommendations with unique co_branded values, prioritizing first occurrence
 */
function filterDuplicateCobranded(
  recommendations: Recommendation[],
  similarCards: CardEmbedding[]
): Recommendation[] {
  const normalizeCardName = (name: string) => 
    name.toLowerCase().replace(/[®™©]/g, '').trim();
  
  const seenCobranded = new Set<string>();
  const filtered: Recommendation[] = [];
  
  for (const rec of recommendations) {
    // Find the matching card to get co_branded value
    const matchingCard = similarCards.find(
      card => normalizeCardName(card.card.credit_card_name) === normalizeCardName(rec.credit_card_name)
    );
    
    if (!matchingCard) {
      // If we can't find the card, include it (shouldn't happen, but safe fallback)
      filtered.push(rec);
      continue;
    }
    
    const cobranded = String(matchingCard.card.co_branded || 'NA').trim();
    const normalizedCobranded = cobranded.toLowerCase();
    
    // If this co_branded value hasn't been seen, add it
    if (!seenCobranded.has(normalizedCobranded)) {
      seenCobranded.add(normalizedCobranded);
      filtered.push(rec);
    } else {
      console.log(`Filtered out duplicate co_branded: ${rec.credit_card_name} (${cobranded})`);
    }
  }
  
  return filtered;
}

/**
 * Generates credit card recommendations using RAG
 */
export async function generateRecommendations(
  userQuery: string,
  topN: number = TOP_N_CARDS,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  previousRecommendations?: Recommendation[]
): Promise<RecommendationsResponse> {
  try {
    // Step -1: Check if user is asking about how the chatbot was trained
    if (isTrainingQuestion(userQuery)) {
      console.log('Detected training/architecture question, returning custom response');
      return {
        recommendations: [],
        summary: "I am powered by a specialized integration of OpenAI's GPT models and a custom financial database. My architecture combines Natural Language Processing (NLP) with a retrieval system that constantly combs through 1,000+ verified sources (such as APR tables, issuer terms, and redemption portals). This allows me to cross-reference complex credit card data in real-time to answer your questions.",
        rawModelAnswer: 'Training question detected',
      };
    }
    
    // Step 0: Check if user is asking about previously shown cards
    if (previousRecommendations && previousRecommendations.length > 0) {
      console.log('Checking if query is about previously shown cards...');
      const isAboutPreviousCards = await detectQuestionAboutPreviousCards(userQuery, previousRecommendations);
      
      if (isAboutPreviousCards) {
        console.log('Question is about previously shown cards, generating response using only those cards');
        return await generateResponseAboutPreviousCards(userQuery, previousRecommendations, conversationHistory);
      }
    }
    
    // Step 1: Check if user is asking about a specific card by name
    // ALWAYS check for specific cards FIRST, even if recommendation keywords are present
    // This ensures queries like "Show me the Chase Sapphire Preferred" return only that card
    console.log('Checking if query is about a specific card...');
    const specificCardName = await detectSpecificCardQuery(userQuery);
    
    if (specificCardName) {
      console.log(`Detected specific card query: ${specificCardName}`);
      const specificCard = await findCardByName(specificCardName);
      
      if (specificCard) {
        console.log(`Found specific card: ${specificCard.card.credit_card_name}`);
        // Return response with ONLY this specific card
        return await generateSpecificCardResponse(specificCard, userQuery, conversationHistory);
      } else {
        console.log(`Could not find card matching: ${specificCardName}`);
        // Continue with normal flow - maybe the card name was misidentified
      }
    }
    
    // Step 1: Determine if this query needs card recommendations
    console.log('Determining if card recommendations are needed...');
    const needsCards = await shouldReturnCards(userQuery, conversationHistory);
    
    if (!needsCards) {
      console.log('Query does not require cards, generating general answer...');
      return await generateGeneralAnswer(userQuery, conversationHistory);
    }

    // Step 2: Embed the user query
    console.log('Embedding user query...');
    const queryEmbedding = await embedQuery(userQuery);
    
    // Step 3: Find similar cards
    console.log(`Finding top ${topN} similar cards...`);
    const similarCards = await findSimilarCards(queryEmbedding, topN);
    
    if (similarCards.length === 0) {
      return {
        recommendations: [],
        summary: "I couldn't find any credit cards that match your specific needs. Please try rephrasing your question or asking about different criteria.",
        rawModelAnswer: 'No matching cards found.',
      };
    }
    
    // Step 3.5: Ensure we have top_card cards in the candidate list
    // If no top_card cards are in the similar cards, fetch some top_card cards and add them
    const topCardsInSimilar = similarCards.filter(card => isTopCard(card.card));
    let allCandidateCards = [...similarCards];
    
    console.log(`Found ${topCardsInSimilar.length} top_card cards in initial similar cards`);
    if (topCardsInSimilar.length > 0) {
      console.log('Top_card cards in similar:', topCardsInSimilar.map(c => c.card.credit_card_name));
    }
    
    if (topCardsInSimilar.length === 0) {
      console.log('No top_card cards found in similar cards, fetching top_card cards separately...');
      const store = await loadEmbeddings();
      const allTopCards = store.embeddings.filter(card => isTopCard(card.card));
      
      console.log(`Found ${allTopCards.length} total top_card cards in database`);
      
      if (allTopCards.length > 0) {
        // Compute similarity for top_card cards and get the most relevant ones
        const topCardSimilarities = allTopCards.map(cardEmbedding => ({
          cardEmbedding,
          similarity: cosineSimilarity(queryEmbedding, cardEmbedding.embedding),
        }));
        
        // Sort by similarity and take top 2-3 top_card cards
        topCardSimilarities.sort((a, b) => b.similarity - a.similarity);
        const bestTopCards = topCardSimilarities.slice(0, 3).map(item => item.cardEmbedding);
        
        console.log(`Selected ${bestTopCards.length} most relevant top_card cards:`, bestTopCards.map(c => c.card.credit_card_name));
        
        // Add top_card cards to the candidate list (avoid duplicates)
        const normalizeCardName = (name: string) => 
          name.toLowerCase().replace(/[®™©]/g, '').trim();
        const existingCardNames = new Set(allCandidateCards.map(c => normalizeCardName(c.card.credit_card_name)));
        
        for (const topCard of bestTopCards) {
          if (!existingCardNames.has(normalizeCardName(topCard.card.credit_card_name))) {
            allCandidateCards.push(topCard);
            console.log(`Added top_card card to candidates: ${topCard.card.credit_card_name}`);
          } else {
            console.log(`Top_card card already in candidates: ${topCard.card.credit_card_name}`);
          }
        }
      } else {
        console.warn('No top_card cards found in database at all!');
      }
    }
    
    // Step 3.6: Prioritize top_card cards (cards with top_card === 1)
    // Sort allCandidateCards to put top_card cards first, but keep similarity order within each group
    const topCards = allCandidateCards.filter(card => isTopCard(card.card));
    const nonTopCards = allCandidateCards.filter(card => !isTopCard(card.card));
    const prioritizedSimilarCards = [...topCards, ...nonTopCards];
    
    if (topCards.length > 0) {
      console.log(`Found ${topCards.length} top_card cards in candidate list, prioritizing them in recommendations`);
    }
    
    // Step 4: Format context for LLM (use prioritized cards)
    const context = formatCardsForContext(prioritizedSimilarCards);
    
    // Step 5: Call LLM with RAG context
    console.log('Calling LLM for recommendations...');
    // Prompt that generates a conversational, markdown-formatted response with structured card listings
    const systemPrompt = `You are a credit card recommendation assistant. You MUST return valid JSON with exactly this structure:
{
  "summary": "A markdown-formatted response with:\n1. ONE sentence preface introducing the recommendations\n2. Three cards listed, each on its own line with format: - **[Card Name](url)** - brief description (5-15 words)\n3. Each card description should explain how it addresses the user's question/need\n\nFormat example:\nBased on your needs, here are three credit cards that could work well for you.\n\n- **[Chase Sapphire Preferred](https://example.com)** - Earns 2x points on travel and dining with a generous welcome bonus\n- **[Capital One Venture](https://example.com)** - Simple flat-rate rewards perfect for frequent travelers\n- **[Amex Gold Card](https://example.com)** - Excellent for dining and groceries with 4x points on both",
  "cards": [
    {"credit_card_name": "Exact card name from candidate cards", "apply_url": "URL from candidate cards", "reason": "Brief 5-15 word description of how this card addresses the user's question/need", "card_summary": "A concise 1-2 sentence summary of this card's key value proposition", "card_highlights": "Highlight 1\\nHighlight 2\\nHighlight 3"},
    {"credit_card_name": "Another card name", "apply_url": "Another URL", "reason": "Brief 5-15 word description", "card_summary": "Summary text", "card_highlights": "Highlight 1\\nHighlight 2\\nHighlight 3"},
    {"credit_card_name": "Third card name", "apply_url": "Third URL", "reason": "Brief 5-15 word description", "card_summary": "Summary text", "card_highlights": "Highlight 1\\nHighlight 2\\nHighlight 3"}
  ]
}

CRITICAL REQUIREMENTS: 
- The "cards" array MUST contain exactly 3 cards (no more, no less)
- Use EXACT card names from the candidate cards provided
- Use EXACT URLs from the candidate cards provided
- The summary MUST follow this exact format:
  1. ONE sentence preface (no more, no less)
  2. Blank line
  3. Three cards, each on its own line: - **[Card Name](url)** - description (5-15 words)
  4. Each card description must explain how it addresses the user's specific question/need
- The card name appears ONLY ONCE - inside the markdown link [Card Name](url), wrapped in bold **
- DO NOT repeat card names anywhere else
- Keep descriptions concise: 5-15 words per card
- Make it conversational and warm`;

    // Build conversation history for context
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history if provided (limit to last 6 messages to avoid token bloat)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-6); // Last 6 messages
      recentHistory.forEach((msg) => {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      });
    }

    // Add current user query with card context
    const userPrompt = `User question: ${userQuery}

Candidate cards:
${context}

${topCards.length > 0 ? `\nIMPORTANT: Some cards in the candidate list are marked as top recommendations (top_card = 1). When possible, try to include at least one of these top cards in your recommendations if they match the user's needs. However, prioritize relevance to the user's question above all else.\n` : ''}

Create a markdown-formatted response with this EXACT structure:

1. ONE sentence preface that introduces the recommendations (acknowledge the user's question/need)
2. Blank line
3. Three cards, each on its own line with this format:
   - **[Card Name](url)** - brief description (5-15 words explaining how this card addresses the user's question/need)

EXAMPLE FORMAT:
Based on your travel needs, here are three credit cards that could work well for you.

- **[Chase Sapphire Preferred](https://chase.com/sapphire)** - Earns 2x points on travel and dining with a generous welcome bonus
- **[Capital One Venture](https://capitalone.com/venture)** - Simple flat-rate rewards perfect for frequent travelers  
- **[Amex Gold Card](https://amex.com/gold)** - Excellent for dining and groceries with 4x points on both

CRITICAL RULES:
- Card name appears ONLY ONCE: inside the markdown link [Card Name](url), wrapped in bold **
- Each description must be 5-15 words
- Each description must explain how the card addresses the user's specific question/need
- Use EXACT card names and URLs from the candidate cards provided
- DO NOT repeat card names outside the link
- DO NOT add closing sentences or additional text after the three cards

For each card in the "cards" array, include:
- "reason": Brief 5-15 word description of how this card addresses the user's question/need
- "card_summary": A concise 1-2 sentence summary of the card's key value proposition
- "card_highlights": A newline-separated list of 3-5 key highlights/benefits (one per line, no bullets or dashes)

CRITICAL: You MUST select exactly 3 cards from the candidates. If there are fewer than 3 candidate cards, select all available cards. If there are more than 3, select the best 3. The "cards" array in your JSON response MUST contain exactly 3 cards (no exceptions).

Return JSON with the formatted markdown summary.`;
    
    messages.push({ role: 'user', content: userPrompt });

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      temperature: 0.3, // Slightly higher for more natural conversational tone
      max_tokens: 800, // Increased to accommodate longer markdown-formatted responses with structure
      response_format: { type: 'json_object' },
    });
    
    const rawAnswer = completion.choices[0]?.message?.content || '';
    console.log('LLM response received, length:', rawAnswer.length);
    console.log('LLM full response:', rawAnswer);
    
    // Step 5: Parse LLM response
    try {
      const parsed = JSON.parse(rawAnswer);
      const recommendations: Recommendation[] = parsed.cards || [];
      let summary = parsed.summary || '';
      
      // Clean duplicate card names from summary immediately after parsing
      // This catches patterns like "CardName****CardName - description"
      
      // FIRST: Simple replacement - replace any sequence of 2+ asterisks with a space
      // This handles patterns like "CardName****CardName" -> "CardName CardName"
      let cleanedSummary = summary.replace(/\*{2,}/g, ' ');
      
      // Then remove duplicate card names that result from the replacement above
      // Remove patterns like "CardName CardName" -> "CardName"
      if (recommendations.length > 0) {
        recommendations.forEach((rec: any) => {
          const cardName = rec.credit_card_name;
          const escapedCardName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Pattern: CardName CardName (with space between) followed by optional description
          const duplicateWithSpace = new RegExp(`([-•]?\\s*)(${escapedCardName})\\s+\\2(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          cleanedSummary = cleanedSummary.replace(duplicateWithSpace, (match: string, prefix: string, p1: string, p2: string) => {
            const afterText = p2.trim();
            const result = `${prefix || ''}${cardName}${afterText ? ' ' + afterText : ''}`;
            console.log(`[BACKEND] Removed duplicate after asterisk replacement: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
            return result;
          });
        });
        
        // General pattern: Remove any duplicate text separated by space (for card names)
        cleanedSummary = cleanedSummary.replace(/([-•]?\s*)([a-zA-Z0-9\s®™©]{3,50}?)\s+\2(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match: string, prefix: string, p1: string, p2: string) => {
          const cardName = p1.trim();
          const afterText = p2.trim();
          if (cardName.length > 3 && cardName.length < 50) {
            const result = `${prefix || ''}${cardName}${afterText ? ' ' + afterText : ''}`;
            console.log(`[BACKEND GENERAL] Removed duplicate: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
            return result;
          }
          return match;
        });
      }
      
      if (recommendations.length > 0) {
        recommendations.forEach((rec: any) => {
          const cardName = rec.credit_card_name;
          const escapedCardName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Pattern 1: CardName****CardName - description (most common issue)
          // Remove the $ anchor to match anywhere in the line, not just at the end
          const duplicatePattern = new RegExp(`(${escapedCardName})\\*{2,}\\1(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          cleanedSummary = cleanedSummary.replace(duplicatePattern, (match: string, p1: string, p2: string) => {
            const afterText = p2.trim();
            console.log(`[CLEANING FIRST PASS] Found duplicate: "${match.substring(0, 100)}" -> "${cardName}${afterText ? ' ' + afterText : ''}"`);
            return afterText ? `${cardName} ${afterText}` : cardName;
          });
          
          // Pattern 2: CardName****CardName (without description, at start of line or after bullet)
          // This specifically handles list items like "- CardName****CardName - description"
          const duplicatePatternStart = new RegExp(`([-•]?\\s*)(${escapedCardName})\\*{2,}\\2(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gim');
          cleanedSummary = cleanedSummary.replace(duplicatePatternStart, (match: string, prefix: string, p1: string, p2: string) => {
            const afterText = p2.trim();
            const result = `${prefix || ''}${cardName}${afterText ? ' ' + afterText : ''}`;
            console.log(`[CLEANING FIRST PASS START] Found duplicate: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
            return result;
          });
          
          // Pattern 3: **CardName**CardName - description
          const boldDuplicatePattern = new RegExp(`\\*\\*${escapedCardName}\\*\\*${escapedCardName}(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          cleanedSummary = cleanedSummary.replace(boldDuplicatePattern, (match: string, p1: string) => {
            console.log(`[CLEANING FIRST PASS BOLD] Found duplicate: "${match.substring(0, 100)}" -> "**${cardName}**${p1}"`);
            return `**${cardName}**${p1}`;
          });
        });
      }
      
      // Also do a general pass to catch any camelCase or lowercase duplicates that might not match exact card names
      // This catches patterns like "cashRewards****cashRewards" even if the card name in data is "Cash Rewards"
      // Also catches patterns with spaces and special characters like "Citi Custom Cash® Card****Citi Custom Cash® Card"
      // Remove the $ anchor to match anywhere, not just at end of line
      cleanedSummary = cleanedSummary.replace(/([a-zA-Z0-9\s®™©]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gim, (match: string, p1: string, p2: string) => {
        const cardName = p1.trim();
        const afterText = p2.trim();
        // Only process if it looks like a card name (more than 3 characters to avoid false positives, less than 100 to avoid matching entire lines)
        if (cardName.length > 3 && cardName.length < 100) {
          console.log(`[CLEANING GENERAL FIRST PASS] Found duplicate: "${match.substring(0, 100)}" -> "${cardName}${afterText ? ' ' + afterText : ''}"`);
          return afterText ? `${cardName} ${afterText}` : cardName;
        }
        return match;
      });
      
      // Then use general patterns to catch any remaining duplicates
      summary = cleanedSummary.split('\n').map((line: string) => {
        // Pattern 1: Match any sequence of characters (alphanumeric, spaces, special chars) followed by 2+ asterisks and the same sequence
        // This catches patterns like "cashRewards****cashRewards" and "Citi Custom Cash® Card****Citi Custom Cash® Card"
        // The pattern matches: (text) followed by ** or more, followed by the same (text)
        // Use non-greedy matching and lookahead to match anywhere in the line
        let cleaned = line.replace(/([a-zA-Z0-9\s®™©]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match: string, p1: string, p2: string) => {
          const cardName = p1.trim();
          const afterText = p2.trim();
          // Only process if it looks like a card name (more than 2 characters to avoid false positives, less than 100 to avoid matching entire lines)
          if (cardName.length > 2 && cardName.length < 100) {
            console.log(`[CLEANING GENERAL] Found duplicate pattern: "${match.substring(0, 100)}" -> "${cardName}${afterText ? ' ' + afterText : ''}"`);
            return afterText ? `${cardName} ${afterText}` : cardName;
          }
          return match;
        });
        
        // Pattern 1b: More specific - catch camelCase or word sequences without spaces
        // This handles cases like "cashRewards****cashRewards" more reliably
        cleaned = cleaned.replace(/([a-zA-Z0-9]+)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match: string, p1: string, p2: string) => {
          const cardName = p1.trim();
          const afterText = p2.trim();
          // Only process if it looks like a card name (more than 3 characters)
          if (cardName.length > 3 && cardName.length < 100) {
            console.log(`[CLEANING CAMELCASE] Found duplicate pattern: "${match.substring(0, 100)}" -> "${cardName}${afterText ? ' ' + afterText : ''}"`);
            return afterText ? `${cardName} ${afterText}` : cardName;
          }
          return match;
        });
        
        // Pattern 2: Handle cases where card name might be in bold markdown: **CardName**CardName
        cleaned = cleaned.replace(/\*\*([^*]+?)\*\*\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match: string, p1: string, p2: string) => {
          const cardName = p1.trim();
          const afterText = p2.trim();
          return afterText ? `**${cardName}** ${afterText}` : `**${cardName}**`;
        });
        
        return cleaned;
      }).join('\n');
      
      // Final safety net: Remove any remaining '****' patterns that might have slipped through
      // This catches any pattern like "text****text" and removes the duplicate
      summary = summary.replace(/([^\*]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match: string, p1: string, p2: string) => {
        const text = p1.trim();
        const afterText = p2.trim();
        return afterText ? `${text} ${afterText}` : text;
      });
      // Also catch any standalone '****' sequences and replace with space
      summary = summary.replace(/\*{2,}/g, ' ');
      
      console.log('Parsed recommendations count:', recommendations.length);
      console.log('Summary:', summary);
      console.log('Raw parsed object:', JSON.stringify(parsed, null, 2));
      
      // If no cards were returned, log a warning
      if (recommendations.length === 0) {
        console.warn('WARNING: LLM returned 0 cards. Parsed object:', parsed);
      }
      
      // Validate and filter recommendations
      // Use fuzzy matching for card names (case-insensitive, ignore special characters)
      const normalizeCardNameLocal = (name: string) => 
        name.toLowerCase().replace(/[®™©]/g, '').trim();
      
      const validRecommendations = recommendations.filter(
        (rec: any) => {
          if (!rec.credit_card_name || !rec.apply_url || !rec.reason) {
            console.log('Recommendation missing required fields:', rec);
            return false;
          }
          
          // Check if card name matches any similar card (fuzzy match)
          const recNameNormalized = normalizeCardNameLocal(rec.credit_card_name);
          const matches = prioritizedSimilarCards.some(
            card => normalizeCardNameLocal(card.card.credit_card_name) === recNameNormalized
          );
          
          if (!matches) {
            console.log('Card name not found in similar cards:', rec.credit_card_name);
            console.log('Available cards:', prioritizedSimilarCards.map(c => c.card.credit_card_name));
          }
          
          return matches;
        }
      );
      
      console.log('Valid recommendations count:', validRecommendations.length);
      console.log('Original recommendations:', recommendations.map((r: any) => r.credit_card_name));
      console.log('Valid recommendations:', validRecommendations.map((r: any) => r.credit_card_name));
      
      // Enrich recommendations with full card data
      const enrichedRecommendations = validRecommendations.map((rec: any, index: number) => {
        // Find the matching card from prioritizedSimilarCards
        const matchingCard = prioritizedSimilarCards.find(
          card => normalizeCardNameLocal(card.card.credit_card_name) === normalizeCardNameLocal(rec.credit_card_name)
        );
        
        if (matchingCard) {
          const card = matchingCard.card;
          
          // Generate card_highlights fallback from other fields if not available
          let cardHighlights = String(card.card_highlights || rec.card_highlights || '').trim();
          
          // If card_highlights is empty, try to generate from perks or other fields
          if (!cardHighlights) {
            const highlights: string[] = [];
            
            // Try to use perks field
            if (card.perks || card.benefits || card.card_perks) {
              const perksText = String(card.perks || card.benefits || card.card_perks || '');
              // Split perks by common delimiters and take first 3-5 items
              const perkItems = perksText.split(/[.,;]/)
                .map(p => p.trim())
                .filter(p => p.length > 10 && p.length < 100)
                .slice(0, 5);
              highlights.push(...perkItems);
            }
            
            // If still no highlights, try to extract from reason or rewards_rate
            if (highlights.length === 0) {
              if (rec.reason) {
                const reasonParts = String(rec.reason)
                  .split(/[.,;]/)
                  .map(r => r.trim())
                  .filter(r => r.length > 15 && r.length < 100)
                  .slice(0, 3);
                highlights.push(...reasonParts);
              }
              
              if (highlights.length === 0 && card.rewards_rate) {
                highlights.push(String(card.rewards_rate));
              }
            }
            
            cardHighlights = highlights.join('\n');
          }
          
          const enriched = {
            credit_card_name: rec.credit_card_name,
            apply_url: rec.apply_url || String(card.url_application || ''),
            reason: rec.reason || '',
            // Pull from Google Sheet first, fallback to LLM response if not in sheet
            card_summary: String(card.card_summary || rec.card_summary || '').trim(),
            card_highlights: cardHighlights,
            intro_offer: String(card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || ''),
            application_fee: String(card.application_fee || card.app_fee || ''),
            credit_score_needed: String(card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || ''),
            annual_fee: String(card.annual_fee || card.fee || ''),
            rewards_rate: String(card.rewards_rate || card.rewards || card.reward_rate || ''),
            perks: String(card.perks || card.benefits || card.card_perks || ''),
          };
          
          console.log(`[ENRICHMENT ${index}] Card: ${rec.credit_card_name}, hasHighlights: ${!!enriched.card_highlights && enriched.card_highlights.length > 0}, highlightsLength: ${enriched.card_highlights?.length || 0}`);
          
          return enriched;
        }
        
        // If no matching card found, still ensure card_highlights is set
        const fallbackHighlights = rec.card_highlights 
          ? String(rec.card_highlights).trim()
          : (rec.perks ? String(rec.perks).split(/[.,;]/).slice(0, 5).join('\n') : '');
        
        const fallback = {
          ...rec,
          card_highlights: fallbackHighlights,
          card_summary: String(rec.card_summary || '').trim(),
        };
        
        console.log(`[ENRICHMENT ${index}] Card: ${rec.credit_card_name}, NO MATCHING CARD FOUND, hasHighlights: ${!!fallback.card_highlights && fallback.card_highlights.length > 0}`);
        
        return fallback;
      });
      
      // Filter out duplicate co_branded values (unless user is asking about a specific cobranded card)
      let filteredRecommendations = enrichedRecommendations;
      const isCobrandedQuery = isCobrandedCardQuery(userQuery);
      
      // Log card_highlights status before filtering
      enrichedRecommendations.forEach((rec, idx) => {
        console.log(`[BEFORE FILTER ${idx}] ${rec.credit_card_name}: hasHighlights=${!!rec.card_highlights && rec.card_highlights.length > 0}`);
      });
      
      if (!isCobrandedQuery) {
        console.log('Filtering duplicate co_branded values from recommendations...');
        filteredRecommendations = filterDuplicateCobranded(enrichedRecommendations, prioritizedSimilarCards);
        console.log(`Filtered from ${enrichedRecommendations.length} to ${filteredRecommendations.length} recommendations`);
      } else {
        console.log('User is asking about a cobranded card, skipping co_branded filter');
      }
      
      // Log card_highlights status after filtering
      filteredRecommendations.forEach((rec, idx) => {
        console.log(`[AFTER FILTER ${idx}] ${rec.credit_card_name}: hasHighlights=${!!rec.card_highlights && rec.card_highlights.length > 0}`);
      });
      
      // Ensure at least one top_card card is included if available
      // This is CRITICAL - we must force top_card cards to appear
      if (topCards.length > 0) {
        const normalizeCardNameLocal = (name: string) => 
          name.toLowerCase().replace(/[®™©]/g, '').trim();
        
        const hasTopCard = filteredRecommendations.some(rec => {
          const matchingCard = prioritizedSimilarCards.find(
            card => normalizeCardNameLocal(card.card.credit_card_name) === normalizeCardNameLocal(rec.credit_card_name)
          );
          return matchingCard && isTopCard(matchingCard.card);
        });
        
        if (!hasTopCard) {
          console.log('No top_card card found in recommendations, forcing inclusion...');
          console.log(`Available topCards: ${topCards.map(c => c.card.credit_card_name).join(', ')}`);
          console.log(`Current recommendations: ${filteredRecommendations.map(r => r.credit_card_name).join(', ')}`);
          
          const usedCardNames = new Set(filteredRecommendations.map(r => normalizeCardNameLocal(r.credit_card_name)));
          const availableTopCard = topCards.find(card => 
            !usedCardNames.has(normalizeCardNameLocal(card.card.credit_card_name))
          );
          
          if (availableTopCard) {
            const card = availableTopCard.card;
            
            // Generate card_highlights from perks or other fields if not available
            let topCardHighlights = String(card.card_highlights || '').trim();
            if (!topCardHighlights) {
              const highlights: string[] = [];
              if (card.perks || card.benefits || card.card_perks) {
                const perksText = String(card.perks || card.benefits || card.card_perks || '');
                const perkItems = perksText.split(/[.,;]/)
                  .map(p => p.trim())
                  .filter(p => p.length > 10 && p.length < 100)
                  .slice(0, 5);
                highlights.push(...perkItems);
              }
              if (highlights.length === 0 && card.rewards_rate) {
                highlights.push(String(card.rewards_rate));
              }
              topCardHighlights = highlights.join('\n');
            }
            
            const topCardRec: Recommendation = {
              credit_card_name: card.credit_card_name,
              apply_url: String(card.url_application || ''),
              reason: `This top-rated card matches your criteria based on ${card.rewards || 'its features'}.`,
              card_summary: String(card.card_summary || '').trim(),
              card_highlights: topCardHighlights,
              intro_offer: String(card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || ''),
              application_fee: String(card.application_fee || card.app_fee || ''),
              credit_score_needed: String(card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || ''),
              annual_fee: String(card.annual_fee || card.fee || ''),
              rewards_rate: String(card.rewards_rate || card.rewards || card.reward_rate || ''),
              perks: String(card.perks || card.benefits || card.card_perks || ''),
            };
            
            if (filteredRecommendations.length < 3) {
              // Add it if we have room
              filteredRecommendations.push(topCardRec);
              console.log(`✓ Added top_card card to recommendations: ${card.credit_card_name}`);
            } else {
              // Replace the FIRST non-top card (not the last) to ensure top_card appears early
              // Find the first card that is NOT a top_card
              let replaced = false;
              for (let i = 0; i < filteredRecommendations.length; i++) {
                const rec = filteredRecommendations[i];
                const matchingCard = prioritizedSimilarCards.find(
                  c => normalizeCardNameLocal(c.card.credit_card_name) === normalizeCardNameLocal(rec.credit_card_name)
                );
                if (!matchingCard || !isTopCard(matchingCard.card)) {
                  filteredRecommendations[i] = topCardRec;
                  console.log(`✓ Replaced recommendation at index ${i} (${rec.credit_card_name}) with top_card card: ${card.credit_card_name}`);
                  replaced = true;
                  break;
                }
              }
              
              // If all cards are top_card (shouldn't happen, but just in case), replace the last one
              if (!replaced) {
                filteredRecommendations[filteredRecommendations.length - 1] = topCardRec;
                console.log(`✓ Replaced last recommendation with top_card card: ${card.credit_card_name}`);
              }
            }
          } else {
            console.warn(`⚠ No available top_card card found to add. Used cards: ${Array.from(usedCardNames).join(', ')}`);
            console.warn(`Top cards available: ${topCards.map(c => c.card.credit_card_name).join(', ')}`);
          }
        } else {
          console.log('✓ Top_card card already present in recommendations');
        }
      }
      
      // Fallback: If validation filtered out all cards but we have similar cards, use them
      let finalRecommendations = filteredRecommendations;
      if (finalRecommendations.length === 0 && prioritizedSimilarCards.length > 0) {
        console.warn('All recommendations were filtered out. Using top similar cards as fallback.');
        const normalizeCardNameLocal = (name: string) => 
          name.toLowerCase().replace(/[®™©]/g, '').trim();
        
        // Track co_branded values if not a cobranded query
        const usedCobranded = new Set<string>();
        const fallbackCards: CardEmbedding[] = [];
        
        // Prioritize top_card cards in fallback
        for (const cardData of prioritizedSimilarCards) {
          if (fallbackCards.length >= 3) break;
          
          if (!isCobrandedQuery) {
            const cobranded = String(cardData.card.co_branded || 'NA').trim().toLowerCase();
            if (usedCobranded.has(cobranded)) {
              continue; // Skip duplicate co_branded
            }
            usedCobranded.add(cobranded);
          }
          
          fallbackCards.push(cardData);
        }
        
        finalRecommendations = fallbackCards.map((cardData) => {
          const card = cardData.card;
          
          // Generate card_highlights from perks or other fields if not available
          let cardHighlights = String(card.card_highlights || '').trim();
          if (!cardHighlights) {
            const highlights: string[] = [];
            if (card.perks || card.benefits || card.card_perks) {
              const perksText = String(card.perks || card.benefits || card.card_perks || '');
              const perkItems = perksText.split(/[.,;]/)
                .map(p => p.trim())
                .filter(p => p.length > 10 && p.length < 100)
                .slice(0, 5);
              highlights.push(...perkItems);
            }
            if (highlights.length === 0 && card.rewards_rate) {
              highlights.push(String(card.rewards_rate));
            }
            cardHighlights = highlights.join('\n');
          }
          
          return {
            credit_card_name: card.credit_card_name,
            apply_url: String(card.url_application || card.url || ''),
            reason: `This card matches your criteria based on ${card.rewards || 'its features'}.`,
            card_summary: String(card.card_summary || '').trim(),
            card_highlights: cardHighlights,
            intro_offer: String(card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || ''),
            application_fee: String(card.application_fee || card.app_fee || ''),
            credit_score_needed: String(card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || ''),
            annual_fee: String(card.annual_fee || card.fee || ''),
            rewards_rate: String(card.rewards_rate || card.rewards || card.reward_rate || ''),
            perks: String(card.perks || card.benefits || card.card_perks || ''),
          };
        });
      }
      
      // Ensure at least one top_card is included if available (before final padding)
      if (topCards.length > 0 && finalRecommendations.length > 0) {
        const normalizeCardNameLocal = (name: string) => 
          name.toLowerCase().replace(/[®™©]/g, '').trim();
        
        const hasTopCard = finalRecommendations.some(rec => {
          const matchingCard = prioritizedSimilarCards.find(
            card => normalizeCardNameLocal(card.card.credit_card_name) === normalizeCardNameLocal(rec.credit_card_name)
          );
          return matchingCard && isTopCard(matchingCard.card);
        });
        
        if (!hasTopCard) {
          // Find an available top_card card
          const usedCardNames = new Set(finalRecommendations.map(r => normalizeCardNameLocal(r.credit_card_name)));
          const availableTopCard = topCards.find(card => 
            !usedCardNames.has(normalizeCardNameLocal(card.card.credit_card_name))
          );
          
          if (availableTopCard) {
            const card = availableTopCard.card;
            const topCardRec: Recommendation = {
              credit_card_name: card.credit_card_name,
              apply_url: String(card.url_application || ''),
              reason: `This top-rated card matches your criteria based on ${card.rewards || 'its features'}.`,
              card_summary: String(card.card_summary || '').trim(),
              card_highlights: String(card.card_highlights || '').trim(),
              intro_offer: String(card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || ''),
              application_fee: String(card.application_fee || card.app_fee || ''),
              credit_score_needed: String(card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || ''),
              annual_fee: String(card.annual_fee || card.fee || ''),
              rewards_rate: String(card.rewards_rate || card.rewards || card.reward_rate || ''),
              perks: String(card.perks || card.benefits || card.card_perks || ''),
            };
            
            // If we have 3 cards, replace the last one. Otherwise, add it.
            if (finalRecommendations.length >= 3) {
              finalRecommendations[finalRecommendations.length - 1] = topCardRec;
              console.log(`Replaced last recommendation with top_card card: ${card.credit_card_name}`);
            } else {
              finalRecommendations.push(topCardRec);
              console.log(`Added top_card card to recommendations: ${card.credit_card_name}`);
            }
          }
        }
      }
      
      // Ensure we return exactly 3 cards for general recommendations
      // (If this was a specific card query, we would have returned earlier)
      if (finalRecommendations.length > 3) {
        finalRecommendations = finalRecommendations.slice(0, 3);
      } else if (finalRecommendations.length < 3 && prioritizedSimilarCards.length > 0) {
          // If we have fewer than 3 cards, pad with additional similar cards
          console.log(`Only found ${finalRecommendations.length} cards, padding to 3...`);
          const normalizeCardNameLocal = (name: string) => 
            name.toLowerCase().replace(/[®™©]/g, '').trim();
          
          const usedCardNames = new Set(finalRecommendations.map(r => normalizeCardNameLocal(r.credit_card_name)));
          
          // Track used co_branded values if not a cobranded query
          const usedCobranded = new Set<string>();
          if (!isCobrandedQuery) {
            // Get co_branded values from current recommendations
            finalRecommendations.forEach(rec => {
              const matchingCard = similarCards.find(
                card => normalizeCardNameLocal(card.card.credit_card_name) === normalizeCardNameLocal(rec.credit_card_name)
              );
              if (matchingCard) {
                const cobranded = String(matchingCard.card.co_branded || 'NA').trim().toLowerCase();
                usedCobranded.add(cobranded);
              }
            });
          }
          
          // When padding, prioritize top_card cards if we don't have one yet
          const hasTopCardInFinal = finalRecommendations.some(rec => {
            const matchingCard = prioritizedSimilarCards.find(
              card => normalizeCardNameLocal(card.card.credit_card_name) === normalizeCardNameLocal(rec.credit_card_name)
            );
            return matchingCard && isTopCard(matchingCard.card);
          });
          
          let cardsToConsider = prioritizedSimilarCards;
          if (!hasTopCardInFinal && topCards.length > 0) {
            // Prioritize top_card cards when padding
            cardsToConsider = [...topCards.filter(card => 
              !finalRecommendations.some(rec => 
                normalizeCardNameLocal(rec.credit_card_name) === normalizeCardNameLocal(card.card.credit_card_name)
              )
            ), ...nonTopCards];
          }
          
          // First try: Get cards with unique co_branded values (if not cobranded query)
          let additionalCards = cardsToConsider
            .filter(card => {
              const cardNameNormalized = normalizeCardNameLocal(card.card.credit_card_name);
              if (usedCardNames.has(cardNameNormalized)) {
                return false;
              }
              // If not a cobranded query, also filter by co_branded
              if (!isCobrandedQuery) {
                const cobranded = String(card.card.co_branded || 'NA').trim().toLowerCase();
                if (usedCobranded.has(cobranded)) {
                  return false;
                }
              }
              return true;
            })
            .slice(0, 3 - finalRecommendations.length);
          
          // If we still don't have enough cards, relax the co_branded constraint
          if (additionalCards.length < (3 - finalRecommendations.length) && !isCobrandedQuery) {
            console.log('Not enough cards with unique co_branded, relaxing constraint to ensure 3 cards...');
            additionalCards = cardsToConsider
              .filter(card => {
                const cardNameNormalized = normalizeCardNameLocal(card.card.credit_card_name);
                return !usedCardNames.has(cardNameNormalized);
              })
              .slice(0, 3 - finalRecommendations.length);
          }
          
          // If still not enough, just take any available cards (last resort)
          if (additionalCards.length < (3 - finalRecommendations.length)) {
            console.log('Still not enough cards, using any available cards to reach 3...');
            const needed = 3 - finalRecommendations.length;
            const moreCards = cardsToConsider
              .filter(card => {
                const cardNameNormalized = normalizeCardNameLocal(card.card.credit_card_name);
                return !usedCardNames.has(cardNameNormalized);
              })
              .slice(0, needed);
            additionalCards = [...additionalCards, ...moreCards].slice(0, needed);
          }
          
          additionalCards.forEach((cardData) => {
            const card = cardData.card;
            const cobranded = String(card.co_branded || 'NA').trim().toLowerCase();
            if (!isCobrandedQuery) {
              usedCobranded.add(cobranded);
            }
            
            // Generate card_highlights from perks or other fields if not available
            let cardHighlights = String(card.card_highlights || '').trim();
            if (!cardHighlights) {
              const highlights: string[] = [];
              if (card.perks || card.benefits || card.card_perks) {
                const perksText = String(card.perks || card.benefits || card.card_perks || '');
                const perkItems = perksText.split(/[.,;]/)
                  .map(p => p.trim())
                  .filter(p => p.length > 10 && p.length < 100)
                  .slice(0, 5);
                highlights.push(...perkItems);
              }
              if (highlights.length === 0 && card.rewards_rate) {
                highlights.push(String(card.rewards_rate));
              }
              cardHighlights = highlights.join('\n');
            }
            
            finalRecommendations.push({
              credit_card_name: card.credit_card_name,
              apply_url: String(card.url_application || card.url || ''),
              reason: `This card matches your criteria based on ${card.rewards || 'its features'}.`,
              card_summary: String(card.card_summary || '').trim(),
              card_highlights: cardHighlights,
              intro_offer: String(card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || ''),
              application_fee: String(card.application_fee || card.app_fee || ''),
              credit_score_needed: String(card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || ''),
              annual_fee: String(card.annual_fee || card.fee || ''),
              rewards_rate: String(card.rewards_rate || card.rewards || card.reward_rate || ''),
              perks: String(card.perks || card.benefits || card.card_perks || ''),
            });
          });
          
          // Final check: if we still don't have 3 cards, log a warning but proceed
          if (finalRecommendations.length < 3) {
            console.warn(`WARNING: Only able to return ${finalRecommendations.length} cards instead of 3. Available similar cards: ${similarCards.length}`);
          }
        }
      
      // Clean summary again before checking if we need to rebuild
      // This ensures any duplicates are removed before we check for missing cards
      // FIRST: Replace any sequence of 2+ asterisks with a space
      summary = summary.replace(/\*{2,}/g, ' ');
      
      // Then remove duplicate card names
      if (finalRecommendations.length > 0) {
        finalRecommendations.forEach((rec: any) => {
          const cardName = rec.credit_card_name;
          const escapedCardName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Pattern: CardName CardName (with space between) followed by optional description
          const duplicateWithSpace = new RegExp(`([-•]?\\s*)(${escapedCardName})\\s+\\2(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          summary = summary.replace(duplicateWithSpace, (match: string, prefix: string, p1: string, p2: string) => {
            const afterText = p2.trim();
            const result = `${prefix || ''}${cardName}${afterText ? ' ' + afterText : ''}`;
            console.log(`[BACKEND BEFORE REBUILD] Removed duplicate: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
            return result;
          });
        });
      }
      
      summary = summary.split('\n').map((line: string) => {
        // Aggressively remove duplicate card names with asterisks
        // Use lookahead instead of $ anchor to match anywhere in the line
        let cleaned = line.replace(/([^\*]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match: string, p1: string, p2: string) => {
          const cardName = p1.trim();
          const afterText = p2.trim();
          console.log(`[CLEANING BEFORE REBUILD CHECK] Found duplicate: "${match.substring(0, 100)}" -> "${cardName}${afterText ? ' ' + afterText : ''}"`);
          return afterText ? `${cardName} ${afterText}` : cardName;
        });
        // Also handle bold markdown duplicates
        cleaned = cleaned.replace(/\*\*([^*]+?)\*\*\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match: string, p1: string, p2: string) => {
          const cardName = p1.trim();
          const afterText = p2.trim();
          return afterText ? `**${cardName}** ${afterText}` : `**${cardName}**`;
        });
        return cleaned;
      }).join('\n');
      
      // Ensure all cards are included in the summary with proper formatting
      // If summary doesn't contain all cards as bullet points, rebuild it
      let finalSummary = summary;
      if (finalRecommendations.length > 0) {
        const summaryLower = summary.toLowerCase();
        // Count how many cards appear in the summary
        const cardsInSummary = finalRecommendations.filter(rec => {
          const cardNameLower = rec.credit_card_name.toLowerCase();
          return summaryLower.includes(cardNameLower);
        }).length;
        
        // If not all cards are present, or if summary doesn't have proper bullet format, rebuild it
        const hasBulletPoints = summary.includes('-') || summary.includes('•');
        if (cardsInSummary < finalRecommendations.length || !hasBulletPoints) {
          console.log('Rebuilding summary to ensure all cards are displayed with proper formatting...');
          
          // Try to extract opening sentence from summary (first sentence only)
          const sentences = summary.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
          let openingSentence = '';
          if (sentences.length >= 1) {
            openingSentence = sentences[0].trim() + '.';
          } else {
            // Fallback: generate one
            openingSentence = `Based on your needs, here are three credit cards that could work well for you.`;
          }
          
          // Build cards list with proper markdown formatting - each on separate line
          // Format: - **[Card Name](url)** - description (5-15 words)
          const cardsText = finalRecommendations.map(rec => 
            `- **[${rec.credit_card_name}](${rec.apply_url})** - ${rec.reason}`
          ).join('\n\n');
          
          // New format: ONE sentence preface, blank line, then three cards (no closing sentence)
          finalSummary = openingSentence + '\n\n' + cardsText;
        } else {
          // Even if we're not rebuilding, clean the summary one more time to be safe
          finalSummary = summary.split('\n').map((line: string) => {
            // Use lookahead instead of $ anchor to match anywhere in the line
            return line.replace(/([^\*]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match: string, p1: string, p2: string) => {
              const cardName = p1.trim();
              const afterText = p2.trim();
              console.log(`[CLEANING NOT REBUILDING] Found duplicate: "${match.substring(0, 100)}" -> "${cardName}${afterText ? ' ' + afterText : ''}"`);
              return afterText ? `${cardName} ${afterText}` : cardName;
            });
          }).join('\n');
        }
      }
      
      // Final cleaning pass using actual card names from recommendations
      // This is the last chance to catch any duplicates before returning
      if (finalRecommendations.length > 0) {
        finalRecommendations.forEach(rec => {
          const cardName = rec.credit_card_name;
          const escapedCardName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Pattern 1: CardName****CardName - description
          // Use lookahead instead of $ anchor to match anywhere, not just at end of line
          const duplicatePattern = new RegExp(`(${escapedCardName})\\*{2,}\\1(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          finalSummary = finalSummary.replace(duplicatePattern, (match: string, p1: string, p2: string) => {
            const afterText = p2.trim();
            console.log(`[CLEANING FINAL] Found duplicate: "${match.substring(0, 100)}" -> "${cardName}${afterText ? ' ' + afterText : ''}"`);
            return afterText ? `${cardName} ${afterText}` : cardName;
          });
          
          // Pattern 2: **CardName**CardName - description  
          const boldDuplicatePattern = new RegExp(`\\*\\*${escapedCardName}\\*\\*${escapedCardName}(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          finalSummary = finalSummary.replace(boldDuplicatePattern, (match: string, p1: string) => {
            console.log(`[CLEANING FINAL BOLD] Found bold duplicate: "${match.substring(0, 100)}" -> "**${cardName}**${p1}"`);
            return `**${cardName}**${p1}`;
          });
          
          // Pattern 3: **[Card Name](url)**Card Name - description (card name after link)
          const linkAfterPattern = new RegExp(`\\*\\*\\[${escapedCardName}\\]\\([^)]+\\)\\*\\*${escapedCardName}(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          finalSummary = finalSummary.replace(linkAfterPattern, (match: string, p1: string) => {
            // Extract the URL from the match
            const urlMatch = match.match(/\[.*?\]\((.*?)\)/);
            const url = urlMatch ? urlMatch[1] : '';
            const afterText = p1.trim();
            console.log(`[CLEANING FINAL LINK+NAME] Found link+name duplicate: "${match.substring(0, 100)}" -> "**[${cardName}](${url})**${afterText ? ' ' + afterText : ''}"`);
            return `**[${cardName}](${url})**${afterText ? ' ' + afterText : ''}`;
          });
          
          // Pattern 4: **Card Name**[Card Name](url) - description (card name before link)
          const linkBeforePattern = new RegExp(`\\*\\*${escapedCardName}\\*\\*\\[${escapedCardName}\\]\\([^)]+\\)(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          finalSummary = finalSummary.replace(linkBeforePattern, (match: string, p1: string) => {
            // Extract the URL from the match
            const urlMatch = match.match(/\[.*?\]\((.*?)\)/);
            const url = urlMatch ? urlMatch[1] : '';
            const afterText = p1.trim();
            console.log(`[CLEANING FINAL NAME+LINK] Found name+link duplicate: "${match.substring(0, 100)}" -> "**[${cardName}](${url})**${afterText ? ' ' + afterText : ''}"`);
            return `**[${cardName}](${url})**${afterText ? ' ' + afterText : ''}`;
          });
          
          // Pattern 5: Card Name**[Card Name](url)** - description (card name before bold link)
          const nameBeforeBoldLinkPattern = new RegExp(`${escapedCardName}\\*\\*\\[${escapedCardName}\\]\\([^)]+\\)\\*\\*(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          finalSummary = finalSummary.replace(nameBeforeBoldLinkPattern, (match: string, p1: string) => {
            const urlMatch = match.match(/\[.*?\]\((.*?)\)/);
            const url = urlMatch ? urlMatch[1] : '';
            const afterText = p1.trim();
            console.log(`[CLEANING FINAL NAME BEFORE BOLD] Found name before bold link duplicate: "${match.substring(0, 100)}" -> "**[${cardName}](${url})**${afterText ? ' ' + afterText : ''}"`);
            return `**[${cardName}](${url})**${afterText ? ' ' + afterText : ''}`;
          });
        });
      }
      
      // Final safety net: Replace any remaining asterisks and remove duplicates
      // Replace any sequence of 2+ asterisks with a space first
      finalSummary = finalSummary.replace(/\*{2,}/g, ' ');
      
      // Then remove duplicate card names that result from the replacement
      if (finalRecommendations.length > 0) {
        finalRecommendations.forEach(rec => {
          const cardName = rec.credit_card_name;
          const escapedCardName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // Pattern: CardName CardName (with space between) followed by optional description
          const duplicateWithSpace = new RegExp(`([-•]?\\s*)(${escapedCardName})\\s+\\2(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          finalSummary = finalSummary.replace(duplicateWithSpace, (match: string, prefix: string, p1: string, p2: string) => {
            const afterText = p2.trim();
            const result = `${prefix || ''}${cardName}${afterText ? ' ' + afterText : ''}`;
            console.log(`[CLEANING FINAL SAFETY NET] Removed duplicate: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
            return result;
          });
        });
      }
      
      // General catch-all: Remove any text pattern that looks like "CardName****CardName"
      // This catches duplicates even if the card name doesn't exactly match our recommendations
      finalSummary = finalSummary.replace(/([-•]?\s*)([a-zA-Z0-9\s®™©]{3,50}?)\*{2,}\2(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match: string, prefix: string, p1: string, p2: string) => {
        const cardName = p1.trim();
        const afterText = p2.trim();
        // Only process if it looks like a card name (more than 3 characters, less than 50)
        if (cardName.length > 3 && cardName.length < 50) {
          const result = `${prefix || ''}${cardName}${afterText ? ' ' + afterText : ''}`;
          console.log(`[CLEANING GENERAL SAFETY NET] Found duplicate: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
          return result;
        }
        return match;
      });
      
      // One more aggressive pass: line-by-line cleaning for any remaining duplicates
      // This catches cases where the card name appears both inside and outside the markdown link
      finalSummary = finalSummary.split('\n').map((line: string) => {
        if (finalRecommendations.length > 0) {
          for (const rec of finalRecommendations) {
            const cardName = rec.credit_card_name;
            const escapedCardName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Count how many times the card name appears (case-insensitive)
            const nameRegex = new RegExp(escapedCardName, 'gi');
            const nameMatches = line.match(nameRegex);
            
            // If the card name appears more than once, we need to clean it
            if (nameMatches && nameMatches.length > 1) {
              // Try to find a markdown link with this card name
              const linkRegex = new RegExp(`\\[${escapedCardName}\\]\\(([^)]+)\\)`, 'gi');
              const linkMatch = line.match(linkRegex);
              
              if (linkMatch && linkMatch.length > 0) {
                // Extract the URL from the first link match
                const urlMatch = linkMatch[0].match(/\[.*?\]\((.*?)\)/);
                const url = urlMatch ? urlMatch[1] : rec.apply_url || '';
                
                // Find the description part (everything after the card name/link)
                const descriptionMatch = line.match(/[-–—]\s*(.+)$/);
                const description = descriptionMatch ? descriptionMatch[1].trim() : '';
                
                // Reconstruct the line with proper format, keeping only the link version
                const cleaned = `- **[${cardName}](${url})**${description ? ' - ' + description : ''}`;
                console.log(`[CLEANING LINE] Removed duplicate: "${line.substring(0, 100)}..." -> "${cleaned}"`);
                return cleaned;
              }
            }
          }
        }
        return line;
      }).join('\n');
      
      // Generate a short title for the recommendations
      const title = await generateRecommendationTitle(userQuery);
      
      console.log('[FINAL] Summary after all cleaning:', finalSummary.substring(0, 500));
      
      // Final validation: Ensure all recommendations have card_highlights
      const validatedRecommendations = finalRecommendations.map((rec: any, idx: number) => {
        if (!rec.card_highlights || String(rec.card_highlights).trim().length === 0) {
          console.warn(`[FINAL VALIDATION ${idx}] ${rec.credit_card_name} missing card_highlights, generating from perks...`);
          const fallbackHighlights = rec.perks 
            ? String(rec.perks).split(/[.,;]/).slice(0, 5).join('\n')
            : (rec.reason ? String(rec.reason).split(/[.,;]/).slice(0, 3).join('\n') : '');
          return {
            ...rec,
            card_highlights: fallbackHighlights,
          };
        }
        return rec;
      });
      
      // Log final status
      validatedRecommendations.forEach((rec, idx) => {
        console.log(`[FINAL RETURN ${idx}] ${rec.credit_card_name}: hasHighlights=${!!rec.card_highlights && rec.card_highlights.length > 0}, length=${rec.card_highlights?.length || 0}`);
      });
      
      return {
        recommendations: validatedRecommendations,
        summary: finalSummary,
        rawModelAnswer: rawAnswer,
        title: title,
      };
    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError);
      console.error('Raw response:', rawAnswer);
      // Try to extract recommendations from text if JSON parsing fails
      return {
        recommendations: [],
        summary: 'I found some cards that might match your needs. Here are the top recommendations:',
        rawModelAnswer: rawAnswer,
      };
    }
  } catch (error) {
    console.error('Error generating recommendations:', error);
    throw error;
  }
}

