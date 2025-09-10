const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Get all available models from output folders
router.get('/available', (req, res) => {
  try {
    const bomDir = path.join(__dirname, '../output/bom');
    const webDir = path.join(__dirname, '../output/web');
    const compressedDir = path.join(__dirname, '../output/compressed');
    
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
          let originalGlbPath = null;
          
          if (fs.existsSync(webPath)) {
            const glbFiles = fs.readdirSync(webPath).filter(f => f.endsWith('.glb'));
            originalGlb = glbFiles.find(f => f.includes('_model.glb'));
            if (originalGlb) {
              originalGlbPath = path.join(webPath, originalGlb);
            }
          }
          
          // Find compressed GLB file - IMPROVED MATCHING
          let compressedGlb = null;
          let compressedGlbPath = null;
          
          if (fs.existsSync(compressedDir)) {
            const compressedFiles = fs.readdirSync(compressedDir);
            
            // Extract base name from folder (e.g., "75944_01" from "75944_01_20250909_160406_553")
            const baseName = folder.split('_').slice(0, 2).join('_'); // Gets "75944_01"
            
            // Find compressed file that starts with base name and contains "compressed"
            compressedGlb = compressedFiles.find(f => 
              f.startsWith(baseName) && 
              f.includes('compressed') && 
              f.endsWith('.glb')
            );
            
            if (compressedGlb) {
              compressedGlbPath = path.join(compressedDir, compressedGlb);
            }
          }
          
          if (bomFiles.length > 0) {
            // Extract model info from BOM
            const bomFilePath = path.join(bomPath, bomFiles[0]);
            const bomData = JSON.parse(fs.readFileSync(bomFilePath, 'utf8'));
            
            // Get file sizes
            const originalSize = originalGlbPath && fs.existsSync(originalGlbPath) ? 
              fs.statSync(originalGlbPath).size : 0;
            const compressedSize = compressedGlbPath && fs.existsSync(compressedGlbPath) ? 
              fs.statSync(compressedGlbPath).size : 0;
            
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
              // Add file paths for server routes
              originalGlbPath: originalGlbPath,
              compressedGlbPath: compressedGlbPath
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

module.exports = router;
