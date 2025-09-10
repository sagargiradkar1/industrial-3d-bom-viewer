// components/ViewerToolbar.jsx
import React from 'react';

const ViewerToolbar = ({ onResetView, onToggleWireframe, onToggleExploded, modelName }) => {
  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">3D Assembly Viewer</h2>
          <p className="text-sm text-gray-600">
            {modelName || 'Interactive Model Explorer'}
          </p>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={onResetView}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-200 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Reset View</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewerToolbar;
