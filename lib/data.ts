import Papa from 'papaparse';
import { CreditCard } from '@/types';

/**
 * Configuration for data fetching
 */
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '19ioGC8Oj8ej7QP_MG87FyMuAC3AdgGwRrEuKk5wZHZI';
const CARD_NAME_COLUMN = process.env.CARD_NAME_COLUMN || 'credit_card_name';
const CARD_URL_COLUMN = process.env.CARD_URL_COLUMN || 'url_application';

/**
 * In-memory cache for credit card data
 */
let cachedCards: CreditCard[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Fetches CSV data from Google Sheets and parses it
 */
async function fetchCSVFromGoogleSheets(): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Google Sheet: ${response.statusText}`);
  }
  
  return response.text();
}

/**
 * Parses CSV data into CreditCard objects
 */
function parseCSVToCards(csvText: string): CreditCard[] {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (!parsed.data || parsed.data.length === 0) {
    throw new Error('No data found in CSV');
  }

  // Log available columns from first row (for debugging)
  if (parsed.data.length > 0) {
    const firstRow = parsed.data[0] as any;
    const columns = Object.keys(firstRow);
    console.log(`📊 Available columns in Google Sheet (${columns.length} total):`, columns.join(', '));
    
    // Check for top_card column variations
    const topCardVariations = ['top_card', 'topCard', 'Top Card', 'Top_Card', 'top card', 'TOP_CARD'];
    const foundTopCardColumn = topCardVariations.find(col => columns.includes(col));
    if (foundTopCardColumn) {
      console.log(`✅ Found top_card column: "${foundTopCardColumn}"`);
      // Count how many cards have top_card = 1
      const topCardCount = (parsed.data as any[]).filter(row => {
        const value = row[foundTopCardColumn];
        const normalized = String(value || '').trim().toLowerCase();
        return normalized === '1' || normalized === '1.0' || normalized === 'true' || value === 1 || value === true;
      }).length;
      console.log(`✅ Found ${topCardCount} cards with top_card = 1`);
    } else {
      console.warn(`⚠️  No top_card column found. Available columns: ${columns.join(', ')}`);
    }
  }

  const cards: CreditCard[] = [];
  
  for (const row of parsed.data as any[]) {
    // Check for card name (required)
    const cardName = row[CARD_NAME_COLUMN];
    if (!cardName) {
      console.warn(`Skipping row missing card name:`, Object.keys(row));
      continue;
    }

    // Check for URL - try configured column first, then fallback to 'url'
    let cardUrl = row[CARD_URL_COLUMN];
    if (!cardUrl) {
      cardUrl = row['url'] || row['URL'] || row['application_url'] || row['apply_url'];
    }
    
    if (!cardUrl) {
      console.warn(`Skipping row missing URL column (tried: ${CARD_URL_COLUMN}, url, URL, application_url, apply_url):`, cardName);
      continue;
    }

    // Generate a simple ID from the card name
    const id = String(cardName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const card: CreditCard = {
      id,
      credit_card_name: String(cardName),
      url_application: String(cardUrl),
      ...row, // Include all other columns
    };

    cards.push(card);
  }

  return cards;
}

/**
 * Fetches and parses credit card data from Google Sheets
 * Uses in-memory cache to avoid re-fetching on every request
 */
export async function getCreditCards(forceRefresh = false): Promise<CreditCard[]> {
  // Return cached data if available and not expired
  if (
    !forceRefresh &&
    cachedCards &&
    cacheTimestamp &&
    Date.now() - cacheTimestamp < CACHE_TTL
  ) {
    return cachedCards;
  }

  try {
    const csvText = await fetchCSVFromGoogleSheets();
    const cards = parseCSVToCards(csvText);
    
    // Update cache
    cachedCards = cards;
    cacheTimestamp = Date.now();
    
    return cards;
  } catch (error) {
    // If we have cached data, return it even if expired
    if (cachedCards) {
      console.warn('Failed to refresh data, using stale cache:', error);
      return cachedCards;
    }
    
    throw error;
  }
}

/**
 * Creates a text representation of a credit card for embedding
 * Combines relevant fields into a searchable string
 * Optimized for speed: shorter, more focused text
 */
export function cardToText(card: CreditCard): string {
  const parts: string[] = [];
  
  // Always include the card name
  parts.push(card.credit_card_name);
  
  // Include only the most critical fields for maximum speed
  const priorityFields = [
    'target_consumer',
    'annual_fee',
    'rewards',
    'points_multipliers',
  ];
  
  for (const field of priorityFields) {
    if (card[field] && String(card[field]).trim()) {
      const value = String(card[field]).trim();
      // Aggressive truncation for speed: 100 chars max
      const truncated = value.length > 100 ? value.substring(0, 100) + '...' : value;
      parts.push(`${field}:${truncated}`);
    }
  }
  
  return parts.join(' | ');
}


