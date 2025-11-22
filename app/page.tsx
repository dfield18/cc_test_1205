'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Recommendation } from '@/types';
import SwipeToLoad from '@/components/SwipeToLoad';
import CartoonDisplay from '@/components/CartoonDisplay';
import ReactMarkdown from 'react-markdown';
import { Plane, ShoppingCart, Shield, User, Sparkles, CreditCard, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Check, Star, ExternalLink, TrendingUp } from 'lucide-react';

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
  
  // Questions to show in carousel (6 on desktop, all on mobile)
  const carouselQuestions = useMemo(() => {
    return isDesktop ? SUGGESTED_QUESTIONS.slice(0, 6) : SUGGESTED_QUESTIONS;
  }, [isDesktop]);
  const shownCartoonsRef = useRef<string[]>([]);
  const chatbotContainerRef = useRef<HTMLDivElement>(null);
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
  
  // Get the most recent recommendations for mobile bottom bar
  const topThreeRecommendations = useMemo(() => {
    const mostRecentAssistantMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0);
    
    const recommendations = mostRecentAssistantMessage?.recommendations || [];
    return recommendations.slice(0, 3);
  }, [messages]);
  
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

    // Handle touch events for trackpads
    const handleTouchMove = (e: TouchEvent) => {
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

    window.addEventListener('scroll', handleScroll, { passive: false });
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchmove', handleTouchMove);
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
      // Clear the current cartoon immediately so old one doesn't show while new one loads
      setCurrentCartoon(null);
      
      const fetchCartoon = async (retryCount = 0) => {
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
              // If it's already shown and we haven't retried too many times, try again
              if (retryCount < 3) {
                console.warn('Received already-shown cartoon, retrying...');
                // Wait a bit before retrying to avoid rapid requests
                setTimeout(() => fetchCartoon(retryCount + 1), 100);
              } else {
                console.warn('Received already-shown cartoon after retries, will not display');
              }
            }
          } else {
            // If no imageUrl in response, retry if we haven't exceeded retry limit
            if (retryCount < 3) {
              console.warn('No imageUrl in response, retrying...');
              setTimeout(() => fetchCartoon(retryCount + 1), 100);
            }
          }
        } catch (error) {
          console.error('Error fetching cartoon:', error);
          // Retry on error if we haven't exceeded retry limit
          if (retryCount < 3) {
            setTimeout(() => fetchCartoon(retryCount + 1), 200);
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
    <div className="relative overflow-hidden min-h-screen bg-background">
      {/* Custom grid styles for desktop */}
      <style dangerouslySetInnerHTML={{__html: `
        @media (min-width: 1024px) {
          .desktop-grid-cols {
            grid-template-columns: 32% 68% !important;
          }
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
      
      <div className={`container mx-auto px-4 lg:px-6 max-w-7xl relative z-10 ${messages.length > 0 ? (messages.some(msg => msg.role === 'user') ? 'pt-6 lg:pt-4 md:pt-6' : 'pt-4 md:pt-6') : 'pt-6 md:pt-8 lg:pt-4'} ${messages.length > 0 ? (messages.some(msg => msg.role === 'user') ? 'pb-24 lg:pb-4 md:pb-6' : 'pb-4 md:pb-6') : 'pb-6 md:pb-8'}`}>
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
                <span className="text-foreground">Credit Card Match</span>
              </span>
              <span className="lg:hidden">
                <span className="text-primary">Find Your Perfect</span>
                <br />
                <span className="text-foreground">Credit Card Match</span>
              </span>
            </h1>
            
            {messages.length === 0 && (
              <p className="text-lg lg:text-2xl text-muted-foreground max-w-2xl mx-auto leading-tight lg:leading-relaxed mb-0 lg:mb-4">
                <span className="lg:hidden">Get personalized credit card recommendations powered by AI.</span>
                <span className="hidden lg:block">
                  <span className="whitespace-nowrap block">Get personalized credit card recommendations powered by AI.</span>
                  <span className="whitespace-nowrap block">Find the perfect card for your spending habits and financial goals.</span>
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
                      <h3 className="font-semibold text-base text-card-foreground leading-tight">
                        {question.text}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
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
                      <h3 className="font-semibold text-base text-card-foreground leading-tight px-2">
                        {question.mobileText || question.text}
                      </h3>
                      <p className="text-base md:text-sm text-muted-foreground leading-relaxed px-2">
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
                  
                  return (
                    <>
                      {/* Sliding indicator bar */}
                      <div 
                        className="absolute h-2 bg-primary rounded-full transition-all duration-75 ease-out"
                        style={{
                          width: '1.5rem',
                          left: `${barPosition}rem`,
                          top: '0',
                          transform: 'translateY(0)'
                        }}
                      />
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
                              isActive ? 'bg-slate-300 w-2' : 'bg-slate-300'
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
                  <div className="text-3xl font-bold text-primary mb-2">10,000+</div>
                  <div className="text-base text-muted-foreground font-sans">Cards Analyzed</div>
                </div>
                
                {/* Happy Users */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">50,000+</div>
                  <div className="text-base text-muted-foreground font-sans">Happy Users</div>
                </div>
                
                {/* AI-Powered */}
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

        {/* Two Column Layout - Only show when there are messages */}
        {messages.length > 0 && (
        <div 
          ref={chatbotContainerRef} 
          className={`grid gap-6 mb-6 mt-12 lg:mt-4 ${messages.some(msg => msg.role === 'user') ? 'grid-cols-1 desktop-grid-cols lg:-ml-12 lg:-mr-12' : 'grid-cols-1 max-w-xl mx-auto'} ${messages.some(msg => msg.role === 'user') ? 'lg:h-[700px]' : 'h-[500px]'} overflow-visible lg:overflow-hidden`}
        >
          {/* Left Column - Chatbot */}
          <div className={`${messages.some(msg => msg.role === 'user') ? 'lg:col-span-1' : 'col-span-1'} flex flex-col ${messages.some(msg => msg.role === 'user') ? 'min-h-[600px] lg:h-[700px]' : 'h-[500px]'} overflow-visible lg:overflow-hidden`}>
            <div className={`lg:bg-transparent bg-transparent rounded-2xl lg:shadow-none border lg:border-transparent border-slate-200/30 lg:h-full flex flex-col backdrop-blur-sm ${messages.some(msg => msg.role === 'user') ? 'p-4 lg:p-8' : 'p-4 md:p-6'}`} style={{ maxHeight: '100%' }}>
              <div className={`${messages.some(msg => msg.role === 'user') ? 'mb-6 pb-4' : 'mb-4 pb-3'} border-b border-slate-200/60 flex-shrink-0 hidden lg:block`}>
                <h3 className={`${messages.some(msg => msg.role === 'user') ? 'text-xl' : 'text-lg'} font-semibold text-slate-900 mb-1`}>Your Questions</h3>
                <p className="text-base text-muted-foreground">Ask me anything about credit cards</p>
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
                className={`flex-1 mb-4 min-h-0 lg:max-h-full px-1 lg:[direction:rtl] ${
                  messages.some(msg => msg.role === 'user') 
                    ? 'lg:overflow-y-auto overflow-x-hidden lg:scrollbar-thin overflow-visible' 
                    : 'lg:overflow-hidden overflow-visible scrollbar-hide'
                }`}
                style={messages.some(msg => msg.role === 'user') 
                  ? (isMobile ? { overflowX: 'hidden' } : { 
                      scrollbarWidth: 'thin', 
                      overflowX: 'hidden', 
                      overflowY: 'auto',
                      touchAction: 'pan-y',
                      direction: 'rtl'
                    })
                  : (isMobile ? {} : { overflow: 'hidden', scrollbarWidth: 'none' })
                }
              >
              <div className="lg:[direction:ltr] overflow-x-hidden overflow-y-hidden min-w-0">
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
                        <div key={displayIndex} className="mb-6 max-w-xl lg:max-w-lg lg:mx-auto overflow-x-hidden min-w-0" data-message-index={displayIndex}>
                          {/* User Message */}
                          <div className="flex items-start gap-3 mb-4 flex-row-reverse lg:flex-row">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 flex items-center justify-center shadow-sm">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl p-4 px-5 shadow-sm flex-1 transition-all duration-200 min-w-0 overflow-hidden">
                              <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed break-words overflow-wrap-anywhere">{message.content}</p>
                            </div>
                          </div>
                          
                          {/* Bot Response */}
                          {message.summary && (
                            <div className={`flex items-start gap-3 flex-row-reverse lg:flex-row ${isErrorMessage ? '' : 'mb-0'}`}>
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shadow-sm">
                                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                              </div>
                              {isErrorMessage ? (
                                <div className="flex-1 bg-blue-50 rounded-xl p-4 px-5 shadow-sm border border-blue-100 transition-all duration-200 min-w-0 overflow-hidden">
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
                                        className="border border-teal-600 text-teal-600 rounded-full px-4 py-3 h-12 md:h-auto text-base md:text-sm font-medium hover:bg-teal-50 focus:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {suggestion}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-gray-50 rounded-xl p-4 px-5 shadow-sm flex-1 max-w-xl lg:max-w-lg transition-all duration-200 min-w-0 overflow-hidden">
                                  <div className="prose prose-sm max-w-none overflow-x-hidden">
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
                        <div className="hidden lg:flex items-start gap-3 mb-6 max-w-xl lg:max-w-lg mx-auto">
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
                      </>
                    );
                  })()}
                  
                  {/* Input Area - Desktop */}
                  {!isLoading && (
                    <div className="hidden lg:flex flex-col sm:flex-row gap-3 mt-6 mb-6 max-w-xl lg:max-w-lg lg:mx-auto">
                      <div className="flex items-start gap-3 w-full">
                        {/* Spacer to match avatar width */}
                        <div className="flex-shrink-0 w-8 h-8"></div>
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            onFocus={(e) => {
                              // Prevent scroll when input is focused on desktop
                              if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
                                e.preventDefault();
                                // Store current scroll position
                                if (chatContainerRef.current) {
                                  const currentScroll = chatContainerRef.current.scrollTop;
                                  // Restore scroll position after a brief delay to prevent browser auto-scroll
                                  setTimeout(() => {
                                    if (chatContainerRef.current) {
                                      chatContainerRef.current.scrollTop = currentScroll;
                                    }
                                  }, 0);
                                }
                              }
                            }}
                            placeholder="Ask about credit cards..."
                            className="w-full min-h-[56px] h-10 py-7 lg:py-6 px-3 pr-16 lg:pr-24 text-base border border-input rounded-md shadow-card bg-card text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200"
                          />
                          <button
                            onClick={handleSend}
                            disabled={isLoading || !input.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[48px] min-h-[48px] lg:min-w-[56px] lg:min-h-[56px] bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl hover:from-teal-700 hover:to-cyan-700 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Dynamic Suggested Questions - After most recent answer - Desktop only */}
                  {dynamicSuggestions.length > 0 && messages.length > 0 && !isLoading && (
                    <div className="hidden lg:block mt-6 pt-6 border-t border-slate-200 max-w-sm lg:max-w-none">
                      <p className="text-xs md:text-sm text-slate-500 mb-4 font-semibold uppercase tracking-wide">You might also ask:</p>
                      {/* Fixed three boxes grid for desktop */}
                      <div className="grid grid-cols-3 gap-3">
                        {dynamicSuggestions.slice(0, 3).map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSuggestedQuestion(suggestion)}
                            disabled={isLoading}
                            className="bg-white rounded-xl p-2 border border-slate-200 hover:border-teal-300 hover:shadow-md hover:scale-105 transition-all duration-200 h-[160px] flex flex-col disabled:opacity-50 disabled:cursor-not-allowed group focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                          >
                            <div className="flex flex-col items-center text-center space-y-2 flex-1 justify-center">
                              <div className="rounded-full bg-primary/10 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center">
                                <span className="text-lg group-hover:scale-110 transition-transform">{getSuggestionIcon(suggestion)}</span>
                              </div>
                              <h3 className="font-semibold text-xs text-card-foreground leading-tight px-2">
                                {suggestion}
                              </h3>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              </div>
              <div ref={messagesEndRef} />
              
              {/* Mobile: Expandable recommendation boxes below chatbox */}
              {topThreeRecommendations.length > 0 && (
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
                            <h4 className="font-semibold text-sm text-slate-900 text-left line-clamp-1 flex-1 min-w-0">
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
                          <div className="px-3 pb-3 pt-0 border-t border-slate-100">
                            <div className="pt-3 space-y-2 text-sm">
                              {/* Annual Fee */}
                              {rec.annual_fee && (
                                <div className="flex justify-between items-start gap-2">
                                  <span className="font-medium text-slate-500">Annual Fee:</span>
                                  <span className="text-slate-700 font-medium text-right">{rec.annual_fee}</span>
                                </div>
                              )}
                              
                              {/* Intro Offer */}
                              {rec.intro_offer && (
                                <div className="flex justify-between items-start gap-2">
                                  <span className="font-medium text-slate-500">Intro Offer:</span>
                                  <span className="text-slate-700 font-medium text-right">{rec.intro_offer}</span>
                                </div>
                              )}
                              
                              {/* Perks */}
                              {rec.perks && (
                                <div className="flex justify-between items-start gap-2">
                                  <span className="font-medium text-slate-500">Perks:</span>
                                  <span className="text-slate-700 font-medium text-right">{rec.perks}</span>
                                </div>
                              )}
                            </div>
                            
                            {/* Apply Button */}
                            <a
                              href={rec.apply_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 block w-full bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-lg text-sm font-semibold py-2.5 text-center hover:from-teal-700 hover:to-cyan-700 transition-all duration-200 active:scale-95"
                            >
                              Apply Now
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Mobile: Dynamic Suggested Questions - After recommendation cards */}
              {dynamicSuggestions.length > 0 && messages.length > 0 && !isLoading && (
                <div className="lg:hidden border-t border-slate-200 max-w-sm" style={{ marginTop: '3rem', paddingTop: '1rem' }}>
                  <p className="text-xs md:text-sm text-slate-500 mb-4 font-semibold uppercase tracking-wide">You might also ask:</p>
                  {/* Carousel for mobile */}
                  <div 
                    ref={suggestionsCarouselRef}
                    className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 px-4 -mx-4 bg-slate-50/50 rounded-lg py-3"
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
                    {dynamicSuggestions.slice(0, 4).map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestedQuestion(suggestion)}
                        disabled={isLoading}
                        className="bg-white rounded-xl p-2 border border-slate-200 hover:border-teal-300 hover:shadow-md hover:scale-105 transition-all duration-200 h-[160px] w-[200px] flex-shrink-0 snap-center flex flex-col disabled:opacity-50 disabled:cursor-not-allowed group focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                      >
                        <div className="flex flex-col items-center text-center space-y-2 flex-1 justify-center">
                          <div className="rounded-full bg-primary/10 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center">
                            <span className="text-lg group-hover:scale-110 transition-transform">{getSuggestionIcon(suggestion)}</span>
                          </div>
                          <h3 className="font-semibold text-xs text-card-foreground leading-tight px-2">
                            {suggestion}
                          </h3>
                        </div>
                      </button>
                    ))}
                  </div>
                  {/* Carousel Indicators */}
                  {dynamicSuggestions.length > 0 && (() => {
                    const totalDots = dynamicSuggestions.slice(0, 4).length;
                    const dotWidth = 0.5; // w-2 = 0.5rem (inactive), w-6 = 1.5rem (active)
                    const gap = 0.5; // gap-2 = 0.5rem
                    const barWidth = 1.5; // width of sliding bar
                    
                    // Calculate positions based on actual dot layout
                    // Dots are in flex container with gap-2 (0.5rem between elements)
                    // Each dot button: w-2 (0.5rem) inactive, w-6 (1.5rem) active
                    // 
                    // For 4 dots with gap-2:
                    //   Dot 0: left=0, right=0.5rem (inactive) or 1.5rem (active)
                    //   Gap: 0.5rem
                    //   Dot 1: left=1rem, right=1.5rem (inactive) or 2.5rem (active)
                    //   Gap: 0.5rem
                    //   Dot 2: left=2rem, right=2.5rem (inactive) or 3.5rem (active)
                    //   Gap: 0.5rem
                    //   Dot 3: left=3rem, right=3.5rem (inactive) or 4.5rem (active)
                    //
                    // Bar should move from 0 to align with rightmost dot's right edge (4.5rem when active)
                    // Bar right edge at rightmost: 4.5rem, so bar left: 4.5rem - 1.5rem = 3rem
                    const dotSpacing = dotWidth + gap; // 1rem between dot left edges
                    const leftmostPosition = 0;
                    const rightmostDotLeftEdge = (totalDots - 1) * dotSpacing; // 3rem for 4 dots
                    const rightmostDotRightEdge = rightmostDotLeftEdge + 1.5; // 4.5rem (active)
                    const rightmostPosition = rightmostDotRightEdge - barWidth; // 3rem
                    
                    // Map scroll progress (0-1) to bar position
                    // Bar should reach rightmost position when scroll is 75% (0.75) of the way
                    // So we need to scale the progress: when progress = 0.75, bar should be at rightmostPosition
                    // Scale factor: rightmostPosition should be reached at progress = 0.75
                    // So: barPosition = (progress / 0.75) * rightmostPosition, capped at rightmostPosition
                    const scaledProgress = Math.min(suggestionsCarouselScrollProgress / 0.75, 1.0);
                    const barPosition = scaledProgress * rightmostPosition;
                    
                    return (
                      <div className="flex justify-center gap-2 mt-4 relative" style={{ width: 'fit-content', margin: '1rem auto 0' }}>
                        {/* Sliding indicator bar */}
                        <div 
                          className="absolute h-2 bg-primary rounded-full transition-all duration-75 ease-out"
                          style={{
                            width: '1.5rem',
                            left: `${barPosition}rem`,
                            top: '0',
                            transform: 'translateY(0)'
                          }}
                        />
                      {dynamicSuggestions.slice(0, 4).map((_, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            if (suggestionsCarouselRef.current) {
                              // Mobile card width is 200px
                              const cardWidth = 200;
                              const gap = 12; // gap-3 = 12px
                              suggestionsCarouselRef.current.scrollTo({
                                left: index * (cardWidth + gap),
                                behavior: 'smooth'
                              });
                            }
                          }}
                          className={`w-2 h-2 rounded-full transition-all duration-200 relative z-10 ${
                            index === suggestionsCarouselIndex ? 'bg-primary w-6' : 'bg-slate-300'
                          }`}
                          aria-label={`Go to slide ${index + 1}`}
                        />
                      ))}
                      </div>
                    );
                  })()}
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
                        className="max-w-full max-h-full object-contain drop-shadow-lg"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
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
            </div>
          </div>

          {/* Right Column - Credit Card Recommendations - Only show after a question is asked */}
          {messages.some(msg => msg.role === 'user') && (
          <div className="hidden lg:flex lg:col-span-1 flex-col h-[500px] lg:h-[700px]" style={{ overflow: 'hidden', marginLeft: '5%' }}>
            <div className="lg:bg-transparent bg-white rounded-2xl lg:shadow-none lg:border-transparent shadow-2xl shadow-slate-300/40 border border-slate-200/60 p-4 lg:p-8 h-full flex flex-col backdrop-blur-sm" style={{ maxHeight: '100%', overflow: 'hidden' }}>
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

              <div className="flex-1 overflow-y-auto min-h-0 max-h-full scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
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
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
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
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
                        {mostRecentAssistantMessage.recommendations.slice(0, 4).map((rec, recIndex) => {
                          // Extract issuer from card name (usually first word)
                          const cardNameParts = rec.credit_card_name.split(' ');
                          const issuer = cardNameParts[0];
                          const cardName = cardNameParts.slice(1).join(' ') || rec.credit_card_name;
                          
                          // Parse benefits from reason, perks, or rewards_rate
                          const parseBenefits = (): string[] => {
                            const benefits: string[] = [];
                            
                            // Add rewards rate as a benefit if available
                            if (rec.rewards_rate && !rec.rewards_rate.toLowerCase().includes('apr')) {
                              benefits.push(rec.rewards_rate);
                            }
                            
                            // Parse perks if available
                            if (rec.perks) {
                              const perkList = rec.perks
                                .split(/[.,;]/)
                                .map(p => p.trim())
                                .filter(p => p.length > 10 && p.length < 100); // Reasonable length
                              benefits.push(...perkList);
                            }
                            
                            // Parse reason for key benefits
                            if (rec.reason && benefits.length < 4) {
                              const reasonBenefits = rec.reason
                                .split(/[.,;]/)
                                .map(r => r.trim())
                                .filter(r => {
                                  const lower = r.toLowerCase();
                                  return r.length > 15 && 
                                         r.length < 100 &&
                                         !lower.includes('annual fee') &&
                                         !lower.includes('credit score') &&
                                         (lower.includes('points') || 
                                          lower.includes('cash back') || 
                                          lower.includes('rewards') ||
                                          lower.includes('travel') ||
                                          lower.includes('perk') ||
                                          lower.includes('benefit'));
                                });
                              benefits.push(...reasonBenefits);
                            }
                            
                            return benefits.slice(0, 4); // Limit to 4 benefits
                          };
                          
                          const benefits = parseBenefits();
                          
                          return (
                            <div
                              key={recIndex}
                              className="bg-gradient-to-br from-card to-blue-50 rounded-xl border border-border shadow-md hover:shadow-lg transition-all duration-300 p-6 flex flex-col group hover:-translate-y-1 space-y-4"
                            >
                              {/* Header Section */}
                              <div className="flex items-start gap-3">
                                {/* Card Icon */}
                                <div className="w-16 h-10 rounded bg-gradient-to-br from-primary/10 to-primary/5 border border-border flex-shrink-0 flex items-center justify-center">
                                  <CreditCard className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  {/* Card Name */}
                                  <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors leading-tight mb-1">
                                    <a 
                                      href={rec.apply_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline cursor-pointer"
                                    >
                                      {cardName}
                                    </a>
                                  </h3>
                                  {/* Issuer */}
                                  <p className="text-sm text-muted-foreground">{issuer}</p>
                                </div>
                              </div>
                              
                              {/* Benefits Section */}
                              {benefits.length > 0 && (
                                <div className="space-y-2">
                                  {benefits.map((benefit, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                      <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                                      <p className="text-sm text-foreground leading-relaxed">{benefit}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Footer Section */}
                              <div className="border-t border-border pt-4 space-y-3">
                                {/* Badges */}
                                <div className="flex flex-wrap gap-2">
                                  {rec.annual_fee && (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                      {rec.annual_fee}
                                    </span>
                                  )}
                                </div>
                                
                                {/* CTA Button */}
                                <a
                                  href={rec.apply_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium border border-border rounded-lg bg-transparent text-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-300 group-hover:border-primary"
                                >
                                  Learn More
                                  <ExternalLink className="w-4 h-4 ml-2" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Cartoon below the cards - Desktop only */}
                      {currentCartoon && (
                        <div className="hidden lg:flex mt-6 flex-col items-center">
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
    </div>
  );
}

