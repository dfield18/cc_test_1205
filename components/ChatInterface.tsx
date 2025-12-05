'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import CreditCardBox from '@/components/CreditCardBox';
import RecommendedQuestions from '@/components/RecommendedQuestions';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  creditCards?: Array<{
    name: string;
    url: string;
    highlights: string;
  }>;
  recommendedQuestions?: string[];
}

interface ChatInterfaceProps {
  initialMessage?: string;
  onBack?: () => void;
}

export default function ChatInterface({ initialMessage = '', onBack }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialMessage) {
      handleSend(initialMessage);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text) return;

    const userMessage: Message = {
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message,
        creditCards: data.creditCards || [],
        recommendedQuestions: data.recommendedQuestions || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 min-h-screen flex flex-col">
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 text-teal-600 hover:text-teal-700 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </button>
      )}

      <div className="flex-1 space-y-6 mb-8">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <h1 className="text-4xl font-bold mb-4">
              <span className="text-teal-600">Find Your</span>{' '}
              <span className="text-purple-500">Perfect</span>{' '}
              <span className="text-teal-600">Credit Card</span>
            </h1>
            <p className="text-gray-600 mb-8">
              Ask me anything about credit cards!
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3xl rounded-lg p-4 ${
                message.role === 'user'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white border border-gray-200 shadow-sm'
              }`}
            >
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      // Customize markdown rendering for better styling
                      p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-teal-700">{children}</strong>,
                      ul: ({ children }) => <ul className="my-2 space-y-1">{children}</ul>,
                      li: ({ children }) => <li className="ml-4">{children}</li>,
                      h3: ({ children }) => <h3 className="font-semibold text-lg mt-4 mb-2 text-gray-900">{children}</h3>,
                      h4: ({ children }) => <h4 className="font-semibold text-base mt-3 mb-1.5 text-gray-800">{children}</h4>,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
              
              {message.creditCards && message.creditCards.length > 0 && (
                <div className="mt-4 space-y-3">
                  {message.creditCards.map((card, cardIndex) => (
                    <CreditCardBox
                      key={cardIndex}
                      name={card.name}
                      url={card.url}
                      highlights={card.highlights}
                    />
                  ))}
                </div>
              )}

              {message.recommendedQuestions && message.recommendedQuestions.length > 0 && (
                <RecommendedQuestions
                  questions={message.recommendedQuestions}
                  onQuestionClick={handleSend}
                />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-teal-600 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about credit cards, rewards, travel perks..."
          className="flex-1 px-6 py-4 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-lg"
        />
        <button
          onClick={() => handleSend()}
          disabled={loading}
          className="px-8 py-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 font-medium disabled:opacity-50"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          Search
        </button>
      </div>
    </div>
  );
}

