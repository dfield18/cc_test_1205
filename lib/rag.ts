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
    'application_fee', 'app_fee', 'intro_apr', 'apr'
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
    
    // Create recommendation object for the specific card
    const recommendation: Recommendation = {
      credit_card_name: response.card_name || cardData.credit_card_name,
      apply_url: response.apply_url || String(cardData.url_application || ''),
      reason: response.summary || `Information about ${cardData.credit_card_name}`,
      intro_offer: cardData.intro_offer || cardData.welcome_bonus || cardData.sign_up_bonus || cardData.intro_bonus || '',
      application_fee: cardData.application_fee || cardData.app_fee || '',
      credit_score_needed: cardData.credit_score_needed || cardData.credit_score || cardData.min_credit_score || cardData.credit_score_required || '',
      annual_fee: cardData.annual_fee || cardData.fee || '',
      rewards_rate: cardData.rewards_rate || cardData.rewards || cardData.reward_rate || '',
      perks: cardData.perks || cardData.benefits || cardData.card_perks || '',
    };
    
    const title = await generateRecommendationTitle(userQuery);
    
    return {
      recommendations: [recommendation],
      summary: response.summary || `Here's information about ${cardData.credit_card_name}.`,
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
    /^what is\s+(an|a|the)?\s+/i,  // "What is an annual fee?"
    /^what's\s+(an|a|the)?\s+/i,    // "What's an annual fee?"
    /^what are\s+/i,                 // "What are credit card rewards?"
    /^how do\s+/i,                   // "How do credit cards work?"
    /^how does\s+/i,                 // "How does balance transfer work?"
    /^how can\s+/i,                  // "How can I improve my credit score?"
    /^explain\s+/i,                  // "Explain what APR means"
    /^can you explain\s+/i,          // "Can you explain what APR means?"
    /^tell me about\s+/i,            // "Tell me about credit scores"
    /^what does\s+/i,                // "What does APR mean?"
    /^what's the difference between/i, // "What's the difference between cash back and points?"
    /^difference between/i,          // "Difference between cash back and points"
    /^compare\s+/i,                  // "Compare cash back vs points" (conceptual comparison)
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
  if (isSpecificQuestion) {
    // These keywords suggest the question is about concepts, not card recommendations
    const conceptKeywords = [
      'mean', 'means', 'meaning', 'work', 'works', 'difference', 'compare',
      'explain', 'definition', 'define', 'is', 'are', 'does', 'do'
    ];
    
    // Check if the question is asking about a concept/term rather than asking for cards
    const hasConceptKeywords = conceptKeywords.some(keyword => queryLower.includes(keyword));
    
    // If it's a specific question pattern AND has concept keywords, it's likely a definition/explanation question
    // But we need to be careful - some questions like "What is the best card?" should still return cards
    if (hasConceptKeywords) {
      // Additional check: if it contains recommendation-seeking words, it might still want cards
      const recommendationSeekingWords = [
        'best', 'recommend', 'suggest', 'should i', 'which', 'what card', 'card for'
      ];
      const isSeekingRecommendation = recommendationSeekingWords.some(word => queryLower.includes(word));
      
      if (!isSeekingRecommendation) {
        console.log('Query is a specific definition/explanation question, skipping cards');
        return false;
      }
    }
  }
  
  // Quick heuristic check: if query contains recommendation keywords, default to cards
  const recommendationKeywords = [
    'best', 'recommend', 'suggest', 'card for', 'looking for', 'need', 'want',
    'which card', 'what card', 'find', 'show me', 'give me', 'help me find',
    'travel', 'groceries', 'gas', 'cash back', 'points', 'rewards', 'annual fee',
    'starter', 'good credit', 'bad credit', 'student', 'business'
  ];
  
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
      content: `You are a helpful credit card assistant. Answer the user's question about credit cards in a friendly, conversational way. Keep responses concise (2-4 sentences). Return JSON: {"summary": "your answer"}`,
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
        'application_fee', 'app_fee', 'intro_apr', 'apr'
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
  "summary": "A markdown-formatted response that:\n1. Directly answers the user's question\n2. References ONLY the cards that were previously shown\n3. Provides specific information about which cards (if any) match the criteria\n4. Uses markdown links: [Card Name](application_url) for each card mentioned\n\nBe specific and helpful. If no cards match, say so clearly.",
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
    content: `User question: ${userQuery}\n\nPreviously shown cards:\n${cardsContext}\n\nAnswer the user's question by ONLY referencing these specific cards.`,
  });
  
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });
    
    const responseText = completion.choices[0]?.message?.content || '{}';
    const response = JSON.parse(responseText);
    
    const title = await generateRecommendationTitle(userQuery);
    
    return {
      recommendations: [], // Empty - we're not showing new cards
      summary: response.summary || `Here's information about the cards you asked about.`,
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
    const systemPrompt = `You MUST return valid JSON with exactly this structure:
{
  "summary": "A well-structured markdown-formatted response with:\n1. Brief personalized opening (1 sentence) acknowledging the user's question\n2. Each card on a separate line as: - **Card Name** (as markdown link [Card Name](url)) - brief 1-2 sentence description\n3. Each card must be on its own line with a blank line between cards\n4. Brief closing (1 sentence) summarizing key takeaway\n\nUse markdown: **bold** for emphasis, proper line breaks, markdown list syntax (-), keep it conversational and warm. NO subheadings - go directly from opening sentence to list items. Each card MUST be on a separate line.",
  "cards": [
    {"credit_card_name": "Exact card name from candidate cards", "apply_url": "URL from candidate cards", "reason": "Brief 1-2 sentence description of why this card fits"},
    {"credit_card_name": "Another card name", "apply_url": "Another URL", "reason": "Brief description"}
  ]
}

CRITICAL: 
- The "cards" array MUST contain exactly 3 cards (no more, no less)
- Use EXACT card names from the candidate cards provided
- Use EXACT URLs from the candidate cards provided
- The summary MUST be in markdown format with:
  1. Opening sentence (1 sentence only) acknowledging user's situation
  2. Each card on its own line as: - **[Card Name](url)** - description (NO subheading before the cards)
  3. Each card must be separated by a blank line (double line break)
  4. Closing sentence (1 sentence only)
- Always list ALL individual cards from the cards array in the summary
- Make it conversational, warm, and visually structured
- CRITICAL: Each card MUST be on a separate line with proper spacing`;

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

Create a conversational, well-structured markdown response that:
1. Starts with a brief personalized opening (1 sentence only) acknowledging their question
2. Lists each card on a separate line as: - **Card Name** (as markdown link [Card Name](url)) - 1-2 sentence description
3. Each card MUST be on its own line with a blank line between cards (double line break)
4. Ends with a brief closing (1 sentence only) summarizing key takeaway

ALWAYS list ALL individual cards from your recommendations in the summary using the format above. Include both the card name and URL in the markdown link format. Each card MUST be on a separate line.

Then recommend exactly 3 cards (the best 3). Return JSON with the formatted markdown summary.`;
    
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
      const summary = parsed.summary || '';
      
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
            intro_offer: card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || '',
            application_fee: card.application_fee || card.app_fee || '',
            credit_score_needed: card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || '',
            annual_fee: card.annual_fee || card.fee || '',
            rewards_rate: card.rewards_rate || card.rewards || card.reward_rate || '',
            perks: card.perks || card.benefits || card.card_perks || '',
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
            intro_offer: card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || '',
            application_fee: card.application_fee || card.app_fee || '',
            credit_score_needed: card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || '',
            annual_fee: card.annual_fee || card.fee || '',
            rewards_rate: card.rewards_rate || card.rewards || card.reward_rate || '',
            perks: card.perks || card.benefits || card.card_perks || '',
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
            intro_offer: card.intro_offer || card.welcome_bonus || card.sign_up_bonus || card.intro_bonus || '',
            application_fee: card.application_fee || card.app_fee || '',
            credit_score_needed: card.credit_score_needed || card.credit_score || card.min_credit_score || card.credit_score_required || '',
            annual_fee: card.annual_fee || card.fee || '',
            rewards_rate: card.rewards_rate || card.rewards || card.reward_rate || '',
            perks: card.perks || card.benefits || card.card_perks || '',
          });
        });
      }
      
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
        const hasBulletPoints = summary.includes('•');
        if (cardsInSummary < finalRecommendations.length || !hasBulletPoints) {
          console.log('Rebuilding summary to ensure all cards are displayed with proper formatting...');
          
          // Try to extract opening sentence from summary (first sentence only)
          const sentences = summary.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
          let openingParagraph = '';
          if (sentences.length >= 1) {
            openingParagraph = sentences[0].trim() + '.';
          } else {
            // Fallback: generate one
            openingParagraph = `Based on your needs, here are some credit cards that could be a great fit for you.`;
          }
          
          // Build cards list with proper markdown formatting - each on separate line
          const cardsText = finalRecommendations.map(rec => 
            `- **[${rec.credit_card_name}](${rec.apply_url})** - ${rec.reason}`
          ).join('\n\n');
          
          // Extract or generate closing recap (1 sentence only)
          let closingRecap = '';
          if (sentences.length > cardsInSummary + 1) {
            // Try to use last sentence as closing
            closingRecap = sentences[sentences.length - 1].trim() + '.';
          } else {
            closingRecap = 'Consider comparing these options to find the best match.';
          }
          
          finalSummary = openingParagraph + '\n\n' + cardsText + '\n\n' + closingRecap;
        }
      }
      
      // Generate a short title for the recommendations
      const title = await generateRecommendationTitle(userQuery);
      
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

