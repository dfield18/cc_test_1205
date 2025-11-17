'use client';

import { useEffect, useState } from 'react';

interface CartoonData {
  imageUrl: string;
  source?: string;
}

export default function CartoonDisplay() {
  const [cartoon, setCartoon] = useState<CartoonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchCartoon = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch('/api/cartoon');
        const data = await response.json();
        
        if (mounted) {
          if (data.error) {
            setError(data.error);
            // Still set the imageUrl if provided as fallback
            if (data.imageUrl) {
              setCartoon({ imageUrl: data.imageUrl });
            }
          } else {
            setCartoon(data);
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          console.error('Error fetching cartoon:', err);
          setError('Failed to load cartoon');
          setIsLoading(false);
        }
      }
    };

    fetchCartoon();

    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-pulse text-gray-400 text-sm">Loading cartoon...</div>
      </div>
    );
  }

  if (error && !cartoon) {
    return null; // Don't show error, just don't display anything
  }

  if (!cartoon) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col items-center">
      <div className="w-full max-w-lg rounded-lg overflow-hidden shadow-md border border-gray-200 bg-gray-50 flex items-center justify-center">
        <img
          src={cartoon.imageUrl}
          alt="Loading cartoon"
          className="max-w-full max-h-64 object-contain"
          onError={(e) => {
            // Hide on error
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
          }}
        />
      </div>
    </div>
  );
}

