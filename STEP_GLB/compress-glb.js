#!/usr/bin/env node
/**
 * GLB Batch Compressor with Unique Naming
 * Compresses all GLB files from STEP processor output using gltf-pipeline with Draco compression
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const INPUT_FOLDER = path.resolve(__dirname, 'output/web');
const OUTPUT_FOLDER = path.resolve(__dirname, 'output/compressed');

// Draco compression settings (aggressive compression)
const DRACO_SETTINGS = {
  compressionLevel: 10,
  quantizePosition: 11,
  quantizeNormal: 8,
  quantizeTexcoord: 10,
  quantizeColor: 8
};

class GLBCompressor {
  constructor() {
    this.results = [];
    this.totalFiles = 0;
    this.processedFiles = 0;
    this.failedFiles = 0;
  }

  /**
   * Generate unique name with timestamp
   */
  generateUniqueName(originalPath) {
    const baseName = path.basename(originalPath, '.glb');
    const now = new Date();
    
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    
    const timestamp = `${yyyy}${mm}${dd}_${hh}${min}${ss}_${ms}`;
    
    return `${baseName}_compressed_${timestamp}.glb`;
  }

  /**
   * Get all GLB files recursively from input folder
   */
  getAllGlbFiles(dir, fileList = []) {
    try {
      const files = fs.readdirSync(dir);
      
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          this.getAllGlbFiles(fullPath, fileList);
        } else if (file.toLowerCase().endsWith('.glb')) {
          fileList.push(fullPath);
        }
      });
    } catch (error) {
      console.error(`❌ Error reading directory ${dir}:`, error.message);
    }
    
    return fileList;
  }

  /**
   * Compress a single GLB file
   */
  async compressGlbFile(inputPath, index) {
    const fileName = path.basename(inputPath);
    const uniqueFileName = this.generateUniqueName(inputPath);
    const outputPath = path.join(OUTPUT_FOLDER, uniqueFileName);
    
    console.log(`\n[${index}/${this.totalFiles}] 🔄 Compressing: ${fileName}`);
    console.log(`📂 Input: ${inputPath}`);
    console.log(`💾 Output: ${uniqueFileName}`);
    
    // Get original file size
    const originalStats = fs.statSync(inputPath);
    const originalSizeMB = (originalStats.size / (1024 * 1024));
    
    console.log(`📏 Original size: ${originalSizeMB.toFixed(2)} MB`);
    
    // Build compression command
    const command = [
      'npx gltf-pipeline',
      `-i "${inputPath}"`,
      `-o "${outputPath}"`,
      `--draco.compressionLevel=${DRACO_SETTINGS.compressionLevel}`,
      `--draco.quantizePosition=${DRACO_SETTINGS.quantizePosition}`,
      `--draco.quantizeNormal=${DRACO_SETTINGS.quantizeNormal}`,
      `--draco.quantizeTexcoord=${DRACO_SETTINGS.quantizeTexcoord}`,
      `--draco.quantizeColor=${DRACO_SETTINGS.quantizeColor}`,
      '--draco.compressMeshes'
    ].join(' ');
    
    return new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Compression failed: ${error.message}`);
          this.failedFiles++;
          resolve({
            success: false,
            fileName,
            uniqueFileName,
            originalSizeMB,
            error: error.message
          });
        } else {
          try {
            // Get compressed file size
            const compressedStats = fs.statSync(outputPath);
            const compressedSizeMB = (compressedStats.size / (1024 * 1024));
            const compressionRatio = originalSizeMB / compressedSizeMB;
            const sizeSavedMB = originalSizeMB - compressedSizeMB;
            const percentSaved = ((sizeSavedMB / originalSizeMB) * 100);
            
            console.log(`✅ Compression successful!`);
            console.log(`📊 Results:`);
            console.log(`   • Compressed size: ${compressedSizeMB.toFixed(2)} MB`);
            console.log(`   • Space saved: ${sizeSavedMB.toFixed(2)} MB (${percentSaved.toFixed(1)}%)`);
            console.log(`   • Compression ratio: ${compressionRatio.toFixed(2)}x smaller`);
            
            this.processedFiles++;
            resolve({
              success: true,
              fileName,
              uniqueFileName,
              originalSizeMB,
              compressedSizeMB,
              sizeSavedMB,
              compressionRatio,
              percentSaved,
              outputPath
            });
          } catch (statError) {
            console.error(`❌ Error reading compressed file stats: ${statError.message}`);
            this.failedFiles++;
            resolve({
              success: false,
              fileName,
              uniqueFileName,
              originalSizeMB,
              error: statError.message
            });
          }
        }
      });
    });
  }

  /**
   * Process all GLB files
   */
  async processAllFiles() {
    console.log('🚀 GLB BATCH COMPRESSOR WITH UNIQUE NAMING');
    console.log('=' * 60);
    
    // Create output folder if it doesn't exist
    if (!fs.existsSync(OUTPUT_FOLDER)) {
      fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
      console.log(`✅ Created output folder: ${OUTPUT_FOLDER}`);
    }
    
    // Find all GLB files
    const glbFiles = this.getAllGlbFiles(INPUT_FOLDER);
    this.totalFiles = glbFiles.length;
    
    if (this.totalFiles === 0) {
      console.log(`❌ No GLB files found in: ${INPUT_FOLDER}`);
      console.log('💡 Make sure you have run the STEP processor first');
      return;
    }
    
    console.log(`📊 Found ${this.totalFiles} GLB files to compress`);
    console.log(`📁 Input folder: ${INPUT_FOLDER}`);
    console.log(`📁 Output folder: ${OUTPUT_FOLDER}`);
    console.log(`⚙️ Draco settings: Level ${DRACO_SETTINGS.compressionLevel} (max compression)`);
    
    // Process files one by one
    console.log(`\n🔄 Starting sequential compression...`);
    const startTime = Date.now();
    
    for (let i = 0; i < glbFiles.length; i++) {
      const file = glbFiles[i];
      try {
        const result = await this.compressGlbFile(file, i + 1);
        this.results.push(result);
        
        // Short pause between files
        if (i < glbFiles.length - 1) {
          console.log('⏸️ Pausing 1 second...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`❌ Unexpected error processing ${file}:`, error);
        this.failedFiles++;
      }
    }
    
    const endTime = Date.now();
    const totalDuration = (endTime - startTime) / 1000;
    
    // Print final summary
    this.printSummary(totalDuration);
  }

  /**
   * Print compression summary
   */
  printSummary(duration) {
    console.log(`\n` + '='.repeat(60));
    console.log('🎉 COMPRESSION COMPLETE');
    console.log('='.repeat(60));
    
    console.log(`📊 Summary:`);
    console.log(`   • Total files: ${this.totalFiles}`);
    console.log(`   • Successfully compressed: ${this.processedFiles}`);
    console.log(`   • Failed: ${this.failedFiles}`);
    console.log(`   • Processing time: ${duration.toFixed(1)} seconds`);
    
    if (this.results.length > 0) {
      // Calculate totals
      const successfulResults = this.results.filter(r => r.success);
      const totalOriginalSize = successfulResults.reduce((sum, r) => sum + r.originalSizeMB, 0);
      const totalCompressedSize = successfulResults.reduce((sum, r) => sum + r.compressedSizeMB, 0);
      const totalSaved = totalOriginalSize - totalCompressedSize;
      const avgCompressionRatio = successfulResults.reduce((sum, r) => sum + r.compressionRatio, 0) / successfulResults.length;
      
      console.log(`\n💾 Storage Summary:`);
      console.log(`   • Total original size: ${totalOriginalSize.toFixed(2)} MB`);
      console.log(`   • Total compressed size: ${totalCompressedSize.toFixed(2)} MB`);
      console.log(`   • Total space saved: ${totalSaved.toFixed(2)} MB`);
      console.log(`   • Average compression: ${avgCompressionRatio.toFixed(2)}x smaller`);
      
      console.log(`\n📁 Individual Results:`);
      this.results.forEach((result, index) => {
        if (result.success) {
          console.log(`   ${index + 1}. ✅ ${result.fileName}`);
          console.log(`      → ${result.uniqueFileName}`);
          console.log(`      → ${result.originalSizeMB.toFixed(2)}MB → ${result.compressedSizeMB.toFixed(2)}MB (${result.compressionRatio.toFixed(2)}x smaller)`);
        } else {
          console.log(`   ${index + 1}. ❌ ${result.fileName} - ${result.error}`);
        }
      });
    }
    
    if (this.processedFiles > 0) {
      console.log(`\n🚀 Compressed files ready for web deployment!`);
      console.log(`📂 Check folder: ${OUTPUT_FOLDER}`);
    }
    
    if (this.failedFiles > 0) {
      console.log(`\n⚠️ ${this.failedFiles} files failed to compress`);
      console.log(`💡 Make sure gltf-pipeline is installed: npm install -g gltf-pipeline`);
    }
  }
}

// Main execution
async function main() {
  try {
    const compressor = new GLBCompressor();
    await compressor.processAllFiles();
    
    process.exit(compressor.failedFiles === 0 ? 0 : 1);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { GLBCompressor };
