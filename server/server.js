const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// STATIC FILE SERVING - This is the key fix for 404 errors
// Serve compressed GLB files directly
const compressedDir = path.resolve(__dirname, 'output/compressed');
app.use('/api/model/compressed', express.static(compressedDir));

// Serve original GLB files from web directory
const webDir = path.resolve(__dirname, 'output/web');
app.use('/api/model/original', express.static(webDir, { 
  setHeaders: (res, path, stat) => {
    res.set('Content-Type', 'model/gltf-binary');
  }
}));

// API: Get all available models
app.get('/api/models/available', (req, res) => {
  try {
    const bomDir = path.join(__dirname, 'output/bom');
    const webDir = path.join(__dirname, 'output/web');
    const compressedDir = path.join(__dirname, 'output/compressed');
    
    const models = [];
    
    if (fs.existsSync(bomDir)) {
      const bomFolders = fs.readdirSync(bomDir);
      
      bomFolders.forEach(folder => {
        const bomPath = path.join(bomDir, folder);
        const webPath = path.join(webDir, folder);
        
        if (fs.statSync(bomPath).isDirectory()) {
          // Find BOM JSON file
          const bomFiles = fs.readdirSync(bomPath).filter(f => f.endsWith('_bom.json'));
          
          // Find original GLB file
          let originalGlb = null;
          if (fs.existsSync(webPath)) {
            const glbFiles = fs.readdirSync(webPath).filter(f => f.endsWith('.glb'));
            originalGlb = glbFiles.find(f => f.includes('_model.glb'));
          }
          
          // Find compressed GLB file
          let compressedGlb = null;
          if (fs.existsSync(compressedDir)) {
            const compressedFiles = fs.readdirSync(compressedDir);
            // Extract base name (e.g., "75944_01" from "75944_01_20250909_160406_553")
            const baseName = folder.split('_').slice(0, 2).join('_');
            compressedGlb = compressedFiles.find(f => 
              f.startsWith(baseName) && 
              f.includes('compressed') && 
              f.endsWith('.glb')
            );
          }
          
          if (bomFiles.length > 0) {
            // Extract model info from BOM
            const bomFilePath = path.join(bomPath, bomFiles[0]);
            const bomData = JSON.parse(fs.readFileSync(bomFilePath, 'utf8'));
            
            // Get file sizes
            const originalSize = originalGlb && fs.existsSync(path.join(webPath, originalGlb)) ? 
              fs.statSync(path.join(webPath, originalGlb)).size : 0;
            const compressedSize = compressedGlb && fs.existsSync(path.join(compressedDir, compressedGlb)) ? 
              fs.statSync(path.join(compressedDir, compressedGlb)).size : 0;
            
            models.push({
              id: folder,
              name: bomData.filename || folder,
              displayName: bomData.filename?.replace(/\.(step|stp)$/i, '') || folder,
              totalParts: bomData.total_parts || 0,
              totalAssemblies: bomData.total_assemblies || 0,
              timestamp: bomData.timestamp,
              originalSize: originalSize,
              compressedSize: compressedSize,
              hasCompressed: !!compressedGlb,
              bomFile: bomFiles[0],
              originalGlb: originalGlb,
              compressedGlb: compressedGlb,
              // URLs for frontend
              originalGlbUrl: originalGlb ? `/api/model/original/${folder}/${originalGlb}` : null,
              compressedGlbUrl: compressedGlb ? `/api/model/compressed/${compressedGlb}` : null
            });
          }
        }
      });
    }
    
    // Sort by timestamp (newest first)
    models.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({ success: true, models });
  } catch (error) {
    console.error('Error getting available models:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get BOM data for a specific model
app.get('/api/bom/:modelId', (req, res) => {
  try {
    const { modelId } = req.params;
    const bomDir = path.join(__dirname, 'output/bom', modelId);
    
    if (!fs.existsSync(bomDir)) {
      return res.status(404).json({ 
        success: false,
        error: 'BOM data not found',
        modelId: modelId
      });
    }
    
    // Find BOM file
    const bomFiles = fs.readdirSync(bomDir).filter(f => f.endsWith('_bom.json'));
    
    if (bomFiles.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'BOM file not found',
        modelId: modelId
      });
    }
    
    // Read BOM data
    const bomFilePath = path.join(bomDir, bomFiles[0]);
    const bomData = JSON.parse(fs.readFileSync(bomFilePath, 'utf8'));
    
    res.json({
      success: true,
      modelId: modelId,
      data: bomData
    });
    
  } catch (error) {
    console.error('Error reading BOM file:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to read BOM data',
      details: error.message 
    });
  }
});

// API: Auto-serve GLB with fallback (compressed -> original)
app.get('/api/model/auto/:modelId', async (req, res) => {
  const modelId = req.params.modelId;
  
  try {
    // Get model info
    const modelsResponse = await fetch(`http://localhost:${PORT}/api/models/available`);
    const modelsData = await modelsResponse.json();
    
    if (!modelsData.success) {
      return res.status(500).json({ error: 'Failed to get model info' });
    }
    
    const model = modelsData.models.find(m => m.id === modelId);
    
    if (!model) {
      return res.status(404).json({ error: `Model ${modelId} not found` });
    }
    
    // Try compressed first, then original
    if (model.hasCompressed && model.compressedGlb) {
      const compressedPath = path.join(__dirname, 'output/compressed', model.compressedGlb);
      if (fs.existsSync(compressedPath)) {
        console.log(`Serving compressed GLB for ${modelId}: ${model.compressedGlb}`);
        return res.sendFile(path.resolve(compressedPath));
      }
    }
    
    if (model.originalGlb) {
      const originalPath = path.join(__dirname, 'output/web', modelId, model.originalGlb);
      if (fs.existsSync(originalPath)) {
        console.log(`Serving original GLB for ${modelId}: ${model.originalGlb}`);
        return res.sendFile(path.resolve(originalPath));
      }
    }
    
    res.status(404).json({ 
      error: `No GLB file found for model ${modelId}`,
      model: model
    });
    
  } catch (error) {
    console.error('Error in auto GLB serving:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Search assemblies/parts in BOM
app.get('/api/bom/:modelId/search', (req, res) => {
  try {
    const { modelId } = req.params;
    const { q: query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query parameter "q" is required'
      });
    }
    
    const bomDir = path.join(__dirname, 'output/bom', modelId);
    
    if (!fs.existsSync(bomDir)) {
      return res.status(404).json({ 
        success: false,
        error: 'BOM data not found'
      });
    }
    
    const bomFiles = fs.readdirSync(bomDir).filter(f => f.endsWith('_bom.json'));
    if (bomFiles.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'BOM file not found'
      });
    }
    
    const bomFilePath = path.join(bomDir, bomFiles[0]);
    const bomData = JSON.parse(fs.readFileSync(bomFilePath, 'utf8'));
    
    // Search in assembly tree
    const results = bomData.assembly_tree.filter(item => 
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      (item.reference_name && item.reference_name.toLowerCase().includes(query.toLowerCase()))
    );
    
    res.json({
      success: true,
      modelId: modelId,
      query: query,
      results: results,
      count: results.length
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Search failed' 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/models/available',
      '/api/bom/:modelId',
      '/api/model/compressed/:filename',
      '/api/model/original/:modelId/:filename',
      '/api/model/auto/:modelId'
    ]
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'STEP Model & BOM API Server',
    version: '2.0',
    endpoints: {
      models: '/api/models/available',
      bom: '/api/bom/:modelId',
      bom_search: '/api/bom/:modelId/search?q=query',
      model_auto: '/api/model/auto/:modelId',
      compressed: '/api/model/compressed/:filename',
      original: '/api/model/original/:modelId/:filename'
    },
    supported_formats: {
      models: ['.glb'],
      bom: ['.json']
    }
  });
});

// Utility function to get local IP
function getLocalIP() {
  const os = require("os");
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

// Start server with enhanced logging
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 STEP Model Server running at:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${getLocalIP()}:${PORT}`);
  console.log(`\n📊 API Endpoints:`);
  console.log(`   Models:     http://localhost:${PORT}/api/models/available`);
  console.log(`   BOM:        http://localhost:${PORT}/api/bom/{modelId}`);
  console.log(`   Auto GLB:   http://localhost:${PORT}/api/model/auto/{modelId}`);
  console.log(`   Health:     http://localhost:${PORT}/api/health`);
  
  // Log available directories
  const outputDir = path.join(__dirname, 'output');
  if (fs.existsSync(outputDir)) {
    console.log(`\n📁 Available output directories:`);
    ['bom', 'web', 'compressed'].forEach(dir => {
      const dirPath = path.join(outputDir, dir);
      if (fs.existsSync(dirPath)) {
        const items = fs.readdirSync(dirPath);
        console.log(`   • ${dir}/: ${items.length} items`);
      } else {
        console.log(`   • ${dir}/: not found`);
      }
    });
  }
});
