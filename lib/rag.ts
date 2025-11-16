import OpenAI from 'openai';
import { Recommendation, RecommendationsResponse, CardEmbedding } from '@/types';
import { embedQuery, findSimilarCards } from './embeddings';
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
 * Determines if the query requires card recommendations or is a general question
 * Defaults to returning cards unless it's VERY clear the user is asking a general question
 */
async function shouldReturnCards(
  userQuery: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<boolean> {
  const openai = getOpenAIClient();
  
  // Quick heuristic check: if query contains recommendation keywords, default to cards
  const recommendationKeywords = [
    'best', 'recommend', 'suggest', 'card for', 'looking for', 'need', 'want',
    'which card', 'what card', 'find', 'show me', 'give me', 'help me find',
    'travel', 'groceries', 'gas', 'cash back', 'points', 'rewards', 'annual fee',
    'starter', 'good credit', 'bad credit', 'student', 'business'
  ];
  
  const queryLower = userQuery.toLowerCase();
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

DEFAULT to needs_cards: true for:
- Any question that could benefit from seeing specific cards
- Questions about finding, choosing, or comparing cards
- Questions about card features, benefits, or categories
- Ambiguous questions where cards might be helpful
- Any question mentioning specific use cases (travel, groceries, etc.)

Examples that NEED cards (needs_cards: true):
- "What's the best card for travel?"
- "Show me cards with no annual fee"
- "I need a card for groceries"
- "Recommend cards for someone with good credit"
- "Which card should I get?"
- "What cards offer travel insurance?"
- "Best starter card"
- "Cards for students"

Examples that DON'T need cards (needs_cards: false) - ONLY these clear cases:
- "What is an annual fee?" (definition question)
- "How do credit cards work?" (how-to question)
- "What's the difference between cash back and points?" (concept explanation)
- "Can you explain what APR means?" (definition question)`,
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
 * Generates credit card recommendations using RAG
 */
export async function generateRecommendations(
  userQuery: string,
  topN: number = TOP_N_CARDS,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<RecommendationsResponse> {
  try {
    // Step 0: Determine if this query needs card recommendations
    console.log('Determining if card recommendations are needed...');
    const needsCards = await shouldReturnCards(userQuery, conversationHistory);
    
    if (!needsCards) {
      console.log('Query does not require cards, generating general answer...');
      return await generateGeneralAnswer(userQuery, conversationHistory);
    }

    // Step 1: Embed the user query
    console.log('Embedding user query...');
    const queryEmbedding = await embedQuery(userQuery);
    
    // Step 2: Find similar cards
    console.log(`Finding top ${topN} similar cards...`);
    const similarCards = await findSimilarCards(queryEmbedding, topN);
    
    if (similarCards.length === 0) {
      return {
        recommendations: [],
        summary: "I couldn't find any credit cards that match your specific needs. Please try rephrasing your question or asking about different criteria.",
        rawModelAnswer: 'No matching cards found.',
      };
    }
    
    // Step 3: Format context for LLM
    const context = formatCardsForContext(similarCards);
    
    // Step 4: Call LLM with RAG context
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
      const normalizeCardName = (name: string) => 
        name.toLowerCase().replace(/[®™©]/g, '').trim();
      
      const validRecommendations = recommendations.filter(
        (rec: any) => {
          if (!rec.credit_card_name || !rec.apply_url || !rec.reason) {
            console.log('Recommendation missing required fields:', rec);
            return false;
          }
          
          // Check if card name matches any similar card (fuzzy match)
          const recNameNormalized = normalizeCardName(rec.credit_card_name);
          const matches = similarCards.some(
            card => normalizeCardName(card.card.credit_card_name) === recNameNormalized
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
          card => normalizeCardName(card.card.credit_card_name) === normalizeCardName(rec.credit_card_name)
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
      
      // Ensure we only return exactly 3 cards
      if (finalRecommendations.length > 3) {
        finalRecommendations = finalRecommendations.slice(0, 3);
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

