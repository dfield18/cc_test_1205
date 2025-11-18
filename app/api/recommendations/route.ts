import { NextRequest, NextResponse } from 'next/server';
import { generateRecommendations } from '@/lib/rag';
import { RecommendationsRequest, RecommendationsResponse } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: RecommendationsRequest = await request.json();
    
    if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }
    
    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set in environment variables');
      return NextResponse.json(
        { 
          error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your Vercel environment variables.',
          details: process.env.NODE_ENV === 'development' 
            ? 'Set OPENAI_API_KEY in .env.local file' 
            : 'Configure OPENAI_API_KEY in Vercel project settings > Environment Variables'
        },
        { status: 500 }
      );
    }
    
    // Generate recommendations using RAG with conversation history
    const result: RecommendationsResponse = await generateRecommendations(
      body.message.trim(),
      undefined, // topN uses default
      body.conversationHistory, // Pass conversation history
      body.previousRecommendations // Pass previous recommendations
    );
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in recommendations API:', error);
    
    // Provide more detailed error information
    let errorMessage = 'Failed to generate recommendations';
    let errorDetails = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || '';
      
      // Check for specific error types
      if (error.message.includes('API key') || error.message.includes('OPENAI_API_KEY')) {
        errorMessage = 'OpenAI API key error. Please configure OPENAI_API_KEY in Vercel environment variables.';
      } else if (error.message.includes('fetch')) {
        errorMessage = 'Failed to fetch data from Google Sheets. Please check the sheet ID and ensure it is public.';
      } else if (error.message.includes('timeout') || error.message.includes('time')) {
        errorMessage = 'Request timed out. This may happen on the first request while generating embeddings. Please try again in a few moments.';
      } else if (error.message.includes('embeddings') || error.message.includes('embedding')) {
        errorMessage = 'Error generating embeddings. This may take a moment on first request. Please try again.';
      }
    }
    
    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

