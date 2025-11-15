import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Please check your .env.local file.');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-3.5-turbo';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userQuestion, conversationHistory } = body;

    if (!userQuestion || typeof userQuestion !== 'string') {
      return NextResponse.json(
        { error: 'User question is required' },
        { status: 400 }
      );
    }

    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const openai = getOpenAIClient();

    // Build context from conversation history if provided
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: `You are a credit card recommendation assistant. Based on the user's question and conversation history, generate 2-3 relevant questions that the USER would ask the chatbot next.

CRITICAL: ALL questions must be formatted as questions the USER would ask the chatbot. They should be phrased as if the user is speaking to the chatbot.

Return JSON with this exact format:
{
  "suggestions": [
    "Question 1",
    "Question 2",
    "Question 3"
  ]
}

CORRECT Examples (questions the user would ask):
- "What cards offer the best cash back for groceries?"
- "Show me cards with travel insurance"
- "I need a card with no foreign transaction fees"
- "Which cards have the best sign-up bonuses?"
- "What are the best cards for dining rewards?"
- "Show me cards with no annual fee"

INCORRECT Examples (questions for the user - DO NOT USE):
- "What is your budget?"
- "Do you travel often?"
- "How much do you spend monthly?"
- "What are your spending habits?"
- "Are you looking for cash back or points?"

Guidelines:
- ALL questions must be what the USER would ask the chatbot
- Start with question words (What, Which, Show me, I need, etc.)
- They should relate to credit card features, use cases, or benefits
- Keep questions concise (under 15 words each)
- Make them natural and conversational
- Think: "What would a user type into the chatbot?"`,
      },
    ];

    // Add conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-4); // Last 4 messages for context
      recentHistory.forEach((msg: { role: string; content: string }) => {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      });
    }

    messages.push({
      role: 'user',
      content: `User's question: "${userQuestion}"\n\nGenerate 2-3 relevant questions that the USER would ask the chatbot next. These must be questions the user would type, NOT questions for the user. Return JSON.`,
    });

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      temperature: 0.7,
      max_tokens: 150,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(responseText);
    const suggestions = parsed.suggestions || [];

    // Ensure we have 2-3 suggestions
    const validSuggestions = suggestions
      .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
      .slice(0, 3);

    if (validSuggestions.length < 2) {
      // Fallback suggestions if API doesn't return enough
      return NextResponse.json({
        suggestions: [
          'What cards offer the best rewards?',
          'Show me cards with no annual fee',
        ],
      });
    }

    return NextResponse.json({ suggestions: validSuggestions });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

