'use client';

import { useState } from 'react';

interface HeroSectionProps {
  onQuestionClick: (question: string) => void;
}

export default function HeroSection({ onQuestionClick }: HeroSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = () => {
    if (searchQuery.trim()) {
      onQuestionClick(searchQuery);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pt-16 pb-8">
      <h1 className="text-5xl md:text-6xl font-bold text-center mb-6 leading-tight">
        <span className="text-teal-600">Find Your</span>{' '}
        <span className="text-purple-500">Perfect</span>{' '}
        <span className="text-teal-600">Credit Card</span>
      </h1>
      
      <p className="text-xl text-gray-700 text-center mb-2">
        Get personalized credit card recommendations powered by AI.
      </p>
      <p className="text-xl text-gray-700 text-center mb-8">
        Choose the card that fits your life.
      </p>

      <div className="flex gap-3 max-w-3xl mx-auto mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about credit cards, rewards, travel perks..."
          className="flex-1 px-6 py-4 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-lg"
        />
        <button
          onClick={handleSearch}
          className="px-8 py-4 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 font-medium"
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

      <div className="flex gap-6 justify-center text-sm text-gray-500">
        <span className="flex items-center gap-1">
          <span className="text-green-600">✓</span> Enter to send
        </span>
        <span className="flex items-center gap-1">
          <span>⚡</span> Instant AI recommendations
        </span>
      </div>
    </div>
  );
}

