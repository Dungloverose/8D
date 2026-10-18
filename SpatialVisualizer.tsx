/**
 * 3D Spatial Audio Visualizer Component
 * Displays listener head and orbiting sound source with trail
 */

import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { AudioSpatializer, Position3D } from './AudioSpatializer';

interface SpatialVisualizerProps {
  spatializer: AudioSpatializer;
  className?: string;
}

// Trail configuration
const TRAIL_LENGTH = 100;

export const SpatialVisualizer: React.FC<SpatialVisualizerProps> = ({
  spatializer,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const soundSourceRef = useRef<THREE.Mesh | null>(null);
  const trailPointsRef = useRef<THREE.Vector3[]>([]);
  const trailLineRef = useRef<THREE.Line | null>(null);
  const glowMeshRef = useRef<THREE.Mesh | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const planeRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const orbitLineRef = useRef<THREE.Line | null>(null);

  // Theme colors (Cyberpunk/DAW style)
  const colors = {
    background: 0x0a0a0f,
    grid: 0x1a1a2e,
    listener: 0x00ffff, // Cyan
    listenerGlow: 0x00ffff,
    soundSource: 0xff00ff, // Magenta
    soundSourceGlow: 0xff00ff,
    trail: 0xff00ff,
    orbit: 0x2a2a4a
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(colors.background);
    scene.fog = new THREE.Fog(colors.background, 10, 30);
    sceneRef.current = scene;

    // Camera (top-down with slight angle)
    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 8, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(0, 10, 0);
    pointLight.castShadow = true;
    scene.add(pointLight);

    // Grid floor
    const gridHelper = new THREE.GridHelper(20, 40, colors.grid, colors.grid);
    (gridHelper.material as THREE.LineBasicMaterial).opacity = 0.3;
    (gridHelper.material as THREE.LineBasicMaterial).transparent = true;
    scene.add(gridHelper);

    // Axis helper (subtle)
    const axesHelper = new THREE.AxesHelper(3);
    // AxesHelper.material can be a single Material or Material[]
    const materials = axesHelper.material;
    if (Array.isArray(materials)) {
      materials.forEach(mat => {
        mat.opacity = 0.2;
        mat.transparent = true;
      });
    } else {
      materials.opacity = 0.2;
      materials.transparent = true;
    }
    scene.add(axesHelper);

    // Create listener head (stylized)
    createListenerHead(scene);

    // Create sound source sphere
    createSoundSource(scene);

    // Create orbit path indicator
    createOrbitPath(scene);

    // Create trail line
    createTrail(scene);

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      // Rotate glow effect
      if (glowMeshRef.current) {
        glowMeshRef.current.rotation.y += 0.01;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
        renderer.dispose();
      }
    };
  }, []);

  // Create listener head representation
  const createListenerHead = (scene: THREE.Scene) => {
    // Main head sphere
    const headGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: colors.listener,
      emissive: colors.listenerGlow,
      emissiveIntensity: 0.3,
      metalness: 0.7,
      roughness: 0.3,
      transparent: true,
      opacity: 0.8
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 0, 0);
    head.castShadow = true;
    scene.add(head);

    // Ears (representing left/right)
    const earGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.3, 16);
    const earMaterial = new THREE.MeshStandardMaterial({
      color: colors.listener,
      emissive: colors.listenerGlow,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2
    });

    // Left ear
    const leftEar = new THREE.Mesh(earGeometry, earMaterial);
    leftEar.position.set(-0.6, 0, 0);
    leftEar.rotation.z = Math.PI / 2;
    scene.add(leftEar);

    // Right ear
    const rightEar = new THREE.Mesh(earGeometry, earMaterial);
    rightEar.position.set(0.6, 0, 0);
    rightEar.rotation.z = Math.PI / 2;
    scene.add(rightEar);

    // Glow ring around head
    const ringGeometry = new THREE.TorusGeometry(0.7, 0.02, 16, 100);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: colors.listener,
      transparent: true,
      opacity: 0.5
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
  };

  // Create sound source sphere with glow
  const createSoundSource = (scene: THREE.Scene) => {
    // Main sphere
    const geometry = new THREE.SphereGeometry(0.25, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: colors.soundSource,
      emissive: colors.soundSourceGlow,
      emissiveIntensity: 0.8,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.9
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(spatializer.getRadius(), 0, 0);
    sphere.castShadow = true;
    scene.add(sphere);
    soundSourceRef.current = sphere;

    // Outer glow
    const glowGeometry = new THREE.SphereGeometry(0.35, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: colors.soundSourceGlow,
      transparent: true,
      opacity: 0.3
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.copy(sphere.position);
    scene.add(glow);
    glowMeshRef.current = glow;

    // Point light attached to source
    const sourceLight = new THREE.PointLight(colors.soundSource, 0.5, 5);
    sourceLight.position.copy(sphere.position);
    scene.add(sourceLight);
  };

  // Create orbit path indicator
  const createOrbitPath = (scene: THREE.Scene) => {
    const radius = spatializer.getRadius();
    const segments = 128;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(theta) * radius,
        0,
        Math.sin(theta) * radius
      ));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: colors.orbit,
      transparent: true,
      opacity: 0.4
    });
    const orbitLine = new THREE.Line(geometry, material);
    scene.add(orbitLine);
    orbitLineRef.current = orbitLine;
  };

  // Create trail line
  const createTrail = (scene: THREE.Scene) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL_LENGTH * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: colors.trail,
      transparent: true,
      opacity: 0.6
    });

    const line = new THREE.Line(geometry, material);
    scene.add(line);
    trailLineRef.current = line;
  };

  // Update trail
  const updateTrail = useCallback((position: Position3D) => {
    if (!trailLineRef.current) return;

    // Add new point
    trailPointsRef.current.push(new THREE.Vector3(position.x, position.y, position.z));

    // Keep trail at max length
    if (trailPointsRef.current.length > TRAIL_LENGTH) {
      trailPointsRef.current.shift();
    }

    // Update geometry
    const positions = trailLineRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < trailPointsRef.current.length; i++) {
      positions[i * 3] = trailPointsRef.current[i].x;
      positions[i * 3 + 1] = trailPointsRef.current[i].y;
      positions[i * 3 + 2] = trailPointsRef.current[i].z;
    }
    trailLineRef.current.geometry.attributes.position.needsUpdate = true;
    trailLineRef.current.geometry.setDrawRange(0, trailPointsRef.current.length);
  }, []);

  // Subscribe to position updates
  useEffect(() => {
    spatializer.setPositionCallback((position: Position3D) => {
      // Update sound source position
      if (soundSourceRef.current) {
        soundSourceRef.current.position.set(position.x, position.y, position.z);
      }
      if (glowMeshRef.current) {
        glowMeshRef.current.position.set(position.x, position.y, position.z);
      }

      // Update trail
      updateTrail(position);
    });

    return () => {
      spatializer.setPositionCallback(() => {});
    };
  }, [spatializer, updateTrail]);

  // Mouse interaction handlers
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !soundSourceRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObject(soundSourceRef.current);

    if (intersects.length > 0) {
      isDraggingRef.current = true;
      // Pause auto animation while dragging
    }
  }, []);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current || !cameraRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    // Intersect with XZ plane
    const intersectPoint = new THREE.Vector3();
    raycasterRef.current.ray.intersectPlane(planeRef.current, intersectPoint);

    if (intersectPoint) {
      // Clamp to reasonable radius
      const maxRadius = 8;
      const distance = Math.sqrt(intersectPoint.x ** 2 + intersectPoint.z ** 2);

      if (distance <= maxRadius) {
        spatializer.setPositionManually(intersectPoint.x, intersectPoint.z);

        if (soundSourceRef.current) {
          soundSourceRef.current.position.set(intersectPoint.x, 0, intersectPoint.z);
        }
        if (glowMeshRef.current) {
          glowMeshRef.current.position.set(intersectPoint.x, 0, intersectPoint.z);
        }
      }
    }
  }, [spatializer]);

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      spatializer.resumeAnimation();
    }
  }, [spatializer]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: 'grab' }}
    >
      {/* Overlay info */}
      <div className="absolute top-4 left-4 text-xs text-cyan-400 font-mono opacity-70 pointer-events-none">
        <div>Position: ({spatializer.getPosition().x.toFixed(2)}, {spatializer.getPosition().z.toFixed(2)})</div>
        <div>Radius: {spatializer.getRadius().toFixed(2)}m</div>
      </div>

      {/* Drag hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-gray-500 font-mono pointer-events-none">
        Drag the sphere to reposition
      </div>
    </div>
  );
};

export default SpatialVisualizer;
