'use client';

import { useState, useRef, useEffect } from 'react';
import { Recommendation } from '@/types';
import SwipeToLoad from '@/components/SwipeToLoad';
import CartoonDisplay from '@/components/CartoonDisplay';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  recommendations?: Recommendation[];
  summary?: string; // Summary with card links for user messages
}

const SUGGESTED_QUESTIONS = [
  { text: 'Best Card for Travel', icon: '✈️' },
  { text: 'Groceries & Gas Rewards', icon: '🛒' },
  { text: 'No Annual Fee Cards', icon: '💳' },
  { text: 'Premium Travel Cards', icon: '✨' },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recommendationTitle, setRecommendationTitle] = useState('AI Recommendations');
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const [currentCartoon, setCurrentCartoon] = useState<{ imageUrl: string; source?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Track when recommendations change to trigger animation
  const prevRecommendationsRef = useRef<Recommendation[]>([]);
  // Track if user has manually scrolled the left box
  const userHasScrolledLeftRef = useRef(false);
  // Track previous message count to detect new questions
  const prevMessageCountRef = useRef(0);
  // Track previous user message count to detect new questions
  const prevUserMessageCountRef = useRef(0);
  
  // Track manual scrolling in left box
  useEffect(() => {
    const leftBox = chatContainerRef.current;
    if (!leftBox) return;

    const handleScroll = () => {
      // If user scrolls down (not at top), mark as manually scrolled
      if (leftBox.scrollTop > 10) {
        userHasScrolledLeftRef.current = true;
      }
    };

    leftBox.addEventListener('scroll', handleScroll);
    return () => leftBox.removeEventListener('scroll', handleScroll);
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
      // Note: Left box scrolling is handled in the separate useEffect below
      prevMessageCountRef.current = currentMessageCount;
    }
    
    if (hasChanged && currentRecommendations.length > 0) {
      prevRecommendationsRef.current = currentRecommendations;
    } else if (currentRecommendations.length === 0) {
      prevRecommendationsRef.current = [];
    }
  }, [messages]);

  useEffect(() => {
    // Scroll the left box to show the most recent question at the top
    const userMessages = messages.filter((msg) => msg.role === 'user');
    const currentUserMessageCount = userMessages.length;
    
    // Scroll whenever messages change (including when summaries are added)
    if (currentUserMessageCount > 0 && chatContainerRef.current) {
      const lastUserMessageIndex = currentUserMessageCount - 1;
      
      // Wait for DOM to update, then scroll
      const scrollToLatest = () => {
        if (!chatContainerRef.current) return;
        
        // Get all user message elements within the left box
        const messageElements = chatContainerRef.current.querySelectorAll('[data-message-index]');
        if (messageElements.length === 0 || lastUserMessageIndex < 0) return;
        
        // Find the element for the most recent user message
        const lastMessageElement = Array.from(messageElements).find((el) => {
          const index = parseInt(el.getAttribute('data-message-index') || '-1');
          return index === lastUserMessageIndex;
        });
        
        if (!lastMessageElement) return;
        
        const container = chatContainerRef.current;
        const element = lastMessageElement as HTMLElement;
        
        // Use scrollIntoView with block: 'start' to position at top
        // But we need to scroll the container, not the window
        // So we'll calculate the position manually
        
        // Get the element's position relative to the container
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        // Calculate the scroll position needed
        // elementRect.top is relative to viewport, containerRect.top is container's viewport position
        // The difference tells us how far the element is from the container's top
        // Add current scrollTop to get absolute position in scrollable content
        const currentScrollTop = container.scrollTop;
        const elementTopRelativeToContainer = elementRect.top - containerRect.top;
        const targetScrollTop = currentScrollTop + elementTopRelativeToContainer;
        
        // Scroll to position the element at the very top (use smooth scrolling)
        container.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
      };
      
      // Try multiple times to ensure DOM is fully updated (especially for summaries)
      const timeout1 = setTimeout(scrollToLatest, 200);
      const timeout2 = setTimeout(scrollToLatest, 400);
      const timeout3 = setTimeout(scrollToLatest, 600);
      
      return () => {
        clearTimeout(timeout1);
        clearTimeout(timeout2);
        clearTimeout(timeout3);
      };
    }
    
    // Update the ref to track the current count
    if (currentUserMessageCount > prevUserMessageCountRef.current) {
      prevUserMessageCountRef.current = currentUserMessageCount;
    } else if (currentUserMessageCount === 0) {
      prevUserMessageCountRef.current = 0;
    }
  }, [messages]);

  // Fetch a new cartoon when loading starts
  useEffect(() => {
    if (isLoading) {
      const fetchCartoon = async () => {
        try {
          // Add a timestamp to ensure we get a fresh cartoon each time
          const response = await fetch(`/api/cartoon?t=${Date.now()}`);
          const data = await response.json();
          if (data.imageUrl) {
            setCurrentCartoon({ imageUrl: data.imageUrl, source: data.source });
          }
        } catch (error) {
          console.error('Error fetching cartoon:', error);
        }
      };
      fetchCartoon();
    }
  }, [isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    // Reset cartoon when starting a new search
    setCurrentCartoon(null);

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

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: userMessage,
          conversationHistory: conversationHistory,
        }),
      });

      const data = await response.json();
      
      // Check if the response contains an error
      if (!response.ok || data.error) {
        const errorMessage = data.error || 'Failed to get recommendations';
        const errorDetails = data.details ? `\n\nDetails: ${data.details}` : '';
        throw new Error(`${errorMessage}${errorDetails}`);
      }
      
      console.log('API Response data:', { 
        hasRecommendations: !!data.recommendations, 
        recommendationsCount: data.recommendations?.length || 0,
        recommendations: data.recommendations,
        summary: data.summary,
        title: data.title
      });
      
      // Update the title if provided
      if (data.title) {
        setRecommendationTitle(data.title);
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
        setMessages([
          ...updatedUserMessages,
          {
            role: 'assistant',
            content: '', // No summary in right box, only cards
            recommendations: data.recommendations,
          },
        ]);
      } else {
        console.log('No recommendations found, only updating user message');
        // General answer - only update user message, don't add assistant message
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
            setDynamicSuggestions(suggestionsData.suggestions);
          }
        }
      } catch (error) {
        console.error('Error generating suggestions:', error);
        // Don't show error to user, just continue without suggestions
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Sorry, I encountered an error. Please try again.';
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `❌ Error: ${errorMessage}\n\nPlease check:\n- Your OpenAI API key is set correctly in .env.local\n- The Google Sheet is public and accessible\n- Check the browser console and server logs for more details`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
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

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: question,
          conversationHistory: conversationHistory,
        }),
      });

      const data = await response.json();
      
      // Check if the response contains an error
      if (!response.ok || data.error) {
        const errorMessage = data.error || 'Failed to get recommendations';
        const errorDetails = data.details ? `\n\nDetails: ${data.details}` : '';
        throw new Error(`${errorMessage}${errorDetails}`);
      }
      
      console.log('API Response data:', { 
        hasRecommendations: !!data.recommendations, 
        recommendationsCount: data.recommendations?.length || 0,
        recommendations: data.recommendations,
        summary: data.summary,
        title: data.title
      });
      
      // Update the title if provided
      if (data.title) {
        setRecommendationTitle(data.title);
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
        setMessages([
          ...updatedUserMessages,
          {
            role: 'assistant',
            content: '', // No summary in right box, only cards
            recommendations: data.recommendations,
          },
        ]);
      } else {
        console.log('No recommendations found, only updating user message');
        // General answer - only update user message, don't add assistant message
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
            setDynamicSuggestions(suggestionsData.suggestions);
          }
        }
      } catch (error) {
        console.error('Error generating suggestions:', error);
        // Don't show error to user, just continue without suggestions
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Sorry, I encountered an error. Please try again.';
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `❌ Error: ${errorMessage}\n\nPlease check:\n- Your OpenAI API key is set correctly in .env.local\n- The Google Sheet is public and accessible\n- Check the browser console and server logs for more details`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 overflow-hidden">
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/20 mb-6">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h1 className="text-5xl font-bold text-slate-900 mb-4 tracking-tight">
            Credit Card Advisor
          </h1>
          <p className="text-lg text-slate-600 font-light max-w-2xl mx-auto">
            Get personalized credit card recommendations powered by AI
          </p>
        </header>

        {/* Two Column Layout */}
        <div className="grid grid-cols-5 gap-6 mb-6" style={{ height: '700px', maxHeight: '700px', overflow: 'hidden' }}>
          {/* Left Column - Chatbot */}
          <div className="col-span-2 flex flex-col" style={{ height: '700px', maxHeight: '700px', overflow: 'hidden' }}>
            <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 h-full flex flex-col" style={{ maxHeight: '100%', overflow: 'hidden' }}>
              <div className="mb-6 pb-4 border-b border-slate-200 flex-shrink-0">
                <h3 className="text-xl font-semibold text-slate-900 mb-1">Your Questions</h3>
                <p className="text-sm text-slate-500 font-light">Ask me anything about credit cards</p>
              </div>
              <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto mb-4 space-y-3 min-h-0 max-h-full scrollbar-thin"
                style={{ scrollbarWidth: 'thin' }}
              >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8">
                  {/* Professional icon */}
                  <div className="w-20 h-20 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-teal-500/20">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="font-semibold text-slate-900 mb-2 text-center text-lg">Start a conversation</p>
                  <p className="text-sm text-slate-500 mb-8 text-center px-4 font-light">
                    Choose a quick action below or type your own question about credit cards.
                  </p>
                  <div className="grid grid-cols-2 gap-3 w-full px-4">
                    {SUGGESTED_QUESTIONS.map((question, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestedQuestion(question.text)}
                        className="px-5 py-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 hover:border-teal-300 hover:shadow-md transition-all duration-200 flex items-center gap-3 group"
                      >
                        <span className="text-xl group-hover:scale-110 transition-transform">{question.icon}</span>
                        <span className="text-left font-medium">{question.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages
                    .filter((msg) => msg.role === 'user')
                    .map((message, index) => {
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

                      return (
                        <div key={index} className="space-y-3" data-message-index={index}>
                          <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl p-4 shadow-md shadow-teal-500/20">
                            <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed">{message.content}</p>
                          </div>
                          {message.summary && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-700 shadow-sm">
                              <div className="prose prose-sm max-w-none">
                                <ReactMarkdown
                                  components={{
                                    a: ({ ...props }) => (
                                      <a 
                                        {...props} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-teal-600 font-semibold hover:text-teal-700 underline decoration-2 decoration-teal-300 hover:decoration-teal-500 transition-colors"
                                      />
                                    ),
                                    strong: ({ ...props }) => (
                                      <strong className="font-semibold text-slate-900" {...props} />
                                    ),
                                    h2: ({ ...props }) => (
                                      <h2 className="text-base font-semibold text-slate-900 mt-4 mb-3" {...props} />
                                    ),
                                    h3: ({ ...props }) => (
                                      <h3 className="text-base font-semibold text-slate-900 mt-3 mb-2" {...props} />
                                    ),
                                    p: ({ ...props }) => (
                                      <p className="mb-3 leading-relaxed text-slate-700" {...props} />
                                    ),
                                    ul: ({ ...props }) => (
                                      <ul className="list-none space-y-3 my-3" {...props} />
                                    ),
                                    li: ({ ...props }) => (
                                      <li className="mb-4 leading-relaxed text-slate-700" {...props} />
                                    ),
                                  }}
                                >
                                  {(() => {
                                    // Process markdown and ensure all cards are included
                                    let displayText = message.recommendations && message.recommendations.length > 0
                                      ? processMarkdownSummary(message.summary, message.recommendations)
                                      : message.summary;
                                    
                                    // If we have recommendations but they're not in the summary, append them
                                    if (message.recommendations && message.recommendations.length > 0) {
                                      const summaryLower = displayText.toLowerCase();
                                      const missingCards = message.recommendations.filter(rec => {
                                        const cardNameLower = rec.credit_card_name.toLowerCase();
                                        return !summaryLower.includes(cardNameLower);
                                      });
                                      
                                      if (missingCards.length > 0) {
                                        const cardsText = missingCards.map(rec => 
                                          `• **[${rec.credit_card_name}](${rec.apply_url})** - ${rec.reason}`
                                        ).join('\n\n');
                                        displayText = displayText + '\n\n' + cardsText;
                                      }
                                    }
                                    
                                    return displayText;
                                  })()}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {isLoading && (
                    <div className="bg-slate-100 rounded-xl p-4 border border-slate-200">
                      <p className="text-slate-600 text-sm font-medium">Sending...</p>
                    </div>
                  )}
                  
                  {/* Dynamic Suggested Questions - After most recent answer */}
                  {dynamicSuggestions.length > 0 && messages.length > 0 && !isLoading && (
                    <div className="mt-6 pt-6 border-t border-slate-200">
                      <p className="text-xs text-slate-500 mb-4 font-semibold uppercase tracking-wide">You might also ask:</p>
                      <div className="grid grid-cols-2 gap-3">
                        {dynamicSuggestions.slice(0, 4).map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSuggestedQuestion(suggestion)}
                            disabled={isLoading}
                            className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 hover:border-teal-300 hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 group"
                          >
                            <span className="text-lg group-hover:scale-110 transition-transform">{getSuggestionIcon(suggestion)}</span>
                            <span className="text-left flex-1 font-medium">{suggestion}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input Area */}
            <div className="flex gap-3 mt-auto pt-6 border-t border-slate-200 flex-shrink-0">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about credit cards..."
                  className="flex-1 px-5 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white shadow-sm transition-all"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl hover:from-teal-700 hover:to-cyan-700 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center min-w-[56px] shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Credit Card Recommendations */}
          <div className="col-span-3 flex flex-col" style={{ height: '700px', maxHeight: '700px', overflow: 'hidden' }}>
            <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 h-full flex flex-col" style={{ maxHeight: '100%', overflow: 'hidden' }}>
              <div className="flex items-center gap-3 mb-8 flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Top Bank Cards</h2>
                  <p className="text-sm text-slate-500 font-light">Personalized recommendations for you</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 max-h-full scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
                {(() => {
                  // Find only the most recent assistant message with recommendations
                  const mostRecentAssistantMessage = [...messages]
                    .reverse()
                    .find((msg) => msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0);

                  // Show loading animation when loading
                  if (isLoading) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12">
                        <SwipeToLoad />
                        {currentCartoon && (
                          <div className="mt-6 flex flex-col items-center">
                            <div className="w-full max-w-lg rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                              <img
                                src={currentCartoon.imageUrl}
                                alt="Loading cartoon"
                                className="max-w-full max-h-64 object-contain"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            </div>
                            <p className="text-xs text-slate-500 mt-3 text-center font-light">
                              Cartoon of the moment
                            </p>
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
                        <p className="text-slate-500 font-medium">Card recommendations will appear here after you ask a question.</p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="grid grid-cols-3 gap-5 mb-6">
                        {mostRecentAssistantMessage.recommendations.slice(0, 4).map((rec, recIndex) => (
                          <div
                            key={recIndex}
                            className="bg-white rounded-xl border border-slate-200 shadow-md hover:shadow-lg transition-all duration-300 p-6 flex flex-col group hover:border-teal-300"
                          >
                            {/* Card Name */}
                            <h3 className="font-semibold text-lg text-slate-900 mb-3 leading-tight">
                              {rec.credit_card_name}
                            </h3>
                            
                            {/* Description */}
                            {rec.reason && (
                              <p className="text-sm text-slate-600 mb-5 flex-grow leading-relaxed">
                                {rec.reason}
                              </p>
                            )}
                            
                            <div className="space-y-2.5 text-sm mb-5 border-t border-slate-100 pt-4">
                              {/* Annual Fee */}
                              {rec.annual_fee && (
                                <div className="flex justify-between">
                                  <span className="font-medium text-slate-700">Annual Fee</span>
                                  <span className="text-slate-600 font-medium">{rec.annual_fee}</span>
                                </div>
                              )}
                              
                              {/* Credit Score */}
                              {rec.credit_score_needed && (
                                <div className="flex justify-between">
                                  <span className="font-medium text-slate-700">Credit Score</span>
                                  <span className="text-slate-600 font-medium">{rec.credit_score_needed}</span>
                                </div>
                              )}
                              
                              {/* Intro Offer */}
                              {rec.intro_offer && (
                                <div className="flex justify-between">
                                  <span className="font-medium text-slate-700">Intro Offer</span>
                                  <span className="text-slate-600 font-medium">{rec.intro_offer}</span>
                                </div>
                              )}
                              
                              {/* Intro APR - check if rewards_rate contains APR info */}
                              {rec.rewards_rate && (rec.rewards_rate.toLowerCase().includes('apr') || rec.rewards_rate.toLowerCase().includes('0%')) && (
                                <div className="flex justify-between">
                                  <span className="font-medium text-slate-700">Intro APR</span>
                                  <span className="text-slate-600 font-medium">{rec.rewards_rate}</span>
                                </div>
                              )}
                              
                              {/* Rewards Rate (if not APR) */}
                              {rec.rewards_rate && !rec.rewards_rate.toLowerCase().includes('apr') && !rec.rewards_rate.toLowerCase().includes('0%') && (
                                <div className="flex justify-between">
                                  <span className="font-medium text-slate-700">Rewards</span>
                                  <span className="text-slate-600 font-medium">{rec.rewards_rate}</span>
                                </div>
                              )}
                            </div>
                              
                              {/* Apply Now Button */}
                              <a
                                href={rec.apply_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-auto w-full text-center px-5 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm font-semibold rounded-xl hover:from-teal-700 hover:to-cyan-700 transition-all flex items-center justify-center gap-2 shadow-md shadow-teal-500/30 hover:shadow-lg hover:shadow-teal-500/40 group-hover:scale-[1.02]"
                              >
                                Apply Now
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </a>
                            </div>
                        ))}
                      </div>
                      {/* Cartoon below the cards */}
                      {currentCartoon && (
                        <div className="mt-6 flex flex-col items-center">
                          <div className="w-full max-w-lg rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                            <img
                              src={currentCartoon.imageUrl}
                              alt="Loading cartoon"
                              className="max-w-full max-h-64 object-contain"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          </div>
                          <p className="text-xs text-slate-500 mt-3 text-center font-light">
                            Cartoon of the moment
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

