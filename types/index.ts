/**
 * Credit card data structure from Google Sheets
 */
export interface CreditCard {
  id: string;
  credit_card_name: string;
  url_application: string;
  [key: string]: string | number; // Allow other attributes
}

/**
 * Embedding vector with metadata
 */
export interface CardEmbedding {
  cardId: string;
  embedding: number[];
  card: CreditCard;
}

/**
 * Embeddings store structure
 */
export interface EmbeddingsStore {
  cards: CreditCard[];
  embeddings: CardEmbedding[];
  generatedAt: string;
}

/**
 * Single recommendation from the LLM
 */
export interface Recommendation {
  credit_card_name: string;
  apply_url: string;
  reason: string;
  intro_offer?: string;
  application_fee?: string;
  credit_score_needed?: string;
  annual_fee?: string;
  rewards_rate?: string;
  perks?: string;
  card_summary?: string; // Summary text displayed at the top of the expandable box
  card_highlights?: string; // Highlights formatted as checkmarks in the body
}

/**
 * API response structure
 */
export interface RecommendationsResponse {
  recommendations: Recommendation[];
  summary?: string; // Conversational summary of recommendations
  rawModelAnswer?: string;
  title?: string; // Short 2-5 word description of what the recommendations are for

  // NEW: Debugging metadata for browser console logging
  metadata?: {
    step: number; // Which step (1-5) was executed
    stepName: string; // Human-readable step name
    usedWebSearch: boolean; // Whether web search was used
    reason?: string; // Additional context about the decision
  };
}

/**
 * Conversation message structure
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * API request structure
 */
export interface RecommendationsRequest {
  message: string;
  conversationHistory?: ConversationMessage[]; // Optional conversation history
  previousRecommendations?: Recommendation[]; // Previous cards that were shown to the user
}

