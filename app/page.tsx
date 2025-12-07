'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Recommendation } from '@/types';
import SwipeToLoad from '@/components/SwipeToLoad';
import CartoonDisplay from '@/components/CartoonDisplay';
import ReactMarkdown from 'react-markdown';
import { Plane, ShoppingCart, Shield, User, Sparkles, CreditCard, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Check, Star, ExternalLink, TrendingUp, Send } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  recommendations?: Recommendation[];
  summary?: string; // Summary with card links for user messages
}

type SuggestedQuestion = {
  text: string;
  description: string;
  icon: string;
  mobileText?: string;
};

const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  { text: 'What\'s the best card for travel?', description: 'Maximize points on flights and hotels', icon: 'travel' },
  { 
    text: 'How can I earn cash back on everyday purchases', 
    mobileText: 'How can I earn cash back?', 
    description: 'Earn cashback on everyday purchases', 
    icon: 'shopping' 
  },
  { text: 'Show the best cards with no annual fee', description: 'Get great rewards without yearly costs', icon: 'creditcard' },
  { text: 'Recommend luxury travel credit cards?', description: 'Elite perks and lounge access', icon: 'premium' },
  { text: 'What are the best cards for beginners?', description: 'Easy approvals and simple rewards', icon: 'creditcard' },
  { text: 'What card should I get to build credit?', description: 'Secured and starter options', icon: 'creditcard' },
  { text: 'What are the best business credit cards?', description: 'Top rewards for small business spending', icon: 'premium' },
  { text: 'Show top cards for streaming and subscriptions', description: 'Earn more on Netflix, Spotify, etc.', icon: 'shopping' },
  { text: 'Which cards offer the best welcome bonuses?', description: 'High-value intro rewards', icon: 'travel' },
  { text: 'What cards give the best rewards for dining?', description: 'Maximize points at restaurants', icon: 'shopping' },
  { text: 'Show me cards with 0% APR offers', description: 'Interest-free balance transfers', icon: 'creditcard' },
  { text: 'What are the best cards for groceries?', description: 'Earn rewards on supermarket spending', icon: 'shopping' },
  { text: 'Which cards have the best airport lounge access?', description: 'Premium travel experiences', icon: 'travel' },
  { text: 'What cards offer the most points for gas?', description: 'Maximize fuel rewards', icon: 'shopping' },
  { text: 'Show cards with no foreign transaction fees', description: 'Perfect for international travel', icon: 'travel' },
  { text: 'What are the best student credit cards?', description: 'Cards designed for students', icon: 'creditcard' },
  { text: 'Which cards offer the best hotel rewards?', description: 'Free nights and elite status', icon: 'travel' },
  { text: 'What cards have the best cash back rates?', description: 'Highest percentage returns', icon: 'shopping' },
];

const FUN_LOADING_MESSAGES = [
  "Hold on—I'm convincing the credit cards to reveal their secrets. They're dramatic.",
  "Loading… because even credit cards need a moment to collect themselves.",
  "Almost there—just wrestling a contactless card that refuses to make contact.",
  "Gathering your card info—it's shy at first, but it warms up quickly.",
  "Just a moment—I'm whispering your question into the data void. It tickles.",
  "Hang tight—your question is doing a little dramatic pose before answering.",
  "One moment—your question is making me pinky-promise I'll answer thoughtfully.",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recommendationTitle, setRecommendationTitle] = useState('AI Recommendations');
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const [currentCartoon, setCurrentCartoon] = useState<{ imageUrl: string; source?: string } | null>(null);
  const [shownCartoons, setShownCartoons] = useState<string[]>([]);
  // Initialize carousel index to center position
  const centerIndex = Math.floor(SUGGESTED_QUESTIONS.length / 2);
  const [carouselIndex, setCarouselIndex] = useState(centerIndex);
  const [suggestionsCarouselIndex, setSuggestionsCarouselIndex] = useState(0);
  const [suggestionsCarouselScrollProgress, setSuggestionsCarouselScrollProgress] = useState(0);
  const [popularQuestionsCarouselIndex, setPopularQuestionsCarouselIndex] = useState(centerIndex);
  const [popularQuestionsCarouselScrollProgress, setPopularQuestionsCarouselScrollProgress] = useState(0);
  const [isCarouselHovered, setIsCarouselHovered] = useState(false);
  const [expandedRecommendations, setExpandedRecommendations] = useState<Set<number>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [isChatbotVisible, setIsChatbotVisible] = useState(true);
  
  // On desktop, show only 6 questions in the carousel
  const [isDesktop, setIsDesktop] = useState(false);
  
  // State for collapsible credit card boxes (all closed by default)
  const [openCardBoxes, setOpenCardBoxes] = useState<Set<number>>(new Set([]));
  const [desktopExpandedRecommendations, setDesktopExpandedRecommendations] = useState<Set<number>>(new Set());
  // State to track if chatbot content is small (for dynamic container sizing)
  const [isChatbotContentSmall, setIsChatbotContentSmall] = useState(true);
  // State for dynamic chatbot container height (5% larger than content)
  const [chatbotContainerHeight, setChatbotContainerHeight] = useState<number | null>(null);
  // State to track if scrolling is needed
  const [chatbotNeedsScrolling, setChatbotNeedsScrolling] = useState(false);
  
  // Questions to show in carousel (6 on desktop, all on mobile)
  const carouselQuestions = useMemo(() => {
    return isDesktop ? SUGGESTED_QUESTIONS.slice(0, 6) : SUGGESTED_QUESTIONS;
  }, [isDesktop]);
  const shownCartoonsRef = useRef<string[]>([]);
  const chatbotContainerRef = useRef<HTMLDivElement>(null);
  const desktopChatbotRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const suggestionsCarouselRef = useRef<HTMLDivElement>(null);
  const popularQuestionsCarouselRef = useRef<HTMLDivElement>(null);
  const hasInitialCartoonRef = useRef(false);
  // Refs for dragging indicator buttons
  const isDraggingIndicatorRef = useRef(false);
  const hasDraggedIndicatorRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const prevIsLoadingRef = useRef(false);
  // Refs for click-vs-drag detection on carousel buttons
  const carouselButtonMouseDownRef = useRef<{ x: number; y: number; time: number; target: HTMLElement | null } | null>(null);
  const carouselButtonHasDraggedRef = useRef(false);
  const suggestionsCarouselHasDraggedRef = useRef(false);
  
  // Track when recommendations change to trigger animation
  const prevRecommendationsRef = useRef<Recommendation[]>([]);
  // Track if user has manually scrolled the left box
  const userHasScrolledLeftRef = useRef(false);
  // Track previous message count to detect new questions
  const prevMessageCountRef = useRef(0);
  // Track previous user message count to detect new questions
  const prevUserMessageCountRef = useRef(0);
  
  const latestAssistantMessage = useMemo(() => {
    return [...messages]
      .reverse()
      .find((msg) => msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0);
  }, [messages]);

  // Get the most recent recommendations for mobile bottom bar
  const topThreeRecommendations = useMemo(() => {
    const recommendations = latestAssistantMessage?.recommendations || [];
    return recommendations.slice(0, 3);
  }, [latestAssistantMessage]);

  const userConversationMessages = useMemo(
    () => messages.filter((msg) => msg.role === 'user'),
    [messages]
  );
  const lastUserMessage = userConversationMessages[userConversationMessages.length - 1];
  const hasAskedQuestion = userConversationMessages.length > 0;
  const latestRecommendations = latestAssistantMessage?.recommendations || [];

  const normalizeText = (text: string) =>
    text
      ? text
          .toLowerCase()
          .replace(/https?:\/\/\S+/g, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()
      : '';

  const removeDuplicateFinalSentence = (text: string): string => {
    if (!text) return text;
    const sentenceMatches = text.match(/[^.!?]+[.!?]/g);
    if (!sentenceMatches || sentenceMatches.length < 2) return text;
    const lastSentence = sentenceMatches[sentenceMatches.length - 1].trim();
    const prevSentence = sentenceMatches[sentenceMatches.length - 2].trim();
    if (lastSentence && prevSentence && lastSentence === prevSentence) {
      const lastIndex = text.lastIndexOf(sentenceMatches[sentenceMatches.length - 1]);
      return text.slice(0, lastIndex).trimEnd();
    }
    return text;
  };

  const normalizeMarkdownListItems = (text: string): string => {
    if (!text) return text;
    // Ensure each list item (starting with -) is on its own line
    // This handles cases where multiple list items might be on the same line
    let normalized = text;
    
    // Split text into lines
    const lines = normalized.split('\n');
    const processedLines: string[] = [];
    
    for (const line of lines) {
      // Check if line contains multiple list items (starts with "-" but has another "-" later that's also a list item)
      // Pattern: "- [Card](url) - desc - [Card](url) - desc"
      // We want to split on "- " that appears after a description and before another card link
      const listItemMatch = /-\s+\*\*\[([^\]]+)\]\([^)]+\)\*\*\s*-\s*/g;
      const matches = Array.from(line.matchAll(listItemMatch));
      
      if (matches.length > 1) {
        // Multiple list items on same line - split them
        let lastIndex = 0;
        matches.forEach((match, idx) => {
          if (idx === 0 && match.index! > 0) {
            // Add any text before the first list item
            processedLines.push(line.substring(0, match.index!));
          }
          
          // Find the end of this list item (start of next list item or end of line)
          const start = match.index!;
          const nextMatch = matches[idx + 1];
          const end = nextMatch ? nextMatch.index! : line.length;
          const listItem = line.substring(start, end).trim();
          
          if (listItem) {
            processedLines.push(listItem);
          }
          lastIndex = end;
        });
        
        // Add any remaining text after the last list item
        if (lastIndex < line.length) {
          const remaining = line.substring(lastIndex).trim();
          if (remaining) {
            processedLines.push(remaining);
          }
        }
      } else {
        processedLines.push(line);
      }
    }
    
    // Join and ensure double line breaks between list items for better separation
    normalized = processedLines.join('\n');
    
    // Ensure proper spacing: if a list item is followed by another list item, add a blank line
    normalized = normalized.replace(/(-\s+\*\*\[[^\]]+\]\([^)]+\)\*\*\s*-\s*[^\n]+)\n(?!\n)(-\s+\*\*\[)/g, '$1\n\n$2');
    
    return normalized;
  };

  const cleanUrlText = (text: string): string => {
    if (!text) return text;
    let cleaned = text;
    
    // Remove URL fragments that appear as plain text before ")** -"
    // Pattern: "com/credit-cards/savorone-student/)** -" or similar
    // This is the main issue - URL text appearing outside markdown links
    cleaned = cleaned.replace(/\s+(com\/[^\s\)]+|www\.[^\s\)]+|https?:\/\/[^\s\)]+)[^-\n]*?\)\*\*\s*-\s*/g, ' - ');
    
    // Remove URL fragments that appear after markdown links
    // Pattern: ")** com/..." or ")** www..." appearing after a markdown link
    cleaned = cleaned.replace(/\)\*\*\s+(com\/[^\s\)]+|www\.[^\s\)]+|https?:\/\/[^\s\)]+)[^-\n]*?\)\*\*\s*-\s*/g, ')** - ');
    
    // Remove URL fragments that appear after markdown link closing
    // Pattern: markdown link ending with )** followed by URL text and )**
    cleaned = cleaned.replace(/(\]\([^)]+\)\*\*)\s+(com\/[^\s\)]+|www\.[^\s\)]+|https?:\/\/[^\s\)]+)[^-\n]*?\)\*\*\s*-\s*/g, '$1 - ');
    
    // Remove any remaining URL-like text that appears before ")** -"
    cleaned = cleaned.replace(/([^\]])\s+(com\/[^\s\)]+|www\.[^\s\)]+|https?:\/\/[^\s\)]+)[^-\n]*?\)\*\*\s*-\s*/g, '$1 - ');
    
    return cleaned;
  };

  const removeDuplicateCardNames = (text: string, recommendations?: Recommendation[]): string => {
    if (!text) return text;
    let cleaned = text;
    
    // FIRST: Simple replacement - replace any sequence of 2+ asterisks with a space
    // This handles patterns like "CardName****CardName" -> "CardName CardName"
    cleaned = cleaned.replace(/\*{2,}/g, ' ');
    
    // Then remove duplicate card names that result from the replacement above
    // Remove patterns like "CardName CardName" -> "CardName"
    if (recommendations && recommendations.length > 0) {
      recommendations.forEach((rec) => {
        const cardName = rec.credit_card_name;
        const escapedCardName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Pattern: CardName CardName (with space between) followed by optional description
        const duplicateWithSpace = new RegExp(`(${escapedCardName})\\s+\\1(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
        cleaned = cleaned.replace(duplicateWithSpace, (match, p1, p2) => {
          const afterText = p2.trim();
          const result = afterText ? `${p1} ${afterText}` : p1;
          console.log(`[FRONTEND] Removed duplicate after asterisk replacement: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
          return result;
        });
      });
      
      // General pattern: Remove any duplicate text separated by space (for card names)
      cleaned = cleaned.replace(/([a-zA-Z0-9\s®™©]{3,50}?)\s+\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, p1, p2) => {
        const cardName = p1.trim();
        const afterText = p2.trim();
        if (cardName.length > 3 && cardName.length < 50) {
          const result = afterText ? `${cardName} ${afterText}` : cardName;
          console.log(`[FRONTEND GENERAL] Removed duplicate: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
          return result;
        }
        return match;
      });
    }
    
    // First, use recommendations to do direct string replacement for known card names
    // This is the most reliable approach
    if (recommendations && recommendations.length > 0) {
      recommendations.forEach((rec) => {
        const cardName = rec.credit_card_name;
        // Escape special regex characters in card name
        const escapedCardName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Pattern 1: Handle "**\n\ncardName\n\n**cardName" - markdown bold with newlines then duplicate
        const markdownNewlinePattern = new RegExp(`\\*\\*[\\s\\n]*(${escapedCardName})[\\s\\n]*\\*\\*\\s*\\1`, 'gi');
        cleaned = cleaned.replace(markdownNewlinePattern, `**$1**`);
        
        // Pattern 2: Handle "**cardName**cardName" (same line, no newlines)
        const markdownSameLinePattern = new RegExp(`\\*\\*(${escapedCardName})\\*\\*\\s*\\1`, 'gi');
        cleaned = cleaned.replace(markdownSameLinePattern, `**$1**`);
        
        // Pattern 3: Handle card name followed by same card name with newlines in between
        // This catches patterns like "cardName\n\ncardName" or "cardName\ncardName"
        const newlineDuplicatePattern = new RegExp(`(${escapedCardName})[\\s\\n]+\\1([\\s\\n]*)`, 'gi');
        cleaned = cleaned.replace(newlineDuplicatePattern, '$1$2');
        
        // Pattern 4: Handle card name on its own line appearing multiple times
        // Match: newline(s), cardName, newline(s), cardName
        const standaloneDuplicatePattern = new RegExp(`([\\s\\n]+)(${escapedCardName})([\\s\\n]+)\\2([\\s\\n]*)`, 'gi');
        cleaned = cleaned.replace(standaloneDuplicatePattern, '$1$2$3');
        
        // Pattern 4.5: PRIORITY - Handle card name with asterisks and same card name with text after (must run before Pattern 5)
        // This catches: "Huntington Cashback****Huntington Cashback - description" -> "Huntington Cashback - description"
        // Also catches: "- American Express Green Card****American Express Green Card - Ideal for travelers..."
        // Must run before Pattern 5 to preserve the description text
        const duplicateWithTextAfterPriority = new RegExp(`([-•]?\\s*)(${escapedCardName})\\*{2,}\\2(\\s*[-–—]?\\s*[^\\n]*)`, 'gi');
        cleaned = cleaned.replace(duplicateWithTextAfterPriority, (match, prefix, p1, p2) => {
          const afterText = p2.trim();
          const result = afterText ? `${prefix || ''}${p1} ${afterText}` : `${prefix || ''}${p1}`;
          console.log(`[FRONTEND CLEANING Pattern 4.5] Found: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
          return result;
        });
        
        // Pattern 5: Card name followed by asterisks followed by same card name (no text after)
        // Only match if there's no text after (end of line or newline)
        const duplicatePattern1 = new RegExp(`(${escapedCardName})\\*{2,}\\1(?=\\s*$|\\s*\\n|$)`, 'gi');
        cleaned = cleaned.replace(duplicatePattern1, '$1');
        
        // Pattern 6: Card name with optional whitespace around asterisks
        const duplicatePattern2 = new RegExp(`(${escapedCardName})\\s*\\*{2,}\\s*\\1`, 'gi');
        cleaned = cleaned.replace(duplicatePattern2, '$1');
        
        // Pattern 7: Card name with any number of asterisks (1 or more)
        const duplicatePattern3 = new RegExp(`(${escapedCardName})\\*+\\1`, 'gi');
        cleaned = cleaned.replace(duplicatePattern3, '$1');
        
        // Pattern 8: Remove duplicate card name that appears right after "**cardName**"
        // This handles: "**cardName**cardName" -> "**cardName**"
        const afterMarkdownPattern = new RegExp(`\\*\\*${escapedCardName}\\*\\*\\s*${escapedCardName}`, 'gi');
        cleaned = cleaned.replace(afterMarkdownPattern, `**${cardName}**`);
        
        // Pattern 8b: Remove duplicate card name after bold with dash/description
        // This handles: "**Card Name**Card Name - description" -> "**Card Name** - description"
        const afterMarkdownWithDash = new RegExp(`\\*\\*${escapedCardName}\\*\\*${escapedCardName}(\\s*[-–—]?\\s*)`, 'gi');
        cleaned = cleaned.replace(afterMarkdownWithDash, (match, p1) => {
          return `**${cardName}**${p1}`;
        });
        
        // Pattern 9: Remove standalone card name that appears after it was already in markdown
        // This handles: "**\n\ncardName\n\n**cardName\n\ncardName" -> keep only the one in markdown
        const standaloneAfterMarkdown = new RegExp(`\\*\\*[\\s\\n]*${escapedCardName}[\\s\\n]*\\*\\*[\\s\\n]*${escapedCardName}`, 'gi');
        cleaned = cleaned.replace(standaloneAfterMarkdown, `**${cardName}**`);
        
        // Pattern 10: Handle "**\n\ncardName\n\n**cardName ([Link]" - card name after markdown before link
        // This is a specific case for camelCase names like "cashRewards"
        const beforeLinkPattern = new RegExp(`\\*\\*[\\s\\n]*${escapedCardName}[\\s\\n]*\\*\\*\\s*${escapedCardName}\\s*\\(`, 'gi');
        cleaned = cleaned.replace(beforeLinkPattern, `**${cardName}** (`);
        
        // Pattern 11: Handle card name appearing multiple times in sequence with various separators
        // This catches: "cardName\n\ncardName" or "cardName cardName" or "cardName\ncardName"
        const sequentialDuplicate = new RegExp(`(${escapedCardName})([\\s\\n]+)\\1([\\s\\n]*[^\\w])`, 'gi');
        cleaned = cleaned.replace(sequentialDuplicate, '$1$3');
        
        // Pattern 12: Handle card name appearing right after itself with only whitespace/newlines/asterisks
        // This catches cases like "cashRewards\n\ncashRewards" or "cashRewards cashRewards"
        // But only if they're adjacent (not separated by other text)
        const adjacentDuplicate = new RegExp(`(${escapedCardName})([\\s\\n\\*]{1,20})\\1(?![\\w])`, 'gi');
        cleaned = cleaned.replace(adjacentDuplicate, '$1');
        
        // Pattern 13: Handle card name followed by asterisks and same card name with text after
        // This catches: "cashRewards****cashRewards - description" -> "cashRewards - description"
        // The key is matching the duplicate even when followed by additional text
        const duplicateWithTextAfter = new RegExp(`(${escapedCardName})\\*{2,}\\1(\\s*[-–—]?\\s*)`, 'gi');
        cleaned = cleaned.replace(duplicateWithTextAfter, '$1$2');
        
        // Pattern 14: More general - card name with asterisks and same name, keeping everything after
        // This is a catch-all for patterns like "cardName****cardName anything else"
        const duplicateKeepAfter = new RegExp(`(${escapedCardName})\\*{2,}\\1(\\s+)`, 'gi');
        cleaned = cleaned.replace(duplicateKeepAfter, '$1$2');
        
        // Pattern 15: Handle card name with 2+ asterisks and same card name, keeping everything after (more aggressive)
        // This catches: "Visa Signature® Flagship Rewards****Visa Signature® Flagship Rewards - description"
        // Works with any text after, including descriptions starting with dashes
        // Also handles list items: "- CardName****CardName - description"
        const duplicateWithAnyTextAfter = new RegExp(`([-•]?\\s*)(${escapedCardName})\\*{2,}\\2(\\s*[-–—]?\\s*.*?)(?=\\n|$)`, 'gi');
        cleaned = cleaned.replace(duplicateWithAnyTextAfter, (match, prefix, p1, p2) => {
          // prefix is optional bullet/dash, p1 is the card name, p2 is everything after (including dash and description)
          const afterText = p2.trim();
          const result = afterText ? `${prefix || ''}${p1} ${afterText}` : `${prefix || ''}${p1}`;
          console.log(`[FRONTEND CLEANING Pattern 15] Found: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
          return result;
        });
        
        // Pattern 15b: Final safety net - catch any remaining card name with asterisks followed by same name
        // Only match if there are 2+ asterisks (to avoid false positives with single asterisks)
        // This is a catch-all for any patterns that slipped through
        const duplicateCatchAll = new RegExp(`(${escapedCardName})\\*{2,}\\1(?!\\*)`, 'gi');
        cleaned = cleaned.replace(duplicateCatchAll, (match) => {
          console.log(`[FRONTEND CLEANING Pattern 15b] Removed remaining duplicate: "${match.substring(0, 100)}"`);
          return cardName;
        });
      });
    }
    
    // General catch-all pattern: Remove any card name followed by 2+ asterisks and the same name
    // This catches patterns that might not have been caught by the specific patterns above
    // Pattern: "Any text****Any text" where the text looks like a card name (3+ chars, alphanumeric + spaces)
    cleaned = cleaned.replace(/([a-zA-Z0-9\s®™©]{3,50}?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, p1, p2) => {
      const cardName = p1.trim();
      const afterText = p2.trim();
      // Only process if it looks like a card name (more than 3 characters, less than 50)
      if (cardName.length > 3 && cardName.length < 50) {
        const result = afterText ? `${cardName} ${afterText}` : cardName;
        console.log(`[FRONTEND CLEANING GENERAL] Found duplicate: "${match.substring(0, 100)}" -> "${result.substring(0, 100)}"`);
        return result;
      }
      return match;
    });
    
    // Final pass: Remove duplicate card names that appear on their own lines
    // This handles cases where a card name appears multiple times as standalone lines
    if (recommendations && recommendations.length > 0) {
      const textLines = cleaned.split('\n');
      const cardNameSet = new Set(recommendations.map(rec => rec.credit_card_name.toLowerCase()));
      const seenCardNames = new Set<string>();
      const processedLines = textLines.map((line, index) => {
        const trimmedLine = line.trim();
        // Check if this line is just a card name (case-insensitive)
        for (const cardName of cardNameSet) {
          if (trimmedLine.toLowerCase() === cardName.toLowerCase()) {
            // If we've seen this card name before and it's not part of markdown formatting
            if (seenCardNames.has(cardName)) {
              // Check if it's part of markdown (check surrounding lines)
              const prevLine = index > 0 ? textLines[index - 1].trim() : '';
              const nextLine = index < textLines.length - 1 ? textLines[index + 1].trim() : '';
              const isPartOfMarkdown = prevLine.includes('**') || nextLine.includes('**') || 
                                       prevLine.includes('[') || nextLine.includes('](');
              // If not part of markdown, remove this duplicate
              if (!isPartOfMarkdown) {
                return '';
              }
            } else {
              seenCardNames.add(cardName);
            }
            break;
          }
        }
        return line;
      });
      cleaned = processedLines.filter(line => line !== '').join('\n');
    }
    
    // Simple string-based approach: split by lines and check for duplicate patterns within lines
    const lines = cleaned.split('\n');
    const processedLines = lines.map(line => {
      // Check if line contains pattern like "text****text"
      // Split by 2+ asterisks and check if parts are the same
      const asteriskPattern = /\*{2,}/;
      if (asteriskPattern.test(line)) {
        const parts = line.split(/\*{2,}/);
        if (parts.length >= 2) {
          // Check if first two parts are the same (case-insensitive)
          for (let i = 0; i < parts.length - 1; i++) {
            if (parts[i].trim() === parts[i + 1].trim() && parts[i].trim().length > 0) {
              // Found duplicate, remove the second occurrence
              parts.splice(i + 1, 1);
              // Rejoin with asterisks removed
              return parts.join('');
            }
          }
        }
      }
      return line;
    });
    cleaned = processedLines.join('\n');
    
    // Then, handle general patterns for any duplicate text with asterisks
    // These patterns handle cases where the card name isn't in the recommendations list
    // Process line by line to avoid cross-line matches and handle duplicates properly
    
    // Pattern 0: PRIORITY - Aggressively catch "CardName****CardName - description" pattern first
    // This must run before other patterns to preserve descriptions
    // This handles: "Huntington Cashback****Huntington Cashback - description" -> "Huntington Cashback - description"
    cleaned = cleaned.split('\n').map(line => {
      // Match: any text (including spaces, special chars), 2+ asterisks, same text, then anything after
      // Use [^\*]+? to match any characters except asterisks (non-greedy)
      const aggressivePattern = /([^\*]+?)\*{2,}\1(\s*.*)$/gi;
      const result = line.replace(aggressivePattern, (match, p1, p2) => {
        const cardName = p1.trim();
        const afterText = p2.trim();
        // Always preserve the text after the duplicate
        return afterText ? `${cardName} ${afterText}` : cardName;
      });
      return result;
    }).join('\n');
    
    // Pattern 1: Match any sequence followed by 2+ asterisks and same sequence, keeping everything after on the same line
    // This handles: "cashRewards****cashRewards - description" -> "cashRewards - description"
    // Also handles card names with special characters: "Visa Signature® Flagship Rewards****Visa Signature® Flagship Rewards - description"
    // PRIORITY: This must run first to catch duplicates with text after
    cleaned = cleaned.split('\n').map(line => {
      // Match pattern: text****text (rest of line)
      // Capture the duplicate text and everything after it
      // Use [^\*]+ to match any characters except asterisks (handles spaces, special chars like ®)
      // Make it non-greedy and match the full line to catch all cases
      const result = line.replace(/([^\*]+?)\*{2,}\1(\s*.*)$/gi, (match, p1, p2) => {
        // p1 is the duplicate text, p2 is everything after (including spaces and dashes)
        const afterText = p2.trim();
        const trimmedP1 = p1.trim();
        // Always preserve the text after, just remove the duplicate and asterisks
        return afterText ? `${trimmedP1} ${afterText}` : trimmedP1;
      });
      return result;
    }).join('\n');
    
    // Pattern 2: Match any word characters followed by 2+ asterisks and same word (standalone, no text after)
    cleaned = cleaned.replace(/(\w+)\*{2,}\1(?=\s*$|\s*\n|\s*\[|\s*\(|$)/gi, '$1');
    
    // Pattern 3: Match text with spaces, quotes, hyphens, special chars (more complex card names) - process line by line
    // This handles card names with special characters like ®, ™, ©, spaces, etc.
    cleaned = cleaned.split('\n').map(line => {
      // Match any sequence of characters (including spaces, special chars) followed by 2+ asterisks and same sequence
      return line.replace(/([A-Za-z0-9\s"\-_®™©]+)\*{2,}\1(\s*.*)$/gi, (match, p1, p2) => {
        const afterText = p2.trim();
        const trimmedP1 = p1.trim();
        return afterText ? trimmedP1 + (afterText.startsWith('-') || afterText.startsWith('–') || afterText.startsWith('—') ? ' ' + afterText : ' ' + afterText) : trimmedP1;
      });
    }).join('\n');
    
    // Pattern 4: Handle whitespace around asterisks - process line by line
    // This pattern is more permissive and handles card names with any characters including special chars
    cleaned = cleaned.split('\n').map(line => {
      // Match any non-asterisk characters (including special chars, spaces) followed by 2+ asterisks and same sequence
      return line.replace(/([^\n\r\*]+?)\s*\*{2,}\s*\1(\s*.*)$/g, (match, p1, p2) => {
        const afterText = p2.trim();
        const trimmedP1 = p1.trim();
        return afterText ? trimmedP1 + (afterText.startsWith('-') || afterText.startsWith('–') || afterText.startsWith('—') ? ' ' + afterText : ' ' + afterText) : trimmedP1;
      });
    }).join('\n');
    
    // Pattern 5: Handle "**Card Name**Card Name - description" pattern (card name after bold markdown)
    // This catches cases where card name appears in bold, then immediately again without separator
    cleaned = cleaned.split('\n').map(line => {
      // Match: **text**text (with optional dash/description after)
      return line.replace(/\*\*([^*]+?)\*\*\1(\s*[-–—]?\s*.*?)$/gi, (match, p1, p2) => {
        // p1 is the card name, p2 is everything after (dash, description, etc.)
        const afterText = p2.trim();
        const trimmedCardName = p1.trim();
        // If there's text after, keep it; otherwise just return the bold card name
        return afterText ? `**${trimmedCardName}**${afterText.startsWith('-') || afterText.startsWith('–') || afterText.startsWith('—') ? ' ' + afterText : ' ' + afterText}` : `**${trimmedCardName}**`;
      });
    }).join('\n');
    
    // Pattern 6: Handle "**Card Name**Card Name" without description (standalone duplicate)
    cleaned = cleaned.replace(/\*\*([^*]+?)\*\*\1(?=\s*$|\s*\n|\s*\[|\s*\(|$)/gi, '**$1**');
    
    // Also handle cases with markdown links: "Card Name**[Card Name](url)"
    cleaned = cleaned.replace(/([^\n\*\[\]]+?)\*+\[([^\]]+)\]\([^\)]+\)/g, (match, p1, p2) => {
      if (p1.trim() === p2.trim()) {
        return `[${p2}]`;
      }
      return match;
    });
    
    // Handle reverse pattern: "[Card Name](url)**Card Name"
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)\*+([^\n\*\[\]]+?)/g, (match, p1, p2) => {
      if (p1.trim() === p2.trim()) {
        return `[${p1}]`;
      }
      return match;
    });
    
    // Final pass: Detect and remove duplicate card listings in the same response
    // This handles cases where the same card appears multiple times as separate listings
    if (recommendations && recommendations.length > 0) {
      const lines = cleaned.split('\n');
      const seenCardNames = new Map<string, number>(); // Track card name and its first occurrence line index
      
      // Create a map of normalized card names to their original names for matching
      const cardNameMap = new Map<string, string>();
      recommendations.forEach(rec => {
        const normalized = rec.credit_card_name.toLowerCase().replace(/[®™©]/g, '').trim();
        cardNameMap.set(normalized, rec.credit_card_name);
      });
      
      const processedLines = lines.map((line, index) => {
        const trimmedLine = line.trim();
        const lineLower = trimmedLine.toLowerCase();
        
        // Check if this line looks like a card listing
        const isCardListing = /^[-•*]\s*/.test(trimmedLine) || 
                             /^\*\*/.test(trimmedLine) || 
                             /^\[/.test(trimmedLine) ||
                             (index > 0 && lines[index - 1].trim() === ''); // Previous line was blank
        
        if (!isCardListing) {
          return line;
        }
        
        // Check if this line contains any of the card names
        for (const [normalizedCardName, originalCardName] of cardNameMap.entries()) {
          // Simple check: does the line contain the card name (case-insensitive, ignoring special chars)
          const cardNameInLine = lineLower.includes(normalizedCardName);
          
          if (cardNameInLine) {
            if (seenCardNames.has(normalizedCardName)) {
              // This card has been seen before - remove this duplicate listing
              // Keep the first occurrence to maintain order and completeness
              return '';
            } else {
              // First time seeing this card name
              seenCardNames.set(normalizedCardName, index);
            }
            break; // Found a match, no need to check other card names
          }
        }
        
        return line;
      });
      
      cleaned = processedLines.filter(line => line.trim() !== '').join('\n');
    }
    
    return cleaned;
  };

  const removeColonPeriod = (text: string, recommendations?: Recommendation[]): string => {
    if (!text) return text;
    let cleaned = text;
    
    // Remove periods that immediately follow colons (e.g., "top options to consider:." -> "top options to consider:")
    // Handles both ":." and ": ." (with optional whitespace)
    cleaned = cleaned.replace(/:\s*\./g, ':');
    
    // Remove colon-hyphen patterns (e.g., ": -" or ":-") and replace with colon + first card name on new line
    if (recommendations && recommendations.length > 0) {
      const firstCard = recommendations[0];
      const firstCardName = firstCard.credit_card_name;
      const firstCardUrl = firstCard.apply_url || '';
      // Replace ": -" or ":-" (with optional whitespace) with ":" followed by newline and first card name as markdown link
      cleaned = cleaned.replace(/:\s*-\s*/g, `:\n- **[${firstCardName}](${firstCardUrl})**`);
    } else {
      // If no recommendations, just remove the hyphen
      cleaned = cleaned.replace(/:\s*-\s*/g, ':');
    }
    
    return cleaned;
  };

  const replaceColonWithHyphen = (text: string, recommendations?: Recommendation[]): string => {
    if (!text) return text;
    let cleaned = text;
    
    // Replace colons with hyphens after credit card names
    // This handles patterns like "Card Name: $200..." -> "Card Name - $200..."
    if (recommendations && recommendations.length > 0) {
      recommendations.forEach((rec) => {
        const cardName = rec.credit_card_name;
        // Escape special regex characters in card name
        const escapedCardName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Pattern 1: Plain card name followed by colon (e.g., "Card Name: $200...")
        // Match card name, optional whitespace, colon, optional whitespace, then text (usually starting with $ or number)
        const plainPattern = new RegExp(`(${escapedCardName})\\s*:\\s+`, 'gi');
        cleaned = cleaned.replace(plainPattern, '$1 - ');
        
        // Pattern 2: Card name in markdown bold followed by colon (e.g., "**Card Name**: $200...")
        const boldPattern = new RegExp(`(\\*\\*${escapedCardName}\\*\\*)\\s*:\\s+`, 'gi');
        cleaned = cleaned.replace(boldPattern, '$1 - ');
        
        // Pattern 3: Card name in markdown link followed by colon (e.g., "[Card Name](url): $200...")
        const linkPattern = new RegExp(`(\\[${escapedCardName}\\]\\([^)]+\\))\\s*:\\s+`, 'gi');
        cleaned = cleaned.replace(linkPattern, '$1 - ');
        
        // Pattern 4: Card name in markdown bold link followed by colon (e.g., "**[Card Name](url)**: $200...")
        const boldLinkPattern = new RegExp(`(\\*\\*\\[${escapedCardName}\\]\\([^)]+\\)\\*\\*)\\s*:\\s+`, 'gi');
        cleaned = cleaned.replace(boldLinkPattern, '$1 - ');
      });
    }
    
    return cleaned;
  };

  // Ensure each card name appears only once in the entire text
  // Only removes lines that are clearly card listings (list items, markdown links, etc.)
  const ensureSingleCardNameOccurrence = (text: string, recommendations?: Recommendation[]): string => {
    if (!text || !recommendations || recommendations.length === 0) return text;
    
    const lines = text.split('\n');
    const seenCardNames = new Map<string, number>(); // Track first occurrence line index for each card
    const cardNameMap = new Map<string, string>(); // Normalized -> Original card name
    
    // Build map of normalized card names
    recommendations.forEach(rec => {
      const normalized = rec.credit_card_name.toLowerCase().replace(/[®™©]/g, '').trim();
      cardNameMap.set(normalized, rec.credit_card_name);
    });
    
    const processedLines = lines.map((line, index) => {
      const trimmedLine = line.trim();
      const lineLower = trimmedLine.toLowerCase();
      
      // Only process lines that look like card listings:
      // - Start with list marker (-, •, *)
      // - Start with markdown link [Card Name]
      // - Start with markdown bold **Card Name**
      // - Are standalone lines (previous line was blank)
      const isCardListing = /^[-•*]\s*/.test(trimmedLine) || 
                           /^\[/.test(trimmedLine) || 
                           /^\*\*/.test(trimmedLine) ||
                           (index > 0 && lines[index - 1].trim() === '');
      
      if (!isCardListing) {
        return line; // Keep non-listing lines as-is
      }
      
      // Check if this line contains any card name
      for (const [normalizedCardName, originalCardName] of cardNameMap.entries()) {
        // Escape special regex characters
        const escapedCardName = originalCardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Check if line contains the card name (case-insensitive)
        const cardNameRegex = new RegExp(escapedCardName.replace(/[®™©]/g, '[®™©]?'), 'i');
        
        if (cardNameRegex.test(trimmedLine)) {
          if (seenCardNames.has(normalizedCardName)) {
            // This card has already appeared - remove this duplicate listing
            return '';
          } else {
            // First occurrence - keep it and mark as seen
            seenCardNames.set(normalizedCardName, index);
            return line;
          }
        }
      }
      
      return line;
    });
    
    // Filter out empty lines and rejoin
    return processedLines.filter(line => line.trim() !== '').join('\n');
  };

  const getRecommendationHighlight = (rec: Recommendation) => {
    const highlight =
      rec.reason ||
      rec.perks ||
      rec.rewards_rate ||
      'Premium rewards without the hassle.';
    return highlight.length > 110 ? `${highlight.slice(0, 107)}...` : highlight;
  };

  const getDerivedRating = (index: number) => {
    const baseRatings = [4.8, 4.6, 4.5];
    const rating = baseRatings[index] ?? Math.max(4.2, 4.5 - index * 0.1);
    return rating.toFixed(1);
  };

  const recentConversationSummary = useMemo(() => {
    const plainSummary = latestAssistantMessage?.summary
      ?.replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/[*_`#>-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!plainSummary) return '';

    const extractedSentences = plainSummary.split(/(?<=[.!?])\s+/).filter(Boolean);
    const sentences: string[] = extractedSentences.slice(0, Math.min(4, extractedSentences.length));

    if (sentences.length === 0) {
      sentences.push(plainSummary);
    }

    if (sentences.length < 2 && latestRecommendations.length > 0) {
      const cardNames = latestRecommendations.slice(0, 3).map((rec) => rec.credit_card_name);
      const cardsSentence =
        cardNames.length === 1
          ? `${cardNames[0]} is the featured recommendation.`
          : `Featured cards include ${cardNames.slice(0, -1).join(', ')} and ${cardNames.slice(-1)}.`;
      sentences.push(cardsSentence);
    }

    return sentences.slice(0, 4).join(' ');
  }, [latestAssistantMessage, latestRecommendations]);

  const recommendedSectionSummary = useMemo(() => {
    if (!lastUserMessage || latestRecommendations.length === 0) return null;

    const questionFocus = lastUserMessage.content.trim().replace(/\s+/g, ' ');
    const cards = latestRecommendations.slice(0, 3);
    const highlight = (rec: Recommendation) => getRecommendationHighlight(rec).toLowerCase();
    const link = (rec: Recommendation) => (
      <a
        href={rec.apply_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary font-semibold underline decoration-2 decoration-primary/30 hover:decoration-primary"
      >
        {rec.credit_card_name}
      </a>
    );

    if (cards.length === 1) {
      return (
        <>
          For your question about {questionFocus}, {link(cards[0])} stands out for {highlight(cards[0])}.
        </>
      );
    }

    if (cards.length === 2) {
      return (
        <>
          To address your question about {questionFocus}, consider {link(cards[0])} for {highlight(cards[0])}, while{' '}
          {link(cards[1])} shines for {highlight(cards[1])}.
        </>
      );
    }

    return (
      <>
        Based on your question about {questionFocus}, {link(cards[0])} offers {highlight(cards[0])}, {link(cards[1])} excels at{' '}
        {highlight(cards[1])}, and {link(cards[2])} rounds things out with {highlight(cards[2])}.
      </>
    );
  }, [lastUserMessage, latestRecommendations]);

  const extractBenefits = (rec: Recommendation) => {
    const benefits: string[] = [];

    if (rec.rewards_rate && !rec.rewards_rate.toLowerCase().includes('apr')) {
      benefits.push(rec.rewards_rate);
    }

    if (rec.perks) {
      const perkList = rec.perks
        .split(/[.,;]/)
        .map((p) => p.trim())
        .filter((p) => p.length > 10 && p.length < 100);
      benefits.push(...perkList);
    }

    if (rec.reason && benefits.length < 4) {
      const reasonBenefits = rec.reason
        .split(/[.,;]/)
        .map((r) => r.trim())
        .filter((r) => {
          const lower = r.toLowerCase();
          return (
            r.length > 15 &&
            r.length < 100 &&
            !lower.includes('annual fee') &&
            !lower.includes('credit score') &&
            (lower.includes('points') ||
              lower.includes('cash back') ||
              lower.includes('rewards') ||
              lower.includes('travel') ||
              lower.includes('perk') ||
              lower.includes('benefit'))
          );
        });
      benefits.push(...reasonBenefits);
    }

    return benefits.slice(0, 4);
  };
  
  // Keep ref in sync with state
  useEffect(() => {
    shownCartoonsRef.current = shownCartoons;
  }, [shownCartoons]);

  // Detect mobile and desktop screen size
  useEffect(() => {
    const checkScreenSize = () => {
      const width = typeof window !== 'undefined' ? window.innerWidth : 0;
      setIsMobile(width < 1024);
      setIsDesktop(width >= 1024);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Prevent scrolling too far past bottom of page on desktop (initial load only)
  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (!isDesktop || messages.length > 0) return;

    const getMetricsBottom = () => {
      const metricsSection = document.getElementById('metrics-section');
      if (!metricsSection) return 0;
      const rect = metricsSection.getBoundingClientRect();
      return rect.bottom + window.scrollY;
    };

    const handleScroll = () => {
      const metricsBottom = getMetricsBottom();
      if (metricsBottom === 0) return;

      const currentScroll = window.scrollY || document.documentElement.scrollTop;
      const maxScroll = metricsBottom + 50; // Allow only 50px of scroll past bottom

      // If user tries to scroll too far past the bottom, prevent it
      if (currentScroll > maxScroll) {
        window.scrollTo({
          top: maxScroll,
          behavior: 'auto'
        });
      }
    };

    // Also handle wheel events to prevent scrolling down too far
    const handleWheel = (e: WheelEvent) => {
      const metricsBottom = getMetricsBottom();
      if (metricsBottom === 0) return;

      const currentScroll = window.scrollY || document.documentElement.scrollTop;
      const maxScroll = metricsBottom + 50; // Allow only 50px of scroll past bottom

      // If scrolling down and already at or near the limit, prevent it
      if (e.deltaY > 0 && currentScroll >= maxScroll - 10) {
        e.preventDefault();
        e.stopPropagation();
        window.scrollTo({
          top: maxScroll,
          behavior: 'auto'
        });
      }
    };

    // Handle touch events for trackpads (desktop only - don't interfere with mobile scrolling)
    const handleTouchMove = (e: TouchEvent) => {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      if (!isDesktop) return; // Don't interfere with mobile touch scrolling
      
      const metricsBottom = getMetricsBottom();
      if (metricsBottom === 0) return;

      const currentScroll = window.scrollY || document.documentElement.scrollTop;
      const maxScroll = metricsBottom + 50;

      if (currentScroll >= maxScroll) {
        e.preventDefault();
      }
    };

    // Set initial max scroll position
    const setMaxScroll = () => {
      const metricsBottom = getMetricsBottom();
      if (metricsBottom === 0) return;

      const currentScroll = window.scrollY || document.documentElement.scrollTop;
      const maxScroll = metricsBottom + 50;

      if (currentScroll > maxScroll) {
        window.scrollTo({
          top: maxScroll,
          behavior: 'auto'
        });
      }
    };

    // Run after a short delay to ensure DOM is ready
    setTimeout(setMaxScroll, 100);

    // Only add these listeners on desktop
    if (isDesktop) {
      window.addEventListener('scroll', handleScroll, { passive: false });
      window.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
    }

    return () => {
      if (isDesktop) {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('wheel', handleWheel);
        window.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, [messages.length]); // Re-run when messages change

  // Track chatbot container visibility for mobile
  useEffect(() => {
    if (!isMobile) {
      setIsChatbotVisible(true);
      return;
    }

    // Wait for the element to be available
    if (!chatbotContainerRef.current) {
      // If messages exist but container isn't ready yet, set a timeout to check again
      const timer = setTimeout(() => {
        if (chatbotContainerRef.current) {
          setIsChatbotVisible(true);
        }
      }, 100);
      return () => clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsChatbotVisible(entry.isIntersecting);
        });
      },
      {
        threshold: 0.05, // Trigger when 5% of the element is visible
        rootMargin: '0px 0px -20% 0px', // Trigger when bottom 20% of viewport is reached
      }
    );

    observer.observe(chatbotContainerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isMobile, messages]);
  
  // Track manual scrolling in left box
  useEffect(() => {
    const leftBox = chatContainerRef.current;
    if (!leftBox) return;

    const handleScroll = () => {
      // Check if user has scrolled away from the top (where most recent question is)
      // Allow a small threshold (50px) to account for rounding
      if (leftBox.scrollTop > 50) {
        // User has scrolled down from top, mark as manually scrolled
        userHasScrolledLeftRef.current = true;
      }
    };

    leftBox.addEventListener('scroll', handleScroll);
    return () => leftBox.removeEventListener('scroll', handleScroll);
  }, []);

  // Set initial scroll position to top when chat container first loads (desktop only)
  // Only when there are no messages or a single message
  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (!isDesktop) return; // Only run on desktop
    
    // Don't scroll if input is focused
    const isInputFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
    if (isInputFocused) return;
    
    const userMessages = messages.filter((msg) => msg.role === 'user');
    const userMessageCount = userMessages.length;
    
    // Only set scroll to top if there are no messages or only one message
    // For multiple messages, the scroll-to-latest logic will handle it
    if (userMessageCount <= 1) {
      const setScrollToTop = () => {
        // Check again if input is focused before scrolling
        const stillFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
        if (stillFocused) return;
        
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = 0;
        }
      };
      
      // Set scroll to top when container becomes available
      if (chatContainerRef.current) {
        // Set immediately
        setScrollToTop();
        
        // Use requestAnimationFrame for reliable timing
        requestAnimationFrame(() => {
          setScrollToTop();
          requestAnimationFrame(() => {
            setScrollToTop();
          });
        });
        
        // Also set after delays to ensure it sticks after DOM updates
        const timeout1 = setTimeout(setScrollToTop, 0);
        const timeout2 = setTimeout(setScrollToTop, 10);
        const timeout3 = setTimeout(setScrollToTop, 50);
        const timeout4 = setTimeout(setScrollToTop, 100);
        const timeout5 = setTimeout(setScrollToTop, 200);
        const timeout6 = setTimeout(setScrollToTop, 500);
        
        return () => {
          clearTimeout(timeout1);
          clearTimeout(timeout2);
          clearTimeout(timeout3);
          clearTimeout(timeout4);
          clearTimeout(timeout5);
          clearTimeout(timeout6);
        };
      }
    }
  }, [messages.length, messages]); // Run whenever messages change or container becomes available

  // Handle carousel scroll on mobile
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft;
      const cardWidth = 280; // Fixed card width
      const gap = 12; // gap-3 = 12px
      const newIndex = Math.round(scrollLeft / (cardWidth + gap));
      setCarouselIndex(Math.min(newIndex, SUGGESTED_QUESTIONS.length - 1));
    };

    carousel.addEventListener('scroll', handleScroll);
    return () => carousel.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle dynamic suggestions carousel scroll
  useEffect(() => {
    const carousel = suggestionsCarouselRef.current;
    if (!carousel) return;

    let rafId: number | null = null;
    let isScrolling = false;

    const updateScrollState = () => {
      const scrollLeft = carousel.scrollLeft;
      // Mobile card width is 200px, desktop is 280px
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      const cardWidth = isMobile ? 200 : 280;
      const gap = 12; // gap-3 = 12px
      const cardSpacing = cardWidth + gap;
      const newIndex = Math.round(scrollLeft / cardSpacing);
      setSuggestionsCarouselIndex(Math.min(newIndex, dynamicSuggestions.length - 1));
      
      // Calculate scroll progress for smooth bar movement (0 to 1)
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      let progress = 0;
      
      if (maxScroll > 0) {
        progress = scrollLeft / maxScroll;
        // Ensure progress reaches exactly 1.0 when scrolled all the way to the right
        // Use a generous threshold (10px) to account for rounding, pixel snapping, touch scrolling, and browser differences
        if (scrollLeft >= maxScroll - 10) {
          progress = 1.0;
        }
        // Also check if we're at or past the absolute maximum
        if (scrollLeft >= maxScroll) {
          progress = 1.0;
        }
        // Additional check: if we're very close (within 1% of max), set to 1.0
        if (maxScroll > 0 && scrollLeft / maxScroll >= 0.99) {
          progress = 1.0;
        }
      } else if (scrollLeft > 0 || carousel.scrollLeft >= carousel.scrollWidth - carousel.clientWidth - 1) {
        // If maxScroll is 0 or negative but we have scroll, or we're at the end, we're at the end
        progress = 1.0;
      }
      
      // Clamp and set progress - ensure it can reach 1.0
      const finalProgress = Math.max(0, Math.min(progress, 1.0));
      setSuggestionsCarouselScrollProgress(finalProgress);
      
      isScrolling = false;
      rafId = null;
    };

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        rafId = requestAnimationFrame(updateScrollState);
      }
    };

    carousel.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      carousel.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [dynamicSuggestions.length]);

  // Handle popular questions carousel scroll (mobile and desktop)
  useEffect(() => {
    const carousel = popularQuestionsCarouselRef.current;
    if (!carousel) return;

    let rafId: number | null = null;
    let isScrolling = false;

    const updateScrollState = () => {
      const scrollLeft = carousel.scrollLeft;
      // Card width is 280px for both mobile and desktop
      const cardWidth = 280;
      const gap = 12; // gap-3 = 12px
      const cardSpacing = cardWidth + gap;
      // Use Math.floor to ensure we snap to the leftmost visible card
      // Add a small offset (half the card spacing) to determine which card is most centered
      const newIndex = Math.floor((scrollLeft + cardSpacing / 2) / cardSpacing);
      // Clamp the index to valid range
      const clampedIndex = Math.max(0, Math.min(newIndex, SUGGESTED_QUESTIONS.length - 1));
      setPopularQuestionsCarouselIndex(clampedIndex);
      
      // Calculate scroll progress for smooth bar movement (0 to 1)
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      let progress = 0;
      
      if (maxScroll > 0) {
        progress = scrollLeft / maxScroll;
        // Ensure progress reaches exactly 1.0 when scrolled all the way to the right
        // Use a generous threshold (10px) to account for rounding, pixel snapping, touch scrolling, and browser differences
        if (scrollLeft >= maxScroll - 10) {
          progress = 1.0;
        }
        // Also check if we're at or past the absolute maximum
        if (scrollLeft >= maxScroll) {
          progress = 1.0;
        }
        // Additional check: if we're very close (within 1% of max), set to 1.0
        if (maxScroll > 0 && scrollLeft / maxScroll >= 0.99) {
          progress = 1.0;
        }
      } else if (scrollLeft > 0 || carousel.scrollLeft >= carousel.scrollWidth - carousel.clientWidth - 1) {
        // If maxScroll is 0 or negative but we have scroll, or we're at the end, we're at the end
        progress = 1.0;
      }
      
      // Clamp and set progress - ensure it can reach 1.0
      const finalProgress = Math.max(0, Math.min(progress, 1.0));
      setPopularQuestionsCarouselScrollProgress(finalProgress);
      
      isScrolling = false;
      rafId = null;
    };

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        rafId = requestAnimationFrame(updateScrollState);
      }
    };

    carousel.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      carousel.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  // Enable horizontal mouse wheel scrolling, drag-to-scroll, and hide scrollbar for suggestions carousel
  useEffect(() => {
    const carousel = suggestionsCarouselRef.current;
    if (!carousel) return;

    // Set a unique ID for the carousel if it doesn't have one
    if (!carousel.id) {
      carousel.id = 'suggestions-carousel';
    }

    const updateScrollbar = () => {
      // Check if style element already exists
      let styleElement = document.getElementById('suggestions-carousel-scrollbar-style');
      
      // Hide scrollbar on both mobile and desktop
      carousel.style.scrollbarWidth = 'none';
      carousel.style.setProperty('-ms-overflow-style', 'none', 'important');
      
      // For webkit browsers, hide scrollbar
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'suggestions-carousel-scrollbar-style';
        styleElement.textContent = `
          #suggestions-carousel::-webkit-scrollbar {
            display: none !important;
          }
        `;
        document.head.appendChild(styleElement);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Only handle on desktop
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      if (!isDesktop) return;

      // If there's horizontal delta (trackpad horizontal scroll), allow native scrolling
      if (Math.abs(e.deltaX) > 0) {
        // Native horizontal scrolling - don't prevent default
        return;
      }
      
      // If vertical scroll, convert to horizontal
      if (Math.abs(e.deltaY) > 0 && Math.abs(e.deltaX) === 0) {
        e.preventDefault();
        carousel.scrollLeft += e.deltaY;
      }
    };

    // Drag-to-scroll functionality for desktop
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasDragged = false;

    const handleDragStart = (e: DragEvent) => {
      // Prevent default drag behavior for images and links
      if (isDown) {
        e.preventDefault();
        return false;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      if (!isDesktop) return;
      
      // Don't start drag if clicking on carousel indicators
      const target = e.target as HTMLElement;
      if (target.closest('[aria-label*="slide"]')) {
        return;
      }

      // Allow dragging even when clicking on suggestion buttons
      // The button click handler will prevent clicks if we detect a drag
      isDown = true;
      hasDragged = false;
      carousel.style.cursor = 'grabbing';
      carousel.style.userSelect = 'none';
      // Track starting mouse X position and current scroll position
      startX = e.clientX;
      scrollLeft = carousel.scrollLeft;
      
      // Prevent default to avoid text selection and image dragging
      // Don't stop propagation - let it bubble so buttons can still detect it
      e.preventDefault();
    };

    const handleMouseLeave = () => {
      if (isDown) {
        isDown = false;
        hasDragged = false;
        carousel.style.cursor = 'grab';
        carousel.style.userSelect = '';
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDown) {
        // If we dragged, prevent button click
        if (hasDragged) {
          e.preventDefault();
          e.stopPropagation();
          suggestionsCarouselHasDraggedRef.current = true;
        }
        // Reset drag tracking after a short delay to allow click handler to check
        setTimeout(() => {
          suggestionsCarouselHasDraggedRef.current = false;
        }, 100);
        isDown = false;
        hasDragged = false;
        carousel.style.cursor = 'grab';
        carousel.style.userSelect = '';
      }
    };

    const handleDocumentMouseUp = (e: MouseEvent) => {
      if (isDown) {
        // If we dragged, prevent button click
        if (hasDragged) {
          e.preventDefault();
          e.stopPropagation();
          suggestionsCarouselHasDraggedRef.current = true;
        }
        // Reset drag tracking after a short delay to allow click handler to check
        setTimeout(() => {
          suggestionsCarouselHasDraggedRef.current = false;
        }, 100);
        isDown = false;
        hasDragged = false;
        carousel.style.cursor = 'grab';
        carousel.style.userSelect = '';
      }
    };

    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      
      // Calculate distance moved
      const currentX = e.clientX;
      const deltaX = currentX - startX;
      
      // Always prevent default drag behavior and text selection when dragging
      e.preventDefault();
      
      // Scroll the carousel immediately: moving mouse right scrolls content right, moving mouse left scrolls content left
      // User wants: drag right reveals right content (scrollLeft increases), drag left reveals left content (scrollLeft decreases)
      // Formula: scrollLeft = initialScrollLeft + deltaX
      // This makes: drag right (positive deltaX) increases scrollLeft (shows right content)
      const newScrollLeft = scrollLeft + deltaX;
      
      // Ensure we don't scroll beyond bounds
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      carousel.scrollLeft = Math.max(0, Math.min(newScrollLeft, maxScroll));
      
      // Only consider it a drag if moved more than 3px (for click prevention)
      if (Math.abs(deltaX) > 3) {
        hasDragged = true;
        // Mark that we've dragged, so button clicks won't fire
        suggestionsCarouselHasDraggedRef.current = true;
      }
    };

    updateScrollbar();
    carousel.style.cursor = 'grab';
    carousel.addEventListener('wheel', handleWheel, { passive: false });
    carousel.addEventListener('dragstart', handleDragStart);
    // Use capture phase to catch mousedown even on buttons inside
    // Also add without capture as fallback to ensure it works
    carousel.addEventListener('mousedown', handleMouseDown, { capture: true });
    carousel.addEventListener('mousedown', handleMouseDown);
    carousel.addEventListener('mouseleave', handleMouseLeave);
    carousel.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseup', handleDocumentMouseUp);
    document.addEventListener('mousemove', handleDocumentMouseMove);
    window.addEventListener('resize', updateScrollbar);

    return () => {
      carousel.removeEventListener('wheel', handleWheel);
      carousel.removeEventListener('dragstart', handleDragStart);
      carousel.removeEventListener('mousedown', handleMouseDown, { capture: true });
      carousel.removeEventListener('mousedown', handleMouseDown);
      carousel.removeEventListener('mouseleave', handleMouseLeave);
      carousel.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      window.removeEventListener('resize', updateScrollbar);
      const styleElement = document.getElementById('suggestions-carousel-scrollbar-style');
      if (styleElement) {
        styleElement.remove();
      }
    };
  }, [dynamicSuggestions.length]);

  // Handle dragging indicator buttons for desktop carousel
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      if (!isDesktop) return;

      const target = e.target as HTMLElement;
      // Check if clicking on an indicator button
      const indicatorButton = target.closest('[data-indicator-button]');
      
      if (indicatorButton && popularQuestionsCarouselRef.current) {
        isDraggingIndicatorRef.current = true;
        hasDraggedIndicatorRef.current = false;
        dragStartXRef.current = e.pageX;
        dragStartScrollLeftRef.current = popularQuestionsCarouselRef.current.scrollLeft;
        e.preventDefault(); // Prevent text selection
        e.stopPropagation(); // Prevent carousel drag from interfering
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      if (!isDesktop || !isDraggingIndicatorRef.current) return;
      
      const carousel = popularQuestionsCarouselRef.current;
      if (!carousel) {
        isDraggingIndicatorRef.current = false;
        return;
      }
      
      e.preventDefault(); // Prevent default behavior while dragging
      const deltaX = e.pageX - dragStartXRef.current;
      
      // Only start dragging if moved more than 3px (to distinguish from clicks)
      if (Math.abs(deltaX) > 3) {
        hasDraggedIndicatorRef.current = true;
        // Scale factor: 1px of mouse movement = 2px of scroll
        const scrollDistance = deltaX * 2;
        
        const newScrollLeft = dragStartScrollLeftRef.current - scrollDistance;
        const maxScroll = carousel.scrollWidth - carousel.clientWidth;
        carousel.scrollLeft = Math.max(0, Math.min(newScrollLeft, maxScroll));
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDraggingIndicatorRef.current) {
        // Reset after a short delay to allow click handler to check
        setTimeout(() => {
          hasDraggedIndicatorRef.current = false;
        }, 100);
        isDraggingIndicatorRef.current = false;
      }
    };

    document.addEventListener('mousedown', handleMouseDown, { passive: false, capture: true });
    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Unified edge scrolling system for popular questions carousel (desktop)
  // Handles hover, drag, and wheel interactions with continuous edge scrolling
  useEffect(() => {
    const carousel = popularQuestionsCarouselRef.current;
    if (!carousel) return;

    // Set a unique ID for the carousel if it doesn't have one
    if (!carousel.id) {
      carousel.id = 'popular-questions-carousel';
    }

    const updateScrollbar = () => {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      
      // Check if style element already exists
      let styleElement = document.getElementById('popular-questions-carousel-scrollbar-style');
      
      if (isDesktop) {
        // Hide scrollbar on desktop (keep pagination dots)
        carousel.style.scrollbarWidth = 'none';
        carousel.style.setProperty('-ms-overflow-style', 'none', 'important');
        
        // For webkit browsers, hide scrollbar
        if (!styleElement) {
          styleElement = document.createElement('style');
          styleElement.id = 'popular-questions-carousel-scrollbar-style';
          styleElement.textContent = `
            #popular-questions-carousel::-webkit-scrollbar {
              display: none !important;
            }
          `;
          document.head.appendChild(styleElement);
        } else {
          // Update existing style
          styleElement.textContent = `
            #popular-questions-carousel::-webkit-scrollbar {
              display: none !important;
            }
          `;
        }
      } else {
        // Hide scrollbar on mobile
        carousel.style.scrollbarWidth = 'none';
        carousel.style.setProperty('-ms-overflow-style', 'none', 'important');
        
        // For webkit browsers, hide scrollbar
        if (!styleElement) {
          styleElement = document.createElement('style');
          styleElement.id = 'popular-questions-carousel-scrollbar-style';
          styleElement.textContent = `
            #popular-questions-carousel::-webkit-scrollbar {
              display: none !important;
            }
          `;
          document.head.appendChild(styleElement);
        } else {
          styleElement.textContent = `
            #popular-questions-carousel::-webkit-scrollbar {
              display: none !important;
            }
          `;
        }
      }
    };

    // ===== Unified Edge Scrolling System =====
    // This system provides continuous scrolling when at edges during any interaction type (hover, drag, wheel).
    // 
    // Key behaviors:
    // 1. When user reaches left/right edge and continues interacting in that direction, carousel keeps scrolling smoothly
    // 2. Works for hover (edge zones), drag (mouse drag), and wheel (scroll wheel/trackpad)
    // 3. Respects scroll snap - cards still land cleanly on snap points
    // 4. Returns to bounds smoothly when interaction stops (not during active scrolling)
    // 5. Preserves click vs drag detection - clicks still navigate, drags don't trigger navigation
    
    const EDGE_THRESHOLD = 5; // Pixels from edge to consider "at edge"
    const MAX_OVERSCROLL = 200; // Maximum pixels to allow beyond bounds for smooth feel
    const CONTINUOUS_SCROLL_SPEED = 3; // Pixels per frame for continuous scroll animation
    const EDGE_ZONE_WIDTH = 100; // Width of edge zones (left/right) for hover detection

    // State for continuous edge scrolling
    let continuousScrollAnimationFrame: number | null = null;
    let continuousScrollDirection: 'left' | 'right' | null = null;
    let isContinuousScrolling = false;
    let returnToBoundsTimeout: number | null = null;
    let isDragging = false;
    let isWheeling = false;
    let lastWheelTime = 0;
    const WHEEL_IDLE_TIME = 150; // ms after last wheel event before considering wheel interaction stopped

    // Detect edge state
    const getEdgeState = () => {
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      const currentScroll = carousel.scrollLeft;
      const isAtStart = currentScroll <= EDGE_THRESHOLD;
      const isAtEnd = currentScroll >= maxScroll - EDGE_THRESHOLD;
      return { isAtStart, isAtEnd, maxScroll, currentScroll };
    };

    // Start continuous scrolling in a direction
    const startContinuousScroll = (direction: 'left' | 'right') => {
      if (continuousScrollDirection === direction && isContinuousScrolling) {
        return; // Already scrolling in this direction
      }

      // Cancel any pending return to bounds
      if (returnToBoundsTimeout !== null) {
        clearTimeout(returnToBoundsTimeout);
        returnToBoundsTimeout = null;
      }

      continuousScrollDirection = direction;
      isContinuousScrolling = true;

      if (continuousScrollAnimationFrame === null) {
        const continuousScroll = () => {
          if (!isContinuousScrolling || !continuousScrollDirection) {
            isContinuousScrolling = false;
            if (continuousScrollAnimationFrame !== null) {
              cancelAnimationFrame(continuousScrollAnimationFrame);
              continuousScrollAnimationFrame = null;
            }
            return;
          }

          const { maxScroll, currentScroll } = getEdgeState();

          if (continuousScrollDirection === 'left') {
            // Scroll left (showing earlier items)
            carousel.scrollLeft = Math.max(-MAX_OVERSCROLL, currentScroll - CONTINUOUS_SCROLL_SPEED);
          } else if (continuousScrollDirection === 'right') {
            // Scroll right (showing later items)
            carousel.scrollLeft = Math.min(maxScroll + MAX_OVERSCROLL, currentScroll + CONTINUOUS_SCROLL_SPEED);
          }

          continuousScrollAnimationFrame = requestAnimationFrame(continuousScroll);
        };

        continuousScrollAnimationFrame = requestAnimationFrame(continuousScroll);
      }
    };

    // Stop continuous scrolling
    const stopContinuousScroll = (immediateReturnToBounds = false) => {
      isContinuousScrolling = false;
      continuousScrollDirection = null;

      if (continuousScrollAnimationFrame !== null) {
        cancelAnimationFrame(continuousScrollAnimationFrame);
        continuousScrollAnimationFrame = null;
      }

      // Return to bounds after a delay (unless immediate)
      if (immediateReturnToBounds) {
        returnToBounds();
      } else {
        // Delay return to bounds to allow smooth transition
        if (returnToBoundsTimeout !== null) {
          clearTimeout(returnToBoundsTimeout);
        }
        returnToBoundsTimeout = window.setTimeout(() => {
          returnToBounds();
        }, 300);
      }
    };

    // Smoothly return carousel to bounds if overscrolled
    const returnToBounds = () => {
      const { maxScroll, currentScroll } = getEdgeState();
      
      if (currentScroll < 0) {
        carousel.scrollTo({ left: 0, behavior: 'smooth' });
      } else if (currentScroll > maxScroll) {
        carousel.scrollTo({ left: maxScroll, behavior: 'smooth' });
      }
    };

    // Check if interaction should trigger continuous scroll
    const checkAndTriggerContinuousScroll = (direction: 'left' | 'right' | null, interactionType: 'hover' | 'drag' | 'wheel') => {
      if (!direction) {
        // If no direction or not at edge, stop continuous scroll
        if (interactionType === 'hover') {
          stopContinuousScroll();
        }
        return;
      }

      const { isAtStart, isAtEnd } = getEdgeState();

      // Only start continuous scroll if at the corresponding edge
      if (direction === 'left' && isAtStart) {
        startContinuousScroll('left');
      } else if (direction === 'right' && isAtEnd) {
        startContinuousScroll('right');
      } else if (interactionType === 'hover') {
        // For hover, stop if not at edge
        stopContinuousScroll();
      }
    };

    // ===== Wheel Handler =====
    const handleWheel = (e: WheelEvent) => {
      // Only handle on desktop
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      if (!isDesktop) return;

      isWheeling = true;
      lastWheelTime = Date.now();

      // Clear wheel idle timeout
      if (returnToBoundsTimeout !== null) {
        clearTimeout(returnToBoundsTimeout);
        returnToBoundsTimeout = null;
      }

      // Determine scroll direction
      let scrollDirection: 'left' | 'right' | null = null;
      let delta = 0;

      if (Math.abs(e.deltaX) > 0) {
        // Horizontal scroll
        delta = e.deltaX;
        scrollDirection = delta < 0 ? 'left' : 'right';
      } else if (Math.abs(e.deltaY) > 0) {
        // Vertical scroll converted to horizontal
        delta = e.deltaY;
        scrollDirection = delta < 0 ? 'left' : 'right';
      }

      const { isAtStart, isAtEnd, maxScroll, currentScroll } = getEdgeState();

      // If at edge and scrolling in that direction, allow overscroll and trigger continuous scroll
      if (scrollDirection === 'left' && isAtStart) {
        e.preventDefault();
        const newScroll = Math.max(-MAX_OVERSCROLL, currentScroll + delta);
        carousel.scrollLeft = newScroll;
        startContinuousScroll('left');
      } else if (scrollDirection === 'right' && isAtEnd) {
        e.preventDefault();
        const newScroll = Math.min(maxScroll + MAX_OVERSCROLL, currentScroll + delta);
        carousel.scrollLeft = newScroll;
        startContinuousScroll('right');
      } else if (scrollDirection) {
        // Normal scrolling - apply scroll and stop continuous scroll
        e.preventDefault();
        if (Math.abs(e.deltaX) > 0) {
          carousel.scrollLeft = Math.max(0, Math.min(maxScroll, currentScroll + e.deltaX));
        } else {
          carousel.scrollLeft = Math.max(0, Math.min(maxScroll, currentScroll + e.deltaY));
        }
        stopContinuousScroll();
      }

      // Set timeout to detect when wheel interaction stops
      setTimeout(() => {
        if (Date.now() - lastWheelTime >= WHEEL_IDLE_TIME) {
          isWheeling = false;
          if (!isDragging) {
            stopContinuousScroll();
          }
        }
      }, WHEEL_IDLE_TIME);
    };

    // ===== Drag Handler =====
    let isDown = false;
    let startX = 0;
    let initialScrollLeft = 0;
    let hasDragged = false;

    const handleDragStart = (e: DragEvent) => {
      if (isDown) {
        e.preventDefault();
        return false;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      if (!isDesktop) return;
      
      const target = e.target as HTMLElement;
      if (target.closest('[aria-label*="slide"]') || 
          target.closest('[data-indicator-button]') ||
          target.hasAttribute('data-indicator-button') ||
          target.closest('button[aria-label="Previous slide"]') ||
          target.closest('button[aria-label="Next slide"]') ||
          target.closest('svg')?.parentElement?.closest('button[aria-label*="slide"]')) {
        return;
      }

      isDown = true;
      isDragging = false;
      hasDragged = false;
      carousel.style.cursor = 'grabbing';
      carousel.style.userSelect = 'none';
      startX = e.clientX;
      initialScrollLeft = carousel.scrollLeft;
      
      e.preventDefault();
      
      if (target.closest('button') && !target.closest('[aria-label*="slide"]') && !target.closest('[data-indicator-button]')) {
        carouselButtonHasDraggedRef.current = false;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDown) {
        if (hasDragged) {
          e.preventDefault();
          e.stopPropagation();
          carouselButtonMouseDownRef.current = null;
          carouselButtonHasDraggedRef.current = true;
        }
        isDown = false;
        isDragging = false;
        hasDragged = false;
        carousel.style.cursor = 'grab';
        carousel.style.userSelect = '';
        stopContinuousScroll(true);
      }
    };

    const handleDocumentMouseUp = (e: MouseEvent) => {
      if (isDown) {
        if (hasDragged) {
          e.preventDefault();
          e.stopPropagation();
          carouselButtonMouseDownRef.current = null;
          carouselButtonHasDraggedRef.current = true;
        }
        isDown = false;
        isDragging = false;
        hasDragged = false;
        carousel.style.cursor = 'grab';
        carousel.style.userSelect = '';
        stopContinuousScroll(true);
      }
    };

    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      
      const currentX = e.clientX;
      const deltaX = currentX - startX;
      
      if (Math.abs(deltaX) > 3) {
        hasDragged = true;
        isDragging = true;
        carouselButtonHasDraggedRef.current = true;
      }
      
      e.preventDefault();
      
      const newScrollLeft = initialScrollLeft + deltaX;
      const { isAtStart, isAtEnd, maxScroll } = getEdgeState();
      
      // Determine drag direction
      const dragDirection: 'left' | 'right' | null = deltaX < 0 ? 'left' : (deltaX > 0 ? 'right' : null);
      
      // Apply scroll with overscroll at edges
      if (isAtStart && dragDirection === 'left') {
        carousel.scrollLeft = Math.max(-MAX_OVERSCROLL, newScrollLeft);
        startContinuousScroll('left');
      } else if (isAtEnd && dragDirection === 'right') {
        carousel.scrollLeft = Math.min(maxScroll + MAX_OVERSCROLL, newScrollLeft);
        startContinuousScroll('right');
      } else {
        carousel.scrollLeft = Math.max(0, Math.min(newScrollLeft, maxScroll));
        stopContinuousScroll();
      }
    };

    // ===== Hover Edge Detection =====
    const handleCarouselMouseMove = (e: MouseEvent) => {
      if (isDown || isWheeling) return; // Don't interfere with drag or wheel

      const rect = carousel.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const carouselWidth = rect.width;
      
      const inLeftZone = mouseX >= 0 && mouseX <= EDGE_ZONE_WIDTH;
      const inRightZone = mouseX >= carouselWidth - EDGE_ZONE_WIDTH && mouseX <= carouselWidth;

      const hoverDirection: 'left' | 'right' | null = inLeftZone ? 'left' : (inRightZone ? 'right' : null);
      checkAndTriggerContinuousScroll(hoverDirection, 'hover');
    };

    const handleCarouselMouseLeave = () => {
      if (isDown) {
        // Handle drag ending
        isDown = false;
        isDragging = false;
        hasDragged = false;
        carousel.style.cursor = 'grab';
        carousel.style.userSelect = '';
        stopContinuousScroll(true);
      } else if (!isWheeling) {
        // Handle hover ending
        stopContinuousScroll();
      }
    };

    // ===== Setup =====
    updateScrollbar();
    carousel.style.cursor = 'grab';
    carousel.addEventListener('wheel', handleWheel, { passive: false });
    carousel.addEventListener('dragstart', handleDragStart);
    carousel.addEventListener('mousedown', handleMouseDown, { capture: true });
    carousel.addEventListener('mouseleave', handleCarouselMouseLeave);
    carousel.addEventListener('mouseup', handleMouseUp);
    carousel.addEventListener('mousemove', handleCarouselMouseMove, { passive: true });
    document.addEventListener('mouseup', handleDocumentMouseUp);
    document.addEventListener('mousemove', handleDocumentMouseMove);
    window.addEventListener('resize', updateScrollbar);

    return () => {
      // Cleanup
      if (continuousScrollAnimationFrame !== null) {
        cancelAnimationFrame(continuousScrollAnimationFrame);
      }
      if (returnToBoundsTimeout !== null) {
        clearTimeout(returnToBoundsTimeout);
      }
      carousel.removeEventListener('wheel', handleWheel);
      carousel.removeEventListener('dragstart', handleDragStart);
      carousel.removeEventListener('mousedown', handleMouseDown, { capture: true });
      carousel.removeEventListener('mouseleave', handleCarouselMouseLeave);
      carousel.removeEventListener('mouseup', handleMouseUp);
      carousel.removeEventListener('mousemove', handleCarouselMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      window.removeEventListener('resize', updateScrollbar);
      const styleElement = document.getElementById('popular-questions-carousel-scrollbar-style');
      if (styleElement) {
        styleElement.remove();
      }
    };
  }, []);


  // Document-level mouse tracking for carousel button click-vs-drag detection
  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!carouselButtonMouseDownRef.current) return;
      const deltaX = Math.abs(e.clientX - carouselButtonMouseDownRef.current.x);
      const deltaY = Math.abs(e.clientY - carouselButtonMouseDownRef.current.y);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      // If moved more than 8px, consider it a drag
      if (distance > 8) {
        carouselButtonHasDraggedRef.current = true;
      }
    };

    const handleDocumentMouseUp = () => {
      // Reset tracking on document mouseup (in case mouse left button area)
      // The click handler will still check, but this ensures cleanup
      if (carouselButtonMouseDownRef.current) {
        // Small delay to allow click handler to run first
        setTimeout(() => {
          carouselButtonMouseDownRef.current = null;
          carouselButtonHasDraggedRef.current = false;
        }, 100);
      }
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, []);

  // Center the mobile carousel on initial load
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    if (!isMobile) return;

    // Only center once on initial load - use a flag to prevent multiple centers
    let hasCentered = false;
    
    const centerCarousel = () => {
      if (hasCentered) return;
      if (carousel.scrollWidth > carousel.clientWidth && carousel.scrollLeft === 0) {
        // Temporarily disable smooth scrolling to set position instantly
        const originalScrollBehavior = carousel.style.scrollBehavior;
        carousel.style.scrollBehavior = 'auto';
        
        const centerScroll = (carousel.scrollWidth - carousel.clientWidth) / 2;
        // Set scrollLeft directly for instant positioning (no animation)
        carousel.scrollLeft = centerScroll;
        hasCentered = true;
        
        // Immediately update the carousel index to center position
        const cardWidth = 280;
        const gap = 12;
        const centerIndex = Math.round(centerScroll / (cardWidth + gap));
        setCarouselIndex(Math.min(centerIndex, SUGGESTED_QUESTIONS.length - 1));
        
        // Restore smooth scrolling after positioning
        requestAnimationFrame(() => {
          carousel.style.scrollBehavior = originalScrollBehavior || '';
        });
      }
    };

    // Wait a bit to ensure carousel is fully rendered and other useEffects are set up
    const timeoutId = setTimeout(() => {
      centerCarousel();
      // Double-check with requestAnimationFrame
      requestAnimationFrame(centerCarousel);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  // Center the desktop carousel on initial load (runs after other useEffects)
  useEffect(() => {
    const carousel = popularQuestionsCarouselRef.current;
    if (!carousel) return;

    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (!isDesktop) return;

    // Only center once on initial load - use a flag to prevent multiple centers
    let hasCentered = false;
    
    const centerCarousel = () => {
      if (hasCentered) return;
      if (carousel.scrollWidth > carousel.clientWidth && carousel.scrollLeft === 0) {
        // Temporarily disable smooth scrolling to set position instantly
        const originalScrollBehavior = carousel.style.scrollBehavior;
        carousel.style.scrollBehavior = 'auto';
        
        const centerScroll = (carousel.scrollWidth - carousel.clientWidth) / 2;
        // Set scrollLeft directly for instant positioning (no animation)
        carousel.scrollLeft = centerScroll;
        hasCentered = true;
        
        // Immediately update the carousel index to center position
        const cardWidth = 280;
        const gap = 12;
        const centerIndex = Math.round(centerScroll / (cardWidth + gap));
        setPopularQuestionsCarouselIndex(Math.min(centerIndex, SUGGESTED_QUESTIONS.length - 1));
        
        // Restore smooth scrolling after positioning
        requestAnimationFrame(() => {
          carousel.style.scrollBehavior = originalScrollBehavior || '';
        });
      }
    };

    // Wait a bit to ensure carousel is fully rendered and other useEffects are set up
    const timeoutId = setTimeout(() => {
      centerCarousel();
      // Double-check with requestAnimationFrame
      requestAnimationFrame(centerCarousel);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    // Find the most recent assistant message with recommendations
    const mostRecentAssistantMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0);
    
    const currentRecommendations = mostRecentAssistantMessage?.recommendations || [];
    
    // Check if recommendations have changed
    const hasChanged = JSON.stringify(currentRecommendations) !== JSON.stringify(prevRecommendationsRef.current);
    
    // Check if a new question was asked (message count increased and last message is user)
    const currentMessageCount = messages.length;
    const lastMessage = messages[messages.length - 1];
    const isNewQuestion = currentMessageCount > prevMessageCountRef.current && lastMessage && lastMessage.role === 'user';
    
    if (isNewQuestion) {
      // Reset left box scroll tracking - allow auto-scroll
      userHasScrolledLeftRef.current = false;
      // Collapse any expanded credit card info boxes (mobile + desktop) when a new question starts
      setOpenCardBoxes(new Set());
      setExpandedRecommendations(new Set());
      setDesktopExpandedRecommendations(new Set());
      // Note: Left box scrolling is handled in the separate useEffect below
      prevMessageCountRef.current = currentMessageCount;
    }
    
    if (hasChanged && currentRecommendations.length > 0) {
      prevRecommendationsRef.current = currentRecommendations;
      // Reset collapsible boxes: all closed by default
      setOpenCardBoxes(new Set([]));
      setDesktopExpandedRecommendations(new Set());
    } else if (currentRecommendations.length === 0) {
      prevRecommendationsRef.current = [];
    }
  }, [messages]);

  // Scroll desktop chatbot to show most recent question at top
  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (!isDesktop || !desktopChatbotRef.current || !hasAskedQuestion) return;
    
    const userMessages = messages.filter((msg) => msg.role === 'user');
    const currentUserMessageCount = userMessages.length;
    const isNewQuestion = currentUserMessageCount > prevUserMessageCountRef.current;
    
    if (isNewQuestion && desktopChatbotRef.current) {
      // Wait for DOM to update
      setTimeout(() => {
        if (!desktopChatbotRef.current) return;
        
        const container = desktopChatbotRef.current;
        
        // First, scroll the page to bring the chatbot section into view
        const containerRect = container.getBoundingClientRect();
        const containerTop = containerRect.top + window.scrollY;
        const offset = 100; // Offset from top of viewport
        
        // Scroll page to chatbot section
        window.scrollTo({
          top: containerTop - offset,
          behavior: 'smooth'
        });
        
        // Then scroll within the chatbot container to show most recent question at top
        setTimeout(() => {
          if (!desktopChatbotRef.current) return;
          
          const innerDiv = container.querySelector('div[style*="direction: ltr"]') as HTMLElement;
          if (!innerDiv) return;
          
          const messageElements = innerDiv.querySelectorAll('[data-message-index]');
          
          if (messageElements.length > 0) {
            // Get the most recent message (last in the list)
            const lastMessageElement = messageElements[messageElements.length - 1] as HTMLElement;
            
            if (lastMessageElement) {
              // Calculate position relative to the scrollable container
              const elementTop = lastMessageElement.getBoundingClientRect().top;
              const containerTop = container.getBoundingClientRect().top;
              const elementTopRelativeToContainer = elementTop - containerTop;
              const currentScrollTop = container.scrollTop;
              
              // Scroll to position the most recent question at the top (with small padding)
              const targetScrollTop = currentScrollTop + elementTopRelativeToContainer - 20;
              
              container.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: 'smooth'
              });
            }
          }
        }, 300); // Wait for page scroll to complete
      }, 150);
    }
  }, [messages, hasAskedQuestion]);

  // Measure chatbot content height and adjust container size dynamically
  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (!isDesktop || !desktopChatbotRef.current || !hasAskedQuestion) {
      setIsChatbotContentSmall(true);
      setChatbotContainerHeight(null);
      setChatbotNeedsScrolling(false);
      return;
    }

    const measureContent = () => {
      if (!desktopChatbotRef.current) return;
      
      const container = desktopChatbotRef.current;
      const innerDiv = container.querySelector('div[style*="direction: ltr"]') as HTMLElement;
      
      if (!innerDiv) return;
      
      // Measure the actual content height (scrollHeight)
      const contentHeight = innerDiv.scrollHeight;
      // Threshold: if content is less than 400px, consider it small
      const threshold = 400;
      setIsChatbotContentSmall(contentHeight < threshold);
      
      // Dynamic container sizing:
      // - If content is less than 600px, set container height to match content exactly
      // - If content is 600px or more, set container height to 600px and enable scrolling
      const maxHeight = 600;
      let dynamicHeight: number;
      
      if (contentHeight < maxHeight) {
        // Content doesn't fill container - set height to match content
        dynamicHeight = contentHeight;
      } else {
        // Content fills or exceeds container - keep at max height
        dynamicHeight = maxHeight;
      }
      
      setChatbotContainerHeight(dynamicHeight);
      
      // Enable scrolling only if content actually exceeds the container height
      setChatbotNeedsScrolling(contentHeight > dynamicHeight);
    };

    // Measure immediately
    measureContent();

    // Also measure after a short delay to account for any animations/rendering
    const timeoutId = setTimeout(measureContent, 100);
    
    // Use ResizeObserver to watch for content changes
    const innerDiv = desktopChatbotRef.current.querySelector('div[style*="direction: ltr"]') as HTMLElement;
    if (innerDiv) {
      const resizeObserver = new ResizeObserver(() => {
        measureContent();
      });
      resizeObserver.observe(innerDiv);
      
      return () => {
        clearTimeout(timeoutId);
        resizeObserver.disconnect();
      };
    }
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [messages, hasAskedQuestion, isLoading]);

  useEffect(() => {
    // Scroll the left box - show most recent question (both mobile and desktop)
    // Only auto-scroll if user hasn't manually scrolled and input is not focused
    const isInputFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    
    // Don't scroll if input is focused on desktop
    if (chatContainerRef.current && !userHasScrolledLeftRef.current && !(isDesktop && isInputFocused)) {
      const userMessages = messages.filter((msg) => msg.role === 'user');
      const currentUserMessageCount = userMessages.length;
      const isNewQuestion = currentUserMessageCount > prevUserMessageCountRef.current;
      
      const scrollToLatest = (useSmooth: boolean = true) => {
        if (!chatContainerRef.current) return;
        
        const container = chatContainerRef.current;
        
        if (currentUserMessageCount > 0) {
          if (isDesktop && currentUserMessageCount > 1) {
            // On desktop with multiple questions, scroll down to show the most recent question
            const lastUserMessageIndex = currentUserMessageCount - 1;
            const messageElements = container.querySelectorAll('[data-message-index]');
            
            const lastMessageElement = Array.from(messageElements).find((el) => {
              const index = parseInt(el.getAttribute('data-message-index') || '-1');
              return index === lastUserMessageIndex;
            });
            
            if (lastMessageElement) {
              // Scroll to ensure the most recent question is visible
              // Calculate the position needed to show the most recent question
              const containerRect = container.getBoundingClientRect();
              const elementRect = lastMessageElement.getBoundingClientRect();
              const elementTopRelativeToContainer = elementRect.top - containerRect.top;
              const currentScrollTop = container.scrollTop;
              
              // Always scroll to show the most recent question (position it near the top)
              const targetScrollTop = currentScrollTop + elementTopRelativeToContainer;
              container.scrollTo({
                top: targetScrollTop,
                behavior: useSmooth ? 'smooth' : 'auto'
              });
            }
          } else {
            // For mobile or single question, scroll to position the most recent question at the top
            const lastUserMessageIndex = currentUserMessageCount - 1;
            const messageElements = container.querySelectorAll('[data-message-index]');
            
            const lastMessageElement = Array.from(messageElements).find((el) => {
              const index = parseInt(el.getAttribute('data-message-index') || '-1');
              return index === lastUserMessageIndex;
            });
            
            if (lastMessageElement) {
              if (isDesktop) {
                // Desktop: scroll within container
                const containerRect = container.getBoundingClientRect();
                const elementRect = lastMessageElement.getBoundingClientRect();
                const elementTopRelativeToContainer = elementRect.top - containerRect.top;
                const currentScrollTop = container.scrollTop;
                const targetScrollTop = currentScrollTop + elementTopRelativeToContainer;
                
                container.scrollTo({
                  top: targetScrollTop,
                  behavior: useSmooth ? 'smooth' : 'auto'
                });
              } else {
                // Mobile: scroll the window to position the most recent question at the top of the screen
                const elementRect = lastMessageElement.getBoundingClientRect();
                const elementTop = elementRect.top + window.scrollY;
                const offset = 20; // Small offset from top
                
                window.scrollTo({
                  top: elementTop - offset,
                  behavior: useSmooth ? 'smooth' : 'auto'
                });
              }
            }
          }
        }
      };
      
      // For new questions, use smooth scrolling. For initial load or updates, use instant scroll
      if (isNewQuestion) {
        // Try multiple times to ensure DOM is fully updated (especially for summaries)
        const timeout1 = setTimeout(() => scrollToLatest(true), 100);
        const timeout2 = setTimeout(() => scrollToLatest(true), 300);
        const timeout3 = setTimeout(() => scrollToLatest(true), 500);
        
        return () => {
          clearTimeout(timeout1);
          clearTimeout(timeout2);
          clearTimeout(timeout3);
        };
      } else {
        // Instant scroll for initial load or when summaries are added
        scrollToLatest(false);
      }
    }
    
    // Update the ref to track the current count
    const userMessages = messages.filter((msg) => msg.role === 'user');
    const currentUserMessageCount = userMessages.length;
    if (currentUserMessageCount > prevUserMessageCountRef.current) {
      prevUserMessageCountRef.current = currentUserMessageCount;
      // Reset scroll tracking when a new question is asked
      userHasScrolledLeftRef.current = false;
    } else if (currentUserMessageCount === 0) {
      prevUserMessageCountRef.current = 0;
    }
  }, [messages]);

  // Hide scrollbar on desktop when there are no user messages
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    
    const hasUserMessages = messages.some(msg => msg.role === 'user');
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    
    if (isDesktop) {
      if (!hasUserMessages) {
        // Explicitly hide scrollbar when no user messages
        container.style.overflow = 'hidden';
        container.style.scrollbarWidth = 'none';
        // For webkit and IE/Edge browsers
        container.style.setProperty('-ms-overflow-style', 'none', 'important');
      } else {
        // Allow scrolling when user messages exist - let className handle it
        container.style.overflow = '';
        container.style.scrollbarWidth = '';
        container.style.removeProperty('-ms-overflow-style');
      }
    }
  }, [messages]);

  // Fetch a cartoon on initial page load (only once)
  useEffect(() => {
    if (hasInitialCartoonRef.current) return; // Already fetched initial cartoon

    const fetchCartoon = async (retryCount = 0) => {
      try {
        // Get current shown cartoons from ref (always has latest value)
        const currentShown = shownCartoonsRef.current;

        // Detect device type
        const isMobile = window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const deviceType = isMobile ? 'mobile' : 'desktop';

        console.log(`[Cartoon] Detected device type: ${deviceType} (width: ${window.innerWidth}px, attempt ${retryCount + 1})`);
        console.log(`[Cartoon] Loading from folder: ${deviceType === 'mobile' ? 'mobile' : 'desktop'}`);

        // Build query parameter with shown cartoons and device type
        // On retry, clear shown cartoons to get ANY cartoon
        const shownParam = (currentShown.length > 0 && retryCount === 0)
          ? `&shown=${encodeURIComponent(JSON.stringify(currentShown))}`
          : '';

        const apiUrl = `/api/cartoon?t=${Date.now()}&device=${deviceType}${shownParam}`;
        console.log(`[Cartoon] Fetching from API: ${apiUrl}`);

        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.imageUrl) {
          console.log(`[Cartoon] Successfully loaded cartoon from: ${data.imageUrl}`);
          console.log(`[Cartoon] Source: ${data.source || 'unknown'}`);
        } else {
          console.warn('[Cartoon] No imageUrl in response:', data);
        }

        if (data.imageUrl) {
          // Always set the cartoon, even if it was shown before
          // Better to show a repeated cartoon than no cartoon at all
          setCurrentCartoon({ imageUrl: data.imageUrl, source: data.source });
          hasInitialCartoonRef.current = true; // Mark as fetched

          // Add to shown cartoons using functional update
          setShownCartoons(prev => {
            if (!prev.includes(data.imageUrl)) {
              return [...prev, data.imageUrl];
            }
            return prev;
          });
          console.log('[Cartoon] Initial cartoon set successfully');
        } else {
          // No imageUrl - retry up to 3 times
          if (retryCount < 3) {
            console.warn(`[Cartoon] No imageUrl, retrying... (attempt ${retryCount + 1}/3)`);
            setTimeout(() => fetchCartoon(retryCount + 1), 1000 * (retryCount + 1));
          } else {
            console.error('[Cartoon] Failed to load initial cartoon after 3 retries');
            hasInitialCartoonRef.current = true; // Mark as attempted to avoid infinite retry
          }
        }
      } catch (error) {
        console.error('[Cartoon] Error fetching initial cartoon:', error);
        // Retry on error up to 3 times
        if (retryCount < 3) {
          console.warn(`[Cartoon] Error occurred, retrying... (attempt ${retryCount + 1}/3)`);
          setTimeout(() => fetchCartoon(retryCount + 1), 1000 * (retryCount + 1));
        } else {
          console.error('[Cartoon] Failed to load initial cartoon after 3 retries due to errors');
          hasInitialCartoonRef.current = true; // Mark as attempted even on error
        }
      }
    };

    // Fetch cartoon on initial load
    fetchCartoon();
  }, []); // Empty dependency array - only run on mount

  // Fetch a new cartoon when loading starts (only when transitioning from false to true, and after initial load)
  useEffect(() => {
    // Only fetch if:
    // 1. isLoading is true
    // 2. It transitioned from false to true (not just staying true)
    // 3. We've already done the initial fetch
    if (isLoading && !prevIsLoadingRef.current && hasInitialCartoonRef.current) {
      // DON'T clear the current cartoon - keep it visible until new one loads
      // This ensures there's always a cartoon on desktop

      const fetchCartoon = async (retryCount = 0) => {
        try {
          // Get current shown cartoons from ref (always has latest value)
          const currentShown = shownCartoonsRef.current;

          // Detect device type
          const isMobile = window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          const deviceType = isMobile ? 'mobile' : 'desktop';

          console.log(`[Cartoon] Loading new cartoon - Device: ${deviceType} (width: ${window.innerWidth}px, attempt ${retryCount + 1})`);
          console.log(`[Cartoon] Loading from folder: ${deviceType === 'mobile' ? 'mobile' : 'desktop'}`);

          // Build query parameter with shown cartoons and device type
          // On retry, clear shown cartoons to get ANY cartoon
          const shownParam = (currentShown.length > 0 && retryCount === 0)
            ? `&shown=${encodeURIComponent(JSON.stringify(currentShown))}`
            : '';

          const apiUrl = `/api/cartoon?t=${Date.now()}&device=${deviceType}${shownParam}`;
          console.log(`[Cartoon] Fetching from API: ${apiUrl}`);

          const response = await fetch(apiUrl);
          const data = await response.json();

          if (data.imageUrl) {
            console.log(`[Cartoon] Successfully loaded new cartoon from: ${data.imageUrl}`);
            console.log(`[Cartoon] Source: ${data.source || 'unknown'}`);
          } else {
            console.warn('[Cartoon] No imageUrl in response:', data);
          }

          if (data.imageUrl) {
            // Always set the new cartoon, even if shown before
            // Better to show a repeated cartoon than no cartoon or an old one
            setCurrentCartoon({ imageUrl: data.imageUrl, source: data.source });

            // Add to shown cartoons
            setShownCartoons(prev => {
              if (!prev.includes(data.imageUrl)) {
                return [...prev, data.imageUrl];
              }
              return prev;
            });
            console.log('[Cartoon] New cartoon set successfully');
          } else {
            // No imageUrl - retry up to 2 times
            if (retryCount < 2) {
              console.warn(`[Cartoon] No new cartoon available, retrying... (attempt ${retryCount + 1}/2)`);
              setTimeout(() => fetchCartoon(retryCount + 1), 1000);
            } else {
              console.warn('[Cartoon] No new cartoon available after retries, keeping current cartoon visible');
            }
          }
        } catch (error) {
          console.error('[Cartoon] Error fetching new cartoon:', error);
          // Retry on error up to 2 times
          if (retryCount < 2) {
            console.warn(`[Cartoon] Error occurred, retrying... (attempt ${retryCount + 1}/2)`);
            setTimeout(() => fetchCartoon(retryCount + 1), 1000);
          } else {
            console.log('[Cartoon] Keeping current cartoon due to persistent fetch errors');
          }
        }
      };
      fetchCartoon();
    }
    
    // Update the previous loading state
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]); // Only depend on isLoading, use ref for shownCartoons

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMessage },
    ];
    setMessages(newMessages);

    try {
      // Prepare conversation history (exclude recommendations from assistant messages)
      const conversationHistory = newMessages
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      // Find the most recent assistant message with recommendations (previous cards shown)
      const mostRecentAssistantMessage = [...messages]
        .reverse()
        .find((msg) => msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0);
      const previousRecommendations = mostRecentAssistantMessage?.recommendations || [];

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: userMessage,
          conversationHistory: conversationHistory,
          previousRecommendations: previousRecommendations,
        }),
      });

      const data = await response.json();
      
      // Check if the response contains an error
      if (!response.ok || data.error) {
        const errorMessage = data.error || 'Failed to get recommendations';
        const errorDetails = data.details ? `\n\n${data.details}` : '';
        const fullError = `${errorMessage}${errorDetails}`;
        console.error('API Error:', { error: errorMessage, details: data.details, status: response.status });
        throw new Error(fullError);
      }
      
      const hasValidRecommendations = data.recommendations && Array.isArray(data.recommendations) && data.recommendations.length > 0;
      console.log('API Response data:', {
        hasRecommendations: hasValidRecommendations,
        recommendationsCount: data.recommendations?.length || 0,
        recommendations: data.recommendations,
        summary: data.summary,
        title: data.title
      });

      // ============================================================
      // Browser Console Logging for Debugging
      // ============================================================
      if (data.metadata) {
        console.log(`
🤖 CHATBOT EXECUTION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step: ${data.metadata.step} - ${data.metadata.stepName}
Used Web Search: ${data.metadata.usedWebSearch ? '✅ YES' : '❌ NO'}
Reason: ${data.metadata.reason || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `.trim());
      }
      
      // Update the user message with summary
      const updatedUserMessages = newMessages.map((msg, idx) => {
        if (idx === newMessages.length - 1 && msg.role === 'user') {
          return {
            ...msg,
            summary: data.summary || '',
            recommendations: data.recommendations || [],
          };
        }
        return msg;
      });

      // Add assistant response only if there are recommendations
      // For general answers, don't add an assistant message (right box stays unchanged)
      if (data.recommendations && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        console.log('Adding assistant message with', data.recommendations.length, 'recommendations');
        // Update the title only when we have new recommendations
        if (data.title) {
          setRecommendationTitle(data.title);
        }
        setMessages([
          ...updatedUserMessages,
          {
            role: 'assistant',
            content: '', // No summary in right box, only cards
            recommendations: data.recommendations,
          },
        ]);
      } else {
        console.log('No recommendations found, only updating user message - keeping previous recommendations in right box');
        // General answer - only update user message, don't add assistant message
        // Don't update the title - keep the previous one so right box stays unchanged
        setMessages(updatedUserMessages);
      }

      // Generate dynamic suggestions after every question is answered
      try {
        const suggestionsResponse = await fetch('/api/suggestions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userQuestion: userMessage,
            conversationHistory: conversationHistory,
            recommendations: data.recommendations || [],
            summary: data.summary || '',
          }),
        });

        if (suggestionsResponse.ok) {
          const suggestionsData = await suggestionsResponse.json();
          if (suggestionsData.suggestions && Array.isArray(suggestionsData.suggestions)) {
            // Filter out questions longer than 65 characters and replace with shorter ones
            const filteredSuggestions = filterSuggestionsByLength(suggestionsData.suggestions);
            setDynamicSuggestions(filteredSuggestions);
          }
        }
      } catch (error) {
        console.error('Error generating suggestions:', error);
        // Don't show error to user, just continue without suggestions
      }
    } catch (error) {
      console.error('Error:', error);
      let errorMessage = error instanceof Error 
        ? error.message 
        : 'Sorry, I encountered an error. Please try again.';
      
      // Provide more helpful error messages based on error content
      if (errorMessage.includes('OpenAI API key') || errorMessage.includes('OPENAI_API_KEY')) {
        errorMessage = `❌ Configuration Error: ${errorMessage}\n\nTo fix this:\n1. Go to your Vercel project settings\n2. Navigate to Environment Variables\n3. Add OPENAI_API_KEY with your OpenAI API key\n4. Redeploy your application\n\nSee VERCEL_DEPLOYMENT.md for detailed instructions.`;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorMessage = `⏱️ ${errorMessage}\n\nThis is normal on the first request. The app is generating embeddings for all credit cards. Please wait 1-2 minutes and try again.`;
      } else {
        errorMessage = `❌ Error: ${errorMessage}\n\nTroubleshooting:\n- Check Vercel function logs for details\n- Verify environment variables are set\n- Ensure the Google Sheet is public\n- Check browser console for more information`;
      }
      
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: errorMessage,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to navigate carousel left
  const navigateCarouselLeft = () => {
    const carousel = popularQuestionsCarouselRef.current;
    if (!carousel) return;
    const cardWidth = 280;
    const gap = 12;
    const scrollAmount = cardWidth + gap;
    carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  };

  // Helper function to navigate carousel right
  const navigateCarouselRight = () => {
    const carousel = popularQuestionsCarouselRef.current;
    if (!carousel) return;
    const cardWidth = 280;
    const gap = 12;
    const scrollAmount = cardWidth + gap;
    carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  // Handle click-vs-drag detection for carousel buttons
  const handleCarouselButtonMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Don't prevent default or stop propagation - allow drag-to-scroll to work
    carouselButtonMouseDownRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      target: e.currentTarget
    };
    carouselButtonHasDraggedRef.current = false;
  };

  const handleCarouselButtonClick = (e: React.MouseEvent<HTMLButtonElement>, question: string) => {
    // Check if this was a drag or a quick click
    if (!carouselButtonMouseDownRef.current) {
      // No mousedown recorded, allow click
      handleSuggestedQuestion(question);
      return;
    }

    const timeDelta = Date.now() - carouselButtonMouseDownRef.current.time;
    const deltaX = Math.abs(e.clientX - carouselButtonMouseDownRef.current.x);
    const deltaY = Math.abs(e.clientY - carouselButtonMouseDownRef.current.y);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Only trigger navigation if:
    // 1. It was a quick click (< 250ms)
    // 2. AND the mouse didn't move more than 8px
    // 3. AND we didn't detect a drag
    if (timeDelta < 250 && distance <= 8 && !carouselButtonHasDraggedRef.current) {
      handleSuggestedQuestion(question);
    }

    // Reset tracking
    carouselButtonMouseDownRef.current = null;
    carouselButtonHasDraggedRef.current = false;
  };

  const handleCarouselButtonMouseUp = () => {
    // Reset tracking on mouseup (will be handled by document handler if mouse left button)
    // Don't reset here to allow click handler to check
  };

  // Helper function to filter and replace questions longer than 65 characters
  const filterSuggestionsByLength = (suggestions: string[]): string[] => {
    const fallbackQuestions = [
      'What cards offer the best cash back?',
      'Show me cards with no annual fee',
      'Which cards have travel benefits?',
      'What are the best cards for everyday spending?',
      'Show me cards with welcome bonuses',
      'What cards offer the most points?',
      'Which cards have no foreign fees?',
      'What are the best student cards?'
    ];
    
    const processed: string[] = [];
    let fallbackIndex = 0;
    
    for (const suggestion of suggestions) {
      if (suggestion.length <= 65) {
        processed.push(suggestion);
      } else {
        // Replace with a fallback question that's under 65 characters
        while (fallbackIndex < fallbackQuestions.length) {
          const fallback = fallbackQuestions[fallbackIndex];
          if (fallback.length <= 65 && !processed.includes(fallback)) {
            processed.push(fallback);
            fallbackIndex++;
            break;
          }
          fallbackIndex++;
        }
        // If we've used all fallbacks, skip this one
        if (fallbackIndex >= fallbackQuestions.length && processed.length < suggestions.length) {
          // Try to truncate the original question
          const truncated = suggestion.substring(0, 62) + '...';
          if (truncated.length <= 65 && !processed.includes(truncated)) {
            processed.push(truncated);
          }
        }
      }
    }
    
    return processed.slice(0, 4); // Ensure max 4 suggestions
  };

  const handleSuggestedQuestion = async (question: string) => {
    // Automatically send the suggested question
    if (isLoading) return;
    
    setInput('');
    setIsLoading(true);

    // Add user message
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: question },
    ];
    setMessages(newMessages);

    try {
      // Prepare conversation history
      const conversationHistory = newMessages
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      // Find the most recent assistant message with recommendations (previous cards shown)
      const mostRecentAssistantMessage = [...messages]
        .reverse()
        .find((msg) => msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0);
      const previousRecommendations = mostRecentAssistantMessage?.recommendations || [];

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: question,
          conversationHistory: conversationHistory,
          previousRecommendations: previousRecommendations,
        }),
      });

      const data = await response.json();
      
      // Check if the response contains an error
      if (!response.ok || data.error) {
        const errorMessage = data.error || 'Failed to get recommendations';
        const errorDetails = data.details ? `\n\n${data.details}` : '';
        const fullError = `${errorMessage}${errorDetails}`;
        console.error('API Error:', { error: errorMessage, details: data.details, status: response.status });
        throw new Error(fullError);
      }
      
      const hasValidRecommendations = data.recommendations && Array.isArray(data.recommendations) && data.recommendations.length > 0;
      console.log('API Response data:', {
        hasRecommendations: hasValidRecommendations,
        recommendationsCount: data.recommendations?.length || 0,
        recommendations: data.recommendations,
        summary: data.summary,
        title: data.title
      });

      // ============================================================
      // Browser Console Logging for Debugging
      // ============================================================
      if (data.metadata) {
        console.log(`
🤖 CHATBOT EXECUTION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step: ${data.metadata.step} - ${data.metadata.stepName}
Used Web Search: ${data.metadata.usedWebSearch ? '✅ YES' : '❌ NO'}
Reason: ${data.metadata.reason || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `.trim());
      }
      
      // Update the user message with summary
      const updatedUserMessages = newMessages.map((msg, idx) => {
        if (idx === newMessages.length - 1 && msg.role === 'user') {
          return {
            ...msg,
            summary: data.summary || '',
            recommendations: data.recommendations || [],
          };
        }
        return msg;
      });

      // Add assistant response only if there are recommendations
      // For general answers, don't add an assistant message (right box stays unchanged)
      if (data.recommendations && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        console.log('Adding assistant message with', data.recommendations.length, 'recommendations');
        // Update the title only when we have new recommendations
        if (data.title) {
          setRecommendationTitle(data.title);
        }
        setMessages([
          ...updatedUserMessages,
          {
            role: 'assistant',
            content: '', // No summary in right box, only cards
            recommendations: data.recommendations,
          },
        ]);
      } else {
        console.log('No recommendations found, only updating user message - keeping previous recommendations in right box');
        // General answer - only update user message, don't add assistant message
        // Don't update the title - keep the previous one so right box stays unchanged
        setMessages(updatedUserMessages);
      }

      // Generate dynamic suggestions after every question is answered
      try {
        const suggestionsResponse = await fetch('/api/suggestions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userQuestion: question,
            conversationHistory: conversationHistory,
            recommendations: data.recommendations || [],
            summary: data.summary || '',
          }),
        });

        if (suggestionsResponse.ok) {
          const suggestionsData = await suggestionsResponse.json();
          if (suggestionsData.suggestions && Array.isArray(suggestionsData.suggestions)) {
            // Filter out questions longer than 65 characters and replace with shorter ones
            const filteredSuggestions = filterSuggestionsByLength(suggestionsData.suggestions);
            setDynamicSuggestions(filteredSuggestions);
          }
        }
      } catch (error) {
        console.error('Error generating suggestions:', error);
        // Don't show error to user, just continue without suggestions
      }
    } catch (error) {
      console.error('Error:', error);
      let errorMessage = error instanceof Error 
        ? error.message 
        : 'Sorry, I encountered an error. Please try again.';
      
      // Provide more helpful error messages based on error content
      if (errorMessage.includes('OpenAI API key') || errorMessage.includes('OPENAI_API_KEY')) {
        errorMessage = `❌ Configuration Error: ${errorMessage}\n\nTo fix this:\n1. Go to your Vercel project settings\n2. Navigate to Environment Variables\n3. Add OPENAI_API_KEY with your OpenAI API key\n4. Redeploy your application\n\nSee VERCEL_DEPLOYMENT.md for detailed instructions.`;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorMessage = `⏱️ ${errorMessage}\n\nThis is normal on the first request. The app is generating embeddings for all credit cards. Please wait 1-2 minutes and try again.`;
      } else {
        errorMessage = `❌ Error: ${errorMessage}\n\nTroubleshooting:\n- Check Vercel function logs for details\n- Verify environment variables are set\n- Ensure the Google Sheet is public\n- Check browser console for more information`;
      }
      
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: errorMessage,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Helper function to render icon SVG for suggested questions
  const renderSuggestedIcon = (iconType: string, size: string = 'h-4 w-4 lg:h-5 lg:w-5', useThemeColor: boolean = false) => {
    // Use primary color from theme (#34CAFF) when useThemeColor is true, otherwise use the hardcoded color
    const iconColor = '#34CAFF'; // Primary color from theme
    const className = size;
    
    switch (iconType) {
      case 'travel':
        return <Plane className={className} color={iconColor} strokeWidth={2} />;
      case 'shopping':
        return <ShoppingCart className={className} color={iconColor} strokeWidth={2} />;
      case 'shield':
        return <Shield className={className} color={iconColor} strokeWidth={2} />;
      case 'creditcard':
        return <CreditCard className={className} color={iconColor} strokeWidth={2} />;
      case 'premium':
        return <User className={className} color={iconColor} strokeWidth={2} />;
      default:
        return null;
    }
  };

  // Helper function to get icon for a suggestion based on keywords
  const getSuggestionIcon = (text: string): string => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('travel') || lowerText.includes('flight') || lowerText.includes('airline')) {
      return '✈️';
    } else if (lowerText.includes('grocery') || lowerText.includes('gas') || lowerText.includes('shopping') || lowerText.includes('store')) {
      return '🛒';
    } else if (lowerText.includes('fee') || lowerText.includes('annual') || lowerText.includes('no fee')) {
      return '💳';
    } else if (lowerText.includes('premium') || lowerText.includes('luxury') || lowerText.includes('elite')) {
      return '✨';
    } else if (lowerText.includes('cash back') || lowerText.includes('cashback')) {
      return '💰';
    } else if (lowerText.includes('reward') || lowerText.includes('point')) {
      return '🎁';
    } else if (lowerText.includes('student') || lowerText.includes('college')) {
      return '🎓';
    } else if (lowerText.includes('business')) {
      return '💼';
    } else {
      return '💳'; // Default icon
    }
  };

  return (
    <div className={`relative bg-background ${isMobile ? 'min-h-screen' : 'min-h-screen overflow-hidden'}`}>
      {/* Custom styles for desktop */}
      <style dangerouslySetInnerHTML={{__html: `
        @media (min-width: 1024px) {
          /* Desktop layout is now vertical stack */
        }
      `}} />
      {/* Animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5 animate-gradient-xy bg-[length:400%_400%] pointer-events-none"></div>
      
      {/* Floating gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* First orb */}
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-3xl"></div>
        {/* Second orb */}
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-3xl"></div>
      </div>

      
      <div className={`container mx-auto px-4 lg:px-6 max-w-7xl relative z-10 ${messages.length > 0 ? (messages.some(msg => msg.role === 'user') ? 'pt-6 lg:pt-4 md:pt-6' : 'pt-4 md:pt-6') : 'pt-6 md:pt-8 lg:pt-4'} ${messages.length > 0 ? (messages.some(msg => msg.role === 'user') ? 'pb-24 lg:pb-28 md:pb-6' : 'pb-4 md:pb-6') : 'pb-6 md:pb-8'}`}>
        {/* Feature boxes at top - Desktop only */}
        {messages.length > 0 && (
          <div className="hidden lg:flex justify-center gap-3 mb-4 pt-2">
            {/* AI-Powered */}
            <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 lg:px-5 py-2.5 border border-slate-200/60 flex items-center gap-2 lg:gap-2.5 shadow-sm flex-shrink-0">
              <svg className="h-5 w-5 lg:h-5 lg:w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <span className="text-slate-700 font-medium text-xs lg:text-sm">AI-Powered</span>
            </div>
            
            {/* Personalized */}
            <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 lg:px-5 py-2.5 border border-slate-200/60 flex items-center gap-2 lg:gap-2.5 shadow-sm flex-shrink-0">
              <svg className="h-5 w-5 lg:h-5 lg:w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="text-slate-700 font-medium text-xs lg:text-sm">Personalized</span>
            </div>
            
            {/* Free to Use */}
            <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 lg:px-5 py-2.5 border border-slate-200/60 flex items-center gap-2 lg:gap-2.5 shadow-sm flex-shrink-0">
              <svg className="h-5 w-5 lg:h-5 lg:w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-slate-700 font-medium text-xs lg:text-sm">Free to Use</span>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <section className={`relative ${messages.length > 0 ? 'py-2 md:py-6 mb-2 lg:mb-2' : 'py-2 md:py-4 lg:pt-20 lg:pb-8 mb-2 lg:mb-4'} ${messages.length === 0 ? 'lg:before:absolute lg:before:-top-[200px] lg:before:bottom-0 lg:before:left-1/2 lg:before:-translate-x-1/2 lg:before:w-screen lg:before:bg-hero-gradient lg:before:-z-10' : ''}`}>
          {/* Hero content */}
          <div className="relative z-10 max-w-3xl lg:max-w-7xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-2 lg:mb-3 tracking-tight lg:whitespace-nowrap text-center">
              <span className="hidden lg:inline">
                <span className="text-primary">Find Your </span>
                <span className="bg-gradient-to-r from-primary to-purple-light bg-clip-text text-transparent">Perfect </span>
                <span className="text-foreground">Credit Card</span>
              </span>
              <span className="lg:hidden">
                <span className="text-primary">Find Your Perfect</span>
                <br />
                <span className="text-foreground">Credit Card</span>
              </span>
            </h1>
            
            {messages.length === 0 && (
              <p className="text-lg lg:text-2xl text-muted-foreground max-w-2xl mx-auto leading-tight lg:leading-relaxed mb-0 lg:mb-4">
                <span className="lg:hidden">Get personalized credit card recommendations powered by AI.</span>
                <span className="hidden lg:block">
                  <span className="whitespace-nowrap block">Get personalized credit card recommendations powered by AI.</span>
                  <span className="whitespace-nowrap block">Choose the card that fits your life.</span>
                </span>
              </p>
            )}

            {/* Input Field on Desktop - Show when no messages, inside hero section */}
            {messages.length === 0 && (
              <div className="hidden lg:block max-w-3xl mx-auto px-4 mt-4">
                <div className="flex flex-col space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask about credit cards, rewards, travel perks..."
                      className="w-full h-auto py-3 md:py-6 px-3 pr-20 md:pr-28 text-base border border-input rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all"
                    />
                    <button
                      onClick={handleSend}
                      disabled={isLoading || !input.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-4 md:px-6 py-2 md:py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 active:scale-95"
                    >
                      <Search className="w-4 h-4 md:w-5 md:h-5" />
                      <span className="hidden md:inline text-sm font-medium">Search</span>
                    </button>
                  </div>
                  {/* Trust indicators - Desktop only */}
                  <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      <span>Enter to send</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span>Instant AI recommendations</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Header - Feature boxes - Mobile only (desktop shows at top) */}
        {messages.length > 0 && (
          <header className="mb-3 text-center lg:hidden">
            <div className="flex flex-nowrap justify-center gap-2 lg:gap-3 mb-4 overflow-x-auto">
              {/* AI-Powered */}
              <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 lg:px-5 py-2.5 border border-slate-200/60 flex items-center gap-2 lg:gap-2.5 shadow-sm flex-shrink-0">
                <svg className="h-5 w-5 lg:h-5 lg:w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <span className="text-slate-700 font-medium text-xs lg:text-sm">AI-Powered</span>
              </div>
              
              {/* Personalized */}
              <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 lg:px-5 py-2.5 border border-slate-200/60 flex items-center gap-2 lg:gap-2.5 shadow-sm flex-shrink-0">
                <svg className="h-5 w-5 lg:h-5 lg:w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <span className="text-slate-700 font-medium text-xs lg:text-sm">Personalized</span>
              </div>
              
              {/* Free to Use */}
              <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 lg:px-5 py-2.5 border border-slate-200/60 flex items-center gap-2 lg:gap-2.5 shadow-sm flex-shrink-0">
                <svg className="h-5 w-5 lg:h-5 lg:w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-slate-700 font-medium text-xs lg:text-sm">Free to Use</span>
              </div>
            </div>
          </header>
        )}



        {/* Popular Questions Section - Only show when no messages */}
        {messages.length === 0 && (
          <div className="max-w-6xl mx-auto mt-16 lg:mt-20 md:mt-40 mb-6 lg:mb-8">
            {/* Badge above heading - Desktop only */}
            <div className="hidden lg:flex items-center justify-center mb-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <Sparkles className="h-4 w-4 text-primary" strokeWidth={2} />
                <span className="text-sm font-medium text-primary">Popular Questions</span>
              </div>
            </div>
            
            {/* Mobile heading */}
            <div className="flex items-center justify-center gap-2 mb-3 lg:mb-5 lg:hidden">
              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center bg-primary">
                <Sparkles className="h-4 w-4 lg:h-5 lg:w-5 text-white" strokeWidth={2} />
              </div>
              <h3 className="text-xl lg:text-2xl md:text-3xl font-bold text-foreground">Popular Questions</h3>
            </div>
            
            {/* Desktop heading and subtitle */}
            <div className="hidden lg:block text-center mb-6">
              <h2 className="text-3xl font-bold text-foreground mb-2">Quick Start Guide</h2>
              <p className="text-muted-foreground">Choose a question or ask your own</p>
            </div>
            {/* Desktop Grid Layout */}
            <div className="hidden lg:grid lg:grid-cols-4 gap-4">
              {carouselQuestions.slice(0, 4).map((question, index) => {
                // Map icon types to lucide-react icons for desktop - matching screenshot
                const getDesktopIcon = () => {
                  // First card: travel -> TrendingUp
                  if (index === 0 && question.icon === 'travel') return <TrendingUp className="w-5 h-5 text-primary" strokeWidth={2} />;
                  // Second card: shopping -> CreditCard
                  if (index === 1 && question.icon === 'shopping') return <CreditCard className="w-5 h-5 text-primary" strokeWidth={2} />;
                  // Third card: creditcard -> Shield
                  if (index === 2 && question.icon === 'creditcard') return <Shield className="w-5 h-5 text-primary" strokeWidth={2} />;
                  // Fourth card: premium -> Sparkles
                  if (index === 3 && question.icon === 'premium') return <Sparkles className="w-5 h-5 text-primary" strokeWidth={2} />;
                  // Fallback mappings
                  if (question.icon === 'travel') return <TrendingUp className="w-5 h-5 text-primary" strokeWidth={2} />;
                  if (question.icon === 'shopping') return <CreditCard className="w-5 h-5 text-primary" strokeWidth={2} />;
                  if (question.icon === 'creditcard') return <Shield className="w-5 h-5 text-primary" strokeWidth={2} />;
                  if (question.icon === 'premium') return <Sparkles className="w-5 h-5 text-primary" strokeWidth={2} />;
                  return <TrendingUp className="w-5 h-5 text-primary" strokeWidth={2} />;
                };
                
                return (
                  <button
                    key={index}
                    onClick={() => handleSuggestedQuestion(question.text)}
                    disabled={isLoading}
                    className="bg-white rounded-lg p-4 border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div className="flex flex-col space-y-3">
                      <div className="flex items-start">
                        <div className="text-primary">
                          {getDesktopIcon()}
                        </div>
                      </div>
                      <h3 className="font-semibold text-base text-card-foreground md:leading-tight">
                        {question.text}
                      </h3>
                      <p className="text-sm text-muted-foreground md:leading-relaxed">
                        {question.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Mobile Carousel for Popular Questions */}
            <div 
              ref={popularQuestionsCarouselRef}
              className="lg:hidden flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 px-4 -mx-4 bg-slate-50/50 rounded-lg py-3 cursor-grab active:cursor-grabbing"
              style={{
                WebkitOverflowScrolling: 'touch',
                scrollBehavior: 'smooth',
                overscrollBehaviorX: 'contain',
                scrollSnapType: 'x mandatory',
                scrollPadding: '0 1rem',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitScrollSnapType: 'x mandatory',
                scrollSnapStop: 'normal',
                willChange: 'scroll-position',
                touchAction: 'pan-x'
              }}
            >
              {carouselQuestions.map((question, index) => {
                return (
                  <button
                    key={index}
                    onClick={(e) => {
                      // Prevent click if we detected a drag
                      if (carouselButtonHasDraggedRef.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      handleSuggestedQuestion(question.text);
                    }}
                    disabled={isLoading}
                    className="bg-white/80 backdrop-blur-sm rounded-xl p-2.5 sm:p-3 border border-slate-200 hover:border-primary/50 hover:shadow-card-hover hover:scale-105 transition-all duration-300 ease-out h-[240px] sm:h-[240px] w-[280px] sm:w-[280px] flex-shrink-0 snap-center flex flex-col disabled:opacity-50 disabled:cursor-not-allowed group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    <div className="flex flex-col items-center text-center space-y-4 flex-1 justify-center">
                      <div className="rounded-full bg-primary/10 p-4 min-w-[56px] min-h-[56px] flex items-center justify-center group-hover:bg-primary/20 transition-all duration-300 ease-out">
                        <div className="group-hover:scale-110 transition-transform duration-300">
                          {renderSuggestedIcon(question.icon, 'w-7 h-7', true)}
                        </div>
                      </div>
                      <h3 className="font-semibold text-base text-card-foreground md:leading-tight px-2">
                        {question.mobileText || question.text}
                      </h3>
                      <p className="text-base md:text-sm text-muted-foreground md:leading-relaxed px-2">
                        {question.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Carousel Indicators with Tracking Bar - Mobile only */}
            {carouselQuestions.length > 0 && (
              <div className="lg:hidden flex justify-center gap-2 mt-4 relative" style={{ width: 'fit-content', margin: '1rem auto 0' }}>
                {(() => {
                  // Show a maximum of 5 dots
                  const maxDots = 5;
                  const totalItems = carouselQuestions.length;
                  const numDots = Math.min(maxDots, totalItems);
                  
                  // Calculate which item indices to show as dots
                  // Distribute dots evenly across the carousel
                  const dotIndices: number[] = [];
                  if (totalItems <= maxDots) {
                    // If we have fewer items than max dots, show all
                    for (let i = 0; i < totalItems; i++) {
                      dotIndices.push(i);
                    }
                  } else {
                    // Distribute dots evenly across the carousel
                    for (let i = 0; i < numDots; i++) {
                      const index = Math.round((i / (numDots - 1)) * (totalItems - 1));
                      dotIndices.push(index);
                    }
                  }
                  
                  const currentIndex = popularQuestionsCarouselIndex;
                  
                  // Find which dot is closest to the current carousel position
                  const getClosestDotIndex = () => {
                    return dotIndices.reduce((prev, curr) => 
                      Math.abs(curr - currentIndex) < Math.abs(prev - currentIndex) ? curr : prev
                    );
                  };
                  
                  const activeDotIndex = getClosestDotIndex();
                  
                  // Calculate tracking bar position
                  // Bar should extend from left edge (0) to right edge when at rightmost position
                  const dotWidth = 0.5; // w-2 = 0.5rem (inactive), w-6 = 1.5rem (active)
                  const gap = 0.5; // gap-2 = 0.5rem
                  const barWidth = 1.5; // width of sliding bar in rem
                  const dotSpacing = dotWidth + gap; // 1rem between dot left edges
                  
                  // Calculate the total width of the dots container
                  // For each dot: spacing between dots + width of active dot
                  // Rightmost dot's left edge position
                  const rightmostDotLeftEdge = (dotIndices.length - 1) * dotSpacing;
                  // Rightmost dot's right edge when active (w-6 = 1.5rem)
                  const rightmostDotRightEdge = rightmostDotLeftEdge + 1.5;
                  
                  // Bar should extend all the way to the right edge when at rightmost position
                  // When progress = 1.0, bar's right edge should align with rightmost dot's right edge
                  // So bar's left edge should be at: rightmostDotRightEdge - barWidth
                  const rightmostPosition = rightmostDotRightEdge - barWidth;
                  
                  // Use scroll progress to position the bar
                  // When progress = 1.0 (fully scrolled right), bar should be at rightmostPosition (extending to right edge)
                  // When progress = 0.0 (at start), bar should be at 0
                  // Ensure bar reaches the rightmost position when progress is 1.0
                  const barPosition = popularQuestionsCarouselScrollProgress >= 1.0 
                    ? rightmostPosition 
                    : popularQuestionsCarouselScrollProgress * rightmostPosition;
                  
                  // On mobile, when at the first question (scrollProgress is 0 or very close to 0),
                  // hide the sliding bar and show only the active dot as blue to avoid multiple blue areas
                  const isAtFirstQuestion = popularQuestionsCarouselScrollProgress < 0.01 && activeDotIndex === 0;
                  
                  return (
                    <>
                      {/* Sliding indicator bar - hide when at first question to show only one blue dot */}
                      {!isAtFirstQuestion && (
                        <div 
                          className="absolute h-2 bg-primary rounded-full transition-all duration-75 ease-out"
                          style={{
                            width: '1.5rem',
                            left: `${barPosition}rem`,
                            top: '0',
                            transform: 'translateY(0)'
                          }}
                        />
                      )}
                      {dotIndices.map((itemIndex) => {
                        const isActive = itemIndex === activeDotIndex;
                        
                        return (
                          <button
                            key={itemIndex}
                            onClick={() => {
                              if (popularQuestionsCarouselRef.current) {
                                // Card width is 280px
                                const cardWidth = 280;
                                const gap = 12; // gap-3 = 12px
                                popularQuestionsCarouselRef.current.scrollTo({
                                  left: itemIndex * (cardWidth + gap),
                                  behavior: 'smooth'
                                });
                              }
                            }}
                            className={`w-2 h-2 rounded-full transition-all duration-200 relative z-10 ${
                              isActive ? 'bg-primary w-2' : 'bg-slate-300'
                            }`}
                            aria-label={`Go to slide ${itemIndex + 1}`}
                          />
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            )}
            
            {/* Partner disclaimer below recommended questions - Desktop only */}
            <div className="hidden lg:block mt-6 mb-4 px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl max-w-4xl mx-auto">
              <p className="text-xs lg:text-sm text-slate-600 leading-relaxed text-center">
                Some of the credit cards on this site are from partners who pay us when you click or apply. This helps keep the site running, but it doesn't influence our recommendations.
              </p>
            </div>
          </div>
        )}

        {/* Metrics Section - Desktop only, show when no messages */}
        {messages.length === 0 && (
          <div id="metrics-section" className="hidden lg:block relative mt-16">
            {/* Full-width background */}
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-screen bg-white border-t border-slate-200 -z-10"></div>
            {/* Content */}
            <div className="relative max-w-6xl mx-auto py-12">
              <div className="flex items-center justify-center gap-16">
                {/* Cards Analyzed */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">300+</div>
                  <div className="text-base text-muted-foreground font-sans">Cards Analyzed</div>
                </div>
                
                {/* Verified Data Sources */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">1,400+</div>
                  <div className="text-base text-muted-foreground font-sans">Verified Data Sources</div>
                </div>
                
                {/* AI-Powered Smart Recommendations */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">AI-Powered</div>
                  <div className="text-base text-muted-foreground font-sans">Smart Recommendations</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Input Field at Bottom - Only show when no messages, Mobile only */}
        {messages.length === 0 && (
          <div className="lg:hidden max-w-3xl mx-auto px-4 mt-[6.192rem] mb-4">
            <div className="flex flex-col space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about credit cards, rewards, travel perks..."
                  className="w-full h-auto py-3 md:py-6 px-3 pr-20 md:pr-28 text-base md:text-sm border border-input rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 md:px-6 py-2 md:py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 active:scale-95"
                >
                  <Search className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="hidden md:inline text-sm font-medium">Search</span>
                </button>
              </div>
              <div className="text-center text-sm text-muted-foreground flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
                <span>✓ Enter to send</span>
                <span>✨ Instant AI recommendations</span>
              </div>
            </div>
          </div>
        )}

        {/* Desktop redesign after first question */}
        {hasAskedQuestion && (
          <section className="hidden lg:block mt-8 mb-8">
            <div className="max-w-6xl mx-auto px-4 lg:px-6 space-y-6">
              {/* Hero Input Card */}
              <div className="relative bg-background/80 backdrop-blur-sm border border-slate-200/40 rounded-3xl shadow-lg shadow-slate-200/20 px-8 py-8 overflow-hidden">
                {/* Decorative gradient overlay */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-primary/5 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-accent/5 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
                
                <div className="relative">
                  {/* Chatbot Conversation with Cartoon */}
                  <div className="flex items-start gap-8">
                    {/* Chatbot Conversation */}
                    <div className="flex-[2]">
                      {/* Header with border-left accent */}
                      <div className="flex items-center gap-4 mb-8">
                        <div className="w-1 h-12 bg-primary rounded-full"></div>
                        <div>
                          <h3 className={`text-4xl font-heading font-bold text-foreground ${messages.length > 0 ? 'lg:text-2xl' : 'lg:text-5xl'}`}>Conversation History</h3>
                        </div>
                      </div>
                    <div 
                      ref={desktopChatbotRef} 
                      className="scrollbar-thin pr-2 transition-all duration-300"
                      style={{ 
                        scrollbarWidth: 'thin', 
                        overflowX: 'hidden', 
                        overflowY: chatbotNeedsScrolling ? 'auto' : 'hidden',
                        direction: 'rtl',
                        paddingBottom: '10vh',
                        height: chatbotContainerHeight ? `${chatbotContainerHeight}px` : 'auto',
                        maxHeight: chatbotContainerHeight ? `${chatbotContainerHeight}px` : '600px'
                      }}
                    >
                      <div style={{ direction: 'ltr' }}>
                        {(() => {
                          const userMessages = messages.filter((msg) => msg.role === 'user');
                          return userMessages.map((message, index) => {
                            const displayIndex = index;
                            const processMarkdownSummary = (summary: string, recommendations?: Recommendation[]) => {
                              if (!summary) return summary;
                              if (recommendations && recommendations.length > 0) {
                                let processedSummary = summary;
                                recommendations.forEach((rec) => {
                                  const cardName = rec.credit_card_name;
                                  const markdownLinkRegex = new RegExp(`\\[${cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\([^)]+\\)`, 'gi');
                                  processedSummary = processedSummary.replace(
                                    markdownLinkRegex,
                                    `[${cardName}](${rec.apply_url})`
                                  );
                                });
                                return processedSummary;
                              }
                              return summary;
                            };

                            const isErrorMessage = message.summary && (
                              message.summary.toLowerCase().includes("i couldn't find") ||
                              message.summary.toLowerCase().includes("couldn't find any credit cards")
                            );

                            return (
                              <React.Fragment key={displayIndex}>
                                <div className="mb-6 last:mb-0" data-message-index={displayIndex}>
                                  {/* User Message */}
                                  <div className="flex items-start gap-3 mb-5">
                                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-md">
                                      <User className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="bg-primary text-white rounded-2xl rounded-tl-sm p-4 px-5 shadow-md flex-1 transition-all duration-200 min-w-0 overflow-hidden">
                                      <p className="whitespace-pre-wrap text-xl font-medium break-words overflow-wrap-anywhere">{message.content}</p>
                                    </div>
                                  </div>
                                  
                                  {/* Bot Response */}
                                  {message.summary && (
                                    <div className={`flex items-start gap-3 ${isErrorMessage ? '' : 'mb-0'}`}>
                                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-secondary flex items-center justify-center shadow-sm border border-slate-200">
                                        <Sparkles className="w-5 h-5 text-primary" />
                                      </div>
                                      {isErrorMessage ? (
                                        <div className="flex-1 bg-white rounded-2xl p-5 shadow-md border border-slate-200 transition-all duration-200 min-w-0 overflow-hidden">
                                          <div className="flex items-start gap-3 mb-4">
                                            <span className="text-2xl flex-shrink-0">💡</span>
                                          <p className="text-lg text-foreground leading-relaxed break-words">
                                              Let me help you find the right card. Try asking about specific features like:
                                            </p>
                                          </div>
                                          <div className="flex flex-wrap gap-2 mt-4">
                                            {[
                                              "Cards with no annual fee",
                                              "Best cash back rewards",
                                              "Travel cards under $100/year"
                                            ].map((suggestion, idx) => (
                                              <button
                                                key={idx}
                                                onClick={() => handleSuggestedQuestion(suggestion)}
                                                disabled={isLoading}
                                                className="border border-primary text-primary rounded-full px-4 py-2.5 text-sm font-medium hover:bg-secondary focus:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                              >
                                                {suggestion}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="bg-white rounded-2xl pt-5 px-5 pb-4 shadow-md border border-slate-200 flex-1 transition-all duration-200 min-w-0 overflow-hidden">
                                        <div className="prose prose-sm lg:prose-lg max-w-none overflow-x-hidden prose-li:my-0">
                                            <ReactMarkdown
                                              components={{
                                                a: ({ ...props }) => (
                                                  <a 
                                                    {...props} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-primary font-normal hover:text-primary/80 underline decoration-2 decoration-primary/30 hover:decoration-primary/50 transition-colors duration-200 break-words"
                                                  />
                                                ),
                                                p: ({ ...props }) => (
                                                  <p className="mb-2 text-lg text-black leading-relaxed break-words last:mb-0" {...props} />
                                                ),
                                                ul: ({ ...props }) => (
                                                  <ul className="list-none space-y-2.5 lg:space-y-4 my-2 last:mb-0 [&>li]:block [&>li]:w-full" {...props} />
                                                ),
                                                li: ({ ...props }) => {
                                                  const children = props.children;
                                                  // Check if children contain an anchor element (link)
                                                  const hasLink = React.Children.toArray(children).some((child: any) => 
                                                    child?.type === 'a' || (typeof child === 'object' && child?.props?.href)
                                                  );
                                                  // Also check if it's a string with markdown link pattern
                                                  const text = typeof children === 'string' ? children : '';
                                                  const hasLinkPattern = text.includes('[') && text.includes('](');
                                                  
                                                  if (hasLink || hasLinkPattern) {
                                                    return (
                                                      <li className="mb-2 lg:mb-4 block w-full text-lg text-black leading-relaxed break-words last:mb-0 whitespace-normal" style={{ display: 'block', clear: 'both', width: '100%' }} {...props} />
                                                    );
                                                  }
                                                  // Regular option description
                                                  return (
                                                    <li className="mb-2 lg:mb-4 block w-full text-lg text-black leading-relaxed break-words last:mb-0 whitespace-normal" style={{ display: 'block', clear: 'both', width: '100%' }} {...props} />
                                                  );
                                                },
                                              }}
                                            >
                                              {(() => {
                                                let displayText = message.recommendations && message.recommendations.length > 0
                                                  ? processMarkdownSummary(message.summary, message.recommendations)
                                                  : message.summary;
                                                
                                                // Remove duplicate card names early, before other processing
                                                displayText = removeDuplicateCardNames(displayText, message.recommendations);
                                                
                                                if (message.recommendations && message.recommendations.length > 0) {
                                                  const summaryLower = displayText.toLowerCase();
                                                  const summaryNormalized = normalizeText(displayText);
                                                  const missingCards = message.recommendations.filter(rec => {
                                                    const cardNameLower = rec.credit_card_name.toLowerCase();
                                                    const reasonLower = (rec.reason || '').toLowerCase();
                                                    const reasonNormalized = normalizeText(rec.reason || '');
                                                    const reasonDuplicate =
                                                      (reasonLower && summaryLower.includes(reasonLower)) ||
                                                      (reasonNormalized && summaryNormalized.includes(reasonNormalized));
                                                    return !summaryLower.includes(cardNameLower) && !reasonDuplicate;
                                                  });
                                                  
                                                  if (missingCards.length > 0) {
                                                    const cardsText = missingCards.map(rec => 
                                                      `- **[${rec.credit_card_name}](${rec.apply_url})** - ${rec.reason}`
                                                    ).join('\n\n');
                                                    displayText = displayText + '\n\n' + cardsText;
                                                  }
                                                }
                                                
                                                displayText = removeDuplicateFinalSentence(displayText);
                                                displayText = normalizeMarkdownListItems(displayText);
                                                displayText = cleanUrlText(displayText);
                                                // Call again after all processing to catch any duplicates introduced
                                                displayText = removeDuplicateCardNames(displayText, message.recommendations);
                                                displayText = removeColonPeriod(displayText, message.recommendations);
                                                displayText = replaceColonWithHyphen(displayText, message.recommendations);
                                                
                                                // Final safety net: Remove any remaining '****' patterns that might have slipped through
                                                // This catches any pattern like "text****text" and removes the duplicate
                                                displayText = displayText.replace(/([^\*]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, p1, p2) => {
                                                  const text = p1.trim();
                                                  const afterText = p2.trim();
                                                  return afterText ? `${text} ${afterText}` : text;
                                                });
                                                // Also catch any standalone '****' sequences and replace with space
                                                displayText = displayText.replace(/\*{2,}/g, ' ');
                                                
                                                // Final pass: Ensure each card name appears only once
                                                displayText = ensureSingleCardNameOccurrence(displayText, message.recommendations);
                                                
                                                return displayText;
                                              })()}
                                            </ReactMarkdown>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Disclaimer after every chatbot response */}
                                {message.summary && (
                                  <>
                                    <div className="mt-6 mb-6 px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl">
                                      <p className="text-sm text-slate-600 leading-relaxed">
                                        We do our best to keep credit card info current, but details can change quickly. Always check the issuer's terms before you apply.
                                      </p>
                                    </div>
                                    
                                  </>
                                )}
                              </React.Fragment>
                            );
                          });
                        })()}
                        {isLoading && (
                          <div className="mb-8">
                            <SwipeToLoad />
                          </div>
                        )}
                        
                        {/* Recommended Cards Section - At the bottom of the last response */}
                        {latestRecommendations.length > 0 && !isLoading && (
                          <div className={`${userConversationMessages.length === 1 ? 'lg:pt-2 pt-6' : 'pt-6'} border-t border-slate-200/60 lg:max-w-xl lg:mx-auto`}>
                            <p className="hidden lg:block text-gray-500 text-sm mb-3">Details</p>
                            <div className="space-y-3">
                              {latestRecommendations.slice(0, 3).map((rec, index) => {
                                const isExpanded = desktopExpandedRecommendations.has(index);
                                const benefits = extractBenefits(rec);
                                const rating = getDerivedRating(index);
                                const highlight = getRecommendationHighlight(rec);
                                const containerClasses = isExpanded
                                  ? 'rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-white to-primary/5 shadow-lg'
                                  : 'rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50/50 shadow-md';
                                
                                return (
                                    <div
                                      key={`${rec.credit_card_name}-${index}-recommended`}
                                      className={`${containerClasses} hover:shadow-lg hover:border-primary/30 overflow-hidden transition-all duration-300 group`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDesktopExpandedRecommendations((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(index)) {
                                              next.delete(index);
                                            } else {
                                              next.add(index);
                                            }
                                            return next;
                                          });
                                        }}
                                        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                                        aria-expanded={isExpanded}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <p className="text-lg md:font-medium text-slate-900 md:text-card-foreground group-hover:text-primary transition-colors truncate card-name-desktop">
                                            {rec.credit_card_name}
                                          </p>
                                        </div>
                                        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isExpanded ? 'bg-primary/10 text-primary rotate-180' : 'bg-slate-100 text-slate-500 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                                          <ChevronDown className="w-5 h-5 transition-transform" />
                                        </div>
                                      </button>
                                      {isExpanded && (
                                        <div className="px-6 pb-6 pt-2 space-y-2 border-t border-slate-100 bg-slate-50/30 animate-in slide-in-from-top-2 duration-200">
                                          {/* Card Summary at Top */}
                                          {rec.card_summary && (
                                            <div className="pt-2">
                                              <p className="text-sm text-slate-600 md:text-muted-foreground md:leading-relaxed">
                                                {rec.card_summary}
                                              </p>
                                            </div>
                                          )}
                                          
                                          {/* Card Highlights as Checkmarks */}
                                          {rec.card_highlights && (
                                            <div className="space-y-2 pt-1">
                                              <p className="text-xs font-semibold text-slate-500 md:text-muted-foreground uppercase md:tracking-wider mb-1">Key Benefits</p>
                                              {rec.card_highlights
                                                .split('\n')
                                                .map((highlight) => highlight.trim())
                                                .filter((highlight) => highlight.length > 0)
                                                .map((highlight, idx) => {
                                                  // Remove bullet points (•, -, *, etc.) from the beginning of the text
                                                  const cleanedHighlight = highlight.replace(/^[•\-\*\u2022\u2023\u25E6\u2043\u2219\s]+/, '').trim();
                                                  return (
                                                    <div key={idx} className="flex items-start gap-3">
                                                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                                                        <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                                                      </div>
                                                      <p className="text-sm text-slate-700 md:text-muted-foreground md:leading-relaxed flex-1">{cleanedHighlight}</p>
                                                    </div>
                                                  );
                                                })}
                                            </div>
                                          )}
                                          <div className="flex flex-wrap gap-2 pt-1">
                                            {rec.annual_fee && (
                                              <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 shadow-sm">
                                                {rec.annual_fee}
                                              </span>
                                            )}
                                            {rec.rewards_rate && (
                                              <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
                                                {rec.rewards_rate}
                                              </span>
                                            )}
                                          </div>
                                          <a
                                            href={rec.apply_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-primary/90 text-white px-6 py-3 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 active:scale-95 transition-all"
                                          >
                                            View Details
                                            <ExternalLink className="w-4 h-4 ml-2" />
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    </div>

                    {/* Cartoon to the right of chatbot - Desktop only */}
                    {currentCartoon && (
                      <div className="hidden lg:block flex-shrink-0 w-80">
                        <div className="sticky top-4 h-[600px] flex items-center justify-center p-4">
                          <img
                            src={currentCartoon.imageUrl}
                            alt="Cartoon"
                            className="max-w-full max-h-full object-contain"
                            style={{ transform: 'scale(1.2)' }}
                            onError={(e) => {
                              console.error('[Cartoon] Failed to load image:', currentCartoon.imageUrl);
                              const target = e.target as HTMLImageElement;
                              // Try to reload the image once after a short delay
                              if (!target.dataset.retried) {
                                target.dataset.retried = 'true';
                                setTimeout(() => {
                                  target.src = currentCartoon.imageUrl + '?retry=' + Date.now();
                                }, 1000);
                              } else {
                                // After retry fails, hide the broken image
                                console.error('[Cartoon] Image failed to load after retry');
                                target.style.display = 'none';
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          </section>
        )}

        {/* Layout - Only show when there are messages */}
        {/* Hide chatbot on desktop when hasAskedQuestion is true (it's shown in the desktop redesign section) */}
        {messages.length > 0 && (
        <div className="lg:hidden">
        <div className={messages.some(msg => msg.role === 'user') ? 'lg:relative' : ''}>
        <div 
          ref={chatbotContainerRef} 
          className={`flex flex-col lg:flex-col gap-6 mb-6 ${messages.some(msg => msg.role === 'user') ? 'mt-12 lg:mt-16 lg:mb-0' : 'mt-12 lg:mt-4'} ${messages.some(msg => msg.role === 'user') ? 'lg:max-w-4xl lg:mx-auto' : 'max-w-xl mx-auto'} overflow-visible ${hasAskedQuestion ? 'lg:hidden' : 'lg:overflow-visible'}`}
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          {/* Chatbot Section */}
          <div className={`flex flex-col w-full ${messages.some(msg => msg.role === 'user') ? 'min-h-[600px]' : 'h-[500px]'} overflow-visible lg:overflow-visible`}>
            <div className={`lg:bg-transparent bg-transparent rounded-2xl lg:shadow-none border lg:border-transparent border-slate-200/30 lg:h-auto flex flex-col backdrop-blur-sm w-full ${messages.some(msg => msg.role === 'user') ? 'p-4 lg:p-8' : 'p-4 md:p-6'}`} style={{ overflow: 'visible' }}>
              <div className={`${messages.some(msg => msg.role === 'user') ? 'mb-6 pb-4' : 'mb-4 pb-3'} border-b border-slate-200/60 flex-shrink-0 hidden lg:block`}>
                <h3 className="text-xl lg:text-2xl font-bold text-slate-900 mb-1.5">Your Questions</h3>
                <p className="text-sm text-slate-500 font-normal">Ask me anything about credit cards</p>
              </div>
              <div 
                ref={(el) => {
                  if (el) {
                    // Store ref
                    (chatContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                    
                    // On desktop, set scroll position based on message count
                    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
                    if (isDesktop) {
                      // Don't scroll if input is focused
                      const isInputFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
                      if (isInputFocused) return;
                      
                      const userMessages = messages.filter((msg) => msg.role === 'user');
                      const userMessageCount = userMessages.length;
                      
                      // Only set scroll to top if there are no messages or only one message
                      // For multiple messages, the scroll-to-latest logic will handle it
                      if (userMessageCount <= 1) {
                        // Set immediately
                        el.scrollTop = 0;
                        
                        // Use multiple approaches to ensure it sticks
                        requestAnimationFrame(() => {
                          // Check again if input is focused
                          const stillFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
                          if (el && !stillFocused) el.scrollTop = 0;
                          requestAnimationFrame(() => {
                            const stillFocused2 = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
                            if (el && !stillFocused2) el.scrollTop = 0;
                          });
                        });
                        
                        setTimeout(() => { 
                          const stillFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
                          if (el && !stillFocused) el.scrollTop = 0; 
                        }, 0);
                        setTimeout(() => { 
                          const stillFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
                          if (el && !stillFocused) el.scrollTop = 0; 
                        }, 10);
                        setTimeout(() => { 
                          const stillFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
                          if (el && !stillFocused) el.scrollTop = 0; 
                        }, 50);
                        setTimeout(() => { 
                          const stillFocused = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
                          if (el && !stillFocused) el.scrollTop = 0; 
                        }, 100);
                      }
                    }
                  }
                }}
                className={`flex-1 min-h-0 lg:max-h-full px-1 lg:[direction:rtl] ${
                  messages.some(msg => msg.role === 'user') 
                    ? 'lg:overflow-y-auto overflow-x-hidden lg:scrollbar-thin overflow-visible' 
                    : 'lg:overflow-hidden overflow-visible scrollbar-hide'
                }`}
                style={messages.some(msg => msg.role === 'user') 
                  ? (isMobile ? { 
                      overflowX: 'hidden', 
                      overflowY: 'visible',
                      marginBottom: '1rem', 
                      paddingBottom: '2rem'
                    } : { 
                      scrollbarWidth: 'thin', 
                      overflowX: 'hidden', 
                      overflowY: 'auto',
                      touchAction: 'pan-y',
                      direction: 'rtl',
                      paddingBottom: '0.5rem',
                      marginBottom: '0'
                    })
                  : (isMobile ? {} : { overflow: 'hidden', scrollbarWidth: 'none' })
                }
              >
              <div className="lg:[direction:ltr] overflow-x-hidden overflow-y-hidden min-w-0" style={messages.some(msg => msg.role === 'user') && !isMobile ? { paddingBottom: '2rem' } : {}}>
              {(
                <>
                  {(() => {
                    // On mobile, only show the most recent question/answer pair
                    const userMessages = messages.filter((msg) => msg.role === 'user');
                    const messagesToShow = isMobile && userMessages.length > 0 
                      ? [userMessages[userMessages.length - 1]] 
                      : userMessages;
                    
                    return messagesToShow.map((message, index) => {
                      // Adjust index for mobile to always be the last message's index
                      const displayIndex = isMobile && userMessages.length > 0 
                        ? userMessages.length - 1 
                        : index;
                      // Process markdown summary and ensure card links use correct URLs
                      const processMarkdownSummary = (summary: string, recommendations?: Recommendation[]) => {
                        if (!summary) return summary;
                        
                        // If there are recommendations, ensure markdown links use the correct URLs
                        if (recommendations && recommendations.length > 0) {
                          let processedSummary = summary;
                          recommendations.forEach((rec) => {
                            const cardName = rec.credit_card_name;
                            // Replace markdown links [Card Name](url) with correct URLs
                            const markdownLinkRegex = new RegExp(`\\[${cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\([^)]+\\)`, 'gi');
                            processedSummary = processedSummary.replace(
                              markdownLinkRegex,
                              `[${cardName}](${rec.apply_url})`
                            );
                          });
                          return processedSummary;
                        }
                        return summary;
                      };

                      // Check if this is an error/fallback message (specifically the "I couldn't find" message)
                      const isErrorMessage = message.summary && (
                        message.summary.toLowerCase().includes("i couldn't find") ||
                        message.summary.toLowerCase().includes("couldn't find any credit cards")
                      );

                      return (
                        <div key={displayIndex} className="mb-8 max-w-xl lg:max-w-xl lg:mx-auto overflow-x-hidden min-w-0" data-message-index={displayIndex}>
                          {/* User Message */}
                          <div className="flex items-start gap-3 mb-5 flex-row-reverse lg:flex-row">
                            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-md">
                              <User className="w-5 h-5 text-white" />
                            </div>
                            <div className="bg-primary text-white rounded-2xl rounded-tl-sm p-4 px-5 shadow-md flex-1 transition-all duration-200 min-w-0 overflow-hidden max-w-[72.25%]">
                              <p className="whitespace-pre-wrap text-xl font-medium break-words overflow-wrap-anywhere">{message.content}</p>
                            </div>
                          </div>
                          
                          {/* Bot Response */}
                          {message.summary && (
                            <div className={`flex items-start gap-3 flex-row-reverse lg:flex-row ${isErrorMessage ? '' : 'mb-0'}`}>
                              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-secondary flex items-center justify-center shadow-sm border border-slate-200">
                                <Sparkles className="w-5 h-5 text-primary" />
                              </div>
                              {isErrorMessage ? (
                                <div className="flex-1 bg-white rounded-2xl p-5 shadow-md border border-slate-200 transition-all duration-200 min-w-0 overflow-hidden max-w-[72.25%]">
                                  <div className="flex items-start gap-3 mb-4">
                                    <span className="text-2xl flex-shrink-0">💡</span>
                                    <p className="text-lg text-foreground leading-relaxed break-words">
                                      Let me help you find the right card. Try asking about specific features like:
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2 mt-4">
                                    {[
                                      "Cards with no annual fee",
                                      "Best cash back rewards",
                                      "Travel cards under $100/year"
                                    ].map((suggestion, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() => handleSuggestedQuestion(suggestion)}
                                        disabled={isLoading}
                                        className="border border-primary text-primary rounded-full px-4 py-2.5 text-sm font-medium hover:bg-secondary focus:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {suggestion}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-white rounded-2xl pt-5 px-5 pb-4 shadow-md border border-slate-200 flex-1 max-w-xl lg:max-w-[24.48rem] transition-all duration-200 min-w-0 overflow-hidden">
                                  <div className="prose prose-sm lg:prose-lg max-w-none overflow-x-hidden prose-li:my-0">
                                    <ReactMarkdown
                                      components={{
                                        a: ({ ...props }) => (
                                          <a 
                                            {...props} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-primary font-normal hover:text-primary/80 underline decoration-2 decoration-primary/30 hover:decoration-primary/50 transition-colors duration-200 break-words"
                                          />
                                        ),
                                        p: ({ ...props }) => (
                                          <p className="mb-2 text-lg text-black leading-relaxed break-words last:mb-0" {...props} />
                                        ),
                                        ul: ({ ...props }) => (
                                          <ul className="list-none space-y-2.5 lg:space-y-4 my-2 last:mb-0 [&>li]:block [&>li]:w-full" {...props} />
                                        ),
                                        li: ({ ...props }) => {
                                          const children = props.children;
                                          // Check if children contain an anchor element (link)
                                          const hasLink = React.Children.toArray(children).some((child: any) => 
                                            child?.type === 'a' || (typeof child === 'object' && child?.props?.href)
                                          );
                                          // Also check if it's a string with markdown link pattern
                                          const text = typeof children === 'string' ? children : '';
                                          const hasLinkPattern = text.includes('[') && text.includes('](');
                                          
                                          if (hasLink || hasLinkPattern) {
                                            return (
                                              <li className="mb-2 lg:mb-4 block w-full text-lg text-black leading-relaxed break-words last:mb-0 whitespace-normal" style={{ display: 'block', clear: 'both', width: '100%' }} {...props} />
                                            );
                                          }
                                          // Regular option description
                                          return (
                                            <li className="mb-2 lg:mb-4 block w-full text-lg text-black leading-relaxed break-words last:mb-0 whitespace-normal" style={{ display: 'block', clear: 'both', width: '100%' }} {...props} />
                                          );
                                        },
                                      }}
                                    >
                                      {(() => {
                                        let displayText = message.recommendations && message.recommendations.length > 0
                                          ? processMarkdownSummary(message.summary, message.recommendations)
                                          : message.summary;
                                        
                                        // Remove duplicate card names early, before other processing
                                        displayText = removeDuplicateCardNames(displayText, message.recommendations);
                                        
                                        if (message.recommendations && message.recommendations.length > 0) {
                                          const summaryLower = displayText.toLowerCase();
                                          const summaryNormalized = normalizeText(displayText);
                                          const missingCards = message.recommendations.filter(rec => {
                                            const cardNameLower = rec.credit_card_name.toLowerCase();
                                            const reasonLower = (rec.reason || '').toLowerCase();
                                            const reasonNormalized = normalizeText(rec.reason || '');
                                            const reasonDuplicate =
                                              (reasonLower && summaryLower.includes(reasonLower)) ||
                                              (reasonNormalized && summaryNormalized.includes(reasonNormalized));
                                            return !summaryLower.includes(cardNameLower) && !reasonDuplicate;
                                          });
                                          
                                          if (missingCards.length > 0) {
                                            const cardsText = missingCards.map(rec => 
                                              `- **[${rec.credit_card_name}](${rec.apply_url})** - ${rec.reason}`
                                            ).join('\n\n');
                                            displayText = displayText + '\n\n' + cardsText;
                                          }
                                        }
                                        
                                        displayText = removeDuplicateFinalSentence(displayText);
                                        displayText = normalizeMarkdownListItems(displayText);
                                        displayText = cleanUrlText(displayText);
                                        // Call again after all processing to catch any duplicates introduced
                                        displayText = removeDuplicateCardNames(displayText, message.recommendations);
                                        displayText = removeColonPeriod(displayText, message.recommendations);
                                        displayText = replaceColonWithHyphen(displayText, message.recommendations);
                                        
                                        // Final safety net: Remove any remaining '****' patterns that might have slipped through
                                        // This catches any pattern like "text****text" and removes the duplicate
                                        displayText = displayText.replace(/([^\*]+?)\*{2,}\1(\s*[-–—]?\s*.*?)(?=\n|$)/gi, (match, p1, p2) => {
                                          const text = p1.trim();
                                          const afterText = p2.trim();
                                          return afterText ? `${text} ${afterText}` : text;
                                        });
                                        // Also catch any standalone '****' sequences and replace with space
                                        displayText = displayText.replace(/\*{2,}/g, ' ');
                                        
                                        // Final pass: Ensure each card name appears only once
                                        displayText = ensureSingleCardNameOccurrence(displayText, message.recommendations);
                                        
                                        return displayText;
                                      })()}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Disclaimer after every chatbot response - Mobile */}
                          {message.summary && (
                            <>
                              <div className="mt-6 mb-6 px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl">
                                <p className="text-sm text-slate-600 leading-relaxed">
                                  We do our best to keep credit card info current, but details can change quickly. Always check the issuer's terms before you apply.
                                </p>
                              </div>
                              
                            </>
                          )}
                        </div>
                      );
                    });
                  })()}
                  {isLoading && (() => {
                    // Check if the current question is about previous cards or a non-recommendation question
                    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
                    const currentQuery = lastUserMessage?.content?.toLowerCase() || '';
                    
                    // Patterns that indicate asking about previous cards or non-recommendation questions
                    const previousCardPatterns = [
                      /these cards/i,
                      /any of these/i,
                      /these recommendations/i,
                      /the cards above/i,
                      /the cards you showed/i,
                      /the cards you recommended/i,
                      /which of these/i,
                      /do these cards/i,
                      /do any of these/i,
                      /are these cards/i,
                      /the recommended cards/i,
                      /the cards you mentioned/i,
                    ];
                    
                    // Patterns for information questions
                    const informationQuestionPatterns = [
                      /^what is\s+(an|a|the)?\s+/i,
                      /^what's\s+(an|a|the)?\s+/i,
                      /^what are\s+/i,
                      /^how do\s+/i,
                      /^how does\s+/i,
                      /^how can\s+/i,
                      /^explain\s+/i,
                      /^can you explain\s+/i,
                      /^tell me about\s+/i,
                      /^what does\s+/i,
                      /^what's the difference between/i,
                      /^difference between/i,
                      /what is the\s+.*\s+of\s+/i,
                      /what's the\s+.*\s+of\s+/i,
                      /what is\s+.*\s+for\s+/i,
                    ];
                    
                    const isAboutPreviousCards = previousCardPatterns.some(pattern => pattern.test(currentQuery));
                    const isInformationQuestion = informationQuestionPatterns.some(pattern => pattern.test(currentQuery));
                    const useFunMessages = isAboutPreviousCards || isInformationQuestion;
                    
                    return (
                      <>
                        {/* Mobile: Show SwipeToLoad only (cartoon moved to bottom of chat box) */}
                        <div className="lg:hidden mb-2 max-w-xl lg:mx-auto">
                          <div className="flex flex-col items-center pt-0 pb-2">
                            <SwipeToLoad messages={useFunMessages ? FUN_LOADING_MESSAGES : undefined} />
                          </div>
                        </div>
                        {/* Desktop: Show simple thinking indicator */}
                        <div className="hidden lg:flex items-start gap-3 mb-8 max-w-xl lg:max-w-xl mx-auto">
                          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shadow-sm ring-1 ring-slate-200">
                            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                          </div>
                          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60 max-w-[30.6rem]">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600 text-xl lg:text-2xl tracking-tight">Thinking</span>
                              <div className="flex gap-1.5">
                                <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  
                </>
              )}
              </div>
              <div ref={messagesEndRef} />
              
              {/* Mobile: Expandable recommendation boxes below chatbox */}
              {topThreeRecommendations.length > 0 && !isLoading && (
                <div className="lg:hidden mt-4 space-y-3 flex-shrink-0 max-w-sm">
                  {topThreeRecommendations.map((rec, index) => {
                    const isExpanded = expandedRecommendations.has(index);
                    return (
                      <div
                        key={index}
                        className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden transition-all duration-200"
                      >
                        {/* Collapsed Header - Clickable */}
                        <button
                          onClick={() => {
                            setExpandedRecommendations(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(index)) {
                                newSet.delete(index);
                              } else {
                                newSet.add(index);
                              }
                              return newSet;
                            });
                          }}
                          className="w-full p-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {/* Card Icon */}
                            <div className="flex-shrink-0 w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                              <CreditCard className="w-5 h-5 text-teal-600" />
                            </div>
                            {/* Card Name */}
                            <h4 className="font-semibold md:font-medium text-sm md:text-base text-slate-900 md:text-card-foreground text-left line-clamp-1 flex-1 min-w-0">
                              {rec.credit_card_name}
                            </h4>
                          </div>
                          {/* Chevron Icon */}
                          <div className="flex-shrink-0 ml-2">
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-slate-500" />
                            )}
                          </div>
                        </button>
                        
                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="px-6 pb-6 pt-2 space-y-2 border-t border-slate-100 bg-slate-50/30 animate-in slide-in-from-top-2 duration-200">
                            {/* Card Summary at Top */}
                            {rec.card_summary && (
                              <div className="pt-2">
                                <p className="text-sm text-slate-600 md:text-muted-foreground md:leading-relaxed">
                                  {rec.card_summary}
                                </p>
                              </div>
                            )}
                            
                            {/* Card Highlights as Checkmarks */}
                            {rec.card_highlights && (
                              <div className="space-y-2 pt-1">
                                <p className="text-xs font-semibold text-slate-500 md:text-muted-foreground uppercase md:tracking-wider mb-1">Key Benefits</p>
                                {rec.card_highlights
                                  .split('\n')
                                  .map((highlight) => highlight.trim())
                                  .filter((highlight) => highlight.length > 0)
                                  .map((highlight, idx) => {
                                    // Remove bullet points (•, -, *, etc.) from the beginning of the text
                                    const cleanedHighlight = highlight.replace(/^[•\-\*\u2022\u2023\u25E6\u2043\u2219\s]+/, '').trim();
                                    return (
                                      <div key={idx} className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                                          <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                                        </div>
                                        <p className="text-sm text-slate-700 md:text-muted-foreground md:leading-relaxed flex-1">{cleanedHighlight}</p>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {rec.annual_fee && (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 shadow-sm">
                                  {rec.annual_fee}
                                </span>
                              )}
                              {rec.rewards_rate && (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
                                  {rec.rewards_rate}
                                </span>
                              )}
                            </div>
                            <a
                              href={rec.apply_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-primary/90 text-white px-6 py-3 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 active:scale-95 transition-all w-full"
                            >
                              View Details
                              <ExternalLink className="w-4 h-4 ml-2" />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

                  {/* Desktop: Dynamic Suggested Questions - Under chatbot window */}
                  {dynamicSuggestions.length > 0 && messages.length > 0 && !isLoading && (
                    <div className="hidden lg:block mt-6 pt-6 border-t border-slate-200/60">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-semibold text-slate-500 md:text-muted-foreground uppercase md:tracking-wider">
                          You might also ask
                        </p>
                        <span className="text-xs text-slate-400">Click a suggestion to auto-fill</span>
                      </div>
                      <div className="flex flex-row gap-4">
                        {dynamicSuggestions.slice(0, 3).map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSuggestedQuestion(suggestion)}
                            disabled={isLoading}
                            className="bg-white rounded-2xl p-4 border border-slate-200 hover:border-teal-400 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 min-h-[140px] max-w-[220px] flex flex-col disabled:opacity-50 disabled:cursor-not-allowed group focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                          >
                            <div className="flex flex-col items-center text-center space-y-3 flex-1 justify-center">
                              <div className="rounded-full bg-teal-50 p-3 min-w-[48px] min-h-[48px] flex items-center justify-center group-hover:bg-teal-100 transition-colors">
                                <span className="text-2xl group-hover:scale-110 transition-transform">
                                  {getSuggestionIcon(suggestion)}
                                </span>
                              </div>
                              <h3 className="font-semibold text-sm text-slate-700 leading-snug px-2 line-clamp-3">
                                {(() => {
                                  let fixed = suggestion;
                                  fixed = fixed.replace(/\?(\w)/g, '$1');
                                  if (!fixed.match(/[?.!]$/)) {
                                    fixed = fixed + '?';
                                  }
                                  return fixed;
                                })()}
                              </h3>
                            </div>
                          </button>
                        ))}
                      </div>
                      
                      {/* Partner disclaimer below recommended questions - Desktop */}
                      <div className="mt-6 mb-4 px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl">
                        <p className="text-xs text-slate-600 leading-relaxed text-center">
                          Some of the credit cards on this site are from partners who pay us when you click or apply. This helps keep the site running, but it doesn't influence our recommendations.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Mobile: Dynamic Suggested Questions - After recommendation cards */}
              {dynamicSuggestions.length > 0 && messages.length > 0 && !isLoading && (
                <div className="lg:hidden border-t border-slate-200 max-w-sm" style={{ marginTop: '3rem', paddingTop: '1rem' }}>
                  <p className="text-xs md:text-sm text-slate-500 mb-4 font-semibold uppercase tracking-wide">You might also ask:</p>
                  {/* Two static follow-up questions */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {dynamicSuggestions.slice(0, 2).map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestedQuestion(suggestion)}
                        disabled={isLoading}
                        className="bg-white rounded-lg p-2.5 border border-slate-200 hover:border-teal-300 hover:shadow-md hover:scale-105 transition-all duration-200 flex flex-col disabled:opacity-50 disabled:cursor-not-allowed group focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 min-h-[120px]"
                      >
                        <div className="flex flex-col items-center text-center space-y-2 flex-1 justify-center">
                          <div className="rounded-full bg-primary/10 p-2 min-w-[38px] min-h-[38px] flex items-center justify-center">
                            <span className="text-base group-hover:scale-110 transition-transform">{getSuggestionIcon(suggestion)}</span>
                          </div>
                          <h3 className="font-semibold text-xs leading-tight text-card-foreground px-1 line-clamp-3">
                            {suggestion}
                          </h3>
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  {/* Partner disclaimer below recommended questions - Mobile */}
                  <div className="mt-4 mb-4 px-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl">
                    <p className="text-xs text-slate-600 leading-relaxed text-center">
                      Some of the credit cards on this site are from partners who pay us when you click or apply. This helps keep the site running, but it doesn't influence our recommendations.
                    </p>
                  </div>
                </div>
              )}
              
              {/* Mobile: Show cartoon at bottom of chat box on credit card background */}
              {currentCartoon && (
                <div className="lg:hidden mb-6 flex flex-col items-center flex-shrink-0 max-w-sm" style={{ marginTop: isLoading ? '0.5rem' : '2.5rem' }}>
                  <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl relative" style={{
                    aspectRatio: '1.586 / 1', // Standard credit card ratio
                    background: 'linear-gradient(135deg, #93c5fd 0%, #bfdbfe 50%, #dbeafe 100%)',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
                  }}>
                    {/* Credit card shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent pointer-events-none" />
                    
                    {/* Card chip */}
                    <div className="absolute top-4 left-4 w-10 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-md shadow-lg" style={{
                      clipPath: 'polygon(20% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 20%)'
                    }} />
                    
                    {/* Cartoon image */}
                    <div className="w-full h-full flex items-center justify-center p-4">
                      <img
                        src={currentCartoon.imageUrl}
                        alt="Loading cartoon"
                        className="max-w-full max-h-full object-contain drop-shadow-lg scale-[0.8]"
                        onError={(e) => {
                          console.error('[Cartoon] Mobile - Failed to load image:', currentCartoon.imageUrl);
                          const target = e.target as HTMLImageElement;
                          // Try to reload the image once after a short delay
                          if (!target.dataset.retried) {
                            target.dataset.retried = 'true';
                            setTimeout(() => {
                              target.src = currentCartoon.imageUrl + '?retry=' + Date.now();
                            }, 1000);
                          } else {
                            // After retry fails, hide the broken image
                            console.error('[Cartoon] Mobile - Image failed to load after retry');
                            target.style.display = 'none';
                          }
                        }}
                      />
                    </div>
                    
                    {/* Card number pattern (subtle) */}
                    <div className="absolute bottom-4 left-4 text-white/30 text-xs font-mono">
                      •••• ••••
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Desktop Input and Suggested Questions - Persistent at bottom of left column */}
            {messages.some(msg => msg.role === 'user') && (
              <div className="hidden lg:block lg:sticky lg:bottom-0 flex-shrink-0 pt-6 bg-transparent -mx-8 -mb-8 px-8 pb-8 z-10">
                {/* Input Area - Desktop */}
                {!isLoading && (
                  <div className="flex flex-col gap-4 mb-5">
                    <div className="flex items-start gap-3 w-full">
                      {/* Spacer to match avatar width */}
                      <div className="flex-shrink-0 w-9 h-9"></div>
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyPress={handleKeyPress}
                          placeholder="Ask about credit cards..."
                          className="w-full min-h-[56px] h-12 py-4 px-6 pr-14 text-base border border-slate-300 rounded-2xl shadow-sm bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200"
                        />
                        <button
                          onClick={handleSend}
                          disabled={isLoading || !input.trim()}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-lg hover:from-teal-700 hover:to-cyan-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>

          {/* Credit Card Recommendations - Only show after a question is asked - Desktop: Below chatbot */}
          {messages.some(msg => msg.role === 'user') && (
          <div className="hidden lg:flex flex-col w-full" style={{ overflow: 'visible' }}>
            <div className="lg:bg-transparent bg-white rounded-2xl lg:shadow-none lg:border-transparent shadow-2xl shadow-slate-300/40 border border-slate-200/60 p-4 lg:p-8 flex flex-col backdrop-blur-sm w-full" style={{ overflow: 'visible' }}>
              <div className="hidden lg:flex items-center gap-3 mb-6 lg:mb-8 flex-shrink-0">
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
                  <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl lg:text-2xl font-bold text-slate-900">{recommendationTitle || 'Top Bank Cards'}</h2>
                  <p className="text-xs lg:text-sm text-slate-500 font-light">Personalized recommendations for you</p>
                </div>
              </div>

              <div className="overflow-y-visible scrollbar-thin pt-12" style={{ scrollbarWidth: 'thin' }}>
                {(() => {
                  // Find only the most recent assistant message with recommendations
                  const mostRecentAssistantMessage = [...messages]
                    .reverse()
                    .find((msg) => msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0);

                  // Show loading animation when loading
                  if (isLoading) {
                    // Check if the current question is about previous cards or a non-recommendation question
                    // Get the most recent user message (should be the one being processed)
                    // The message is added to the array before isLoading is set to true
                    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
                    const currentQuery = lastUserMessage?.content?.toLowerCase() || '';
                    
                    // Patterns that indicate asking about previous cards or non-recommendation questions
                    const previousCardPatterns = [
                      /these cards/i,
                      /any of these/i,
                      /these recommendations/i,
                      /the cards above/i,
                      /the cards you showed/i,
                      /the cards you recommended/i,
                      /which of these/i,
                      /do these cards/i,
                      /do any of these/i,
                      /are these cards/i,
                      /the recommended cards/i,
                      /the cards you mentioned/i,
                    ];
                    
                    // Patterns for information questions
                    const informationQuestionPatterns = [
                      /^what is\s+(an|a|the)?\s+/i,
                      /^what's\s+(an|a|the)?\s+/i,
                      /^what are\s+/i,
                      /^how do\s+/i,
                      /^how does\s+/i,
                      /^how can\s+/i,
                      /^explain\s+/i,
                      /^can you explain\s+/i,
                      /^tell me about\s+/i,
                      /^what does\s+/i,
                      /^what's the difference between/i,
                      /^difference between/i,
                      /what is the\s+.*\s+of\s+/i,
                      /what's the\s+.*\s+of\s+/i,
                      /what is\s+.*\s+for\s+/i,
                    ];
                    
                    const isAboutPreviousCards = previousCardPatterns.some(pattern => pattern.test(currentQuery));
                    const isInformationQuestion = informationQuestionPatterns.some(pattern => pattern.test(currentQuery));
                    const useFunMessages = isAboutPreviousCards || isInformationQuestion;
                    
                    return (
                      <div className="flex flex-col items-center pt-0 pb-4">
                        <SwipeToLoad messages={useFunMessages ? FUN_LOADING_MESSAGES : undefined} />
                        {currentCartoon && (
                          <div className="mt-3 flex flex-col items-center">
                            <div className="w-full max-w-lg rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                              <img
                                src={currentCartoon.imageUrl}
                                alt="Loading cartoon"
                                className="max-w-full max-h-64 object-contain"
                                onError={(e) => {
                                  console.error('[Cartoon] Loading state - Failed to load image:', currentCartoon.imageUrl);
                                  const target = e.target as HTMLImageElement;
                                  // Try to reload the image once after a short delay
                                  if (!target.dataset.retried) {
                                    target.dataset.retried = 'true';
                                    setTimeout(() => {
                                      target.src = currentCartoon.imageUrl + '?retry=' + Date.now();
                                    }, 1000);
                                  } else {
                                    // After retry fails, hide the broken image
                                    console.error('[Cartoon] Loading state - Image failed to load after retry');
                                    target.style.display = 'none';
                                  }
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (!mostRecentAssistantMessage || !mostRecentAssistantMessage.recommendations || mostRecentAssistantMessage.recommendations.length === 0) {
                    return (
                      <div className="text-center py-16">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                        </div>
                        <p className="text-slate-500 font-medium mb-6">Card recommendations will appear here after you ask a question.</p>
                        {/* Show cartoon on initial load */}
                        {currentCartoon && (
                          <div className="mt-6 flex flex-col items-center">
                            <div className="w-full max-w-lg rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                              <img
                                src={currentCartoon.imageUrl}
                                alt="Cartoon"
                                className="max-w-full max-h-64 object-contain"
                                onError={(e) => {
                                  console.error('[Cartoon] Initial load - Failed to load image:', currentCartoon.imageUrl);
                                  const target = e.target as HTMLImageElement;
                                  // Try to reload the image once after a short delay
                                  if (!target.dataset.retried) {
                                    target.dataset.retried = 'true';
                                    setTimeout(() => {
                                      target.src = currentCartoon.imageUrl + '?retry=' + Date.now();
                                    }, 1000);
                                  } else {
                                    // After retry fails, hide the broken image
                                    console.error('[Cartoon] Initial load - Image failed to load after retry');
                                    target.style.display = 'none';
                                  }
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="flex flex-col gap-4 mb-6 w-full max-w-md">
                        {mostRecentAssistantMessage.recommendations.slice(0, 3).map((rec, recIndex) => {
                          // Debug: Log each recommendation to verify data structure
                          if (recIndex === 0 || recIndex === 1 || recIndex === 2) {
                            console.log(`Card ${recIndex}:`, {
                              cardName: rec.credit_card_name,
                              hasCardSummary: !!rec.card_summary,
                              hasCardHighlights: !!rec.card_highlights,
                              cardHighlights: rec.card_highlights,
                              hasPerks: !!rec.perks,
                              hasReason: !!rec.reason,
                              fullRec: rec
                            });
                          }
                          
                          const cardName = rec.credit_card_name;
                          // Use a unique key based on card name and index to ensure proper React reconciliation
                          const uniqueKey = `${cardName}-${recIndex}`;
                          const isOpen = openCardBoxes.has(recIndex);
                          
                          const benefits = extractBenefits(rec);
                          
                          const toggleBox = () => {
                            setOpenCardBoxes(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(recIndex)) {
                                newSet.delete(recIndex);
                              } else {
                                newSet.add(recIndex);
                              }
                              return newSet;
                            });
                          };
                          
                          const containerClasses = isOpen
                            ? 'rounded-xl border border-border shadow-md bg-gradient-to-br from-card to-blue-50 hover:shadow-lg'
                            : 'rounded-xl border border-transparent';

                          return (
                            <div
                              key={uniqueKey}
                              className={`${containerClasses} transition-all duration-300 overflow-hidden`}
                            >
                              {/* Collapsible Header */}
                              <button
                                onClick={toggleBox}
                                className="w-full px-2 py-3 flex items-center justify-between gap-4 text-left"
                              >
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-base card-name-desktop font-semibold text-foreground leading-tight truncate">
                                    {cardName}
                                  </h3>
                                </div>
                                {/* Toggle Icon */}
                                <div className="flex-shrink-0 ml-3">
                                  {isOpen ? (
                                    <ChevronUp className="w-5 h-5 text-slate-600" />
                                  ) : (
                                    <ChevronDown className="w-5 h-5 text-slate-600" />
                                  )}
                                </div>
                              </button>
                              
                              {/* Collapsible Content */}
                              {isOpen && (
                                <div className="px-4 pb-4 pt-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                  {/* Card Summary at Top */}
                                  {rec.card_summary && String(rec.card_summary).trim().length > 0 && (
                                    <div className="pt-2">
                                      <p className="text-sm text-slate-600 md:text-muted-foreground md:leading-relaxed">
                                        {String(rec.card_summary)}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {/* Fallback: Show reason if card_summary is missing */}
                                  {(!rec.card_summary || String(rec.card_summary).trim().length === 0) && rec.reason && String(rec.reason).trim().length > 0 && (
                                    <div className="pt-2">
                                      <p className="text-sm text-slate-600 md:text-muted-foreground md:leading-relaxed">
                                        {String(rec.reason)}
                                      </p>
                                    </div>
                                  )}
                                  
                                  {/* Card Highlights - ALWAYS show if it exists */}
                                  {rec.card_highlights && String(rec.card_highlights).trim().length > 0 && (
                                    <div className="space-y-2 pt-1">
                                      <p className="text-xs font-semibold text-slate-500 md:text-muted-foreground uppercase md:tracking-wider mb-1">Key Benefits</p>
                                      {String(rec.card_highlights)
                                        .split('\n')
                                        .map((highlight) => highlight.trim())
                                        .filter((highlight) => highlight.length > 0)
                                        .map((highlight, idx) => {
                                          // Remove bullet points (•, -, *, etc.) from the beginning of the text
                                          const cleanedHighlight = highlight.replace(/^[•\-\*\u2022\u2023\u25E6\u2043\u2219\s]+/, '').trim();
                                          if (!cleanedHighlight) return null;
                                          return (
                                            <div key={`${uniqueKey}-highlight-${idx}`} className="flex items-start gap-3">
                                              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                                                <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                                              </div>
                                              <p className="text-sm text-slate-700 md:text-muted-foreground md:leading-relaxed flex-1">{cleanedHighlight}</p>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  )}
                                  
                                  {/* Fallback: Show perks or other benefits as checkmarks if card_highlights is missing */}
                                  {(!rec.card_highlights || String(rec.card_highlights).trim().length === 0) && (rec.perks || benefits.length > 0) && (
                                    <div className="space-y-2 pt-1">
                                      <p className="text-xs font-semibold text-slate-500 md:text-muted-foreground uppercase md:tracking-wider mb-1">Key Benefits</p>
                                      {(() => {
                                        // Use perks if available, otherwise use extracted benefits
                                        const hasPerks = rec.perks && String(rec.perks).trim().length > 0;
                                        const benefitsToShow = hasPerks
                                          ? String(rec.perks).split(/[.,;]/).map(p => p.trim()).filter(p => p.length > 0 && p.length < 150)
                                          : benefits.filter(b => b.length > 0 && b.length < 150);
                                        
                                        return benefitsToShow.slice(0, 5).map((benefit, idx) => {
                                          const cleanedBenefit = benefit.replace(/^[•\-\*\u2022\u2023\u25E6\u2043\u2219\s]+/, '').trim();
                                          if (!cleanedBenefit) return null;
                                          return (
                                            <div key={`${uniqueKey}-benefit-${idx}`} className="flex items-start gap-3">
                                              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                                                <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                                              </div>
                                              <p className="text-sm text-slate-700 md:text-muted-foreground md:leading-relaxed flex-1">{cleanedBenefit}</p>
                                            </div>
                                          );
                                        });
                                      })()}
                                    </div>
                                  )}
                                  
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    {rec.annual_fee && (
                                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-700 border border-slate-200 shadow-sm">
                                        {String(rec.annual_fee)}
                                      </span>
                                    )}
                                    {rec.rewards_rate && (
                                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
                                        {String(rec.rewards_rate)}
                                      </span>
                                    )}
                                    {rec.intro_offer && (
                                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 border border-green-200 shadow-sm">
                                        {String(rec.intro_offer)}
                                      </span>
                                    )}
                                    {rec.credit_score_needed && (
                                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">
                                        {String(rec.credit_score_needed)}
                                      </span>
                                    )}
                                    {rec.application_fee && (
                                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                                        {String(rec.application_fee)}
                                      </span>
                                    )}
                                  </div>
                                  <a
                                    href={rec.apply_url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-primary/90 text-white px-6 py-3 text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 active:scale-95 transition-all w-full"
                                  >
                                    View Details
                                    <ExternalLink className="w-4 h-4 ml-2" />
                                  </a>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
          )}
        </div>
        </div>
        </div>
        )}

      </div>

      {/* Mobile Input Box - Fixed at bottom of screen after questions */}
      {messages.some(msg => msg.role === 'user') && (
        <div 
          className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] px-4 py-3 border-t border-slate-200/60 shadow-lg"
          style={{
            backgroundColor: 'rgba(248, 250, 252, 0.95)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about credit cards..."
                className="w-full min-h-[56px] h-10 py-7 px-3 pr-16 text-base border border-input rounded-md shadow-card bg-card text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[48px] min-h-[48px] bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl hover:from-teal-700 hover:to-cyan-700 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Chatbot Input at Bottom - Desktop Only */}
      {hasAskedQuestion && (
        <div className="hidden lg:block fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-primary/15 via-white/80 to-transparent border-t border-primary/15 backdrop-blur-sm">
          <div className="max-w-[1100px] mx-auto px-4 py-4 transition-all duration-300">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="relative w-[90%] mx-auto">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask about credit cards..."
                    className={`w-full h-14 rounded-2xl border px-6 py-4 pr-16 text-base text-foreground placeholder:text-muted-foreground shadow-md transition-all ${
                      input.trim() 
                        ? 'border-primary/40 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary' 
                        : 'border-primary/30 bg-gradient-to-r from-white to-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary shadow-primary/10'
                    }`}
                  />
                  <button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-lg bg-gradient-to-r from-primary to-primary/90 text-white flex items-center justify-center shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {dynamicSuggestions.length > 0 && messages.length > 0 && !isLoading && (
                <div className="rounded-xl border border-white/60 bg-white/80 px-4 py-3 shadow-md shadow-primary/10 backdrop-blur">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">You might also ask</p>
                    <span className="text-[10px] text-slate-400">Click to autofill</span>
                  </div>
                  <div className="flex flex-row gap-3 w-full">
                    {dynamicSuggestions.slice(0, 3).map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestedQuestion(suggestion)}
                        disabled={isLoading}
                        className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 rounded-full border border-slate-200/70 bg-white/70 text-left shadow-sm hover:shadow-md hover:border-primary hover:scale-[1.01] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                        aria-label={`Ask: ${suggestion}`}
                      >
                        <div className="rounded-full bg-secondary p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-lg flex-shrink-0">
                          <span>{getSuggestionIcon(suggestion)}</span>
                        </div>
                        <span className="text-sm font-medium text-foreground leading-snug">
                          {(() => {
                            let fixed = suggestion;
                            fixed = fixed.replace(/\?(\w)/g, '$1');
                            if (!fixed.match(/[?.!]$/)) {
                              fixed = fixed + '?';
                            }
                            return fixed;
                          })()}
                        </span>
                      </button>
                    ))}
                  </div>
                  
                  {/* Partner disclaimer below recommended questions - Desktop fixed input */}
                  <div className="mt-4 px-4 py-2">
                    <p className="text-xs text-slate-600 leading-relaxed text-center max-w-2xl mx-auto">
                      Some of the credit cards on this site are from partners who pay us when you click or apply. This helps keep the site running, but it doesn't influence our recommendations.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Site-wide disclaimer footer */}
      <div className="relative z-10 border-t border-slate-200/60 bg-white/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 lg:px-6 max-w-7xl py-4 lg:py-5">
          <p className="text-xs lg:text-sm text-slate-600 leading-relaxed text-center max-w-4xl mx-auto">
            Some of the credit cards on this site are from partners who pay us when you click or apply. This helps keep the site running, but it doesn't influence our recommendations.
          </p>
        </div>
      </div>
    </div>
  );
}

