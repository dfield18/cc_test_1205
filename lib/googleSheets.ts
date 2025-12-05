// Google Sheets API integration
// Since we're using a public sheet, we can access it via the published CSV export

const GOOGLE_SHEET_ID = '19ioGC8Oj8ej7QP_MG87FyMuAC3AdgGwRrEuKk5wZHZI';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv`;

export interface CreditCard {
  [key: string]: string | undefined;
  credit_card_name?: string;
  url?: string;
  card_highlights?: string;
}

export async function getGoogleSheetsData(): Promise<CreditCard[]> {
  try {
    const response = await fetch(SHEET_URL);
    const csvText = await response.text();
    
    // Parse CSV
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    // Parse header
    const headers = parseCSVLine(lines[0]);
    
    // Parse data rows
    const data: CreditCard[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: CreditCard = {};
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim() || '';
      });
      if (row.credit_card_name) {
        data.push(row);
      }
    }

    return data;
  } catch (error) {
    console.error('Error fetching Google Sheets data:', error);
    return [];
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result.map(val => val.replace(/^"|"$/g, ''));
}

export function filterCreditCards(cards: CreditCard[], query: string): CreditCard[] {
  if (!query || cards.length === 0) return cards.slice(0, 3); // Return top 3 if no query

  const lowerQuery = query.toLowerCase();
  
  // Extract key terms from query
  const travelTerms = ['travel', 'flight', 'hotel', 'airline', 'miles', 'points', 'lounge'];
  const cashbackTerms = ['cash back', 'cashback', 'cash', 'rebate'];
  const noFeeTerms = ['no annual fee', 'no fee', 'zero fee', 'free'];
  const luxuryTerms = ['luxury', 'premium', 'elite', 'platinum', 'reserve'];
  const diningTerms = ['dining', 'restaurant', 'food'];
  const businessTerms = ['business', 'corporate'];
  
  // Score cards based on relevance
  const scoredCards = cards.map(card => {
    const cardText = Object.values(card).join(' ').toLowerCase();
    let score = 0;
    
    // Check for travel-related
    if (travelTerms.some(term => lowerQuery.includes(term) || cardText.includes(term))) {
      score += 10;
    }
    
    // Check for cashback-related
    if (cashbackTerms.some(term => lowerQuery.includes(term) || cardText.includes(term))) {
      score += 10;
    }
    
    // Check for no fee
    if (noFeeTerms.some(term => lowerQuery.includes(term) || cardText.includes(term))) {
      score += 10;
    }
    
    // Check for luxury
    if (luxuryTerms.some(term => lowerQuery.includes(term) || cardText.includes(term))) {
      score += 10;
    }
    
    // Check for dining
    if (diningTerms.some(term => lowerQuery.includes(term) || cardText.includes(term))) {
      score += 10;
    }
    
    // Check for business
    if (businessTerms.some(term => lowerQuery.includes(term) || cardText.includes(term))) {
      score += 10;
    }
    
    // General keyword matching
    const keywords = lowerQuery.split(/\s+/).filter(k => k.length > 2);
    keywords.forEach(keyword => {
      if (cardText.includes(keyword)) {
        score += 5;
      }
    });
    
    return { card, score };
  });
  
  // Sort by score and return top matches
  return scoredCards
    .sort((a, b) => b.score - a.score)
    .filter(item => item.score > 0 || cards.length < 3) // Include some results even with low scores if we have few cards
    .slice(0, 10)
    .map(item => item.card);
}

