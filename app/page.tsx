'use client';

import { useState, useRef, useEffect } from 'react';
import { Recommendation } from '@/types';
import SwipeToLoad from '@/components/SwipeToLoad';
import CartoonDisplay from '@/components/CartoonDisplay';
import ReactMarkdown from 'react-markdown';
import { MapPin, ShoppingBag, Wallet, Trophy } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  recommendations?: Recommendation[];
  summary?: string; // Summary with card links for user messages
}

const SUGGESTED_QUESTIONS = [
  { text: 'What\'s the best card for travel?', description: 'Maximize points on flights and hotels', icon: 'travel' },
  { text: 'What\'s the best card for groceries and gas?', description: 'Earn cashback on everyday purchases', icon: 'shopping' },
  { text: 'What are the best cards with no annual fee?', description: 'Get great rewards without yearly costs', icon: 'shield' },
  { text: 'What are the best premium travel cards?', description: 'Elite perks and lounge access', icon: 'premium' },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recommendationTitle, setRecommendationTitle] = useState('AI Recommendations');
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const [currentCartoon, setCurrentCartoon] = useState<{ imageUrl: string; source?: string } | null>(null);
  const [shownCartoons, setShownCartoons] = useState<string[]>([]);
  const shownCartoonsRef = useRef<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialCartoonRef = useRef(false);
  const prevIsLoadingRef = useRef(false);
  
  // Track when recommendations change to trigger animation
  const prevRecommendationsRef = useRef<Recommendation[]>([]);
  // Track if user has manually scrolled the left box
  const userHasScrolledLeftRef = useRef(false);
  // Track previous message count to detect new questions
  const prevMessageCountRef = useRef(0);
  // Track previous user message count to detect new questions
  const prevUserMessageCountRef = useRef(0);
  
  // Keep ref in sync with state
  useEffect(() => {
    shownCartoonsRef.current = shownCartoons;
  }, [shownCartoons]);
  
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

  // Fetch a cartoon on initial page load (only once)
  useEffect(() => {
    if (hasInitialCartoonRef.current) return; // Already fetched initial cartoon
    
    const fetchCartoon = async () => {
      try {
        // Get current shown cartoons from ref (always has latest value)
        const currentShown = shownCartoonsRef.current;
        
        // Build query parameter with shown cartoons
        const shownParam = currentShown.length > 0 
          ? `&shown=${encodeURIComponent(JSON.stringify(currentShown))}`
          : '';
        
        const response = await fetch(`/api/cartoon?t=${Date.now()}${shownParam}`);
        const data = await response.json();
        if (data.imageUrl) {
          // Double-check that this cartoon hasn't been shown (in case of race conditions)
          const isAlreadyShown = shownCartoonsRef.current.includes(data.imageUrl);
          if (!isAlreadyShown) {
            // Only set the cartoon if it's not already shown
            setCurrentCartoon({ imageUrl: data.imageUrl, source: data.source });
            hasInitialCartoonRef.current = true; // Mark as fetched
            // Add to shown cartoons using functional update to ensure we have latest state
            setShownCartoons(prev => {
              if (!prev.includes(data.imageUrl)) {
                return [...prev, data.imageUrl];
              }
              return prev;
            });
          } else {
            console.warn('Received already-shown cartoon on initial load, will not display');
          }
        }
      } catch (error) {
        console.error('Error fetching cartoon:', error);
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
      const fetchCartoon = async () => {
        try {
          // Get current shown cartoons from ref (always has latest value)
          const currentShown = shownCartoonsRef.current;
          
          // Build query parameter with shown cartoons
          const shownParam = currentShown.length > 0 
            ? `&shown=${encodeURIComponent(JSON.stringify(currentShown))}`
            : '';
          
          const response = await fetch(`/api/cartoon?t=${Date.now()}${shownParam}`);
          const data = await response.json();
          if (data.imageUrl) {
            // Double-check that this cartoon hasn't been shown (in case of race conditions)
            const isAlreadyShown = shownCartoonsRef.current.includes(data.imageUrl);
            if (!isAlreadyShown) {
              // Only set the cartoon if it's not already shown
              setCurrentCartoon({ imageUrl: data.imageUrl, source: data.source });
              // Add to shown cartoons using functional update to ensure we have latest state
              setShownCartoons(prev => {
                if (!prev.includes(data.imageUrl)) {
                  return [...prev, data.imageUrl];
                }
                return prev;
              });
            } else {
              // If it's already shown, try fetching again (but limit retries to avoid infinite loop)
              console.warn('Received already-shown cartoon, will not display');
            }
          }
        } catch (error) {
          console.error('Error fetching cartoon:', error);
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
    // Keep current cartoon visible while loading - will be replaced when new one loads

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

  const handleSuggestedQuestion = async (question: string) => {
    // Automatically send the suggested question
    if (isLoading) return;
    
    setInput('');
    setIsLoading(true);
    // Keep current cartoon visible while loading - will be replaced when new one loads

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

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Helper function to render icon SVG for suggested questions
  const renderSuggestedIcon = (iconType: string) => {
    const iconColor = '#34CAFF';
    
    switch (iconType) {
      case 'travel':
        return <MapPin className="w-5 h-5" color={iconColor} strokeWidth={2} />;
      case 'shopping':
        return <ShoppingBag className="w-5 h-5" color={iconColor} strokeWidth={2} />;
      case 'shield':
        return <Wallet className="w-5 h-5" color={iconColor} strokeWidth={2} />;
      case 'premium':
        return <Trophy className="w-5 h-5" color={iconColor} strokeWidth={2} />;
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
    <div className="relative overflow-hidden min-h-screen bg-background">
      {/* Animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5 animate-gradient-xy bg-[length:400%_400%]"></div>
      
      {/* Floating gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* First orb */}
        <div className="absolute top-1/4 -left-48 w-96 h-96 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-3xl"></div>
        {/* Second orb */}
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-3xl"></div>
      </div>
      
      <div className={`container mx-auto px-6 max-w-7xl relative z-10 ${messages.length > 0 ? 'py-4 md:py-6' : 'py-12'}`}>
        {/* Hero Section */}
        <section className={`relative overflow-hidden ${messages.length > 0 ? 'py-4 md:py-6 mb-2' : 'py-16 md:py-24 mb-6'}`}>
          {/* Hero content */}
          <div className="relative z-10 max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 tracking-tight">
              <span className="bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
                Find Your Perfect
              </span>
              <br />
              <span className="text-foreground">
                Credit Card Match
              </span>
            </h1>
            
            {messages.length === 0 && (
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Get personalized credit card recommendations powered by AI.<br />
                Find the perfect card for your spending habits and financial goals.
              </p>
            )}
          </div>
        </section>

        {/* Header - Feature boxes - Only show after user asks a question */}
        {messages.length > 0 && (
          <header className="mb-3 text-center">
            <div className="flex justify-center gap-3 mb-4">
              {/* AI-Powered */}
              <div className="bg-white/80 backdrop-blur-sm rounded-lg px-5 py-2.5 border border-slate-200/60 flex items-center gap-2.5 shadow-sm">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <span className="text-slate-700 font-medium text-sm">AI-Powered</span>
              </div>
              
              {/* Personalized */}
              <div className="bg-white/80 backdrop-blur-sm rounded-lg px-5 py-2.5 border border-slate-200/60 flex items-center gap-2.5 shadow-sm">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <span className="text-slate-700 font-medium text-sm">Personalized</span>
              </div>
              
              {/* Free to Use */}
              <div className="bg-white/80 backdrop-blur-sm rounded-lg px-5 py-2.5 border border-slate-200/60 flex items-center gap-2.5 shadow-sm">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-slate-700 font-medium text-sm">Free to Use</span>
              </div>
            </div>
          </header>
        )}


        {/* Popular Questions Section - Only show when no messages */}
        {messages.length === 0 && (
          <div className="max-w-6xl mx-auto mb-10">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#34CAFF' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold text-slate-900">Popular Questions</h3>
            </div>
            <div className="flex justify-center gap-4">
              {SUGGESTED_QUESTIONS.map((question, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestedQuestion(question.text)}
                  className="bg-white rounded-xl p-4 border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 flex-1 max-w-[240px]"
                >
                  <div className="flex flex-col items-center text-center gap-3">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E0F7FA' }}>
                      {renderSuggestedIcon(question.icon)}
                    </div>
                    <div className="flex-1 min-w-0 w-full">
                      <h3 className="font-bold text-slate-800 mb-1 text-lg leading-tight">
                        {question.text}
                      </h3>
                      <p className="text-base text-muted-foreground leading-snug">
                        {question.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Field at Bottom - Only show when no messages */}
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto mt-8 mb-6">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about credit cards, rewards, travel perks..."
                className="flex-1 px-5 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white/90 backdrop-blur-sm shadow-sm transition-all"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center min-w-[56px] shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <div className="mt-3 text-center text-xs text-slate-500 space-x-4">
              <span>✓ Enter to send</span>
              <span>✨ Instant AI recommendations</span>
            </div>
          </div>
        )}

        {/* Two Column Layout - Only show when there are messages */}
        {messages.length > 0 && (
        <div className={`grid gap-6 mb-6 ${messages.some(msg => msg.role === 'user') ? 'grid-cols-5' : 'grid-cols-1 max-w-2xl mx-auto'}`} style={{ height: messages.some(msg => msg.role === 'user') ? '700px' : '500px', maxHeight: messages.some(msg => msg.role === 'user') ? '700px' : '500px', overflow: 'hidden' }}>
          {/* Left Column - Chatbot */}
          <div className={`${messages.some(msg => msg.role === 'user') ? 'col-span-2' : 'col-span-1'} flex flex-col`} style={{ height: messages.some(msg => msg.role === 'user') ? '700px' : '500px', maxHeight: messages.some(msg => msg.role === 'user') ? '700px' : '500px', overflow: 'hidden' }}>
            <div className={`bg-white rounded-2xl shadow-2xl shadow-slate-300/40 border border-slate-200/60 h-full flex flex-col backdrop-blur-sm bg-gradient-to-br from-white to-slate-50/50 ${messages.some(msg => msg.role === 'user') ? 'p-4 md:p-8' : 'p-4 md:p-6'}`} style={{ maxHeight: '100%', overflow: 'hidden' }}>
              <div className={`${messages.some(msg => msg.role === 'user') ? 'mb-6 pb-4' : 'mb-4 pb-3'} border-b border-slate-200 flex-shrink-0`}>
                <h3 className={`${messages.some(msg => msg.role === 'user') ? 'text-xl' : 'text-lg'} font-semibold text-slate-900 mb-1`}>Your Questions</h3>
                <p className="text-sm text-slate-500 font-light">Ask me anything about credit cards</p>
              </div>
              <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto mb-4 min-h-0 max-h-full scrollbar-thin px-1"
                style={{ scrollbarWidth: 'thin' }}
              >
              {(
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

                      // Check if this is an error/fallback message (specifically the "I couldn't find" message)
                      const isErrorMessage = message.summary && (
                        message.summary.toLowerCase().includes("i couldn't find") ||
                        message.summary.toLowerCase().includes("couldn't find any credit cards")
                      );

                      return (
                        <div key={index} className="mb-6 max-w-2xl mx-auto" data-message-index={index}>
                          {/* User Message */}
                          <div className="flex items-start gap-3 mb-4">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 flex items-center justify-center shadow-sm">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl p-4 px-5 shadow-sm flex-1 transition-all duration-200">
                              <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed break-words">{message.content}</p>
                            </div>
                          </div>
                          
                          {/* Bot Response */}
                          {message.summary && (
                            <div className={`flex items-start gap-3 ${isErrorMessage ? '' : 'mb-0'}`}>
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shadow-sm">
                                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                              </div>
                              {isErrorMessage ? (
                                <div className="flex-1 bg-blue-50 rounded-xl p-4 px-5 shadow-sm border border-blue-100 transition-all duration-200">
                                  <div className="flex items-start gap-2 mb-3">
                                    <span className="text-xl flex-shrink-0">💡</span>
                                    <p className="text-[15px] text-slate-700 leading-relaxed font-medium break-words">
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
                                        className="border border-teal-600 text-teal-600 rounded-full px-4 py-2 text-sm font-medium hover:bg-teal-50 focus:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {suggestion}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-gray-50 rounded-xl p-4 px-5 shadow-sm flex-1 max-w-2xl transition-all duration-200">
                                  <div className="prose prose-sm max-w-none">
                                    <ReactMarkdown
                                      components={{
                                        a: ({ ...props }) => (
                                          <a 
                                            {...props} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-teal-600 font-semibold hover:text-teal-700 underline decoration-2 decoration-teal-300 hover:decoration-teal-500 transition-colors duration-200"
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
                                          <p className="mb-3 text-[15px] leading-[1.6] text-slate-700 break-words" {...props} />
                                        ),
                                        ul: ({ ...props }) => (
                                          <ul className="list-none space-y-3 my-3" {...props} />
                                        ),
                                        li: ({ ...props }) => (
                                          <li className="mb-4 text-[15px] leading-[1.6] text-slate-700 break-words" {...props} />
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
                                              `- **[${rec.credit_card_name}](${rec.apply_url})** - ${rec.reason}`
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
                          )}
                        </div>
                      );
                    })}
                  {isLoading && (
                    <div className="flex items-start gap-3 mb-6 max-w-2xl mx-auto">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shadow-sm">
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 px-5 shadow-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-600 text-[15px] font-medium">Thinking</span>
                          <div className="flex gap-1 ml-2">
                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
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
            <div className={`flex gap-3 mt-auto border-t border-slate-200 flex-shrink-0 ${messages.some(msg => msg.role === 'user') ? 'pt-4 md:pt-6' : 'pt-3 md:pt-4'}`}>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about credit cards..."
                  className="flex-1 px-4 md:px-5 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white shadow-sm transition-all duration-200"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="px-5 md:px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl hover:from-teal-700 hover:to-cyan-700 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200 text-sm flex items-center justify-center min-w-[56px] shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Credit Card Recommendations - Only show after a question is asked */}
          {messages.some(msg => msg.role === 'user') && (
          <div className="col-span-3 flex flex-col" style={{ height: '700px', maxHeight: '700px', overflow: 'hidden' }}>
            <div className="bg-white rounded-2xl shadow-2xl shadow-slate-300/40 border border-slate-200/60 p-8 h-full flex flex-col backdrop-blur-sm bg-gradient-to-br from-white to-slate-50/50" style={{ maxHeight: '100%', overflow: 'hidden' }}>
              <div className="flex items-center gap-3 mb-8 flex-shrink-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{recommendationTitle || 'Top Bank Cards'}</h2>
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
                      <div className="flex flex-col items-center pt-0 pb-4">
                        <SwipeToLoad />
                        {currentCartoon && (
                          <div className="mt-3 flex flex-col items-center">
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

                  return (
                    <>
                      <div className="grid grid-cols-3 gap-5 mb-6">
                        {mostRecentAssistantMessage.recommendations.slice(0, 4).map((rec, recIndex) => (
                          <div
                            key={recIndex}
                            className="bg-gradient-to-br from-white via-white to-slate-50/30 rounded-xl border border-slate-200/80 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:shadow-teal-200/30 transition-all duration-300 p-6 flex flex-col group hover:border-teal-300/60 hover:-translate-y-1"
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
                                className="mt-auto w-full text-center px-5 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm font-semibold rounded-xl hover:from-teal-700 hover:to-cyan-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/40 hover:shadow-xl hover:shadow-teal-500/50 group-hover:scale-[1.02]"
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
          )}
        </div>
        )}

      </div>
    </div>
  );
}

