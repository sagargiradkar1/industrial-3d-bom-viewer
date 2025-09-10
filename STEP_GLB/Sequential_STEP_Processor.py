#!/usr/bin/env python
"""
MAIN FILE - UPDATED
Enhanced Sequential STEP File Processor with Reference BOM Extraction Logic
Processes all files in folder sequentially with robust BOM extraction from reference file.
"""

import json
import sys
import os.path
import glob
import logging
import threading
import queue
import time
import gc
import re
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass

# OCC imports from reference file
from OCC.Core.IFSelect import IFSelect_RetDone
from OCC.Core.Quantity import Quantity_Color
from OCC.Core.STEPCAFControl import STEPCAFControl_Reader
from OCC.Core.TDF import TDF_Label, TDF_LabelSequence
from OCC.Core.TopLoc import TopLoc_Location
from OCC.Core.XCAFDoc import XCAFDoc_ColorSurf
from OCC.Extend.TopologyUtils import TopologyExplorer

# OCAF Document handling
from OCC.Core.TCollection import TCollection_ExtendedString
from OCC.Core.TDocStd import TDocStd_Document
from OCC.Core.XCAFApp import XCAFApp_Application
from OCC.Core.XCAFDoc import (XCAFDoc_DocumentTool_ShapeTool,
                              XCAFDoc_DocumentTool_ColorTool)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

@dataclass
class WebAssetsData:
    """Data structure for web assets"""
    glb_file: Optional[str] = None
    file_size: int = 0
    format: str = ""
    three_js_compatible: bool = False
    conversion_unavailable: Optional[str] = None
    conversion_error: Optional[str] = None

@dataclass
class ProcessingResult:
    """Combined result for both BOM extraction and GLB conversion"""
    total_parts: int = 0
    total_assemblies: int = 0
    bom_output_file: Optional[str] = None
    bom_error: Optional[str] = None
    
    glb_file: Optional[str] = None
    glb_file_path: Optional[str] = None
    glb_file_size: int = 0
    glb_format: str = ""
    three_js_compatible: bool = False
    glb_error: Optional[str] = None
    
    filename: Optional[str] = None
    unique_name: Optional[str] = None
    timestamp: Optional[str] = None
    assembly_tree: Optional[list] = None
    processing_duration: float = 0.0
    timeout_occurred: bool = False
    file_size_mb: float = 0.0

@dataclass
class BatchSummary:
    """Summary of sequential batch processing"""
    total_files: int = 0
    processed_files: int = 0
    successful_bom: int = 0
    successful_glb: int = 0
    failed_files: List[str] = None
    skipped_files: List[str] = None
    total_duration: float = 0.0
    results: List[ProcessingResult] = None
    
    def __post_init__(self):
        if self.failed_files is None:
            self.failed_files = []
        if self.skipped_files is None:
            self.skipped_files = []
        if self.results is None:
            self.results = []

# BOM Extraction Classes from Reference File
class StandaloneTreeModel:
    """Standalone TreeModel replacement for OCAF document handling."""
    
    def __init__(self, doc_name="STEP"):
        try:
            # Create OCAF application
            self.app = XCAFApp_Application.GetApplication()
            
            # Create document with proper TCollection_ExtendedString argument
            doc_name_ext = TCollection_ExtendedString(doc_name)
            self.doc = TDocStd_Document(doc_name_ext)
            self.app.NewDocument(doc_name_ext, self.doc)
            
            # Get shape and color tools from the main label
            main_label = self.doc.Main()
            self.shape_tool = XCAFDoc_DocumentTool_ShapeTool(main_label)
            self.color_tool = XCAFDoc_DocumentTool_ColorTool(main_label)
            
            logger.debug("Successfully initialized OCAF document and tools")
            
        except Exception as e:
            logger.error(f"Failed to initialize OCAF document: {e}")
            raise

class StepToJsonConverter:
    """Convert STEP files to JSON format containing assembly structure data."""

    def __init__(self, filename, nextUID=0):
        self.filename = filename
        self._currentUID = nextUID
        self.assyUidStack = [0]
        self.assyLocStack = []
        
    def getNewUID(self):
        """Generate sequential unique identifiers."""
        uid = self._currentUID + 1
        self._currentUID = uid
        return uid

    def getName(self, label):
        """Extract part name from OCAF label."""
        try:
            name = label.GetLabelName()
            return name if name else None
        except:
            return None

    def getColor(self, shape):
        """Extract color information and convert to JSON-compatible format."""
        try:
            color = Quantity_Color()
            has_color = self.color_tool.GetColor(shape, XCAFDoc_ColorSurf, color)
            
            if has_color:
                return {
                    'r': int(color.Red() * 255),
                    'g': int(color.Green() * 255),
                    'b': int(color.Blue() * 255),
                    'hex': '#{:02x}{:02x}{:02x}'.format(
                        int(color.Red() * 255),
                        int(color.Green() * 255),
                        int(color.Blue() * 255)
                    )
                }
        except Exception as e:
            logger.debug(f"Failed to get color: {e}")
        
        # Default gray color if no color found or error occurred
        return {
            'r': 128,
            'g': 128,
            'b': 128,
            'hex': '#808080'
        }

    def serializeLocation(self, location):
        """Convert TopLoc_Location to JSON-serializable format."""
        try:
            if location.IsIdentity():
                return None
            
            # Get transformation matrix  
            trsf = location.Transformation()
            
            # Extract translation
            translation = {
                'x': float(trsf.TranslationPart().X()),
                'y': float(trsf.TranslationPart().Y()),
                'z': float(trsf.TranslationPart().Z())
            }
            
            # Check for rotation (simplified check)
            has_rotation = not trsf.VectorialPart().IsEqual(trsf.VectorialPart(), 1e-7)
            
            return {
                'translation': translation,
                'has_rotation': has_rotation,
                'scale_factor': float(trsf.ScaleFactor())
            }
        except Exception as e:
            logger.debug(f"Failed to serialize location: {e}")
            return None

    def findComponents(self, label, comps):
        """Recursively find and process assembly components."""
        components = []
        
        logger.debug(f"Processing {comps.Length()} components in label {label.EntryDumpToString()}")
        
        for j in range(comps.Length()):
            try:
                cLabel = comps.Value(j+1)
                cShape = self.shape_tool.GetShape(cLabel)
                name = self.getName(cLabel)
                
                # Get component entry for debugging
                component_entry = cLabel.EntryDumpToString()
                logger.debug(f"Component {j+1}: {name} (Entry: {component_entry})")
                
                # Get referenced shape/assembly
                refLabel = TDF_Label()
                isRef = self.shape_tool.GetReferredShape(cLabel, refLabel)
                
                if isRef:
                    refShape = self.shape_tool.GetShape(refLabel)
                    refName = self.getName(refLabel)
                    ref_entry = refLabel.EntryDumpToString()
                    
                    logger.debug(f"Reference: {refName} (Entry: {ref_entry})")
                    
                    if self.shape_tool.IsSimpleShape(refLabel):
                        # Process individual part/shape
                        logger.debug(f"Processing simple shape: {refName}")
                        color = self.getColor(refShape)
                        location = self.shape_tool.GetLocation(cLabel)
                        
                        component = {
                            'name': name or f"Component_{j+1}",
                            'id': self.getNewUID(),
                            'parent_id': self.assyUidStack[-1],
                            'type': 'part',
                            'is_assembly': False,
                            'location': self.serializeLocation(location),
                            'color': color,
                            'shape_type': self.getShapeTypeName(refShape),
                            'reference_name': refName or "Unnamed_Reference",
                            'component_entry': component_entry,
                            'reference_entry': ref_entry
                        }
                        components.append(component)
                        
                    elif self.shape_tool.IsAssembly(refLabel):
                        # Process sub-assembly
                        logger.debug(f"Processing sub-assembly: {refName}")
                        location = self.shape_tool.GetLocation(cLabel)
                        self.assyLocStack.append(location)
                        newAssyUID = self.getNewUID()
                        
                        assembly = {
                            'name': name or f"Assembly_{j+1}",
                            'id': newAssyUID,
                            'parent_id': self.assyUidStack[-1],
                            'type': 'assembly',
                            'is_assembly': True,
                            'location': self.serializeLocation(location),
                            'color': None,
                            'shape_type': 'Assembly',
                            'reference_name': refName or "Unnamed_Assembly",
                            'component_entry': component_entry,
                            'reference_entry': ref_entry
                        }
                        components.append(assembly)
                        
                        # Recursively process sub-assembly components
                        self.assyUidStack.append(newAssyUID)
                        rComps = TDF_LabelSequence()
                        subchilds = False
                        isAssy = self.shape_tool.GetComponents(refLabel, rComps, subchilds)
                        
                        if rComps.Length():
                            sub_components = self.findComponents(refLabel, rComps)
                            components.extend(sub_components)
                        
                        self.assyUidStack.pop()
                        self.assyLocStack.pop()
                else:
                    # Component without reference - create fallback entry
                    logger.debug(f"Component without reference: {name}")
                    color = self.getColor(cShape) if cShape else self.getColor(None)
                    
                    component = {
                        'name': name or f"Component_{j+1}",
                        'id': self.getNewUID(),
                        'parent_id': self.assyUidStack[-1],
                        'type': 'part',
                        'is_assembly': False,
                        'location': None,
                        'color': color,
                        'shape_type': self.getShapeTypeName(cShape) if cShape else 'Unknown',
                        'reference_name': None,
                        'component_entry': component_entry,
                        'reference_entry': None
                    }
                    components.append(component)
                    
            except Exception as e:
                logger.error(f"Error processing component {j+1}: {e}")
                continue
        
        return components

    def getShapeTypeName(self, shape):
        """Convert shape type number to readable name."""
        if not shape:
            return 'Unknown'
            
        try:
            shape_type = shape.ShapeType()
            type_map = {
                0: 'Compound',
                1: 'CompSolid', 
                2: 'Solid',
                3: 'Shell',
                4: 'Face',
                5: 'Wire',
                6: 'Edge',
                7: 'Vertex'
            }
            return type_map.get(shape_type, f'Unknown({shape_type})')
        except:
            return 'Unknown'

    def convert_to_json(self):
        """Main conversion method - reads STEP file and returns JSON data."""
        logger.info(f"Converting STEP file: {self.filename}")
        
        try:
            # Initialize standalone tree model
            tmodel = StandaloneTreeModel("STEP")
            self.shape_tool = tmodel.shape_tool
            self.color_tool = tmodel.color_tool

            # Set up STEP reader
            step_reader = STEPCAFControl_Reader()
            step_reader.SetColorMode(True)
            step_reader.SetLayerMode(True)
            step_reader.SetNameMode(True)
            step_reader.SetMatMode(True)

            # Read the file
            logger.info("Reading STEP file...")
            status = step_reader.ReadFile(self.filename)
            if status != IFSelect_RetDone:
                raise Exception(f"Failed to read STEP file: {self.filename} (Status: {status})")

            logger.info("Transferring STEP data to OCAF document...")
            step_reader.Transfer(tmodel.doc)

            # Get root labels
            labels = TDF_LabelSequence()
            self.shape_tool.GetShapes(labels)
            
            if labels.Length() == 0:
                logger.warning("No shapes found in STEP file")
                return {
                    'filename': os.path.basename(self.filename),
                    'timestamp': self.get_timestamp(),
                    'total_parts': 0,
                    'total_assemblies': 0,
                    'assembly_tree': []
                }

            logger.info(f'Found {labels.Length()} root labels')

            try:
                rootlabel = labels.Value(1)
            except RuntimeError as e:
                raise Exception(f"Error accessing root label: {e}")

            name = self.getName(rootlabel)
            if not name:
                name = os.path.splitext(os.path.basename(self.filename))[0]
                
            isAssy = self.shape_tool.IsAssembly(rootlabel)
            
            assembly_tree = []

            if isAssy:
                # Process as assembly structure
                logger.info(f"Processing assembly: {name}")
                topLoc = self.shape_tool.GetLocation(rootlabel)
                self.assyLocStack.append(topLoc)
                
                newAssyUID = self.getNewUID()
                root_assembly = {
                    'name': name,
                    'id': newAssyUID,
                    'parent_id': None,
                    'type': 'assembly',
                    'is_assembly': True,
                    'location': self.serializeLocation(topLoc),
                    'color': None,
                    'shape_type': 'Assembly',
                    'is_root': True,
                    'root_entry': rootlabel.EntryDumpToString()
                }
                assembly_tree.append(root_assembly)
                
                self.assyUidStack.append(newAssyUID)
                topComps = TDF_LabelSequence()
                subchilds = False
                isAssy = self.shape_tool.GetComponents(rootlabel, topComps, subchilds)
                
                logger.info(f"Root assembly has {topComps.Length()} components")
                if topComps.Length():
                    components = self.findComponents(rootlabel, topComps)
                    assembly_tree.extend(components)
            else:
                # Process individual parts at root level
                logger.info("Processing individual parts")
                newAssyUID = self.getNewUID()
                root_container = {
                    'name': os.path.splitext(os.path.basename(self.filename))[0],
                    'id': newAssyUID,
                    'parent_id': None,
                    'type': 'assembly',
                    'is_assembly': True,
                    'location': None,
                    'color': None,
                    'shape_type': 'Assembly',
                    'is_root': True
                }
                assembly_tree.append(root_container)
                self.assyUidStack = [newAssyUID]
                
                for j in range(labels.Length()):
                    label = labels.Value(j+1)
                    name = self.getName(label)
                    if not name:
                        name = f"Part_{j+1}"
                    shape = self.shape_tool.GetShape(label)
                    color = self.getColor(shape)
                    shape_type = self.getShapeTypeName(shape)
                    
                    part = {
                        'name': name,
                        'id': self.getNewUID(),
                        'parent_id': self.assyUidStack[-1],
                        'type': 'part',
                        'is_assembly': False,
                        'location': None,
                        'color': color,
                        'shape_type': shape_type,
                        'label_entry': label.EntryDumpToString()
                    }
                    assembly_tree.append(part)

            # Calculate statistics
            total_parts = sum(1 for item in assembly_tree if not item['is_assembly'])
            total_assemblies = sum(1 for item in assembly_tree if item['is_assembly'])

            result = {
                'filename': os.path.basename(self.filename),
                'full_path': os.path.abspath(self.filename),
                'timestamp': self.get_timestamp(),
                'total_parts': total_parts,
                'total_assemblies': total_assemblies,
                'assembly_tree': assembly_tree
            }
            
            logger.info(f"Conversion completed successfully - {total_parts} parts, {total_assemblies} assemblies")
            return result
            
        except Exception as e:
            logger.error(f"Conversion failed: {e}")
            raise

    def get_timestamp(self):
        """Get current timestamp for JSON output."""
        return datetime.now().isoformat()

class BOMAnalyzer:
    """Analyze BOM data and provide hierarchy tools."""
    
    def __init__(self, bom_file_path):
        with open(bom_file_path, 'r', encoding='utf-8') as f:
            self.data = json.load(f)
        self.assembly_tree = self.data['assembly_tree']
        self.items_by_id = {item['id']: item for item in self.assembly_tree}
    
    def find_children(self, parent_id):
        """Find all direct children of a given parent."""
        children = []
        for item in self.assembly_tree:
            if item['parent_id'] == parent_id:
                children.append(item)
        return children
    
    def find_all_descendants(self, parent_id):
        """Find all descendants (children, grandchildren, etc.) of a given parent."""
        descendants = []
        children = self.find_children(parent_id)
        
        for child in children:
            descendants.append(child)
            # Recursively find descendants of this child
            descendants.extend(self.find_all_descendants(child['id']))
        
        return descendants
    
    def get_path_to_root(self, target_id):
        """Get the complete path from target item to root."""
        path = []
        current_id = target_id
        
        while current_id is not None:
            current_item = self.items_by_id.get(current_id)
            if not current_item:
                break
            path.append(current_item)
            current_id = current_item['parent_id']
        
        return path[::-1]  # Reverse to show root-to-target
    
    def build_hierarchy_tree(self):
        """Build a nested tree structure from flat array."""
        # Add children list to each item
        for item in self.assembly_tree:
            item['children'] = []
        
        # Build parent-child relationships
        root_items = []
        for item in self.assembly_tree:
            if item['parent_id'] is None:
                root_items.append(item)
            else:
                parent = self.items_by_id.get(item['parent_id'])
                if parent:
                    parent['children'].append(item)
        
        return root_items

class BOMExtractor:
    """Main BOM extractor class that can be called from other modules."""
    
    def __init__(self):
        """Initialize the BOM extractor."""
        pass
    
    def extract_bom_data(self, input_step_file, output_dir, output_filename="bom_data.json"):
        """
        Extract BOM data from STEP file and save to JSON.
        
        Args:
            input_step_file (str): Path to the STEP file to process
            output_dir (str): Output directory to save BOM files
            output_filename (str): Custom filename for the output JSON file
            
        Returns:
            dict: Results dictionary with success/error status and data
        """
        try:
            # Validate input file
            if not os.path.exists(input_step_file):
                return {
                    "error": f"STEP file not found: {input_step_file}",
                    "total_parts": 0,
                    "total_assemblies": 0
                }
            
            if not (input_step_file.lower().endswith('.stp') or 
                    input_step_file.lower().endswith('.step')):
                logger.warning("File doesn't have .stp or .step extension")
            
            # Create output directory if it doesn't exist
            if not os.path.exists(output_dir):
                os.makedirs(output_dir)
                logger.info(f"Created output directory: {output_dir}")
            
            # Convert STEP to JSON
            logger.info(f"Converting STEP file: {input_step_file}")
            converter = StepToJsonConverter(input_step_file)
            assembly_data = converter.convert_to_json()
            
            # Save BOM data with custom filename
            output_file = save_bom_json(assembly_data, output_dir, output_filename)
            
            # Return success result
            result = {
                "total_parts": assembly_data['total_parts'],
                "total_assemblies": assembly_data['total_assemblies'],
                "output_file": output_file,
                "filename": assembly_data['filename'],
                "timestamp": assembly_data['timestamp'],
                "assembly_tree": assembly_data['assembly_tree']
            }
            
            logger.info(f"BOM extraction completed successfully - {assembly_data['total_parts']} parts, {assembly_data['total_assemblies']} assemblies")
            return result
            
        except Exception as e:
            error_msg = f"BOM extraction failed: {str(e)}"
            logger.error(error_msg)
            return {
                "error": error_msg,
                "total_parts": 0,
                "total_assemblies": 0
            }

# GLB Conversion Class (unchanged from original)
class WebConverter:
    """GLB converter with timeout protection."""
    
    def __init__(self):
        self.cascadio_available = self._check_cascadio()
    
    def _check_cascadio(self) -> bool:
        try:
            import cascadio
            return True
        except ImportError:
            return False
    
    def _convert_worker(self, input_path, output_path, result_queue):
        try:
            import cascadio
            logger.info(f"🔄 Starting GLB conversion...")
            cascadio.step_to_glb(input_path, output_path)
            
            if os.path.exists(output_path):
                file_size = os.path.getsize(output_path)
                result_queue.put({'success': True, 'file_size': file_size})
                logger.info(f"✅ GLB conversion completed - {file_size/(1024*1024):.2f} MB")
            else:
                result_queue.put({'success': False, 'error': 'GLB file was not created'})
            
        except Exception as e:
            logger.error(f"❌ GLB conversion error: {e}")
            result_queue.put({'success': False, 'error': str(e)})
    
    def convert_to_web_format(self, input_path: str, output_dir: str, output_filename: str = "model.glb", timeout_seconds: int = 300) -> WebAssetsData:
        web_assets = WebAssetsData()
        
        if not self.cascadio_available:
            web_assets.conversion_unavailable = "Cascadio not installed - run: pip install cascadio"
            return web_assets
        
        try:
            if not os.path.exists(output_dir):
                os.makedirs(output_dir)
            
            glb_path = os.path.join(output_dir, output_filename)
            
            result_queue = queue.Queue()
            conversion_thread = threading.Thread(
                target=self._convert_worker, 
                args=(input_path, glb_path, result_queue)
            )
            conversion_thread.daemon = True
            conversion_thread.start()
            
            try:
                result = result_queue.get(timeout=timeout_seconds)
                
                if result['success']:
                    web_assets.glb_file = output_filename
                    web_assets.file_size = result['file_size']
                    web_assets.format = "GLB"
                    web_assets.three_js_compatible = True
                else:
                    web_assets.conversion_error = result['error']
                    
            except queue.Empty:
                web_assets.conversion_error = f"GLB conversion timed out after {timeout_seconds} seconds"
                
        except Exception as e:
            web_assets.conversion_error = str(e)
        
        return web_assets

def save_bom_json(assembly_data, output_dir, filename='bom_data.json'):
    """Save assembly data as BOM JSON file."""
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    output_file = os.path.join(output_dir, filename)
    
    bom_data = {
        **assembly_data,
        'bom_type': 'STEP_Assembly_BOM',
        'generated_by': 'Enhanced_Sequential_STEP_Processor',
        'version': '2.2'
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(bom_data, f, indent=2, ensure_ascii=False)
    
    return output_file

def get_ordered_step_files(model_folder="model"):
    """Get all STEP files sorted by name for consistent processing order."""
    if not os.path.exists(model_folder):
        return []
    
    step_extensions = ['*.step', '*.stp', '*.STEP', '*.STP']
    step_files = []
    
    for extension in step_extensions:
        step_files.extend(glob.glob(os.path.join(model_folder, extension)))
    
    step_files = sorted(list(set(step_files)), key=lambda x: os.path.basename(x).lower())
    
    return step_files

def sanitize_filename(filename):
    """Sanitize filename for directory names."""
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', filename)
    sanitized = re.sub(r'_+', '_', sanitized).strip('._')
    return sanitized

class SequentialStepProcessor:
    """Enhanced sequential processor with reference BOM extraction."""
    
    def __init__(self):
        self.web_converter = WebConverter()
    
    def generate_unique_name(self, step_file_path):
        """Generate unique name for output files."""
        base_name = os.path.splitext(os.path.basename(step_file_path))[0]
        base_name = sanitize_filename(base_name)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:-3]
        return f"{base_name}_{timestamp}"
    
    def calculate_glb_timeout(self, file_size_mb):
        """Calculate GLB timeout based on file size."""
        if file_size_mb <= 50:
            return 240
        elif file_size_mb <= 100:
            return 360
        elif file_size_mb <= 200:
            return 480
        else:
            return 600
    
    def process_single_file(self, input_step_file, bom_base_dir, glb_base_dir, file_index, total_files):
        """Process a single STEP file with reference BOM extraction and unique filenames."""
        start_time = datetime.now()
        
        file_size_mb = os.path.getsize(input_step_file) / (1024 * 1024)
        unique_name = self.generate_unique_name(input_step_file)
        bom_output_dir = os.path.join(bom_base_dir, unique_name)
        glb_output_dir = os.path.join(glb_base_dir, unique_name)
        
        result = ProcessingResult()
        result.filename = os.path.basename(input_step_file)
        result.unique_name = unique_name
        result.timestamp = start_time.isoformat()
        result.file_size_mb = file_size_mb
        
        print(f"\n[{file_index}/{total_files}] 📂 {result.filename}")
        print("=" * 60)
        print(f"📏 Size: {file_size_mb:.2f} MB")
        print(f"🏷️ Unique name: {unique_name}")
        print(f"📋 BOM output: {bom_output_dir}")
        print(f"🌐 GLB output: {glb_output_dir}")
        
        # Step 1: Reference BOM Extraction with unique filename
        print(f"\n📋 STEP 1: REFERENCE BOM EXTRACTION")
        print("-" * 40)
        
        try:
            if not os.path.exists(bom_output_dir):
                os.makedirs(bom_output_dir)
            
            print("🚀 Starting reference BOM extraction...")
            extractor = BOMExtractor()
            
            # Create unique BOM filename that matches GLB naming convention
            bom_filename = f"{unique_name}_bom.json"
            bom_result = extractor.extract_bom_data(input_step_file, bom_output_dir, bom_filename)
            
            if "error" in bom_result:
                print(f"❌ BOM extraction failed: {bom_result['error']}")
                result.bom_error = bom_result['error']
            else:
                result.total_parts = bom_result['total_parts']
                result.total_assemblies = bom_result['total_assemblies']
                result.bom_output_file = bom_result['output_file']
                result.assembly_tree = bom_result['assembly_tree']
                
                print(f"✅ BOM: {result.total_parts} parts, {result.total_assemblies} assemblies")
                print(f"📄 Output: {bom_filename}")
                
        except Exception as e:
            print(f"❌ BOM extraction failed: {str(e)}")
            result.bom_error = str(e)
        
        # Step 2: GLB Conversion (unchanged)
        print(f"\n🌐 STEP 2: GLB CONVERSION")
        print("-" * 30)
        
        try:
            glb_timeout = self.calculate_glb_timeout(file_size_mb)
            print(f"🚀 Starting GLB conversion ({glb_timeout//60}min timeout)...")
            
            glb_filename = f"{unique_name}_model.glb"
            web_assets = self.web_converter.convert_to_web_format(
                input_step_file, glb_output_dir, glb_filename, glb_timeout
            )
            
            if web_assets.conversion_error:
                print(f"❌ GLB failed: {web_assets.conversion_error}")
                result.glb_error = web_assets.conversion_error
            elif web_assets.conversion_unavailable:
                print(f"⚠️ GLB unavailable: {web_assets.conversion_unavailable}")
                result.glb_error = web_assets.conversion_unavailable
            else:
                result.glb_file = web_assets.glb_file
                result.glb_file_path = os.path.join(glb_output_dir, web_assets.glb_file)
                result.glb_file_size = web_assets.file_size
                result.glb_format = web_assets.format
                result.three_js_compatible = web_assets.three_js_compatible
                
                print(f"✅ GLB: {result.glb_file_size / (1024*1024):.2f} MB")
                print(f"📄 Output: {glb_filename}")
                
        except Exception as e:
            print(f"❌ GLB conversion failed: {str(e)}")
            result.glb_error = str(e)
        
        # Calculate duration
        end_time = datetime.now()
        result.processing_duration = (end_time - start_time).total_seconds()
        
        # Print file summary
        success_count = 0
        if not result.bom_error:
            success_count += 1
        if not result.glb_error:
            success_count += 1
        
        status_emoji = "✅" if success_count == 2 else "⚠️" if success_count == 1 else "❌"
        print(f"\n{status_emoji} File completed in {result.processing_duration:.1f}s")
        print(f"🔗 Unique files created:")
        if not result.bom_error:
            print(f"  • BOM JSON: {unique_name}_bom.json")
        if not result.glb_error:
            print(f"  • GLB Model: {unique_name}_model.glb")
        
        return result
    
    def process_all_files_sequentially(self, model_folder="model", bom_base_dir="output/bom", glb_base_dir="output/web"):
        """Process all STEP files in sequence with reference BOM extraction."""
        batch_start_time = datetime.now()
        
        print("🔄 ENHANCED SEQUENTIAL STEP FILE PROCESSOR")
        print("📝 Now using reference BOM extraction logic!")
        print("🏷️ All files saved with unique timestamps!")
        print("📁 Processing files one by one in order")
        print("=" * 60)
        
        step_files = get_ordered_step_files(model_folder)
        
        if not step_files:
            print(f"❌ No STEP files found in '{model_folder}' folder")
            return BatchSummary()
        
        batch_summary = BatchSummary()
        batch_summary.total_files = len(step_files)
        
        print(f"📊 Found {len(step_files)} files to process:")
        for i, file_path in enumerate(step_files, 1):
            file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
            print(f"  {i:2d}. {os.path.basename(file_path)} ({file_size_mb:.1f} MB)")
        
        print(f"\n🚀 Starting sequential processing with reference BOM extraction...")
        
        try:
            for i, step_file in enumerate(step_files, 1):
                try:
                    result = self.process_single_file(
                        step_file, bom_base_dir, glb_base_dir, i, len(step_files)
                    )
                    
                    batch_summary.results.append(result)
                    batch_summary.processed_files += 1
                    
                    if not result.bom_error:
                        batch_summary.successful_bom += 1
                    if not result.glb_error:
                        batch_summary.successful_glb += 1
                    
                    if result.bom_error and result.glb_error:
                        batch_summary.failed_files.append(result.filename)
                    
                    if i < len(step_files):
                        print(f"\n⏸️ Pausing 2 seconds before next file...")
                        time.sleep(2)
                        gc.collect()
                    
                except KeyboardInterrupt:
                    print(f"\n❌ Processing interrupted by user at file {i}/{len(step_files)}")
                    break
                except Exception as e:
                    logger.error(f"Unexpected error processing {step_file}: {e}")
                    print(f"❌ Unexpected error: {e}")
                    batch_summary.failed_files.append(os.path.basename(step_file))
                    continue
        
        except Exception as e:
            print(f"❌ Batch processing error: {e}")
        
        batch_end_time = datetime.now()
        batch_summary.total_duration = (batch_end_time - batch_start_time).total_seconds()
        
        self.print_batch_summary(batch_summary)
        
        return batch_summary
    
    def print_batch_summary(self, batch_summary: BatchSummary):
        """Print comprehensive batch processing summary."""
        print(f"\n" + "=" * 60)
        print("🎉 ENHANCED SEQUENTIAL PROCESSING COMPLETE")
        print("=" * 60)
        
        print(f"📊 Overall Statistics:")
        print(f"  • Total files: {batch_summary.total_files}")
        print(f"  • Processed files: {batch_summary.processed_files}")
        print(f"  • Successful BOM extractions: {batch_summary.successful_bom}")
        print(f"  • Successful GLB conversions: {batch_summary.successful_glb}")
        print(f"  • Failed files: {len(batch_summary.failed_files)}")
        print(f"  • Total duration: {batch_summary.total_duration/60:.1f} minutes")
        
        if batch_summary.failed_files:
            print(f"\n❌ Failed files:")
            for filename in batch_summary.failed_files:
                print(f"  • {filename}")
        
        # Success rates
        total_operations = batch_summary.processed_files * 2
        successful_operations = batch_summary.successful_bom + batch_summary.successful_glb
        success_rate = (successful_operations / total_operations) * 100 if total_operations > 0 else 0
        
        print(f"\n🎯 Overall Success Rate: {success_rate:.1f}%")
        print(f"📋 BOM Success Rate: {(batch_summary.successful_bom / batch_summary.processed_files) * 100:.1f}%")
        print(f"🌐 GLB Success Rate: {(batch_summary.successful_glb / batch_summary.processed_files) * 100:.1f}%")
        
        if batch_summary.successful_bom > 0 or batch_summary.successful_glb > 0:
            print(f"\n🚀 Processing completed with reference BOM extraction!")
            print(f"🏷️ All output files have unique timestamps!")
            print(f"📁 Check output folders:")
            print(f"  • BOM files: output/bom/")
            print(f"  • GLB files: output/web/")
            
            # Show example filenames
            if batch_summary.results:
                first_result = batch_summary.results[0]
                print(f"\n📝 Example output filenames:")
                print(f"  • BOM JSON: {first_result.unique_name}_bom.json")
                if not first_result.glb_error:
                    print(f"  • GLB Model: {first_result.unique_name}_model.glb")

def main():
    """Enhanced main function with reference BOM extraction and unique filenames."""
    model_folder = "model"
    bom_base_dir = "output/bom"
    glb_base_dir = "output/web"
    
    try:
        processor = SequentialStepProcessor()
        batch_summary = processor.process_all_files_sequentially(model_folder, bom_base_dir, glb_base_dir)
        
        if batch_summary.successful_bom > 0 or batch_summary.successful_glb > 0:
            return 0
        else:
            return 1
        
    except KeyboardInterrupt:
        print("\n❌ Processing cancelled by user")
        return 1
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1

if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)
