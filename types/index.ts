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
}

/**
 * API response structure
 */
export interface RecommendationsResponse {
  recommendations: Recommendation[];
  summary?: string; // Conversational summary of recommendations
  rawModelAnswer?: string;
  title?: string; // Short 2-5 word description of what the recommendations are for
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
}

