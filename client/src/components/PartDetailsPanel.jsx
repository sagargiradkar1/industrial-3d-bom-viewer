import React, { useState, useEffect } from 'react';

export default function PartDetailsPanel({ 
  selectedParts, 
  onPartDeselect, 
  onPartAction,
  isMobile 
}) {
  const [activeTab, setActiveTab] = useState('details');
  const [quantities, setQuantities] = useState({});
  const [cartItems, setCartItems] = useState([]);
  const [showNotification, setShowNotification] = useState(null);

  // Initialize quantities when parts change
  useEffect(() => {
    const initialQuantities = {};
    selectedParts.forEach(part => {
      if (!quantities[part.id]) {
        initialQuantities[part.id] = 1;
      }
    });
    if (Object.keys(initialQuantities).length > 0) {
      setQuantities(prev => ({ ...prev, ...initialQuantities }));
    }
  }, [selectedParts]);

  const handleQuantityChange = (partId, quantity) => {
    const qty = Math.max(1, Math.min(parseInt(quantity) || 1, 1000));
    setQuantities(prev => ({ ...prev, [partId]: qty }));
  };

  const handleAddToCart = (part) => {
    const quantity = quantities[part.id] || 1;
    const cartItem = {
      ...part,
      quantity,
      addedAt: new Date().toISOString(),
      lineTotal: (part.pricing?.unitPrice || 0) * quantity
    };
    
    setCartItems(prev => [...prev, cartItem]);
    showSuccessNotification(`Added ${quantity}x ${part.name} to cart`);
    
    // Here you would integrate with your actual e-commerce API
    console.log('Adding to cart:', cartItem);
  };

  const handleAddAllToCart = () => {
    const allItems = selectedParts.map(part => ({
      ...part,
      quantity: quantities[part.id] || 1,
      addedAt: new Date().toISOString(),
      lineTotal: (part.pricing?.unitPrice || 0) * (quantities[part.id] || 1)
    }));
    
    setCartItems(prev => [...prev, ...allItems]);
    showSuccessNotification(`Added ${selectedParts.length} items to cart`);
    
    console.log('Adding all to cart:', allItems);
  };

  const handleRequestQuote = (parts = selectedParts) => {
    const quoteData = {
      parts: parts.map(part => ({
        id: part.id,
        name: part.name,
        partNumber: part.part_number,
        quantity: quantities[part.id] || 1,
        specifications: part.specifications,
        referenceNumber: part.reference_name
      })),
      requestedAt: new Date().toISOString(),
      totalItems: parts.length,
      estimatedValue: calculateTotal(parts)
    };
    
    showSuccessNotification('Quote request submitted successfully');
    console.log('Requesting quote:', quoteData);
    
    // Here you would send the quote request to your backend
  };

  const handleDownloadSpecs = (part) => {
    // Generate specifications document
    const specs = generateSpecsDocument(part);
    downloadFile(specs, `${part.name}_specifications.txt`);
  };

  const calculateTotal = (parts = selectedParts) => {
    return parts.reduce((sum, part) => {
      const qty = quantities[part.id] || 1;
      const price = part.pricing?.unitPrice || 0;
      return sum + (qty * price);
    }, 0);
  };

  const showSuccessNotification = (message) => {
    setShowNotification({ type: 'success', message });
    setTimeout(() => setShowNotification(null), 3000);
  };

  const totalEstimate = calculateTotal();
  const totalItems = selectedParts.reduce((sum, part) => sum + (quantities[part.id] || 1), 0);

  return (
    <div className={`${
      isMobile 
        ? 'fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[80vh]' 
        : 'w-96 border-l'
    } bg-white border-gray-200 flex flex-col shadow-xl z-30 overflow-hidden`}>
      
      {/* Notification */}
      {showNotification && (
        <div className={`absolute top-4 left-4 right-4 z-50 p-3 rounded-lg shadow-lg ${
          showNotification.type === 'success' 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {showNotification.type === 'success' ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"/>
              </svg>
            )}
            <span className="text-sm font-medium">{showNotification.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-700 text-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold">Part Details</h3>
            <p className="text-green-100 text-sm">
              {selectedParts.length} item{selectedParts.length > 1 ? 's' : ''} selected
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="text-right text-sm">
              <div className="text-green-100">Total Qty: {totalItems}</div>
              <div className="font-semibold">${totalEstimate.toLocaleString()}</div>
            </div>
            
            {isMobile && (
              <button
                onClick={() => onPartAction(null, 'clear')}
                className="p-2 hover:bg-green-500 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 bg-green-500/30 p-1 rounded-lg">
          <TabButton
            label="Details"
            active={activeTab === 'details'}
            onClick={() => setActiveTab('details')}
            icon={
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v8H4V6z"/>
              </svg>
            }
          />
          <TabButton
            label="Specs"
            active={activeTab === 'specs'}
            onClick={() => setActiveTab('specs')}
            icon={
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2v1a1 1 0 001 1h6a1 1 0 001-1V3a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"/>
              </svg>
            }
          />
          <TabButton
            label="Cart"
            active={activeTab === 'cart'}
            onClick={() => setActiveTab('cart')}
            badge={cartItems.length}
            icon={
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
              </svg>
            }
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'details' && (
          <div className="p-4 space-y-4">
            {selectedParts.map((part, index) => (
              <PartDetailsCard
                key={part.id}
                part={part}
                quantity={quantities[part.id] || 1}
                onQuantityChange={handleQuantityChange}
                onDeselect={() => onPartDeselect(part.id, 'deselect')}
                onAddToCart={() => handleAddToCart(part)}
                onDownloadSpecs={() => handleDownloadSpecs(part)}
                isLast={index === selectedParts.length - 1}
              />
            ))}
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="p-4 space-y-4">
            {selectedParts.map(part => (
              <SpecificationsCard key={part.id} part={part} />
            ))}
          </div>
        )}

        {activeTab === 'cart' && (
          <div className="p-4">
            <CartView 
              items={cartItems} 
              onRemoveItem={(index) => setCartItems(prev => prev.filter((_, i) => i !== index))}
              onClearCart={() => setCartItems([])}
            />
          </div>
        )}
      </div>

      {/* Footer - Actions */}
      <div className="border-t bg-gray-50 p-4 space-y-3">
        {/* Summary */}
        <div className="bg-white rounded-lg p-3 border">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-600">Order Summary</span>
            <button
              onClick={() => onPartAction(null, 'clear')}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Clear All
            </button>
          </div>
          
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Items:</span>
              <span>{totalItems}</span>
            </div>
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>${totalEstimate.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Tax & Shipping:</span>
              <span>Calculated at checkout</span>
            </div>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleRequestQuote()}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"/>
            </svg>
            <span>Quote</span>
          </button>
          
          <button
            onClick={handleAddAllToCart}
            className="flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
            </svg>
            <span>Add All</span>
          </button>
        </div>
        
        {/* Quick actions */}
        <div className="flex justify-center">
          <button
            onClick={() => {
              const specs = selectedParts.map(generateSpecsDocument).join('\n\n');
              downloadFile(specs, 'selected_parts_specifications.txt');
            }}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Download All Specifications
          </button>
        </div>
      </div>
    </div>
  );
}

// Tab button component
function TabButton({ label, active, onClick, icon, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all relative ${
        active 
          ? 'bg-white text-green-700 shadow-sm' 
          : 'text-green-100 hover:text-white hover:bg-green-500/50'
      }`}
    >
      {icon}
      <span className={`${badge ? 'hidden sm:inline' : ''}`}>{label}</span>
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

// Individual part details card
function PartDetailsCard({ 
  part, 
  quantity, 
  onQuantityChange, 
  onDeselect, 
  onAddToCart,
  onDownloadSpecs,
  isLast 
}) {
  const lineTotal = (part.pricing?.unitPrice || 0) * quantity;

  return (
    <div className={`bg-gray-50 rounded-xl p-4 border border-gray-200 ${!isLast ? 'mb-4' : ''}`}>
      {/* Part header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-semibold text-gray-900 truncate">{part.name}</h4>
          <p className="text-sm text-gray-500 font-mono">ID: {part.id}</p>
          {part.reference_name && (
            <p className="text-sm text-gray-500">Ref: {part.reference_name}</p>
          )}
        </div>
        
        <button
          onClick={onDeselect}
          className="ml-3 p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Remove from selection"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
          </svg>
        </button>
      </div>

      {/* Part details */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Price</label>
          <p className="text-lg font-bold text-green-600">
            ${part.pricing?.unitPrice?.toLocaleString() || 'N/A'}
          </p>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Availability</label>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              part.availability === 'in-stock' ? 'bg-green-500' : 
              part.availability === 'limited' ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <span className="text-sm capitalize">{part.availability || 'Unknown'}</span>
          </div>
        </div>
      </div>

      {/* Quantity and line total */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onQuantityChange(part.id, quantity - 1)}
              disabled={quantity <= 1}
              className="w-8 h-8 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/>
              </svg>
            </button>
            
            <input
              type="number"
              min="1"
              max="1000"
              value={quantity}
              onChange={(e) => onQuantityChange(part.id, e.target.value)}
              className="w-20 px-3 py-2 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            
            <button
              onClick={() => onQuantityChange(part.id, quantity + 1)}
              disabled={quantity >= 1000}
              className="w-8 h-8 rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div className="text-right">
          <label className="block text-xs font-medium text-gray-700 mb-1">Line Total</label>
          <p className="text-lg font-bold text-gray-900">${lineTotal.toLocaleString()}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onAddToCart}
          className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
          </svg>
          Add to Cart
        </button>
        
        <button
          onClick={onDownloadSpecs}
          className="bg-blue-100 text-blue-700 py-2 px-4 rounded-lg font-medium hover:bg-blue-200 transition-colors flex items-center justify-center"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// Specifications card component
function SpecificationsCard({ part }) {
  const specs = part.specifications || {};
  
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200">
      <h4 className="text-lg font-semibold text-gray-900 mb-3">{part.name}</h4>
      
      <div className="space-y-3">
        {Object.entries(specs).length > 0 ? (
          Object.entries(specs).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
              <span className="text-sm font-medium text-gray-700 capitalize">
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </span>
              <span className="text-sm text-gray-900 font-mono">{value}</span>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v8H4V6z"/>
            </svg>
            <p className="text-sm">No specifications available</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Cart view component
function CartView({ items, onRemoveItem, onClearCart }) {
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
          <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Cart is Empty</h3>
        <p className="text-sm">Add items to cart to see them here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-lg font-semibold">Cart Items ({items.length})</h4>
        <button
          onClick={onClearCart}
          className="text-sm text-red-600 hover:text-red-800"
        >
          Clear Cart
        </button>
      </div>
      
      {items.map((item, index) => (
        <div key={index} className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
          <div className="flex-1">
            <h5 className="font-medium">{item.name}</h5>
            <p className="text-sm text-gray-600">Qty: {item.quantity} × ${item.pricing?.unitPrice}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">${item.lineTotal.toLocaleString()}</p>
            <button
              onClick={() => onRemoveItem(index)}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      
      <div className="border-t pt-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold">Total:</span>
          <span className="text-xl font-bold text-green-600">${total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function generateSpecsDocument(part) {
  const specs = part.specifications || {};
  let document = `PART SPECIFICATIONS\n`;
  document += `==================\n\n`;
  document += `Part Name: ${part.name}\n`;
  document += `Part ID: ${part.id}\n`;
  document += `Reference: ${part.reference_name || 'N/A'}\n`;
  document += `Shape Type: ${part.shape_type || 'N/A'}\n\n`;
  
  if (Object.keys(specs).length > 0) {
    document += `SPECIFICATIONS:\n`;
    Object.entries(specs).forEach(([key, value]) => {
      document += `${key}: ${value}\n`;
    });
  } else {
    document += `No detailed specifications available.\n`;
  }
  
  document += `\nGenerated: ${new Date().toLocaleString()}\n`;
  return document;
}

function downloadFile(content, filename) {
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}
