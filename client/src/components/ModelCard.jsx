import React from 'react';

const ModelCard = ({ model, onSelect, isSelected }) => {
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const compressionRatio = model.hasCompressed && model.originalSize > 0 
    ? (model.originalSize / model.compressedSize).toFixed(1)
    : null;

  return (
    <div 
      className={`
        bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer
        border-2 transform hover:scale-105 p-6 relative overflow-hidden
        ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'}
      `}
      onClick={() => onSelect(model)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-2xl mr-4">
            🏭
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 truncate max-w-48">
              {model.displayName}
            </h3>
            <p className="text-sm text-gray-500">
              {formatDate(model.timestamp)}
            </p>
          </div>
        </div>
        {isSelected && (
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-blue-600">
            {model.totalParts.toLocaleString()}
          </div>
          <div className="text-xs text-gray-600">Parts</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-purple-600">
            {model.totalAssemblies}
          </div>
          <div className="text-xs text-gray-600">Assemblies</div>
        </div>
      </div>

      {/* File Information */}
      <div className="space-y-2">
        {model.originalGlb && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600 flex items-center">
              🎯 Original GLB
            </span>
            <span className="font-medium">{formatFileSize(model.originalSize)}</span>
          </div>
        )}
        
        {model.hasCompressed && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600 flex items-center">
              ⚡ Compressed GLB
            </span>
            <div className="text-right">
              <div className="font-medium">{formatFileSize(model.compressedSize)}</div>
              {compressionRatio && (
                <div className="text-xs text-green-600">
                  {compressionRatio}x smaller
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Indicators */}
      <div className="flex gap-2 mt-4">
        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
          ✅ BOM Ready
        </span>
        {model.hasCompressed && (
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
            ⚡ Compressed
          </span>
        )}
      </div>

      {/* Click indicator */}
      <div className="absolute bottom-0 right-0 p-2 text-gray-400">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </div>
    </div>
  );
};

export default ModelCard;
