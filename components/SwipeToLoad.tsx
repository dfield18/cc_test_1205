'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

const messages = [
  'Processing your card options…',
  'Comparing APRs responsibly…',
  'Checking perks and bonuses…',
  'Finding the best fit for your lifestyle…',
];

export default function SwipeToLoad() {
  const [messageIndex, setMessageIndex] = useState(0);

  // Cycle through messages every 2.5 seconds (animation loop duration)
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  // Animation keyframes for the card swipe
  const cardAnimation = {
    x: [0, 35, -35, 0, 0],
    rotate: [0, 5, -5, 0, 0],
    scale: [1, 1, 1, 1, 0.96, 1],
    transition: {
      duration: 2.5,
      repeat: Infinity,
      ease: 'easeInOut',
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
          className="w-64 h-40 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 shadow-lg border border-blue-200/50"
          animate={cardAnimation}
        >
          {/* Card chip */}
          <div className="absolute top-4 left-4 w-10 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-sm shadow-sm" />
          
          {/* Card number placeholder */}
          <div className="absolute bottom-12 left-4 right-4 h-3 bg-gray-300/40 rounded" />
          <div className="absolute bottom-8 left-4 w-24 h-3 bg-gray-300/40 rounded" />
          
          {/* Card brand indicator */}
          <div className="absolute bottom-4 right-4 w-12 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded opacity-60" />
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
          className="text-sm text-gray-600 font-medium"
        >
          {messages[messageIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

