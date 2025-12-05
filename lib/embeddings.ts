import OpenAI from 'openai';
import { CreditCard, CardEmbedding, EmbeddingsStore } from '@/types';
import { getCreditCards, cardToText } from './data';
import * as fs from 'fs';
import * as path from 'path';

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

const EMBEDDINGS_MODEL = 'text-embedding-3-small';
const EMBEDDINGS_FILE = path.join(process.cwd(), 'data', 'embeddings.json');

/**
 * In-memory cache for embeddings
 */
let cachedEmbeddings: EmbeddingsStore | null = null;

/**
 * Generates embeddings for all credit cards
 */
export async function generateEmbeddings(): Promise<EmbeddingsStore> {
  const cards = await getCreditCards(true); // Force refresh
  
  console.log(`Generating embeddings for ${cards.length} cards...`);
  
  const embeddings: CardEmbedding[] = [];
  
  // Process in batches to avoid rate limits
  const batchSize = 100;
  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    const texts = batch.map(card => cardToText(card));
    
    try {
      const openai = getOpenAIClient();
      const response = await openai.embeddings.create({
        model: EMBEDDINGS_MODEL,
        input: texts,
      });
      
      for (let j = 0; j < batch.length; j++) {
        embeddings.push({
          cardId: batch[j].id,
          embedding: response.data[j].embedding,
          card: batch[j],
        });
      }
      
      console.log(`Processed ${Math.min(i + batchSize, cards.length)}/${cards.length} cards`);
    } catch (error) {
      console.error(`Error generating embeddings for batch ${i}:`, error);
      throw error;
    }
  }
  
  const store: EmbeddingsStore = {
    cards,
    embeddings,
    generatedAt: new Date().toISOString(),
  };
  
  // Save to disk for local dev
  try {
    const dataDir = path.dirname(EMBEDDINGS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(store, null, 2));
    console.log(`Saved embeddings to ${EMBEDDINGS_FILE}`);
  } catch (error) {
    console.warn('Could not save embeddings to disk:', error);
  }
  
  // Update cache
  cachedEmbeddings = store;
  
  return store;
}

/**
 * Loads embeddings from disk or generates new ones
 */
export async function loadEmbeddings(forceRegenerate = false): Promise<EmbeddingsStore> {
  // Return cached embeddings if available
  if (cachedEmbeddings && !forceRegenerate) {
    return cachedEmbeddings;
  }
  
  // Try to load from disk first
  if (!forceRegenerate && fs.existsSync(EMBEDDINGS_FILE)) {
    try {
      const fileContent = fs.readFileSync(EMBEDDINGS_FILE, 'utf-8');
      const store = JSON.parse(fileContent) as EmbeddingsStore;
      
      // Validate structure
      if (store.cards && store.embeddings && store.embeddings.length > 0) {
        cachedEmbeddings = store;
        console.log(`Loaded ${store.embeddings.length} embeddings from disk`);
        return store;
      }
    } catch (error) {
      console.warn('Failed to load embeddings from disk:', error);
    }
  }
  
  // Generate new embeddings
  console.log('Generating new embeddings...');
  return generateEmbeddings();
}

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
 * Finds the top N most similar cards to a query embedding
 * If filteredCardIds is provided, only searches within those cards
 */
export async function findSimilarCards(
  queryEmbedding: number[],
  topN: number = 20,
  filteredCardIds?: string[]
): Promise<CardEmbedding[]> {
  const store = await loadEmbeddings();

  // Filter embeddings if filteredCardIds is provided
  let embeddingsToSearch = store.embeddings;
  if (filteredCardIds && filteredCardIds.length > 0) {
    const cardIdSet = new Set(filteredCardIds);
    embeddingsToSearch = store.embeddings.filter(e => cardIdSet.has(e.cardId));
    console.log(`[VECTOR SEARCH] Searching within ${embeddingsToSearch.length} filtered cards (out of ${store.embeddings.length} total)`);
  } else {
    console.log(`[VECTOR SEARCH] Searching all ${embeddingsToSearch.length} cards`);
  }

  // Compute similarity scores
  const similarities = embeddingsToSearch.map(cardEmbedding => ({
    cardEmbedding,
    similarity: cosineSimilarity(queryEmbedding, cardEmbedding.embedding),
  }));

  // Sort by similarity (descending) and take top N
  similarities.sort((a, b) => b.similarity - a.similarity);

  return similarities.slice(0, topN).map(item => item.cardEmbedding);
}

/**
 * Generates an embedding for a user query
 */
export async function embedQuery(query: string): Promise<number[]> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: EMBEDDINGS_MODEL,
    input: query,
  });
  
  return response.data[0].embedding;
}

