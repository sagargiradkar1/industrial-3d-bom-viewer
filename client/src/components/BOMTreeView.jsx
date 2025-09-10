// components/BOMTreeView.jsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import SearchPanel from './SearchPanel';

const BOMTreeView = ({ bomData, selectedPart, onPartSelect, searchQuery, onSearchChange, onMobileClose }) => {
  const [expandedNodes, setExpandedNodes] = useState(new Set([1])); // Expand root by default
  const treeContainerRef = useRef(null);
  const selectedItemRef = useRef(null);

  // Build hierarchical tree from flat assembly_tree array
  const hierarchicalData = useMemo(() => {
    if (!bomData?.assembly_tree) return null;

    const buildTree = (parentId = null) => {
      return bomData.assembly_tree
        .filter(item => item.parent_id === parentId)
        .map(item => ({
          ...item,
          children: buildTree(item.id)
        }));
    };

    const tree = buildTree(null);
    return tree.length > 0 ? tree[0] : null;
  }, [bomData]);

  // Auto-expand parent nodes and scroll when part is selected from 3D model
  useEffect(() => {
    if (!selectedPart || !bomData?.assembly_tree) return;

    // Find the selected part in the flat array
    const selectedItem = bomData.assembly_tree.find(item => 
      item.id === selectedPart.id ||
      item.reference_name === selectedPart.reference_name ||
      item.name === selectedPart.name
    );

    if (selectedItem) {
      // Expand all parent nodes
      const expandParents = (itemId) => {
        const item = bomData.assembly_tree.find(i => i.id === itemId);
        if (item && item.parent_id) {
          setExpandedNodes(prev => new Set([...prev, item.parent_id]));
          expandParents(item.parent_id); // Recursively expand parents
        }
      };

      expandParents(selectedItem.id);
      setExpandedNodes(prev => new Set([...prev, selectedItem.id]));

      // Scroll to selected item after a brief delay to allow rendering
      setTimeout(() => {
        if (selectedItemRef.current) {
          selectedItemRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 100);
    }
  }, [selectedPart, bomData]);

  // Filter tree based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery || !hierarchicalData) return hierarchicalData;
    
    const filterNode = (node) => {
      const matches = 
        (node.reference_name && node.reference_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        node.id.toString().includes(searchQuery);
      
      const filteredChildren = node.children?.map(filterNode).filter(Boolean) || [];
      
      return matches || filteredChildren.length > 0 ? {
        ...node,
        children: filteredChildren
      } : null;
    };
    
    return filterNode(hierarchicalData);
  }, [hierarchicalData, searchQuery]);

  const toggleExpanded = (nodeId) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const getNodeIcon = (node) => {
    if (node.is_root) return '🏭';
    if (node.is_assembly) return '📦';
    return '⚙️';
  };

  const TreeNode = ({ node, level = 0 }) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedPart?.id === node.id;
    const displayName = node.reference_name || `Assembly ${node.id}` || 'Unknown Component';

    return (
      <div className="select-none">
        <div
          ref={isSelected ? selectedItemRef : null} // Reference for scrolling
          className={`
            flex items-center py-2 px-3 cursor-pointer rounded-lg transition-all duration-200
            hover:bg-gray-50 group
            ${isSelected ? 'bg-blue-100 border-l-4 border-blue-500 shadow-sm' : ''}
            ${level > 0 ? `ml-${Math.min(level * 4, 16)}` : ''}
          `}
          onClick={() => {
            onPartSelect(node);
            onMobileClose?.();
          }}
        >
          {hasChildren && (
            <button
              className="mr-2 p-1 rounded hover:bg-gray-200 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(node.id);
              }}
            >
              <svg 
                className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          
          <div className="flex items-center flex-1 min-w-0">
            <span className="text-lg mr-3">{getNodeIcon(node)}</span>
            <div className="flex-1 min-w-0">
              <div className={`font-medium truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                {displayName}
              </div>
              <div className={`text-xs ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                ID: {node.id} • {node.shape_type}
              </div>
            </div>
            <div className="flex flex-col items-end text-xs">
              {node.is_assembly && (
                <span className={`px-2 py-0.5 rounded-full text-xs mb-1 ${
                  isSelected ? 'bg-blue-200 text-blue-800' : 'bg-blue-100 text-blue-700'
                }`}>
                  Assembly
                </span>
              )}
              {node.is_root && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  isSelected ? 'bg-green-200 text-green-800' : 'bg-green-100 text-green-700'
                }`}>
                  Root
                </span>
              )}
            </div>
          </div>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="ml-4 border-l border-gray-200 pl-2">
            {node.children.map(child => (
              <TreeNode key={child.id} node={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <span className="text-2xl mr-3">📋</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">BOM Viewer</h1>
              <p className="text-sm text-gray-600">
                {bomData?.filename || 'Interactive Assembly Explorer'}
              </p>
            </div>
          </div>
          <button 
            className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
            onClick={onMobileClose}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <SearchPanel 
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          placeholder="Search reference name or ID..."
        />
        
        {bomData && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>Total Parts:</span>
                <span className="font-medium">{bomData.total_parts?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Assemblies:</span>
                <span className="font-medium">{bomData.total_assemblies}</span>
              </div>
              {bomData.timestamp && (
                <div className="flex justify-between">
                  <span>Updated:</span>
                  <span className="font-medium">
                    {new Date(bomData.timestamp).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Tree Content */}
      <div ref={treeContainerRef} className="flex-1 overflow-y-auto p-4">
        {filteredData ? (
          <TreeNode node={filteredData} />
        ) : bomData === null ? (
          <div className="text-center text-gray-500 py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-4"></div>
            <p>Loading BOM data...</p>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            <span className="text-4xl">📦</span>
            <p className="mt-2">No BOM data available</p>
          </div>
        )}
      </div>
    </>
  );
};

export default BOMTreeView;
