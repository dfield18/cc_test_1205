'use client';

interface QuickStartGuideProps {
  onQuestionClick: (question: string) => void;
}

const popularQuestions = [
  {
    icon: '🏔️',
    question: "What's the best card for travel?",
    description: "Maximize points on flights and hotels",
  },
  {
    icon: '💳',
    question: "How can I earn cash back on everyday purchases?",
    description: "Earn cashback on everyday purchases",
  },
  {
    icon: '🛡️',
    question: "Show the best cards with no annual fee",
    description: "Get great rewards without yearly costs",
  },
];

export default function QuickStartGuide({ onQuestionClick }: QuickStartGuideProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex justify-center mb-6">
        <button className="px-6 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 transition-colors flex items-center gap-2 text-sm font-medium">
          <span>✨</span>
          Popular Questions
        </button>
      </div>

      <h2 className="text-4xl font-bold text-center mb-3 text-gray-800">
        Quick Start Guide
      </h2>
      <p className="text-center text-gray-600 mb-8">
        Choose a question or ask your own
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {popularQuestions.map((item, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick(item.question)}
            className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow text-left border border-gray-100 hover:border-teal-200"
          >
            <div className="text-3xl mb-3">{item.icon}</div>
            <h3 className="font-semibold text-gray-800 mb-2">{item.question}</h3>
            <p className="text-sm text-gray-600">{item.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

