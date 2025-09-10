// components/InteractiveGLBModel.jsx - ENHANCED DOUBLE-CLICK DESELECTION
import React, { useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, extend, useThree, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

const Model = ({ selectedPart, onPartSelect, bomData, onLoadingChange }) => {
  const modelRef = useRef();
  const orbitControlsRef = useRef();
  const { camera, gl, scene: threeScene } = useThree();
  
  const [cameraAnimation, setCameraAnimation] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  const { scene } = useGLTF('http://localhost:5000/api/model/75944_06_compressed.glb');

  useEffect(() => {
    if (scene && modelRef.current && isInitialLoad) {
      console.log('Model loaded successfully:', scene);
      
      scene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.userData.originalMaterial = child.material;
          
          if (child.material) {
            if (child.material.isMeshStandardMaterial || child.material.isMeshPhysicalMaterial) {
              if (child.material.metalness > 0.5) {
                child.material.envMapIntensity = 1.0;
              }
              if (child.material.roughness === 0) {
                child.material.roughness = 0.1;
              }
            }
            
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

      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5;
      
      camera.position.set(
        center.x + cameraDistance,
        center.y + cameraDistance * 0.5,
        center.z + cameraDistance
      );
      
      if (orbitControlsRef.current) {
        orbitControlsRef.current.target.copy(center);
        orbitControlsRef.current.update();
      }

      setupInteractions(scene, camera, gl.domElement, onPartSelect, bomData, selectedPart);
      onLoadingChange(false);
      setIsInitialLoad(false);
    }
  }, [scene, camera, gl.domElement, onPartSelect, bomData, onLoadingChange, isInitialLoad]);

  // Handle part highlighting with better deselection
  useEffect(() => {
    if (!scene || !modelRef.current) return;

    console.log('Selected part changed:', selectedPart ? selectedPart.reference_name || selectedPart.name : 'NONE');

    // Always reset all materials first
    scene.traverse((child) => {
      if (child.isMesh && child.userData.originalMaterial) {
        child.material = child.userData.originalMaterial;
        
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
      }
    });

    // If no part selected, everything stays unhighlighted
    if (!selectedPart) {
      console.log('✅ All parts deselected and unhighlighted');
      return;
    }

    // Find and highlight the selected part
    let selectedMesh = null;
    
    if (selectedPart.meshName) {
      selectedMesh = scene.getObjectByName(selectedPart.meshName);
    }
    
    if (!selectedMesh) {
      scene.traverse((child) => {
        if (child.isMesh && (
          child.name === selectedPart.name ||
          child.name === selectedPart.id ||
          child.userData.partId === selectedPart.id ||
          child.name === selectedPart.reference_name ||
          (child.name && selectedPart.reference_name && 
           (child.name.includes(selectedPart.reference_name) || 
            selectedPart.reference_name.includes(child.name)))
        )) {
          selectedMesh = child;
        }
      });
    }

    if (selectedMesh && selectedMesh.isMesh) {
      console.log('🔴 Highlighting part:', selectedMesh.name);
      
      const highlightMaterial = selectedMesh.userData.originalMaterial.clone();
      highlightMaterial.color.setHex(0xff4444);
      highlightMaterial.emissive.setHex(0x441100);
      highlightMaterial.emissiveIntensity = 0.3;
      
      selectedMesh.material = highlightMaterial;
      selectedMesh.material.needsUpdate = true;

      focusCameraOnMesh(selectedMesh, camera, orbitControlsRef.current);
    }
  }, [selectedPart, scene]);

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
  };

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
      <directionalLight position={[20, 20, 10]} intensity={1.0} color={0xffffff} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
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

// ENHANCED INTERACTION SETUP WITH BETTER DOUBLE-CLICK DETECTION
const setupInteractions = (model, camera, domElement, onPartSelect, bomData, selectedPart) => {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  
  // Enhanced double-click detection
  let clickCount = 0;
  let clickTimer = null;
  let lastClickedObject = null;
  const DOUBLE_CLICK_DELAY = 350; // Slightly longer delay for better detection

  const handleClick = (event) => {
    event.preventDefault();
    
    const rect = domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(model.children, true);

    const clickedObject = intersects.length > 0 ? intersects[0].object : null;

    clickCount++;
    
    // Check if clicking the same object for double-click
    const isSameObject = clickedObject === lastClickedObject;
    
    if (clickCount === 1) {
      lastClickedObject = clickedObject;
      clickTimer = setTimeout(() => {
        handleSingleClick(intersects);
        clickCount = 0;
        lastClickedObject = null;
      }, DOUBLE_CLICK_DELAY);
    } else if (clickCount === 2 && isSameObject) {
      // Double-click on same object
      clearTimeout(clickTimer);
      handleDoubleClick(intersects);
      clickCount = 0;
      lastClickedObject = null;
    } else {
      // Different objects clicked quickly - treat as separate single clicks
      clearTimeout(clickTimer);
      handleSingleClick(intersects);
      clickCount = 0;
      lastClickedObject = null;
    }
  };

  const handleSingleClick = (intersects) => {
    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      
      let partData = null;
      
      if (bomData?.assembly_tree) {
        partData = bomData.assembly_tree.find(item => 
          item.reference_name === clickedObject.name ||
          item.name === clickedObject.name
        );
        
        if (!partData) {
          partData = bomData.assembly_tree.find(item => 
            (item.reference_name && clickedObject.name && 
             (item.reference_name.includes(clickedObject.name) || 
              clickedObject.name.includes(item.reference_name))) ||
            (item.name && clickedObject.name && 
             (item.name.includes(clickedObject.name) || 
              clickedObject.name.includes(item.name)))
          );
        }
      }
      
      if (partData) {
        console.log('👆 Single click - selecting part:', partData.reference_name);
        onPartSelect({
          ...partData,
          meshName: clickedObject.name
        });
      } else {
        const fallbackData = {
          id: `mesh_${clickedObject.uuid.substring(0, 8)}`,
          name: clickedObject.name || 'Unknown Part',
          reference_name: clickedObject.name || 'Unknown Component',
          type: 'part',
          is_assembly: false,
          shape_type: 'Mesh',
          meshName: clickedObject.name,
        };
        
        console.log('👆 Single click - selecting fallback part:', fallbackData.reference_name);
        onPartSelect(fallbackData);
      }
    } else {
      console.log('👆 Single click on empty space - deselecting');
      onPartSelect(null);
    }
  };

  // ENHANCED DOUBLE-CLICK HANDLER
  const handleDoubleClick = (intersects) => {
    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      
      // Check if the double-clicked object is currently selected/highlighted
      const isCurrentlySelected = selectedPart && (
        (selectedPart.meshName && selectedPart.meshName === clickedObject.name) ||
        (selectedPart.name && selectedPart.name === clickedObject.name) ||
        (selectedPart.reference_name && selectedPart.reference_name === clickedObject.name) ||
        // Additional fallback checks
        (selectedPart.id && selectedPart.id === clickedObject.name)
      );
      
      if (isCurrentlySelected) {
        console.log('👆👆 Double click on HIGHLIGHTED part - DESELECTING:', clickedObject.name);
        onPartSelect(null); // ❌ DESELECT AND UNHIGHLIGHT
      } else {
        console.log('👆👆 Double click on different part - selecting it');
        handleSingleClick(intersects);
      }
    } else {
      // Double-click on empty space - also deselect
      console.log('👆👆 Double click on empty space - deselecting');
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

const InteractiveGLBModel = ({ selectedPart, onPartSelect, isLoading, onLoadingChange }) => {
  const [bomData, setBomData] = useState(null);

  useEffect(() => {
    const loadBomData = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/bom/75944_06');
        const result = await response.json();
        
        if (result.success) {
          setBomData(result.data);
        } else {
          console.error('Error loading BOM:', result.error);
        }
      } catch (error) {
        console.error('Error loading BOM data:', error);
      }
    };
    
    loadBomData();
  }, []);

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
            selectedPart={selectedPart}
            onPartSelect={onPartSelect}
            bomData={bomData}
            onLoadingChange={onLoadingChange}
          />
        </Suspense>
      </Canvas>
      
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading 3D Model...</p>
            <p className="text-sm text-gray-500">75944_06_compressed.glb (17.68MB)</p>
          </div>
        </div>
      )}
    </div>
  );
};

useGLTF.preload('http://localhost:5000/api/model/75944_06_compressed.glb');

export default InteractiveGLBModel;
