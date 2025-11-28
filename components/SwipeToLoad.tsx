'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

const defaultMessages = [
  'Processing your card options…',
  'Comparing APRs responsibly…',
  'Checking perks and bonuses…',
  'Finding the best fit for your lifestyle…',
];

interface SwipeToLoadProps {
  messages?: string[];
}

export default function SwipeToLoad({ messages = defaultMessages }: SwipeToLoadProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  // Cycle through messages every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [messages.length]);

  // Animation keyframes for the card swipe
  const cardAnimation = {
    x: [0, 35, -35, 0, 0],
    rotate: [0, 5, -5, 0, 0],
    scale: [1, 1, 1, 1, 0.96, 1],
    transition: {
      duration: 2.5,
      repeat: Infinity,
      ease: 'easeInOut' as const,
      times: [0, 0.3, 0.6, 0.8, 0.9, 1],
    },
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-6 py-8">
      {/* Animated Credit Card */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative"
      >
        <motion.div
          className="w-64 h-40 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 shadow-xl border border-slate-200"
          animate={cardAnimation}
        >
          {/* Card chip */}
          <div className="absolute top-4 left-4 w-10 h-8 bg-gradient-to-br from-amber-400 to-amber-500 rounded-sm shadow-md" />
          
          {/* Card number placeholder */}
          <div className="absolute bottom-12 left-4 right-4 h-3 bg-slate-300/50 rounded" />
          <div className="absolute bottom-8 left-4 w-24 h-3 bg-slate-300/50 rounded" />
          
          {/* Card brand indicator */}
          <div className="absolute bottom-4 right-4 w-12 h-8 bg-gradient-to-br from-teal-500 to-cyan-600 rounded opacity-70" />
        </motion.div>
      </motion.div>

      {/* Rotating Status Message */}
      <AnimatePresence mode="wait">
        <motion.div
          key={messageIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
          className="text-sm text-slate-600 font-medium"
        >
          {messages[messageIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

