// components/LoadingSpinner.jsx
import React from 'react';

const LoadingSpinner = () => {
  return (
    <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10">
      <div className="text-center">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
          <div className="absolute inset-0 rounded-full border-2 border-gray-200"></div>
        </div>
        <p className="mt-4 text-gray-600 font-medium">Loading Assembly...</p>
        <p className="text-sm text-gray-500">Please wait</p>
      </div>
    </div>
  );
};

export default LoadingSpinner;
