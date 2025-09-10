#!/usr/bin/env python
"""
REFERENCE FILE
Complete STEP File to JSON BOM Converter with Hierarchy Analysis
Converts STEP (.stp) files to JSON format and provides tools to analyze assembly structure.
"""

import json
import sys
import os.path
import glob
import logging
from datetime import datetime
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
    
    def print_tree(self, items=None, level=0):
        """Recursively print the tree structure."""
        if items is None:
            items = [item for item in self.assembly_tree if item['parent_id'] is None]
        
        if not isinstance(items, list):
            items = [items]
        
        for item in items:
            indent = "  " * level
            icon = "📁" if item['is_assembly'] else "🔧"
            color_info = ""
            if item.get('color') and item['color']['hex'] != '#808080':
                color_info = f" [{item['color']['hex']}]"
            
            print(f"{indent}{icon} {item['name']} (ID: {item['id']}){color_info}")
            
            # Print children
            children = self.find_children(item['id'])
            if children:
                self.print_tree(children, level + 1)
    
    def analyze_assembly_structure(self):
        """Analyze the assembly structure and print statistics."""
        children_count = {}
        
        for item in self.assembly_tree:
            parent_id = item['parent_id']
            if parent_id not in children_count:
                children_count[parent_id] = 0
            children_count[parent_id] += 1
        
        print("\n" + "="*50)
        print("ASSEMBLY STRUCTURE ANALYSIS")
        print("="*50)
        
        print(f"📊 Total Items: {len(self.assembly_tree)}")
        print(f"🏗️  Total Assemblies: {self.data['total_assemblies']}")
        print(f"🔧 Total Parts: {self.data['total_parts']}")
        
        print(f"\n📁 Assembly Breakdown:")
        print("-" * 30)
        
        for item in self.assembly_tree:
            if item['is_assembly']:
                child_count = children_count.get(item['id'], 0)
                descendants = self.find_all_descendants(item['id'])
                part_count = sum(1 for d in descendants if not d['is_assembly'])
                assy_count = sum(1 for d in descendants if d['is_assembly'])
                
                print(f"{item['name']}:")
                print(f"  • Direct children: {child_count}")
                print(f"  • Total parts: {part_count}")
                print(f"  • Sub-assemblies: {assy_count}")
                print()
    
    def search_by_name(self, search_term, case_sensitive=False):
        """Search for items by name."""
        results = []
        search_term = search_term if case_sensitive else search_term.lower()
        
        for item in self.assembly_tree:
            name = item['name']
            name_to_search = name if case_sensitive else name.lower()
            
            if search_term in name_to_search:
                results.append(item)
        
        return results
    
    def get_parts_list(self):
        """Get a list of all parts (non-assemblies) with their full paths."""
        parts = []
        
        for item in self.assembly_tree:
            if not item['is_assembly']:
                path = self.get_path_to_root(item['id'])
                path_names = [p['name'] for p in path]
                
                parts.append({
                    'name': item['name'],
                    'id': item['id'],
                    'path': ' → '.join(path_names),
                    'color': item.get('color', {}),
                    'shape_type': item.get('shape_type', 'Unknown')
                })
        
        return parts


def save_bom_json(assembly_data, output_dir='output/bom', filename='bom_data.json'):
    """Save assembly data as BOM (Bill of Materials) JSON file."""
    
    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"✅ Created output directory: {output_dir}")
    
    # Full output path
    output_file = os.path.join(output_dir, filename)
    
    # Add BOM-specific metadata
    bom_data = {
        **assembly_data,
        'bom_type': 'STEP_Assembly_BOM',
        'generated_by': 'STEP_to_JSON_Converter',
        'version': '1.0'
    }
    
    # Save to file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(bom_data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ BOM saved to: {output_file}")
    return output_file


def find_step_file_in_model_folder():
    """Find STEP files in the model folder"""
    model_folder = "model"
    
    if not os.path.exists(model_folder):
        return None
    
    # Look for STEP files with common extensions
    step_extensions = ['*.step', '*.stp', '*.STEP', '*.STP']
    step_files = []
    
    for extension in step_extensions:
        step_files.extend(glob.glob(os.path.join(model_folder, extension)))
    
    if not step_files:
        return None
    
    # Return the first STEP file found
    return step_files[0]


class BOMExtractor:
    """Main BOM extractor class that can be called from other modules."""
    
    def __init__(self):
        """Initialize the BOM extractor."""
        pass
    
    def extract_bom_data(self, input_step_file, output_dir):
        """
        Extract BOM data from STEP file and save to JSON.
        
        Args:
            input_step_file (str): Path to the STEP file to process
            output_dir (str): Output directory to save BOM files
            
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
            
            # Save BOM data with fixed filename
            output_filename = "bom_data.json"
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


def main():
    """Main function for standalone usage with hardcoded paths"""
    
    # Hardcoded paths
    model_folder = "model"
    output_dir = "output/bom"
    output_filename = "bom_data.json"
    
    print("🔧 STEP to BOM JSON Converter")
    print("=" * 40)
    
    # Find STEP file in model folder
    step_file = find_step_file_in_model_folder()
    
    if not step_file:
        print(f"❌ No STEP files found in '{model_folder}' folder")
        print(f"📁 Please place your STEP file (.stp or .step) in the '{model_folder}' directory")
        return 1
    
    print(f"📂 Found STEP file: {step_file}")
    print(f"📁 Output directory: {output_dir}")
    print(f"📄 Output filename: {output_filename}")

    try:
        print(f"🔄 Converting STEP file to BOM JSON...")
        print("This may take a few moments for large files...")
        
        # Use the BOMExtractor class
        extractor = BOMExtractor()
        result = extractor.extract_bom_data(step_file, output_dir)
        
        if "error" in result:
            print(f"❌ Error: {result['error']}")
            return 1
        
        print(f"✅ Conversion successful!")
        print(f"📊 Conversion Summary:")
        print(f"• Input file: {step_file}")
        print(f"• Output file: {result['output_file']}")
        print(f"• Total parts: {result['total_parts']}")
        print(f"• Total assemblies: {result['total_assemblies']}")
        print(f"• File size: {os.path.getsize(result['output_file'])} bytes")
        print(f"\n📋 Your BOM data is ready for analysis!")
        
        # Optional: Show quick analysis
        print(f"\n🔍 Quick Analysis:")
        analyzer = BOMAnalyzer(result['output_file'])
        analyzer.analyze_assembly_structure()
        
        return 0
            
    except KeyboardInterrupt:
        print("\n❌ Conversion cancelled by user")
        return 1
    except Exception as e:
        print(f"\n❌ Error: Failed to convert STEP file - {e}")
        logger.exception("Detailed error information:")
        return 1


if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)
