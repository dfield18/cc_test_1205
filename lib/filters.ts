import OpenAI from 'openai';

/**
 * Lazy-loaded OpenAI client
 */
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Structured filters that can be extracted from user queries
 */
export interface CardFilters {
  annualFee?: 'no-fee' | 'low-fee' | 'any';
  annualFeeMax?: number; // Maximum annual fee in dollars
  cardType?: string[]; // e.g., ['travel', 'cashback', 'business']
  issuer?: string[]; // e.g., ['Chase', 'Amex', 'Citi']
  network?: string[]; // e.g., ['Visa', 'Mastercard', 'Amex']
  rewardsType?: string[]; // e.g., ['points', 'miles', 'cashback']
  spendingCategories?: string[]; // e.g., ['dining', 'travel', 'groceries']
  targetConsumer?: string[]; // e.g., ['business', 'student', 'premium']
  hasWelcomeBonus?: boolean;
  hasNoForeignTransactionFee?: boolean;
}

/**
 * Extracts structured filters from a user query using LLM
 */
export async function extractFilters(query: string): Promise<CardFilters> {
  const openai = getOpenAIClient();

  const systemPrompt = `You are a filter extraction system for credit card queries.
Analyze the user query and extract any filtering criteria they specify.

Return a JSON object with these optional fields:
- annualFee: "no-fee" (user wants $0 fee), "low-fee" (wants low/reasonable fee), or "any" (doesn't care)
- annualFeeMax: number (if user specifies max annual fee like "under $100")
- cardType: array of strings like ["travel", "cashback", "business", "rewards", "balance-transfer", "secured"]
- issuer: array of bank names like ["Chase", "American Express", "Citi", "Capital One", "Discover", "Bank of America"]
- network: array like ["Visa", "Mastercard", "American Express", "Discover"]
- rewardsType: array like ["points", "miles", "cashback"]
- spendingCategories: array like ["dining", "travel", "groceries", "gas", "online-shopping", "restaurants"]
- targetConsumer: array like ["business", "student", "excellent-credit", "fair-credit", "premium"]
- hasWelcomeBonus: boolean (if user specifically wants welcome bonus)
- hasNoForeignTransactionFee: boolean (if user mentions international travel or no foreign transaction fees)

Examples:

Query: "cards with no annual fee"
Output: {"annualFee": "no-fee"}

Query: "best travel card under $100 annual fee"
Output: {"cardType": ["travel"], "annualFeeMax": 100}

Query: "Chase cashback cards"
Output: {"issuer": ["Chase"], "rewardsType": ["cashback"]}

Query: "cards with good cash back rewards"
Output: {"rewardsType": ["cashback"]}

Query: "best cash back cards"
Output: {"rewardsType": ["cashback"]}

Query: "travel rewards cards"
Output: {"rewardsType": ["points", "miles"], "cardType": ["travel"]}

Query: "business cards with no foreign transaction fees"
Output: {"cardType": ["business"], "targetConsumer": ["business"], "hasNoForeignTransactionFee": true}

Query: "cards for dining and travel"
Output: {"spendingCategories": ["dining", "travel"]}

Query: "what's a credit card?"
Output: {}

Query: "best card for everyday spending"
Output: {}

Only include fields where the user explicitly specifies criteria. If query is general or doesn't specify filters, return empty object.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast and cheap for classification
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return {};
    }

    const filters = JSON.parse(content) as CardFilters;

    // Log extracted filters for debugging
    console.log('[FILTER EXTRACTION]', {
      query,
      filters: JSON.stringify(filters, null, 2),
    });

    return filters;
  } catch (error) {
    console.error('Error extracting filters:', error);
    return {}; // Fall back to no filtering
  }
}

/**
 * Helper: Get annual fee value from card, checking multiple possible field names
 */
function getAnnualFeeValue(card: any): string | number | null {
  // Check all possible field name variations for annual fee
  const possibleFields = [
    'annual_fee',
    'annualFee',
    'Annual Fee',
    'AnnualFee',
    'annual_fee_score',
    'annualFeeScore',
    'fee',
    'Fee',
    'yearly_fee',
    'yearlyFee',
  ];

  for (const field of possibleFields) {
    if (card[field] !== undefined && card[field] !== null && String(card[field]).trim() !== '') {
      return card[field];
    }
  }

  return null;
}

/**
 * Helper: Check if card has no annual fee
 */
function hasNoAnnualFee(card: any): boolean {
  const feeValue = getAnnualFeeValue(card);

  if (feeValue === null) {
    console.log(`[FILTER DEBUG] Card ${card.credit_card_name || card.id}: No annual fee field found`);
    return false; // If we can't find the field, don't include it
  }

  // Check if it's a number
  if (typeof feeValue === 'number') {
    const isNoFee = feeValue === 0;
    console.log(`[FILTER DEBUG] Card ${card.credit_card_name || card.id}: fee=${feeValue} (number), isNoFee=${isNoFee}`);
    return isNoFee;
  }

  // Check if it's a string that represents $0
  const feeString = String(feeValue).toLowerCase().trim();
  const isNoFee = feeString === '$0' ||
                  feeString === '0' ||
                  feeString === 'none' ||
                  feeString === 'no annual fee' ||
                  feeString === '$0 annual fee' ||
                  feeString === 'free' ||
                  feeString === '$0.00' ||
                  !!feeString.match(/^\$?0+(\.0+)?$/); // Matches $0, 0, $0.00, etc. (!! converts to boolean)

  console.log(`[FILTER DEBUG] Card ${card.credit_card_name || card.id}: fee="${feeString}" (string), isNoFee=${isNoFee}`);
  return isNoFee;
}

/**
 * Applies filters to a list of credit cards
 */
export function applyFilters(cards: any[], filters: CardFilters): any[] {
  if (!filters || Object.keys(filters).length === 0) {
    console.log('[FILTER] No filters to apply, returning all cards');
    return cards;
  }

  let filteredCards = cards;
  const initialCount = cards.length;

  // Log available fields from first card for debugging
  if (cards.length > 0) {
    const sampleCard = cards[0];
    const allFields = Object.keys(sampleCard);
    console.log('[FILTER DEBUG] Available fields in cards:', allFields.filter(f => f.toLowerCase().includes('fee')));
  }

  // Filter by annual fee
  if (filters.annualFee === 'no-fee') {
    console.log('[FILTER] Filtering for no-fee cards...');
    filteredCards = filteredCards.filter(card => hasNoAnnualFee(card));
    console.log(`[FILTER] Annual fee = no-fee: ${initialCount} → ${filteredCards.length} cards`);
  } else if (filters.annualFee === 'low-fee') {
    console.log('[FILTER] Filtering for low-fee cards...');
    filteredCards = filteredCards.filter(card => {
      const feeValue = getAnnualFeeValue(card);

      if (feeValue === null) {
        return true; // Keep if we can't determine fee
      }

      // Try to parse as number
      let feeNumber: number;
      if (typeof feeValue === 'number') {
        feeNumber = feeValue;
      } else {
        // Extract number from string like "$95" or "95"
        const match = String(feeValue).match(/\$?(\d+(?:\.\d+)?)/);
        if (!match) {
          return true; // Keep if we can't parse
        }
        feeNumber = parseFloat(match[1]);
      }

      return feeNumber <= 100; // Low fee is <= $100
    });
    console.log(`[FILTER] Annual fee = low-fee: ${initialCount} → ${filteredCards.length} cards`);
  }

  // Filter by max annual fee
  if (filters.annualFeeMax !== undefined) {
    console.log(`[FILTER] Filtering for annual fee max $${filters.annualFeeMax}...`);
    filteredCards = filteredCards.filter(card => {
      const feeValue = getAnnualFeeValue(card);

      if (feeValue === null) {
        return false; // Exclude if we can't determine fee
      }

      // Try to parse as number
      let feeNumber: number;
      if (typeof feeValue === 'number') {
        feeNumber = feeValue;
      } else {
        // Extract number from string like "$95" or "95"
        const match = String(feeValue).match(/\$?(\d+(?:\.\d+)?)/);
        if (!match) {
          // If no number found, check if it's explicitly $0
          const feeString = String(feeValue).toLowerCase().trim();
          return feeString === '$0' || feeString === '0' || feeString === 'none' || feeString === 'free';
        }
        feeNumber = parseFloat(match[1]);
      }

      return feeNumber <= filters.annualFeeMax!;
    });
    console.log(`[FILTER] Annual fee max $${filters.annualFeeMax}: ${initialCount} → ${filteredCards.length} cards`);
  }

  // Filter by card type
  if (filters.cardType && filters.cardType.length > 0) {
    filteredCards = filteredCards.filter(card => {
      const cardName = String(card.credit_card_name || '').toLowerCase();
      const cardType = String(card.card_type || '').toLowerCase();
      const targetConsumer = String(card.target_consumer || '').toLowerCase();

      return filters.cardType!.some(type => {
        const lowerType = type.toLowerCase();
        return cardName.includes(lowerType) ||
               cardType.includes(lowerType) ||
               targetConsumer.includes(lowerType);
      });
    });
    console.log(`[FILTER] Card type ${filters.cardType.join(', ')}: ${initialCount} → ${filteredCards.length} cards`);
  }

  // Filter by issuer
  if (filters.issuer && filters.issuer.length > 0) {
    filteredCards = filteredCards.filter(card => {
      const issuer = String(card.issuer || '').toLowerCase();
      const cardName = String(card.credit_card_name || '').toLowerCase();

      return filters.issuer!.some(filterIssuer => {
        const lowerIssuer = filterIssuer.toLowerCase();
        // Handle common variations
        if (lowerIssuer.includes('amex') || lowerIssuer.includes('american express')) {
          return issuer.includes('american express') || issuer.includes('amex') ||
                 cardName.includes('american express') || cardName.includes('amex');
        }
        return issuer.includes(lowerIssuer) || cardName.includes(lowerIssuer);
      });
    });
    console.log(`[FILTER] Issuer ${filters.issuer.join(', ')}: ${initialCount} → ${filteredCards.length} cards`);
  }

  // Filter by network
  if (filters.network && filters.network.length > 0) {
    filteredCards = filteredCards.filter(card => {
      const network = String(card.network || '').toLowerCase();
      const cardName = String(card.credit_card_name || '').toLowerCase();

      return filters.network!.some(filterNetwork => {
        const lowerNetwork = filterNetwork.toLowerCase();
        return network.includes(lowerNetwork) || cardName.includes(lowerNetwork);
      });
    });
    console.log(`[FILTER] Network ${filters.network.join(', ')}: ${initialCount} → ${filteredCards.length} cards`);
  }

  // Filter by rewards type
  if (filters.rewardsType && filters.rewardsType.length > 0) {
    filteredCards = filteredCards.filter(card => {
      const rewardsType = String(card.rewards_type || '').toLowerCase();
      const rewardsRate = String(card.rewards_rate || '').toLowerCase();
      const cardName = String(card.credit_card_name || '').toLowerCase();
      const perks = String(card.perks || '').toLowerCase();
      const cardSummary = String(card.card_summary || '').toLowerCase();
      const pointsMultipliers = String(card.points_multipliers || '').toLowerCase();

      return filters.rewardsType!.some(type => {
        const lowerType = type.toLowerCase();

        // Special handling for cashback vs points/miles distinction
        if (lowerType === 'cashback' || lowerType === 'cash back') {
          // MUST have "cash back" or "cashback" mentioned explicitly
          const hasCashBack =
            rewardsRate.includes('cash back') ||
            cardName.includes('cash back') ||
            perks.includes('cash back') ||
            cardSummary.includes('cash back') ||
            rewardsRate.includes('cashback') ||
            cardName.includes('cashback') ||
            perks.includes('cashback') ||
            cardSummary.includes('cashback');

          // MUST NOT be primarily a points/miles card
          const isPointsMilesCard =
            pointsMultipliers.includes('points') ||
            pointsMultipliers.includes('miles') ||
            cardSummary.includes('points') && !cardSummary.includes('cash back') ||
            cardSummary.includes('miles') && !cardSummary.includes('cash back') ||
            cardName.includes('sapphire') ||
            cardName.includes('venture') ||
            cardName.includes('ink business');

          return hasCashBack && !isPointsMilesCard;
        }

        // For points/miles, check as before
        return rewardsType.includes(lowerType) ||
               rewardsRate.includes(lowerType) ||
               cardName.includes(lowerType) ||
               pointsMultipliers.includes(lowerType);
      });
    });
    console.log(`[FILTER] Rewards type ${filters.rewardsType.join(', ')}: ${initialCount} → ${filteredCards.length} cards`);
  }

  // Filter by spending categories
  if (filters.spendingCategories && filters.spendingCategories.length > 0) {
    filteredCards = filteredCards.filter(card => {
      const pointsMultipliers = String(card.points_multipliers || '').toLowerCase();
      const rewardsRate = String(card.rewards_rate || '').toLowerCase();
      const perks = String(card.perks || '').toLowerCase();

      return filters.spendingCategories!.some(category => {
        const lowerCategory = category.toLowerCase();
        return pointsMultipliers.includes(lowerCategory) ||
               rewardsRate.includes(lowerCategory) ||
               perks.includes(lowerCategory);
      });
    });
    console.log(`[FILTER] Spending categories ${filters.spendingCategories.join(', ')}: ${initialCount} → ${filteredCards.length} cards`);
  }

  // Filter by target consumer
  if (filters.targetConsumer && filters.targetConsumer.length > 0) {
    filteredCards = filteredCards.filter(card => {
      const targetConsumer = String(card.target_consumer || '').toLowerCase();
      const cardType = String(card.card_type || '').toLowerCase();
      const cardName = String(card.credit_card_name || '').toLowerCase();

      return filters.targetConsumer!.some(target => {
        const lowerTarget = target.toLowerCase();
        return targetConsumer.includes(lowerTarget) ||
               cardType.includes(lowerTarget) ||
               cardName.includes(lowerTarget);
      });
    });
    console.log(`[FILTER] Target consumer ${filters.targetConsumer.join(', ')}: ${initialCount} → ${filteredCards.length} cards`);
  }

  // Filter by welcome bonus
  if (filters.hasWelcomeBonus === true) {
    filteredCards = filteredCards.filter(card => {
      const welcomeBonus = String(card.welcome_bonus || '').trim();
      return welcomeBonus && welcomeBonus.length > 0 && welcomeBonus.toLowerCase() !== 'none';
    });
    console.log(`[FILTER] Has welcome bonus: ${initialCount} → ${filteredCards.length} cards`);
  }

  // Filter by no foreign transaction fee
  if (filters.hasNoForeignTransactionFee === true) {
    filteredCards = filteredCards.filter(card => {
      const foreignFee = String(card.foreign_transaction_fee || '').toLowerCase().trim();
      return foreignFee === 'none' || foreignFee === '$0' || foreignFee === '0' ||
             foreignFee === 'no foreign transaction fee' || foreignFee.includes('no fee');
    });
    console.log(`[FILTER] No foreign transaction fee: ${initialCount} → ${filteredCards.length} cards`);
  }

  console.log(`[FILTER] Total: ${initialCount} → ${filteredCards.length} cards after all filters`);

  return filteredCards;
}
