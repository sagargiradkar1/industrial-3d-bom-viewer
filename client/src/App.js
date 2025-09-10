// // App.jsx
// import React, { useState, useCallback, useEffect } from 'react';
// import BOMTreeView from './components/BOMTreeView';
// import InteractiveGLBModel from './components/InteractiveGLBModel';
// import ViewerToolbar from './components/ViewerToolbar';

// function App() {
//   const [selectedPart, setSelectedPart] = useState(null);
//   const [searchQuery, setSearchQuery] = useState('');
//   const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
//   const [isLoading, setIsLoading] = useState(true);
//   const [bomData, setBomData] = useState(null);

//   // Load BOM data from your JSON file
// useEffect(() => {
//   const loadBomData = async () => {
//     try {
//       // Updated to match your backend API endpoint
//       const response = await fetch('http://localhost:5000/api/bom/75944_06');

//       const result = await response.json();
//       console.log(response)
      
//       if (result.success) {
//         setBomData(result.data);
//       } else {
//         console.error('Error:', result.error);
//         setIsLoading(false);
//       }
//     } catch (error) {
//       console.error('Error loading BOM data:', error);
//       setIsLoading(false);
//     }
//   };
  
//   loadBomData();
// }, []);


//   // Memoized callbacks to prevent unnecessary re-renders
//   const handleLoadingChange = useCallback((loading) => {
//     setIsLoading(loading);
//   }, []);

//   const handlePartSelect = useCallback((part) => {
//     setSelectedPart(part);
//     setIsMobilePanelOpen(false); // Close mobile panel when part is selected
//   }, []);

//   const handleResetView = useCallback(() => {
//     setSelectedPart(null);
//   }, []);

//   return (
//     <div className="flex h-screen bg-gray-100 relative">
//       {/* Mobile Toggle Button */}
//       <button
//         className="md:hidden fixed top-4 left-4 z-50 bg-slate-700 text-white p-3 rounded-lg shadow-lg hover:bg-slate-800 transition-colors"
//         onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
//       >
//         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
//         </svg>
//       </button>

//       {/* BOM Panel */}
//       <div className={`
//         w-80 bg-white border-r border-gray-200 flex flex-col shadow-lg z-40
//         md:relative md:transform-none transition-transform duration-300 ease-in-out
//         ${isMobilePanelOpen ? 'fixed inset-y-0 left-0 transform translate-x-0' : 'fixed inset-y-0 left-0 transform -translate-x-full md:translate-x-0'}
//       `}>
//         <BOMTreeView 
//           bomData={bomData}
//           selectedPart={selectedPart}
//           onPartSelect={handlePartSelect}
//           searchQuery={searchQuery}
//           onSearchChange={setSearchQuery}
//           onMobileClose={() => setIsMobilePanelOpen(false)}
//         />
//       </div>

//       {/* 3D Viewer Panel */}
//       <div className="flex-1 flex flex-col">
//         <ViewerToolbar 
//           onResetView={handleResetView}
//           modelName={bomData?.filename}
//         />
//         <div className="flex-1 relative">
//           <InteractiveGLBModel 
//             selectedPart={selectedPart}
//             onPartSelect={handlePartSelect}
//             isLoading={isLoading}
//             onLoadingChange={handleLoadingChange}
//             bomData={bomData}
//           />
//         </div>
//       </div>

//       {/* Mobile Overlay */}
//       {isMobilePanelOpen && (
//         <div 
//           className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
//           onClick={() => setIsMobilePanelOpen(false)}
//         />
//       )}
//     </div>
//   );
// }

// export default App;
import React, { useState, useCallback } from 'react';
import ModelSelector from './components/ModelSelector';
import DynamicBOMTreeView from './components/DynamicBOMTreeView';
import DynamicInteractiveGLBModel from './components/DynamicInteractiveGLBModel';
import ViewerToolbar from './components/ViewerToolbar';

function App() {
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bomData, setBomData] = useState(null);

  // Load BOM data when model is selected
  const handleModelSelect = useCallback(async (model) => {
    setSelectedModel(model);
    setSelectedPart(null); // Clear previous selection
    setIsLoading(true);
    setBomData(null);
    
    try {
      const response = await fetch(`http://localhost:5000/api/bom/${model.id}`);
      const result = await response.json();
      
      if (result.success) {
        setBomData(result.data);
        console.log('✅ BOM data loaded:', result.data);
      } else {
        console.error('❌ Error loading BOM:', result.error);
      }
    } catch (error) {
      console.error('❌ Error loading BOM data:', error);
    }
  }, []);

  const handleBackToModels = useCallback(() => {
    setSelectedModel(null);
    setSelectedPart(null);
    setBomData(null);
    setSearchQuery('');
    setIsMobilePanelOpen(false);
  }, []);

  const handleLoadingChange = useCallback((loading) => {
    setIsLoading(loading);
  }, []);

  // FIXED: Enhanced part selection with better logging and synchronization
  const handlePartSelect = useCallback((part) => {
    console.log('🎯 Part selection triggered:', {
      part,
      previousSelection: selectedPart,
      source: 'handlePartSelect'
    });
    
    // If clicking the same part, deselect it
    if (selectedPart && part && selectedPart.id === part.id) {
      console.log('🔄 Deselecting same part');
      setSelectedPart(null);
    } else {
      console.log('✅ Selecting new part:', part);
      setSelectedPart(part);
    }
    
    setIsMobilePanelOpen(false);
  }, [selectedPart]);

  const handleResetView = useCallback(() => {
    console.log('🔄 Resetting view - clearing selection');
    setSelectedPart(null);
  }, []);

  // Show model selector if no model is selected
  if (!selectedModel) {
    return <ModelSelector onModelSelect={handleModelSelect} />;
  }

  // Show 3D viewer for selected model
  return (
    <div className="flex h-screen bg-gray-100 relative">
      {/* Mobile Toggle Button */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 bg-slate-700 text-white p-3 rounded-lg shadow-lg hover:bg-slate-800 transition-colors"
        onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* BOM Panel */}
      <div className={`
        w-80 bg-white border-r border-gray-200 flex flex-col shadow-lg z-40
        md:relative md:transform-none transition-transform duration-300 ease-in-out
        ${isMobilePanelOpen ? 'fixed inset-y-0 left-0 transform translate-x-0' : 'fixed inset-y-0 left-0 transform -translate-x-full md:translate-x-0'}
      `}>
        <DynamicBOMTreeView 
          modelInfo={selectedModel}
          bomData={bomData}
          selectedPart={selectedPart}
          onPartSelect={handlePartSelect}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onMobileClose={() => setIsMobilePanelOpen(false)}
          onBackToModels={handleBackToModels}
        />
      </div>

      {/* 3D Viewer Panel */}
      <div className="flex-1 flex flex-col">
        <ViewerToolbar 
          onResetView={handleResetView}
          modelName={selectedModel.displayName}
          onBackToModels={handleBackToModels}
        />
        <div className="flex-1 relative">
          <DynamicInteractiveGLBModel 
            modelInfo={selectedModel}
            selectedPart={selectedPart}
            onPartSelect={handlePartSelect}
            isLoading={isLoading}
            onLoadingChange={handleLoadingChange}
            bomData={bomData}
          />
        </div>
      </div>

      {/* Mobile Overlay */}
      {isMobilePanelOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMobilePanelOpen(false)}
        />
      )}

      {/* Debug Panel (Remove in production) */}
      {process.env.NODE_ENV === 'development' && selectedPart && (
        <div className="fixed top-4 right-4 bg-black bg-opacity-80 text-white p-3 rounded-lg text-xs z-50 max-w-sm">
          <div className="font-bold mb-1">🐛 Debug - Selected Part:</div>
          <div>ID: {selectedPart.id}</div>
          <div>Name: {selectedPart.name}</div>
          <div>Reference: {selectedPart.reference_name}</div>
          <div>Mesh: {selectedPart.meshName}</div>
        </div>
      )}
    </div>
  );
}

export default App;
