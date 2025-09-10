"""Web format conversion module"""

import os
import sys
import glob
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class WebAssetsData:
    """Data structure for web assets"""
    glb_file: Optional[str] = None
    file_size: int = 0
    format: str = ""
    three_js_compatible: bool = False
    conversion_unavailable: Optional[str] = None
    conversion_error: Optional[str] = None


class WebConverter:
    """Converts STP files to web-ready formats"""
    
    def __init__(self):
        self.cascadio_available = self._check_cascadio()
    
    def _check_cascadio(self) -> bool:
        """Check if cascadio is available"""
        try:
            import cascadio
            return True
        except ImportError:
            return False
    
    def convert_to_web_format(self, input_path: str, output_dir: str) -> WebAssetsData:
        """Convert to web-ready format"""
        web_assets = WebAssetsData()
        
        if not self.cascadio_available:
            web_assets.conversion_unavailable = "Cascadio not installed"
            return web_assets
        
        try:
            import cascadio
            
            # Create output directory if it doesn't exist
            if not os.path.exists(output_dir):
                os.makedirs(output_dir)
            
            glb_path = os.path.join(output_dir, "model.glb")
            cascadio.step_to_glb(input_path, glb_path)
            
            web_assets.glb_file = "model.glb"
            web_assets.file_size = os.path.getsize(glb_path)
            web_assets.format = "GLB"
            web_assets.three_js_compatible = True
            
        except Exception as e:
            web_assets.conversion_error = str(e)
        
        return web_assets


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


def main():
    """Main function for standalone usage with hardcoded paths"""
    
    # Hardcoded paths
    model_folder = "model"
    output_dir = "output/web"
    
    print("🔧 STEP to GLB Web Converter")
    print("=" * 40)
    
    # Find STEP file in model folder
    step_file = find_step_file_in_model_folder()
    
    if not step_file:
        print(f"❌ No STEP files found in '{model_folder}' folder")
        print(f"📁 Please place your STEP file (.stp or .step) in the '{model_folder}' directory")
        return 1
    
    print(f"📂 Found STEP file: {step_file}")
    print(f"📁 Output directory: {output_dir}")
    
    try:
        print(f"🔄 Converting STEP file to GLB...")
        print("This may take a few moments for large files...")
        
        # Create converter and convert
        converter = WebConverter()
        result = converter.convert_to_web_format(step_file, output_dir)
        
        # Check results
        if result.conversion_error:
            print(f"❌ Conversion failed: {result.conversion_error}")
            return 1
        elif result.conversion_unavailable:
            print(f"⚠️  Conversion unavailable: {result.conversion_unavailable}")
            print("💡 Install cascadio: pip install cascadio")
            return 1
        else:
            print(f"✅ Conversion successful!")
            print(f"📊 Conversion Summary:")
            print(f"• Input file: {step_file}")
            print(f"• Output file: {os.path.join(output_dir, result.glb_file)}")
            print(f"• File size: {result.file_size / (1024*1024):.2f} MB")
            print(f"• Format: {result.format}")
            print(f"• Three.js compatible: {result.three_js_compatible}")
            print(f"\n🌐 Your GLB file is ready for web viewing!")
            return 0
        
    except KeyboardInterrupt:
        print("\n❌ Conversion cancelled by user")
        return 1
    except Exception as e:
        print(f"\n❌ Error: Failed to convert STEP file - {e}")
        return 1


if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)
