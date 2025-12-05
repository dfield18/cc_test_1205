import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getGoogleSheetsData, filterCreditCards } from '@/lib/googleSheets';

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Please check your .env.local file.');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const CATEGORIES = {
  RECOMMENDATIONS: 'Wants credit card recommendations',
  SPECIFIC_CARD: 'Question about specific credit card',
  COMPARE_CARDS: 'Question to compare different credit cards',
  ATTRIBUTES: 'Question about how credit card attributes',
  SITE_INFO: 'Question about the site, model or how it was trained',
  UNRELATED: 'Question unrelated to credit cards',
};

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Initialize OpenAI client
    const openai = getOpenAIClient();

    // Step 1: Classify the question
    const classificationResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a question classifier. Classify the user's question into one of these exact categories:
1. "${CATEGORIES.RECOMMENDATIONS}" - User wants credit card recommendations (e.g., "what are best cards for travel", "show me cards for cash back")
2. "${CATEGORIES.SPECIFIC_CARD}" - Question about a specific credit card (e.g., "tell me about Chase Sapphire", "what are the benefits of Amex Platinum")
3. "${CATEGORIES.COMPARE_CARDS}" - Question to compare different credit cards (e.g., "compare Chase Sapphire vs Amex Platinum")
4. "${CATEGORIES.ATTRIBUTES}" - Question about credit card attributes/terms (e.g., "what is APR", "what is cash back")
5. "${CATEGORIES.SITE_INFO}" - Question about the site, model, or how it was trained
6. "${CATEGORIES.UNRELATED}" - Question unrelated to credit cards

Respond with ONLY the exact category name from the list above.`,
        },
        {
          role: 'user',
          content: message,
        },
      ],
      temperature: 0.3,
    });

    const category = classificationResponse.choices[0].message.content?.trim() || CATEGORIES.UNRELATED;

    // Step 2: Get Google Sheets data
    const sheetsData = await getGoogleSheetsData();

    // Step 3: Generate response based on category
    let response: any = {
      category,
      message: '',
      creditCards: [],
      recommendedQuestions: [],
    };

    if (category === CATEGORIES.SITE_INFO) {
      response.message = "I am powered by a specialized integration of OpenAI's GPT models and a custom financial database. My architecture combines Natural Language Processing (NLP) with a retrieval system that constantly combs through 1,000+ verified sources (such as APR tables, issuer terms, and redemption portals). This allows me to cross-reference complex credit card data in real-time to answer your questions.";
    } else if (category === CATEGORIES.UNRELATED) {
      response.message = "I love credit cards, but don't know much else about the world.";
    } else if (category === CATEGORIES.ATTRIBUTES) {
      // Use OpenAI to answer attribute questions
      const attributeResponse = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful credit card expert. Answer questions about credit card attributes, terms, and concepts in 1-3 conversational sentences. Be clear and helpful.',
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.7,
      });
      response.message = attributeResponse.choices[0].message.content || '';
    } else if (category === CATEGORIES.RECOMMENDATIONS) {
      // Filter credit cards based on query
      const filteredCards = filterCreditCards(sheetsData, message);
      const topCards = filteredCards.slice(0, 3);

      // If no cards found, use all cards or a subset
      const cardsToUse = topCards.length > 0 ? topCards : sheetsData.slice(0, 3);

      // Generate conversational response
      const recommendationResponse = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a helpful credit card expert. Provide a conversational 2-3 sentence response about credit card recommendations based on the user's query. Be friendly and helpful. The user asked: "${message}". ${cardsToUse.length > 0 ? `Here are some relevant cards: ${cardsToUse.map(c => c.credit_card_name).join(', ')}` : ''}`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.7,
      });

      response.message = recommendationResponse.choices[0].message.content || '';
      response.creditCards = cardsToUse.map(card => ({
        name: card.credit_card_name || 'Credit Card',
        url: card.url || '#',
        highlights: card.card_highlights || 'No highlights available.',
      }));
    } else if (category === CATEGORIES.SPECIFIC_CARD) {
      // Try to find the card in sheets first
      const cardName = extractCardName(message);
      const matchingCard = sheetsData.find(card =>
        card.credit_card_name?.toLowerCase().includes(cardName.toLowerCase()) ||
        cardName.toLowerCase().includes(card.credit_card_name?.toLowerCase() || '')
      );

      if (matchingCard) {
        // Use sheet data
        const specificResponse = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are a helpful credit card expert. Answer the user's question about a specific credit card in 1-3 conversational sentences. Use the following information if relevant: ${JSON.stringify(matchingCard)}`,
            },
            {
              role: 'user',
              content: message,
            },
          ],
          temperature: 0.7,
        });
        response.message = specificResponse.choices[0].message.content || '';
      } else {
        // Use web search via OpenAI
        const webResponse = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful credit card expert. Answer questions about specific credit cards in 1-3 conversational sentences. If you need current information, use your knowledge base.',
            },
            {
              role: 'user',
              content: message,
            },
          ],
          temperature: 0.7,
        });
        response.message = webResponse.choices[0].message.content || '';
      }
    } else if (category === CATEGORIES.COMPARE_CARDS) {
      // Extract card names and find them in sheets
      const cardNames = extractCardNames(message);
      const matchingCards = sheetsData.filter(card =>
        cardNames.some(name =>
          card.credit_card_name?.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(card.credit_card_name?.toLowerCase() || '')
        )
      ).slice(0, 3);

      const compareResponse = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a helpful credit card expert. Compare credit cards in 1-3 conversational sentences. Use this data if relevant: ${JSON.stringify(matchingCards)}`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.7,
      });

      response.message = compareResponse.choices[0].message.content || '';
      response.creditCards = matchingCards.map(card => ({
        name: card.credit_card_name,
        url: card.url,
        highlights: card.card_highlights || '',
      }));
    }

    // Generate recommended questions
    response.recommendedQuestions = await generateRecommendedQuestions(category, message);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error.message },
      { status: 500 }
    );
  }
}

function extractCardName(message: string): string {
  // Simple extraction - look for common card name patterns
  const patterns = [
    /(?:chase|amex|american express|capital one|citi|discover|bank of america)\s+([a-z\s]+)/i,
    /([a-z\s]+)\s+(?:card|credit card)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1] || match[0];
  }

  return message;
}

function extractCardNames(message: string): string[] {
  const cards: string[] = [];
  const commonIssuers = ['chase', 'amex', 'american express', 'capital one', 'citi', 'discover'];
  
  for (const issuer of commonIssuers) {
    if (message.toLowerCase().includes(issuer)) {
      const regex = new RegExp(`${issuer}\\s+([a-z\\s]+)`, 'i');
      const match = message.match(regex);
      if (match) cards.push(match[1] || match[0]);
    }
  }

  return cards.length > 0 ? cards : [message];
}

async function generateRecommendedQuestions(category: string, originalMessage: string): Promise<string[]> {
  const allQuestions = [
    "What's the best card for travel?",
    "How can I earn cash back on everyday purchases?",
    "Show the best cards with no annual fee",
    "Recommend luxury travel credit cards?",
    "What credit cards offer the best sign-up bonuses?",
    "Which cards are best for dining rewards?",
    "What are the best business credit cards?",
    "Which cards have the lowest APR?",
    "What credit cards offer airport lounge access?",
    "Show me cards with great welcome bonuses",
  ];

  // Filter out questions similar to the original
  const filtered = allQuestions.filter(q => {
    const similarity = calculateSimilarity(q.toLowerCase(), originalMessage.toLowerCase());
    return similarity < 0.6; // More strict filtering
  });

  // Shuffle and return 3
  const shuffled = filtered.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  const intersection = words1.filter(w => words2.includes(w));
  return intersection.length / Math.max(words1.length, words2.length);
}

