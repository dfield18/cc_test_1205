'use client';

interface RecommendedQuestionsProps {
  questions: string[];
  onQuestionClick: (question: string) => void;
}

export default function RecommendedQuestions({ questions, onQuestionClick }: RecommendedQuestionsProps) {
  if (!questions || questions.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <p className="text-sm text-gray-600 mb-3 font-medium">Recommended Questions:</p>
      <div className="flex flex-wrap gap-2">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick(question)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

