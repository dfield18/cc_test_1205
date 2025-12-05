export default function StatsSection() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
        <div>
          <div className="text-5xl font-bold text-teal-600 mb-2">300+</div>
          <div className="text-gray-700">Cards Analyzed</div>
        </div>
        <div>
          <div className="text-5xl font-bold text-teal-600 mb-2">1,400+</div>
          <div className="text-gray-700">Verified Data Sources</div>
        </div>
        <div>
          <div className="text-5xl font-bold text-teal-600 mb-2">AI-Powered</div>
          <div className="text-gray-700">Smart Recommendations</div>
        </div>
      </div>
    </div>
  );
}

