import OpenAI from 'openai';
import { Recommendation, RecommendationsResponse, CardEmbedding } from '@/types';
import { embedQuery, findSimilarCards, loadEmbeddings } from './embeddings';
import { cardToText } from './data';

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
      content: `You are a credit card assistant. Analyze the user's question to determine if they are asking about a SPECIFIC credit card by name AND want to see card information/recommendations.

CRITICAL: Only return is_specific_card: true if:
1. The user is EXPLICITLY asking about ONE specific card by its exact name
2. AND they want to see information about that card (not just asking a general question that happens to mention a card name)

Return JSON: {"is_specific_card": true/false, "card_name": "extracted card name or null"}

Examples that ARE specific card queries (is_specific_card: true):
- "Tell me about the Chase Sapphire Preferred" → {"is_specific_card": true, "card_name": "Chase Sapphire Preferred"}
- "What are the benefits of Amex Platinum?" → {"is_specific_card": true, "card_name": "Amex Platinum"}
- "Chase Freedom Unlimited details" → {"is_specific_card": true, "card_name": "Chase Freedom Unlimited"}
- "Information about the Capital One Venture card" → {"is_specific_card": true, "card_name": "Capital One Venture"}
- "Show me the Chase Sapphire Preferred" → {"is_specific_card": true, "card_name": "Chase Sapphire Preferred"}

Examples that are NOT specific card queries (is_specific_card: false):
- "What's the best travel card?" → {"is_specific_card": false, "card_name": null}
- "Show me cards with no annual fee" → {"is_specific_card": false, "card_name": null}
- "What are the best cards for travel?" → {"is_specific_card": false, "card_name": null}
- "Recommend cards for groceries" → {"is_specific_card": false, "card_name": null}
- "Which card should I get?" → {"is_specific_card": false, "card_name": null}
- "Compare travel cards" → {"is_specific_card": false, "card_name": null}
- "Show me the best Chase cards" → {"is_specific_card": false, "card_name": null} (asking for multiple cards)
- "What is the annual fee of Chase Sapphire?" → {"is_specific_card": false, "card_name": null} (asking for information, not to see the card)
- "How does the Chase Sapphire Preferred work?" → {"is_specific_card": false, "card_name": null} (asking how something works)
- "What does APR mean for the Amex Platinum?" → {"is_specific_card": false, "card_name": null} (asking for definition/explanation)

IMPORTANT: 
- If the question asks for recommendations, comparisons, or multiple cards, return is_specific_card: false
- If the question is asking "what is", "how does", "what does", "explain", "tell me about" (a concept/term), return is_specific_card: false even if a card name is mentioned
- Only return true if the user wants to SEE information about a specific card, not if they're asking a general question that mentions a card`,
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
      content: `You are a helpful credit card assistant. The user is asking about a SPECIFIC credit card. Provide detailed, helpful information about this card.

Return JSON: {
  "summary": "A detailed markdown-formatted response about the card that:\n1. Starts with a brief acknowledgment (1 sentence)\n2. Provides comprehensive information about the card including key features, benefits, fees, rewards, and requirements\n3. Includes the card name as a markdown link: [Card Name](application_url)\n4. Ends with a brief closing (1 sentence)\n\nUse markdown formatting: **bold** for emphasis, bullet points (-), proper line breaks. Be informative and helpful.",
  "card_name": "exact card name from the data",
  "apply_url": "application URL from the data"
}

IMPORTANT: Include ALL relevant information about the card. Make it comprehensive and helpful.`,
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
    summary = summary.split('\n').map(line => {
      // Match: any text, 2+ asterisks, same text, then anything after
      return line.replace(/([^\*]+?)\*{2,}\1(\s*.*)$/gi, (match, p1, p2) => {
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
 * Generates credit card recommendations using RAG
 */
export async function generateRecommendations(
  userQuery: string,
  topN: number = TOP_N_CARDS,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  previousRecommendations?: Recommendation[]
): Promise<RecommendationsResponse> {
  try {
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
    // Skip this check if the query contains recommendation keywords (e.g., "best", "recommend", "show me")
    const queryLower = userQuery.toLowerCase();
    const recommendationKeywords = [
      'best', 'recommend', 'suggest', 'show me', 'give me', 'which', 'what card',
      'find', 'looking for', 'need', 'want', 'help me find'
    ];
    const hasRecommendationKeywords = recommendationKeywords.some(keyword => queryLower.includes(keyword));
    
    if (!hasRecommendationKeywords) {
      // Only check for specific card if it doesn't look like a recommendation request
      console.log('Checking if query is about a specific card...');
      const specificCardName = await detectSpecificCardQuery(userQuery);
      
      if (specificCardName) {
        console.log(`Detected specific card query: ${specificCardName}`);
        const specificCard = await findCardByName(specificCardName);
        
        if (specificCard) {
          console.log(`Found specific card: ${specificCard.card.credit_card_name}`);
          return await generateSpecificCardResponse(specificCard, userQuery, conversationHistory);
        } else {
          console.log(`Could not find card matching: ${specificCardName}`);
          // Continue with normal flow - maybe the card name was misidentified
        }
      }
    } else {
      console.log('Query contains recommendation keywords, skipping specific card detection');
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
    
    // Step 4: Format context for LLM
    const context = formatCardsForContext(similarCards);
    
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

Select the best 3 cards from the candidates and return JSON with the formatted markdown summary.`;
    
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
          cleanedSummary = cleanedSummary.replace(duplicateWithSpace, (match, prefix, p1, p2) => {
            const afterText = p2.trim();
            const result = `${prefix || ''}${cardName}${afterText ? ' ' + afterText : ''}`;
            console.log(`[BACKEND] Removed duplicate after asterisk replacement: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
            return result;
          });
        });
        
        // General pattern: Remove any duplicate text separated by space (for card names)
        cleanedSummary = cleanedSummary.replace(/([-•]?\s*)([a-zA-Z0-9\s®™©]{3,50}?)\s+\2(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, prefix, p1, p2) => {
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
          cleanedSummary = cleanedSummary.replace(duplicatePattern, (match, p1, p2) => {
            const afterText = p2.trim();
            console.log(`[CLEANING FIRST PASS] Found duplicate: "${match.substring(0, 100)}" -> "${cardName}${afterText ? ' ' + afterText : ''}"`);
            return afterText ? `${cardName} ${afterText}` : cardName;
          });
          
          // Pattern 2: CardName****CardName (without description, at start of line or after bullet)
          // This specifically handles list items like "- CardName****CardName - description"
          const duplicatePatternStart = new RegExp(`([-•]?\\s*)(${escapedCardName})\\*{2,}\\2(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gim');
          cleanedSummary = cleanedSummary.replace(duplicatePatternStart, (match, prefix, p1, p2) => {
            const afterText = p2.trim();
            const result = `${prefix || ''}${cardName}${afterText ? ' ' + afterText : ''}`;
            console.log(`[CLEANING FIRST PASS START] Found duplicate: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
            return result;
          });
          
          // Pattern 3: **CardName**CardName - description
          const boldDuplicatePattern = new RegExp(`\\*\\*${escapedCardName}\\*\\*${escapedCardName}(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          cleanedSummary = cleanedSummary.replace(boldDuplicatePattern, (match, p1) => {
            console.log(`[CLEANING FIRST PASS BOLD] Found duplicate: "${match.substring(0, 100)}" -> "**${cardName}**${p1}"`);
            return `**${cardName}**${p1}`;
          });
        });
      }
      
      // Also do a general pass to catch any camelCase or lowercase duplicates that might not match exact card names
      // This catches patterns like "cashRewards****cashRewards" even if the card name in data is "Cash Rewards"
      // Also catches patterns with spaces and special characters like "Citi Custom Cash® Card****Citi Custom Cash® Card"
      // Remove the $ anchor to match anywhere, not just at end of line
      cleanedSummary = cleanedSummary.replace(/([a-zA-Z0-9\s®™©]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gim, (match, p1, p2) => {
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
      summary = cleanedSummary.split('\n').map(line => {
        // Pattern 1: Match any sequence of characters (alphanumeric, spaces, special chars) followed by 2+ asterisks and the same sequence
        // This catches patterns like "cashRewards****cashRewards" and "Citi Custom Cash® Card****Citi Custom Cash® Card"
        // The pattern matches: (text) followed by ** or more, followed by the same (text)
        // Use non-greedy matching and lookahead to match anywhere in the line
        let cleaned = line.replace(/([a-zA-Z0-9\s®™©]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, p1, p2) => {
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
        cleaned = cleaned.replace(/([a-zA-Z0-9]+)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, p1, p2) => {
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
        cleaned = cleaned.replace(/\*\*([^*]+?)\*\*\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, p1, p2) => {
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
          const matches = similarCards.some(
            card => normalizeCardNameLocal(card.card.credit_card_name) === recNameNormalized
          );
          
          if (!matches) {
            console.log('Card name not found in similar cards:', rec.credit_card_name);
            console.log('Available cards:', similarCards.map(c => c.card.credit_card_name));
          }
          
          return matches;
        }
      );
      
      console.log('Valid recommendations count:', validRecommendations.length);
      console.log('Original recommendations:', recommendations.map((r: any) => r.credit_card_name));
      console.log('Valid recommendations:', validRecommendations.map((r: any) => r.credit_card_name));
      
      // Enrich recommendations with full card data
      const enrichedRecommendations = validRecommendations.map((rec: any) => {
        // Find the matching card from similarCards
        const matchingCard = similarCards.find(
          card => normalizeCardNameLocal(card.card.credit_card_name) === normalizeCardNameLocal(rec.credit_card_name)
        );
        
        if (matchingCard) {
          const card = matchingCard.card;
          return {
            credit_card_name: rec.credit_card_name,
            apply_url: rec.apply_url || String(card.url_application || ''),
            reason: rec.reason || '',
            // Pull from Google Sheet first, fallback to LLM response if not in sheet
            card_summary: String(card.card_summary || rec.card_summary || '').trim(),
            card_highlights: String(card.card_highlights || rec.card_highlights || '').trim(),
            intro_offer: String(card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || ''),
            application_fee: String(card.application_fee || card.app_fee || ''),
            credit_score_needed: String(card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || ''),
            annual_fee: String(card.annual_fee || card.fee || ''),
            rewards_rate: String(card.rewards_rate || card.rewards || card.reward_rate || ''),
            perks: String(card.perks || card.benefits || card.card_perks || ''),
          };
        }
        return rec;
      });
      
      // Fallback: If validation filtered out all cards but we have similar cards, use them
      let finalRecommendations = enrichedRecommendations;
      if (finalRecommendations.length === 0 && similarCards.length > 0) {
        console.warn('All recommendations were filtered out. Using top similar cards as fallback.');
        finalRecommendations = similarCards.slice(0, 3).map((cardData) => {
          const card = cardData.card;
          return {
            credit_card_name: card.credit_card_name,
            apply_url: String(card.url_application || card.url || ''),
            reason: `This card matches your criteria based on ${card.rewards || 'its features'}.`,
            intro_offer: String(card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || ''),
            application_fee: String(card.application_fee || card.app_fee || ''),
            credit_score_needed: String(card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || ''),
            annual_fee: String(card.annual_fee || card.fee || ''),
            rewards_rate: String(card.rewards_rate || card.rewards || card.reward_rate || ''),
            perks: String(card.perks || card.benefits || card.card_perks || ''),
          };
        });
      }
      
      // Ensure we return exactly 3 cards for general recommendations
      if (finalRecommendations.length > 3) {
        finalRecommendations = finalRecommendations.slice(0, 3);
      } else if (finalRecommendations.length < 3 && similarCards.length > finalRecommendations.length) {
        // If we have fewer than 3 cards, pad with additional similar cards
        console.log(`Only found ${finalRecommendations.length} cards, padding to 3...`);
        const usedCardNames = new Set(finalRecommendations.map(r => normalizeCardNameLocal(r.credit_card_name)));
        const additionalCards = similarCards
          .filter(card => !usedCardNames.has(normalizeCardNameLocal(card.card.credit_card_name)))
          .slice(0, 3 - finalRecommendations.length);
        
        additionalCards.forEach((cardData) => {
          const card = cardData.card;
          finalRecommendations.push({
            credit_card_name: card.credit_card_name,
            apply_url: String(card.url_application || card.url || ''),
            reason: `This card matches your criteria based on ${card.rewards || 'its features'}.`,
            intro_offer: String(card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || ''),
            application_fee: String(card.application_fee || card.app_fee || ''),
            credit_score_needed: String(card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || ''),
            annual_fee: String(card.annual_fee || card.fee || ''),
            rewards_rate: String(card.rewards_rate || card.rewards || card.reward_rate || ''),
            perks: String(card.perks || card.benefits || card.card_perks || ''),
          });
        });
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
          summary = summary.replace(duplicateWithSpace, (match, prefix, p1, p2) => {
            const afterText = p2.trim();
            const result = `${prefix || ''}${cardName}${afterText ? ' ' + afterText : ''}`;
            console.log(`[BACKEND BEFORE REBUILD] Removed duplicate: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
            return result;
          });
        });
      }
      
      summary = summary.split('\n').map(line => {
        // Aggressively remove duplicate card names with asterisks
        // Use lookahead instead of $ anchor to match anywhere in the line
        let cleaned = line.replace(/([^\*]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, p1, p2) => {
          const cardName = p1.trim();
          const afterText = p2.trim();
          console.log(`[CLEANING BEFORE REBUILD CHECK] Found duplicate: "${match.substring(0, 100)}" -> "${cardName}${afterText ? ' ' + afterText : ''}"`);
          return afterText ? `${cardName} ${afterText}` : cardName;
        });
        // Also handle bold markdown duplicates
        cleaned = cleaned.replace(/\*\*([^*]+?)\*\*\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, p1, p2) => {
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
          finalSummary = summary.split('\n').map(line => {
            // Use lookahead instead of $ anchor to match anywhere in the line
            return line.replace(/([^\*]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, p1, p2) => {
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
          finalSummary = finalSummary.replace(duplicatePattern, (match, p1, p2) => {
            const afterText = p2.trim();
            console.log(`[CLEANING FINAL] Found duplicate: "${match.substring(0, 100)}" -> "${cardName}${afterText ? ' ' + afterText : ''}"`);
            return afterText ? `${cardName} ${afterText}` : cardName;
          });
          
          // Pattern 2: **CardName**CardName - description  
          const boldDuplicatePattern = new RegExp(`\\*\\*${escapedCardName}\\*\\*${escapedCardName}(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          finalSummary = finalSummary.replace(boldDuplicatePattern, (match, p1) => {
            console.log(`[CLEANING FINAL BOLD] Found bold duplicate: "${match.substring(0, 100)}" -> "**${cardName}**${p1}"`);
            return `**${cardName}**${p1}`;
          });
          
          // Pattern 3: **[Card Name](url)**Card Name - description (card name after link)
          const linkAfterPattern = new RegExp(`\\*\\*\\[${escapedCardName}\\]\\([^)]+\\)\\*\\*${escapedCardName}(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          finalSummary = finalSummary.replace(linkAfterPattern, (match, p1) => {
            // Extract the URL from the match
            const urlMatch = match.match(/\[.*?\]\((.*?)\)/);
            const url = urlMatch ? urlMatch[1] : '';
            const afterText = p1.trim();
            console.log(`[CLEANING FINAL LINK+NAME] Found link+name duplicate: "${match.substring(0, 100)}" -> "**[${cardName}](${url})**${afterText ? ' ' + afterText : ''}"`);
            return `**[${cardName}](${url})**${afterText ? ' ' + afterText : ''}`;
          });
          
          // Pattern 4: **Card Name**[Card Name](url) - description (card name before link)
          const linkBeforePattern = new RegExp(`\\*\\*${escapedCardName}\\*\\*\\[${escapedCardName}\\]\\([^)]+\\)(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          finalSummary = finalSummary.replace(linkBeforePattern, (match, p1) => {
            // Extract the URL from the match
            const urlMatch = match.match(/\[.*?\]\((.*?)\)/);
            const url = urlMatch ? urlMatch[1] : '';
            const afterText = p1.trim();
            console.log(`[CLEANING FINAL NAME+LINK] Found name+link duplicate: "${match.substring(0, 100)}" -> "**[${cardName}](${url})**${afterText ? ' ' + afterText : ''}"`);
            return `**[${cardName}](${url})**${afterText ? ' ' + afterText : ''}`;
          });
          
          // Pattern 5: Card Name**[Card Name](url)** - description (card name before bold link)
          const nameBeforeBoldLinkPattern = new RegExp(`${escapedCardName}\\*\\*\\[${escapedCardName}\\]\\([^)]+\\)\\*\\*(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
          finalSummary = finalSummary.replace(nameBeforeBoldLinkPattern, (match, p1) => {
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
          finalSummary = finalSummary.replace(duplicateWithSpace, (match, prefix, p1, p2) => {
            const afterText = p2.trim();
            const result = `${prefix || ''}${cardName}${afterText ? ' ' + afterText : ''}`;
            console.log(`[CLEANING FINAL SAFETY NET] Removed duplicate: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
            return result;
          });
        });
      }
      
      // General catch-all: Remove any text pattern that looks like "CardName****CardName"
      // This catches duplicates even if the card name doesn't exactly match our recommendations
      finalSummary = finalSummary.replace(/([-•]?\s*)([a-zA-Z0-9\s®™©]{3,50}?)\*{2,}\2(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, prefix, p1, p2) => {
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
      finalSummary = finalSummary.split('\n').map(line => {
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
      
      return {
        recommendations: finalRecommendations,
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

