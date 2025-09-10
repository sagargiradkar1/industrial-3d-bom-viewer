# STEP to GLB Converter and BOM Extractor

A comprehensive tool for converting STEP CAD files to GLB format while extracting Bill of Materials (BOM) structure for web-based 3D visualization.

## Overview

This project provides an end-to-end pipeline that:
- Converts STEP files to GLB format for web compatibility
- Extracts hierarchical BOM structure from CAD assemblies
- Compresses GLB files for optimized web delivery
- Serves the results through a web-based 3D viewer

## Prerequisites

- Python 3.10
- Node.js and npm
- Conda package manager

## Installation

### 1. Create Python Environment

Create and activate a conda environment with all required packages:

```bash
# Create environment with all conda packages in one command
conda create --name step-processor python=3.10 -c conda-forge pythonocc-core=7.9.0 numpy pandas -y

# Activate environment
conda activate step-processor

# Install PyPI-only packages
pip install cascadio
```

### 2. Install Node.js Dependencies

```bash
# For compression tool
npm install

# For server
cd server
npm install

# For client
cd ../client
npm install
```

## Project Structure

```
REACT_3D_VIEWER/
│
├── STEP_GLB/                     # Folder for STEP → GLB workflow
│   ├── model/                    # Input: Place your .step files here
│   ├── output/                   # Output: Generated files
│   │   ├── web/                  # Converted GLB files
│   │   ├── compressed/           # Optimized/Compressed GLB files
│   │   └── bom/                  # Generated BOM JSON files
│   │
│   ├── Sequential_STEP_Processor.py  # Script: Convert STEP → GLB + BOM
│   └── compress-glb.js               # Script: Compress GLB files
│
├── server/                       # Backend (Express / Node.js API)
├── client/                       # Frontend (React app for 3D viewer)
│
└── README.md                     # Project documentation

```

## Usage

### Step 1: Prepare Input Files

Place all your `.step` files into the `model/` folder.

### Step 2: Process STEP Files

Run the main processor script:

```bash
python Sequential_STEP_Processor.py
```

This script will:
- Automatically detect all STEP files in the `model/` folder
- Extract BOM structure from each assembly
- Convert STEP files to GLB format
- Save results in the `output/` directory

### Step 3: Compress GLB Files

Switch to Node.js environment and compress the generated GLB files:

```bash
node compress-glb.js
```

This will:
- Process GLB files from `output/web/` folder
- Compress them one by one
- Save compressed versions to `output/compressed/` folder

### Step 4: Deploy to Server

1. Copy the entire `output/` folder to your server root directory
2. Start the server:

```bash
cd server
npm install  # If not already installed
npm run dev
```

### Step 5: Start Client Application

In a separate terminal, start the client:

```bash
cd client
npm install  # If not already installed
npm start
```

## Output

The tool generates:
- **GLB Files**: Web-compatible 3D models in `output/web/`
- **Compressed GLB**: Optimized models in `output/compressed/`
- **BOM JSON**: Hierarchical assembly structure with part information
- **Web Viewer**: Interactive 3D visualization with BOM tree navigation

## Features

- **Batch Processing**: Handles multiple STEP files automatically
- **BOM Extraction**: Preserves assembly hierarchy and part relationships
- **Web Optimization**: GLB compression for faster loading
- **Interactive Viewer**: Web-based 3D model visualization with part selection
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Troubleshooting

### Environment Issues
- Ensure `pythonocc-core=7.9.0` is installed from conda-forge channel
- Use Python 3.10 for compatibility
- Activate the conda environment before running scripts

### File Processing
- Verify STEP files are valid and placed in the correct `model/` folder
- Check console output for processing errors
- Ensure sufficient disk space for GLB file generation

### Server Issues
- Confirm Node.js dependencies are installed in both server and client directories
- Check that ports are available (default: server on 5000, client on 3000)
- Verify the `output/` folder is properly copied to server root
# industrial-3d-bom-viewer
