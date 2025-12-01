/**
 * Detects repeated credit card names in chatbot output.
 * 
 * This module performs QA checks on chatbot output to identify when
 * card names are repeated, including cases where they appear concatenated
 * without spaces or with various punctuation/spacing variations.
 */

export type RepeatedCardIssue = {
  cardName: string;
  occurrences: number;
  hasConcatenatedRepeat: boolean;
  exampleMatches: string[];
};

/**
 * Normalizes text for matching by:
 * - Converting to lowercase
 * - Removing all whitespace (spaces, tabs, newlines)
 * - Removing symbols: ®, ™, ℠
 * - Removing punctuation: . , ; : ! ? ( ) [ ] { }
 * - Removing: - /
 * 
 * This ensures that variations like:
 * - "BankAmericard® Secured"
 * - "BankAmericard-Secured"
 * - "BANKAMERICARD® SECURED"
 * 
 * All normalize to the same string: "bankamericardsecured"
 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    // Remove all whitespace (spaces, tabs, newlines, etc.)
    .replace(/\s+/g, '')
    // Remove symbols: ®, ™, ℠
    .replace(/[®™℠]/g, '')
    // Remove punctuation: . , ; : ! ? ( ) [ ] { }
    .replace(/[.,;:!?()[\]{}]/g, '')
    // Remove: - /
    .replace(/[-/]/g, '');
}

/**
 * Finds all non-overlapping occurrences of a normalized pattern in normalized text.
 * Returns the start indices of each match.
 */
function findAllOccurrences(normalizedText: string, normalizedPattern: string): number[] {
  const indices: number[] = [];
  let searchIndex = 0;
  
  while (true) {
    const index = normalizedText.indexOf(normalizedPattern, searchIndex);
    if (index === -1) {
      break;
    }
    indices.push(index);
    // Move past this match to avoid overlapping matches
    searchIndex = index + normalizedPattern.length;
  }
  
  return indices;
}

/**
 * Builds an array mapping normalized character indices to original text indices.
 * Since normalization removes characters, we track which original characters
 * correspond to each normalized position.
 * 
 * Returns an array where normalizedToOriginal[i] = original index of the i-th
 * normalized character.
 */
function buildNormalizedToOriginalArray(originalText: string): number[] {
  const mapping: number[] = [];
  
  for (let originalIndex = 0; originalIndex < originalText.length; originalIndex++) {
    const char = originalText[originalIndex];
    // Check if this character would be kept in normalization
    const normalizedChar = normalizeForMatch(char);
    if (normalizedChar.length > 0) {
      mapping.push(originalIndex);
    }
  }
  
  return mapping;
}

/**
 * Extracts example matches from the original text.
 * For each normalized match index, finds the corresponding position in original text
 * and extracts ±30 characters around it.
 * 
 * Limits to max 3 examples to avoid overwhelming output.
 */
function extractExampleMatches(
  originalText: string,
  normalizedIndices: number[],
  normalizedPattern: string,
  maxExamples: number = 3
): string[] {
  if (normalizedIndices.length === 0) {
    return [];
  }
  
  const normalizedToOriginal = buildNormalizedToOriginalArray(originalText);
  const examples: string[] = [];
  
  // Take up to maxExamples indices
  const indicesToProcess = normalizedIndices.slice(0, maxExamples);
  
  for (const normalizedIndex of indicesToProcess) {
    // Find the start position in original text
    // normalizedToOriginal[normalizedIndex] gives us the original position
    // of the first character of the match
    let originalStart = 0;
    if (normalizedIndex < normalizedToOriginal.length) {
      originalStart = normalizedToOriginal[normalizedIndex];
    } else if (normalizedToOriginal.length > 0) {
      // If index is beyond mapping, use the last mapped position
      originalStart = normalizedToOriginal[normalizedToOriginal.length - 1];
    }
    
    // Find the end position (normalizedIndex + pattern length)
    // The last character of the match is at normalizedIndex + normalizedPattern.length - 1
    const normalizedEndIndex = normalizedIndex + normalizedPattern.length - 1;
    let originalEnd = originalText.length;
    if (normalizedEndIndex < normalizedToOriginal.length) {
      // Position after the last character of the match
      originalEnd = normalizedToOriginal[normalizedEndIndex] + 1;
    } else if (normalizedToOriginal.length > 0) {
      // If beyond mapping, use the last mapped position + 1
      originalEnd = normalizedToOriginal[normalizedToOriginal.length - 1] + 1;
    }
    
    // Extract ±30 characters around the match
    const contextStart = Math.max(0, originalStart - 30);
    const contextEnd = Math.min(originalText.length, originalEnd + 30);
    const example = originalText.substring(contextStart, contextEnd);
    
    examples.push(example);
  }
  
  return examples;
}

/**
 * Detects repeated card names in chatbot output.
 * 
 * For each card name:
 * 1. Normalizes both the card name and the output text
 * 2. Checks for concatenated repeats (card name immediately followed by itself)
 * 3. Counts all non-overlapping occurrences
 * 4. Extracts example matches from the original text
 * 5. Returns an issue only if occurrences >= 2
 * 
 * @param chatbotOutput - The text output from the chatbot
 * @param cardNames - Array of canonical credit card names to check
 * @returns Array of RepeatedCardIssue objects for cards that appear 2+ times
 */
export function findRepeatedCardNames(
  chatbotOutput: string,
  cardNames: string[]
): RepeatedCardIssue[] {
  const issues: RepeatedCardIssue[] = [];
  const normalizedOutput = normalizeForMatch(chatbotOutput);
  
  for (const cardName of cardNames) {
    const normalizedCardName = normalizeForMatch(cardName);
    
    // Skip empty card names after normalization
    if (normalizedCardName.length === 0) {
      continue;
    }
    
    // Check for concatenated repeat (card name immediately followed by itself)
    const concatenatedPattern = normalizedCardName + normalizedCardName;
    const hasConcatenatedRepeat = normalizedOutput.includes(concatenatedPattern);
    
    // Find all non-overlapping occurrences
    const normalizedIndices = findAllOccurrences(normalizedOutput, normalizedCardName);
    const occurrences = normalizedIndices.length;
    
    // Only create an issue if the card appears 2 or more times
    if (occurrences >= 2) {
      // Extract example matches from original text
      const exampleMatches = extractExampleMatches(
        chatbotOutput,
        normalizedIndices,
        normalizedCardName
      );
      
      issues.push({
        cardName,
        occurrences,
        hasConcatenatedRepeat,
        exampleMatches,
      });
    }
  }
  
  return issues;
}

/**
 * Quick check to determine if any card names are repeated in the output.
 * 
 * @param chatbotOutput - The text output from the chatbot
 * @param cardNames - Array of canonical credit card names to check
 * @returns true if any card appears 2+ times, false otherwise
 */
export function hasAnyRepeatedCardName(
  chatbotOutput: string,
  cardNames: string[]
): boolean {
  const issues = findRepeatedCardNames(chatbotOutput, cardNames);
  return issues.length > 0;
}

/**
 * Cleans concatenated card name repeats from text.
 * Replaces patterns like "CardNameCardName" or "CardName CardName" with "CardName".
 * Also handles patterns with asterisks like "CardName****CardName".
 * 
 * @param text - The text to clean
 * @param cardNames - Array of canonical credit card names to check
 * @returns The cleaned text with concatenated repeats removed
 */
export function cleanConcatenatedCardNames(
  text: string,
  cardNames: string[]
): string {
  let cleaned = text;
  
  for (const cardName of cardNames) {
    const normalizedCardName = normalizeForMatch(cardName);
    
    if (normalizedCardName.length === 0) {
      continue;
    }
    
    // Use a direct search approach: find where card name appears twice in a row
    // This handles both direct concatenation (CardNameCardName) and with spaces/asterisks
    let maxDirectIterations = 50;
    while (maxDirectIterations-- > 0) {
      // Case-insensitive search for the card name
      const lowerCardName = cardName.toLowerCase();
      const lowerCleaned = cleaned.toLowerCase();
      const firstIndex = lowerCleaned.indexOf(lowerCardName);
      
      if (firstIndex === -1) break;
      
      // Check if the card name appears again immediately after (within a few chars for spacing/punctuation)
      const afterFirst = cleaned.substring(firstIndex + cardName.length);
      const afterFirstLower = afterFirst.toLowerCase();
      
      // Look for the card name starting right after the first one
      // Allow 0-5 character offset to account for spaces, asterisks, or punctuation
      let secondStart = -1;
      for (let offset = 0; offset <= 5 && offset < afterFirstLower.length; offset++) {
        if (afterFirstLower.substring(offset).startsWith(lowerCardName)) {
          secondStart = firstIndex + cardName.length + offset;
          break;
        }
      }
      
      if (secondStart !== -1) {
        // Found concatenated repeat! Extract and replace
        const secondEnd = secondStart + cardName.length;
        const fullMatch = cleaned.substring(firstIndex, secondEnd);
        
        // Extract description after the second card name
        const afterText = cleaned.substring(secondEnd);
        const descMatch = afterText.match(/^\s*[-–—]\s*(.+?)(?=\n|$)/);
        const description = descMatch ? descMatch[1] : '';
        
        // Replace with single card name + description
        const replacement = description ? `${cardName} - ${description}` : cardName;
        const replaceEnd = secondEnd + (descMatch ? descMatch[0].length : 0);
        
        cleaned = cleaned.substring(0, firstIndex) + 
                  replacement + 
                  cleaned.substring(replaceEnd);
        
        console.log(`[CLEANING CONCATENATED DIRECT] Fixed: "${fullMatch.substring(0, 80)}..." -> "${replacement}"`);
        // Continue to check for more occurrences
      } else {
        // No concatenated repeat found, move to next card name
        break;
      }
    }
    
    // Also use normalized matching approach for more complex cases (handles variations in spacing/punctuation)
    let maxIterations = 50; // Safety limit
    while (maxIterations-- > 0) {
      const normalizedCleaned = normalizeForMatch(cleaned);
      const concatenatedPattern = normalizedCardName + normalizedCardName;
      
      const concatIndex = normalizedCleaned.indexOf(concatenatedPattern);
      if (concatIndex === -1) {
        break; // No more concatenated repeats found
      }
      
      // Map the normalized index back to original text
      const normalizedToOriginal = buildNormalizedToOriginalArray(cleaned);
      
      // Find original start position
      let originalStart = 0;
      if (concatIndex < normalizedToOriginal.length) {
        originalStart = normalizedToOriginal[concatIndex];
      } else if (normalizedToOriginal.length > 0) {
        originalStart = normalizedToOriginal[normalizedToOriginal.length - 1];
      }
      
      // Find original end position (after both card names)
      const normalizedEnd = concatIndex + concatenatedPattern.length;
      let originalEnd = cleaned.length;
      if (normalizedEnd <= normalizedToOriginal.length) {
        originalEnd = normalizedToOriginal[normalizedEnd - 1] + 1;
      } else if (normalizedToOriginal.length > 0) {
        originalEnd = normalizedToOriginal[normalizedToOriginal.length - 1] + 1;
      }
      
      // Extract description after the second card name
      const afterText = cleaned.substring(originalEnd);
      const descMatch = afterText.match(/^\s*[-–—]\s*(.+?)(?=\n|$)/);
      const description = descMatch ? descMatch[1] : '';
      
      // Replace with single card name + description
      const replacement = description ? `${cardName} - ${description}` : cardName;
      const replaceEnd = originalEnd + (descMatch ? descMatch[0].length : 0);
      
      const beforeReplace = cleaned.substring(originalStart, Math.min(originalStart + 100, replaceEnd));
      cleaned = cleaned.substring(0, originalStart) + 
                replacement + 
                cleaned.substring(replaceEnd);
      
      console.log(`[CLEANING CONCATENATED NORMALIZED] Fixed: "${beforeReplace.substring(0, 80)}..." -> "${replacement}"`);
    }
  }
  
  return cleaned;
}

