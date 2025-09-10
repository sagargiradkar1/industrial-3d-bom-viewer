import React, { useState, useEffect } from 'react';
import ModelCard from './ModelCard';

const ModelSelector = ({ onModelSelect }) => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadAvailableModels();
  }, []);

  const loadAvailableModels = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/models/available');
      const result = await response.json();
      
      if (result.success) {
        setModels(result.models);
      } else {
        setError(result.error || 'Failed to load models');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleModelSelect = (model) => {
    setSelectedModel(model);
    onModelSelect(model);
  };

  const filteredModels = models.filter(model =>
    model.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    model.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Loading Models</h2>
          <p className="text-gray-600">Discovering available STEP models...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-red-700 mb-2">Error Loading Models</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={loadAvailableModels}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">📂</div>
          <h2 className="text-2xl font-bold text-gray-700 mb-2">No Models Available</h2>
          <p className="text-gray-600 mb-4">
            No processed STEP models found. Run the STEP processor first to generate models.
          </p>
          <div className="text-sm text-gray-500 bg-gray-100 p-3 rounded-lg">
            <p>Expected folder structure:</p>
            <p className="font-mono">output/bom/[model-folders]/</p>
            <p className="font-mono">output/web/[model-folders]/</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🏭 3D Model Viewer
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            Select a processed STEP model to view in 3D
          </p>
          
          {/* Search */}
          <div className="max-w-md mx-auto mb-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Statistics */}
          <div className="flex justify-center gap-8 mb-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{models.length}</div>
              <div className="text-sm text-gray-600">Available Models</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {models.reduce((sum, m) => sum + m.totalParts, 0).toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Total Parts</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">
                {models.filter(m => m.hasCompressed).length}
              </div>
              <div className="text-sm text-gray-600">Compressed</div>
            </div>
          </div>
        </div>

        {/* Model Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredModels.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              onSelect={handleModelSelect}
              isSelected={selectedModel?.id === model.id}
            />
          ))}
        </div>

        {/* No results */}
        {filteredModels.length === 0 && searchQuery && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">No models found</h3>
            <p className="text-gray-600">No models match your search criteria.</p>
          </div>
        )}

        {/* Back to top button */}
        {models.length > 6 && (
          <div className="fixed bottom-8 right-8">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelSelector;
