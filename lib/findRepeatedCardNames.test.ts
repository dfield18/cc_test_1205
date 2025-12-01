import { describe, it, expect } from 'vitest';
import {
  findRepeatedCardNames,
  hasAnyRepeatedCardName,
  RepeatedCardIssue,
} from './findRepeatedCardNames';

describe('findRepeatedCardNames', () => {
  describe('Single occurrence — no issue', () => {
    it('should return empty array when card appears only once', () => {
      const output = 'The BankAmericard® Secured is a great card.';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toEqual([]);
    });
  });

  describe('Two occurrences spaced apart', () => {
    it('should detect card name appearing twice with space between', () => {
      const output = 'The BankAmericard® Secured is great. BankAmericard® Secured offers good rewards.';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].cardName).toBe('BankAmericard® Secured');
      expect(result[0].occurrences).toBe(2);
      expect(result[0].hasConcatenatedRepeat).toBe(false);
      expect(result[0].exampleMatches.length).toBeGreaterThan(0);
    });
  });

  describe('Concatenated repeat', () => {
    it('should detect card name concatenated without spaces', () => {
      const output = 'BankAmericard® SecuredBankAmericard® Secured is mentioned here.';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].cardName).toBe('BankAmericard® Secured');
      expect(result[0].occurrences).toBe(2);
      expect(result[0].hasConcatenatedRepeat).toBe(true);
    });

    it('should detect concatenated repeat at start of text', () => {
      const output = 'BankAmericard® SecuredBankAmericard® Secured offers great benefits.';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result[0].hasConcatenatedRepeat).toBe(true);
      expect(result[0].occurrences).toBe(2);
    });
  });

  describe('Mixed — one concatenated + one separate', () => {
    it('should detect both concatenated and separate occurrences', () => {
      const output = 'BankAmericard® SecuredBankAmericard® Secured is great. Also consider BankAmericard® Secured.';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].occurrences).toBe(3);
      expect(result[0].hasConcatenatedRepeat).toBe(true);
    });
  });

  describe('Shared-prefix names that appear only once each', () => {
    it('should not create false positives for shared prefixes', () => {
      const output = 'BankAmericard® is one card. BankAmericard® Secured is another.';
      const cardNames = ['BankAmericard®', 'BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      // Each card appears only once, so no issues
      expect(result).toEqual([]);
    });

    it('should correctly identify when only one of shared-prefix cards repeats', () => {
      const output = 'BankAmericard® appears. BankAmericard® Secured is great. BankAmericard® Secured again.';
      const cardNames = ['BankAmericard®', 'BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      // Only "BankAmericard® Secured" appears twice
      expect(result).toHaveLength(1);
      expect(result[0].cardName).toBe('BankAmericard® Secured');
      expect(result[0].occurrences).toBe(2);
    });
  });

  describe('Line breaks and punctuation', () => {
    it('should handle newlines between occurrences', () => {
      const output = 'BankAmericard® Secured\n\nBankAmericard® Secured';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].occurrences).toBe(2);
    });

    it('should handle various punctuation between occurrences', () => {
      const output = 'BankAmericard® Secured. Then, BankAmericard® Secured!';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].occurrences).toBe(2);
    });

    it('should handle punctuation within card name', () => {
      const output = 'BankAmericard®-Secured appears. BankAmericard®-Secured again.';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].occurrences).toBe(2);
    });
  });

  describe('Case variations', () => {
    it('should match regardless of case', () => {
      const output = 'BANKAMERICARD® SECURED is mentioned. bankamericard® secured again.';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].occurrences).toBe(2);
    });

    it('should match mixed case variations', () => {
      const output = 'BankAmericard® Secured and BANKAMERICARD® secured both match.';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].occurrences).toBe(2);
    });
  });

  describe('No card names present', () => {
    it('should return empty array when no card names are in output', () => {
      const output = 'This text has no card names at all.';
      const cardNames = ['BankAmericard® Secured', 'Chase Sapphire Preferred'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toEqual([]);
    });
  });

  describe('Multiple card names, only one repeated', () => {
    it('should only return issue for the repeated card', () => {
      const output = 'BankAmericard® Secured is great. BankAmericard® Secured again. Chase Sapphire Preferred is also good.';
      const cardNames = ['BankAmericard® Secured', 'Chase Sapphire Preferred'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].cardName).toBe('BankAmericard® Secured');
      expect(result[0].occurrences).toBe(2);
    });
  });

  describe('Multiple card names, multiple repeated', () => {
    it('should return issues for all repeated cards', () => {
      const output = 'BankAmericard® Secured is great. BankAmericard® Secured again. Chase Sapphire Preferred. Chase Sapphire Preferred also.';
      const cardNames = ['BankAmericard® Secured', 'Chase Sapphire Preferred'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(2);
      expect(result.map(r => r.cardName)).toContain('BankAmericard® Secured');
      expect(result.map(r => r.cardName)).toContain('Chase Sapphire Preferred');
      expect(result.every(r => r.occurrences >= 2)).toBe(true);
    });
  });

  describe('Symbol variations', () => {
    it('should handle cards with different symbol representations', () => {
      const output = 'BankAmericard® Secured and BankAmericard Secured both match.';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].occurrences).toBe(2);
    });
  });

  describe('Three or more occurrences', () => {
    it('should correctly count three occurrences', () => {
      const output = 'BankAmericard® Secured. BankAmericard® Secured. BankAmericard® Secured.';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].occurrences).toBe(3);
    });

    it('should limit example matches to 3', () => {
      const output = 'BankAmericard® Secured. '.repeat(5);
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toHaveLength(1);
      expect(result[0].occurrences).toBe(5);
      expect(result[0].exampleMatches.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty output', () => {
      const output = '';
      const cardNames = ['BankAmericard® Secured'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toEqual([]);
    });

    it('should handle empty card names array', () => {
      const output = 'Some text here.';
      const cardNames: string[] = [];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toEqual([]);
    });

    it('should handle card name that normalizes to empty string', () => {
      const output = 'Some text here.';
      const cardNames = ['®™℠'];
      
      const result = findRepeatedCardNames(output, cardNames);
      
      expect(result).toEqual([]);
    });
  });
});

describe('hasAnyRepeatedCardName', () => {
  it('should return false when no cards are repeated', () => {
    const output = 'BankAmericard® Secured appears once.';
    const cardNames = ['BankAmericard® Secured'];
    
    const result = hasAnyRepeatedCardName(output, cardNames);
    
    expect(result).toBe(false);
  });

  it('should return true when at least one card is repeated', () => {
    const output = 'BankAmericard® Secured. BankAmericard® Secured again.';
    const cardNames = ['BankAmericard® Secured'];
    
    const result = hasAnyRepeatedCardName(output, cardNames);
    
    expect(result).toBe(true);
  });

  it('should return true when multiple cards are repeated', () => {
    const output = 'BankAmericard® Secured. BankAmericard® Secured. Chase Sapphire Preferred. Chase Sapphire Preferred.';
    const cardNames = ['BankAmericard® Secured', 'Chase Sapphire Preferred'];
    
    const result = hasAnyRepeatedCardName(output, cardNames);
    
    expect(result).toBe(true);
  });

  it('should return false when no card names are present', () => {
    const output = 'No card names here.';
    const cardNames = ['BankAmericard® Secured'];
    
    const result = hasAnyRepeatedCardName(output, cardNames);
    
    expect(result).toBe(false);
  });
});

