import React, { useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

const Model = ({ modelInfo, selectedPart, onPartSelect, bomData, onLoadingChange }) => {
  const modelRef = useRef();
  const orbitControlsRef = useRef();
  const { camera, gl } = useThree();
  
  const [cameraAnimation, setCameraAnimation] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Use the auto endpoint that handles compressed/original fallback automatically
  const glbUrl = `http://localhost:5000/api/model/auto/${modelInfo.id}`;
  
  console.log(`🎯 3D Model: Loading GLB for model: ${modelInfo.displayName}`);
  console.log(`📂 3D Model: GLB URL: ${glbUrl}`);

  // Load GLB with error handling
  const { scene, error } = useGLTF(glbUrl, true);

  // Handle GLB loading errors
  useEffect(() => {
    if (error) {
      console.error('❌ 3D Model: GLB loading error:', error);
      setLoadError(error.message || 'Failed to load 3D model');
      onLoadingChange(false);
    }
  }, [error, onLoadingChange]);

  // Handle successful model loading
  useEffect(() => {
    if (scene && modelRef.current && isInitialLoad && !loadError) {
      console.log(`✅ 3D Model: Model loaded successfully: ${modelInfo.displayName}`, scene);
      
      // Log available meshes for debugging
      const meshNames = [];
      scene.traverse((child) => {
        if (child.isMesh && child.name) {
          meshNames.push(child.name);
        }
      });
      console.log(`🔍 3D Model: Available mesh names (first 20):`, meshNames.slice(0, 20));
      
      // Setup model materials and interactions
      scene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.userData.originalMaterial = child.material;
          
          if (child.material) {
            // Enhance material properties
            if (child.material.isMeshStandardMaterial || child.material.isMeshPhysicalMaterial) {
              if (child.material.metalness > 0.5) {
                child.material.envMapIntensity = 1.0;
              }
              if (child.material.roughness === 0) {
                child.material.roughness = 0.1;
              }
            }
            
            // Store original material properties for highlighting
            if (child.material.color) {
              child.userData.originalColor = child.material.color.clone();
            }
            if (child.material.emissive) {
              child.userData.originalEmissive = child.material.emissive.clone();
            }
            if (child.material.emissiveIntensity !== undefined) {
              child.userData.originalEmissiveIntensity = child.material.emissiveIntensity;
            }
            
            child.material.needsUpdate = true;
          }
        }
      });

      // Auto-fit camera to model
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5;
      
      // Position camera for optimal viewing
      camera.position.set(
        center.x + cameraDistance,
        center.y + cameraDistance * 0.5,
        center.z + cameraDistance
      );
      
      if (orbitControlsRef.current) {
        orbitControlsRef.current.target.copy(center);
        orbitControlsRef.current.update();
      }

      // Setup click interactions
      setupInteractions(scene, camera, gl.domElement, onPartSelect, bomData, selectedPart);
      onLoadingChange(false);
      setIsInitialLoad(false);
      
      console.log(`🎯 3D Model: Model setup completed for: ${modelInfo.displayName}`);
    }
  }, [scene, camera, gl.domElement, onPartSelect, bomData, onLoadingChange, isInitialLoad, modelInfo.displayName, loadError]);

  // ENHANCED: Handle part highlighting with multiple matching strategies
  useEffect(() => {
    if (!scene || !modelRef.current || loadError) return;

    console.log('🔄 3D Model: Updating part selection:', selectedPart ? {
      id: selectedPart.id,
      name: selectedPart.name,
      reference_name: selectedPart.reference_name,
      meshName: selectedPart.meshName,
      selectionSource: selectedPart.selectionSource
    } : 'NONE');

    // Reset all materials first
    let resetCount = 0;
    scene.traverse((child) => {
      if (child.isMesh && child.userData.originalMaterial) {
        child.material = child.userData.originalMaterial;
        
        // Restore original colors
        if (child.userData.originalColor) {
          child.material.color.copy(child.userData.originalColor);
        }
        if (child.userData.originalEmissive) {
          child.material.emissive.copy(child.userData.originalEmissive);
        }
        if (child.userData.originalEmissiveIntensity !== undefined) {
          child.material.emissiveIntensity = child.userData.originalEmissiveIntensity;
        }
        
        child.material.needsUpdate = true;
        resetCount++;
      }
    });

    console.log(`🔄 3D Model: Reset ${resetCount} meshes to original materials`);

    // If no part selected, keep everything unhighlighted
    if (!selectedPart) {
      console.log('✅ 3D Model: All parts deselected and unhighlighted');
      return;
    }

    // ENHANCED: Find and highlight the selected part with better matching
    let selectedMesh = null;
    let matchMethod = '';
    
    // Strategy 1: Direct mesh name match
    if (selectedPart.meshName && !selectedMesh) {
      selectedMesh = scene.getObjectByName(selectedPart.meshName);
      if (selectedMesh) {
        matchMethod = 'meshName';
        console.log('✅ 3D Model: Found mesh by meshName:', selectedPart.meshName);
      }
    }
    
    // Strategy 2: Reference name match
    if (selectedPart.reference_name && !selectedMesh) {
      scene.traverse((child) => {
        if (child.isMesh && child.name === selectedPart.reference_name) {
          selectedMesh = child;
          matchMethod = 'reference_name';
          console.log('✅ 3D Model: Found mesh by reference_name:', selectedPart.reference_name);
        }
      });
    }
    
    // Strategy 3: Name match
    if (selectedPart.name && !selectedMesh) {
      scene.traverse((child) => {
        if (child.isMesh && child.name === selectedPart.name) {
          selectedMesh = child;
          matchMethod = 'name';
          console.log('✅ 3D Model: Found mesh by name:', selectedPart.name);
        }
      });
    }
    
    // Strategy 4: ID match (as string)
    if (!selectedMesh) {
      const idStr = selectedPart.id.toString();
      scene.traverse((child) => {
        if (child.isMesh && child.name === idStr) {
          selectedMesh = child;
          matchMethod = 'id_string';
          console.log('✅ 3D Model: Found mesh by ID string:', idStr);
        }
      });
    }
    
    // Strategy 5: Partial name matching
    if (selectedPart.reference_name && !selectedMesh) {
      scene.traverse((child) => {
        if (child.isMesh && child.name && (
          child.name.includes(selectedPart.reference_name) ||
          selectedPart.reference_name.includes(child.name)
        )) {
          selectedMesh = child;
          matchMethod = 'partial_reference';
          console.log('✅ 3D Model: Found mesh by partial reference match:', {
            meshName: child.name,
            referenceName: selectedPart.reference_name
          });
        }
      });
    }

    // Strategy 6: Partial name matching with selectedPart.name
    if (selectedPart.name && !selectedMesh) {
      scene.traverse((child) => {
        if (child.isMesh && child.name && (
          child.name.includes(selectedPart.name) ||
          selectedPart.name.includes(child.name)
        )) {
          selectedMesh = child;
          matchMethod = 'partial_name';
          console.log('✅ 3D Model: Found mesh by partial name match:', {
            meshName: child.name,
            partName: selectedPart.name
          });
        }
      });
    }

    if (selectedMesh && selectedMesh.isMesh) {
      console.log('🔴 3D Model: Highlighting mesh:', {
        meshName: selectedMesh.name,
        matchMethod,
        selectedPartInfo: {
          id: selectedPart.id,
          name: selectedPart.name,
          reference_name: selectedPart.reference_name
        }
      });
      
      // Create highlight material
      const highlightMaterial = selectedMesh.userData.originalMaterial.clone();
      highlightMaterial.color.setHex(0xff4444);  // Red color
      highlightMaterial.emissive.setHex(0x441100);  // Dark red emissive
      highlightMaterial.emissiveIntensity = 0.3;
      
      selectedMesh.material = highlightMaterial;
      selectedMesh.material.needsUpdate = true;

      // Focus camera on selected part
      focusCameraOnMesh(selectedMesh, camera, orbitControlsRef.current);
    } else {
      console.warn('⚠️ 3D Model: Could not find mesh for selected part:', {
        selectedPart,
        availableMeshes: (() => {
          const meshes = [];
          scene.traverse((child) => {
            if (child.isMesh && child.name) {
              meshes.push(child.name);
            }
          });
          return meshes.slice(0, 20); // Show first 20 for debugging
        })()
      });
    }
  }, [selectedPart, scene, loadError, camera]);

  const focusCameraOnMesh = (mesh, camera, controls) => {
    setCameraAnimation(null);
    
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 2.5;
    
    const direction = new THREE.Vector3(1, 0.5, 1).normalize();
    const newCameraPosition = center.clone().add(direction.multiplyScalar(distance));
    
    const currentCameraPosition = camera.position.clone();
    const currentTarget = controls ? controls.target.clone() : center;
    
    setCameraAnimation({
      startPosition: currentCameraPosition,
      endPosition: newCameraPosition,
      startTarget: currentTarget,
      endTarget: center,
      progress: 0,
      duration: 1000
    });

    console.log('📹 3D Model: Focusing camera on selected mesh');
  };

  // Handle camera animation
  useFrame((state, delta) => {
    if (cameraAnimation && orbitControlsRef.current) {
      const { startPosition, endPosition, startTarget, endTarget, progress, duration } = cameraAnimation;
      
      const newProgress = Math.min(progress + (delta * 1000) / duration, 1);
      const easeInOutQuad = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const easedProgress = easeInOutQuad(newProgress);
      
      const newCameraPosition = new THREE.Vector3().lerpVectors(startPosition, endPosition, easedProgress);
      camera.position.copy(newCameraPosition);
      
      const newTarget = new THREE.Vector3().lerpVectors(startTarget, endTarget, easedProgress);
      orbitControlsRef.current.target.copy(newTarget);
      orbitControlsRef.current.update();
      
      setCameraAnimation(prev => ({ ...prev, progress: newProgress }));
      
      if (newProgress >= 1) {
        setCameraAnimation(null);
      }
    }
  });

  // Show error mesh if loading failed
  if (loadError) {
    return (
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[4, 2, 1]} />
        <meshStandardMaterial color={0xff4444} />
      </mesh>
    );
  }

  if (!scene) return null;

  return (
    <>
      <OrbitControls
        ref={orbitControlsRef}
        enableDamping
        dampingFactor={0.05}
        enableZoom
        enablePan
        enableRotate
        maxPolarAngle={Math.PI}
        minDistance={1}
        maxDistance={500}
      />
      <primitive ref={modelRef} object={scene} />
    </>
  );
};

const Lighting = () => {
  return (
    <>
      <ambientLight intensity={0.8} color={0xffffff} />
      <directionalLight 
        position={[20, 20, 10]} 
        intensity={1.0} 
        color={0xffffff} 
        castShadow 
        shadow-mapSize-width={2048} 
        shadow-mapSize-height={2048} 
      />
      <directionalLight position={[-20, 10, -10]} intensity={0.8} color={0xffffff} />
      <directionalLight position={[0, -20, 0]} intensity={0.5} color={0xffffff} />
      <hemisphereLight skyColor={0xffffff} groundColor={0x888888} intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={0.8} color={0xffffff} distance={100} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color={0xffffff} distance={100} />
    </>
  );
};

const LoadingFallback = () => {
  return (
    <mesh>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color={0x3498db} />
    </mesh>
  );
};

// ENHANCED: Interaction setup with better part data creation
const setupInteractions = (model, camera, domElement, onPartSelect, bomData, selectedPart) => {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  
  let clickCount = 0;
  let clickTimer = null;
  let lastClickedObject = null;
  const DOUBLE_CLICK_DELAY = 350;

  console.log('🎮 3D Model: Setting up model interactions with BOM data:', !!bomData);

  const handleClick = (event) => {
    event.preventDefault();
    
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(model.children, true);

    const clickedObject = intersects.length > 0 ? intersects[0].object : null;

    clickCount++;
    const isSameObject = clickedObject === lastClickedObject;
    
    if (clickCount === 1) {
      lastClickedObject = clickedObject;
      clickTimer = setTimeout(() => {
        handleSingleClick(intersects);
        clickCount = 0;
        lastClickedObject = null;
      }, DOUBLE_CLICK_DELAY);
    } else if (clickCount === 2 && isSameObject) {
      clearTimeout(clickTimer);
      handleDoubleClick(intersects);
      clickCount = 0;
      lastClickedObject = null;
    } else {
      clearTimeout(clickTimer);
      handleSingleClick(intersects);
      clickCount = 0;
      lastClickedObject = null;
    }
  };

  const handleSingleClick = (intersects) => {
    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      console.log('👆 3D Model: Single click on mesh:', clickedObject.name);
      
      let partData = null;
      let matchMethod = '';
      
      // ENHANCED: Better BOM data matching with multiple strategies
      if (bomData?.assembly_tree) {
        const strategies = [
          // Direct reference name match
          {
            name: 'reference_name_exact',
            test: (item) => item.reference_name === clickedObject.name
          },
          // Direct name match
          {
            name: 'name_exact',
            test: (item) => item.name === clickedObject.name
          },
          // Partial reference name match (contains)
          {
            name: 'reference_name_contains',
            test: (item) => item.reference_name && clickedObject.name && (
              item.reference_name.includes(clickedObject.name) ||
              clickedObject.name.includes(item.reference_name)
            )
          },
          // Partial name match (contains)
          {
            name: 'name_contains',
            test: (item) => item.name && clickedObject.name && (
              item.name.includes(clickedObject.name) ||
              clickedObject.name.includes(item.name)
            )
          },
          // Loose matching - remove common prefixes/suffixes
          {
            name: 'loose_match',
            test: (item) => {
              const cleanMeshName = clickedObject.name?.replace(/[-_]\d+$/, '').toLowerCase();
              const cleanRefName = item.reference_name?.replace(/[-_]\d+$/, '').toLowerCase();
              const cleanItemName = item.name?.replace(/[-_]\d+$/, '').toLowerCase();
              
              return (cleanRefName && cleanMeshName && cleanRefName.includes(cleanMeshName)) ||
                     (cleanItemName && cleanMeshName && cleanItemName.includes(cleanMeshName));
            }
          }
        ];

        for (const strategy of strategies) {
          partData = bomData.assembly_tree.find(strategy.test);
          if (partData) {
            matchMethod = strategy.name;
            console.log(`✅ 3D Model: Found BOM data match using strategy: ${strategy.name}`);
            break;
          }
        }
      }
      
      if (partData) {
        console.log('✅ 3D Model: Found BOM data for part:', {
          bomData: {
            id: partData.id,
            name: partData.name,
            reference_name: partData.reference_name
          },
          meshName: clickedObject.name,
          matchMethod
        });
        
        const partToSelect = {
          ...partData,
          meshName: clickedObject.name,
          selectionSource: '3d_model',
          matchMethod
        };
        
        console.log('📤 3D Model: Sending selection to parent:', partToSelect);
        onPartSelect(partToSelect);
      } else {
        console.log('⚠️ 3D Model: No BOM data found, creating fallback data');
        const fallbackData = {
          id: `mesh_${clickedObject.uuid.substring(0, 8)}`,
          name: clickedObject.name || 'Unknown Part',
          reference_name: clickedObject.name || 'Unknown Component',
          type: 'part',
          is_assembly: false,
          shape_type: 'Mesh',
          meshName: clickedObject.name,
          selectionSource: '3d_model',
          isFallback: true
        };
        
        console.log('📝 3D Model: Created fallback data:', fallbackData);
        onPartSelect(fallbackData);
      }
    } else {
      console.log('👆 3D Model: Single click on empty space - deselecting');
      onPartSelect(null);
    }
  };

  const handleDoubleClick = (intersects) => {
    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      console.log('👆👆 3D Model: Double click on:', clickedObject.name);
      
      // Check if the double-clicked object is currently selected
      const isCurrentlySelected = selectedPart && (
        (selectedPart.meshName && selectedPart.meshName === clickedObject.name) ||
        (selectedPart.name && selectedPart.name === clickedObject.name) ||
        (selectedPart.reference_name && selectedPart.reference_name === clickedObject.name) ||
        (selectedPart.id && selectedPart.id === clickedObject.name)
      );
      
      if (isCurrentlySelected) {
        console.log('🔄 3D Model: Double click on highlighted part - deselecting');
        onPartSelect(null); // Deselect
      } else {
        console.log('🔄 3D Model: Double click on different part - selecting');
        handleSingleClick(intersects);
      }
    } else {
      console.log('👆👆 3D Model: Double click on empty space - deselecting');
      onPartSelect(null);
    }
  };

  const handleMouseMove = (event) => {
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(model.children, true);

    domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
  };

  domElement.addEventListener('click', handleClick);
  domElement.addEventListener('mousemove', handleMouseMove);
  
  return () => {
    domElement.removeEventListener('click', handleClick);
    domElement.removeEventListener('mousemove', handleMouseMove);
    
    if (clickTimer) {
      clearTimeout(clickTimer);
    }
  };
};

const DynamicInteractiveGLBModel = ({ modelInfo, selectedPart, onPartSelect, isLoading, onLoadingChange }) => {
  const [bomData, setBomData] = useState(null);
  const [bomError, setBomError] = useState(null);

  // Load BOM data for the selected model
  useEffect(() => {
    const loadBomData = async () => {
      if (!modelInfo) return;

      try {
        console.log(`📋 3D Model: Loading BOM data for: ${modelInfo.displayName}`);
        const response = await fetch(`http://localhost:5000/api/bom/${modelInfo.id}`);
        const result = await response.json();
        
        if (result.success) {
          setBomData(result.data);
          setBomError(null);
          console.log('✅ 3D Model: BOM data loaded successfully');
        } else {
          console.error('❌ 3D Model: Error loading BOM:', result.error);
          setBomError(`BOM Error: ${result.error}`);
        }
      } catch (error) {
        console.error('❌ 3D Model: Error loading BOM data:', error);
        setBomError(`Network Error: ${error.message}`);
      }
    };
    
    loadBomData();
  }, [modelInfo]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ position: [15, 15, 15], fov: 60, near: 0.1, far: 2000 }}
        style={{ background: '#f0f0f0' }}
        shadows
        gl={{ 
          antialias: true,
          shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ReinhardToneMapping,
          toneMappingExposure: 1.2,
          physicallyCorrectLights: true
        }}
        onCreated={({ gl }) => { gl.setClearColor('#f0f0f0', 1); }}
      >
        <Environment preset="city" background={false} />
        <Lighting />
        
        <Suspense fallback={<LoadingFallback />}>
          <Model
            modelInfo={modelInfo}
            selectedPart={selectedPart}
            onPartSelect={onPartSelect}
            bomData={bomData}
            onLoadingChange={onLoadingChange}
          />
        </Suspense>
      </Canvas>
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading 3D Model...</p>
            <p className="text-sm text-gray-500">
              {modelInfo.displayName}
            </p>
            <p className="text-xs text-gray-400">
              {modelInfo.hasCompressed 
                ? `${formatFileSize(modelInfo.compressedSize)} (compressed)` 
                : `${formatFileSize(modelInfo.originalSize)} (original)`
              }
            </p>
            <div className="mt-2 text-xs text-gray-400">
              Using auto endpoint for optimal loading
            </div>
          </div>
        </div>
      )}

      {/* Error Messages */}
      {bomError && (
        <div className="absolute top-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded z-20 max-w-sm">
          <div className="flex">
            <div className="py-1">
              <svg className="fill-current h-4 w-4 text-yellow-500 mr-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z"/>
              </svg>
            </div>
            <div>
              <p className="font-bold">BOM Warning</p>
              <p className="text-sm">{bomError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Model Info Display (when not loading) */}
      {!isLoading && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg text-xs z-10">
          <div className="font-medium">{modelInfo.displayName}</div>
          <div className="text-gray-300">
            {modelInfo.totalParts.toLocaleString()} parts • {modelInfo.totalAssemblies} assemblies
          </div>
          <div className="text-gray-400">
            {modelInfo.hasCompressed ? 'Compressed' : 'Original'} • 
            {formatFileSize(modelInfo.hasCompressed ? modelInfo.compressedSize : modelInfo.originalSize)}
          </div>
          {selectedPart && (
            <div className="mt-1 text-red-300 border-t border-gray-600 pt-1">
              Selected: {selectedPart.reference_name || selectedPart.name || `ID ${selectedPart.id}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DynamicInteractiveGLBModel;
