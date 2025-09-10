// scripts/compress-only.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function compressGLBOnly(inputPath) {
  const modelId = path.basename(inputPath, '.glb');
  const outputDir = path.dirname(inputPath);
  const compressedPath = path.join(outputDir, `${modelId}_compressed.glb`);
  
  console.log('🚀 Compressing GLB with gltf-pipeline...');
  
  // Get original size
  const originalStats = fs.statSync(inputPath);
  const originalSizeMB = (originalStats.size / (1024 * 1024)).toFixed(2);
  
  // Compress using gltf-pipeline with aggressive settings
  const compressCommand = `gltf-pipeline -i "${inputPath}" -o "${compressedPath}" --draco.compressionLevel=10 --draco.quantizePositionBits=11 --draco.quantizeNormalBits=8 --draco.quantizeTexcoordBits=10`;
  
  await new Promise((resolve, reject) => {
    exec(compressCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Compression failed:', error);
        reject(error);
      } else {
        console.log('✅ Compression completed successfully');
        resolve();
      }
    });
  });
  
  // Check compressed size
  const compressedStats = fs.statSync(compressedPath);
  const compressedSizeMB = (compressedStats.size / (1024 * 1024)).toFixed(2);
  const compressionRatio = (originalSizeMB / compressedSizeMB).toFixed(1);
  const sizeSavedMB = (originalSizeMB - compressedSizeMB).toFixed(1);
  
  console.log(`\n🎯 COMPRESSION RESULTS:`);
  console.log(`   Original: ${originalSizeMB}MB`);
  console.log(`   Compressed: ${compressedSizeMB}MB`);
  console.log(`   Saved: ${sizeSavedMB}MB`);
  console.log(`   Compression ratio: ${compressionRatio}x smaller`);
  console.log(`   Output file: ${compressedPath}`);
  
  return {
    originalFile: path.basename(inputPath),
    compressedFile: path.basename(compressedPath),
    originalSizeMB: parseFloat(originalSizeMB),
    compressedSizeMB: parseFloat(compressedSizeMB),
    compressionRatio: `${compressionRatio}x smaller`,
    sizeSavedMB: parseFloat(sizeSavedMB)
  };
}

async function processModel() {
  const inputPath = path.join(__dirname, '../models/75944_06.glb');
  
  try {
    const result = await compressGLBOnly(inputPath);
    console.log('\n✅ Process completed successfully!');
    console.log('You can now use the compressed file in your React app.');
  } catch (error) {
    console.error('❌ Process failed:', error);
  }
}

if (require.main === module) {
  processModel();
}

module.exports = { compressGLBOnly };
