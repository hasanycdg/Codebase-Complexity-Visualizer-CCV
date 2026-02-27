import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AnalysisModel } from "../types";

interface CityView3DProps {
  model: AnalysisModel;
  onFileSelected: (path: string) => void;
}

interface HoveredBuilding {
  path: string;
  loc: number;
  complexity: number;
  risk: number;
  inCycle: boolean;
}

export function CityView3D({ model, onFileSelected }: CityView3DProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = useState<HoveredBuilding | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0d1211");

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 2000);
    camera.position.set(95, 140, 145);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 40;
    controls.maxDistance = 780;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 0, 0);
    controls.update();

    const hemisphere = new THREE.HemisphereLight(0xf2f4ff, 0x12211f, 0.75);
    scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(120, 180, 55);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x88b2aa, 0.35);
    fillLight.position.set(-95, 90, -65);
    scene.add(fillLight);

    const files = [...model.files];
    const maxRisk = Math.max(1, ...files.map((file) => file.riskScore));
    const maxLoc = Math.max(1, ...files.map((file) => file.loc));
    const maxComplexity = Math.max(1, ...files.map((file) => file.complexity));

    const cityWidth = Math.ceil(Math.sqrt(files.length));
    const spacing = Math.max(7, Math.min(14, 450 / Math.max(1, cityWidth)));
    const half = cityWidth / 2;

    const gridSize = Math.max(140, cityWidth * spacing + 40);
    const grid = new THREE.GridHelper(gridSize, cityWidth + 6, 0x2e4c49, 0x1a2d2a);
    scene.add(grid);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const buildingMeshes: THREE.Mesh[] = [];

    files.forEach((file, index) => {
      const row = Math.floor(index / cityWidth);
      const col = index % cityWidth;
      const x = (col - half) * spacing;
      const z = (row - half) * spacing;

      const locRatio = Math.min(1, file.loc / maxLoc);
      const complexityRatio = Math.min(1, file.complexity / maxComplexity);
      const riskRatio = Math.min(1, file.riskScore / maxRisk);

      const footprint = Math.max(2.8, 2.8 + locRatio * 5.4);
      const height = Math.max(4, 4 + complexityRatio * 58);

      const color = new THREE.Color().setRGB(0.1 + riskRatio * 0.85, 0.58 - riskRatio * 0.4, 0.18);
      const geometry = new THREE.BoxGeometry(footprint, height, footprint);
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0.08
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, height / 2, z);
      mesh.userData = {
        path: file.path,
        loc: file.loc,
        complexity: file.complexity,
        risk: file.riskScore,
        inCycle: file.inCycle
      } as HoveredBuilding;
      scene.add(mesh);
      buildingMeshes.push(mesh);

      if (file.inCycle) {
        const edges = new THREE.EdgesGeometry(geometry);
        const wireframe = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: new THREE.Color("#ff4a2d") })
        );
        wireframe.position.copy(mesh.position);
        scene.add(wireframe);
      }
    });

    const pickBuilding = (event: PointerEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(buildingMeshes, false);
      const firstHit = hits[0];

      if (!firstHit) {
        setHovered(null);
        return;
      }

      const payload = firstHit.object.userData as HoveredBuilding;
      setHovered(payload);
    };

    const onClick = (event: MouseEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(buildingMeshes, false);
      const firstHit = hits[0];
      if (!firstHit) {
        return;
      }

      const payload = firstHit.object.userData as HoveredBuilding;
      onFileSelected(payload.path);
    };

    renderer.domElement.addEventListener("pointermove", pickBuilding);
    renderer.domElement.addEventListener("click", onClick);

    const handleResize = (): void => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    let rafId = 0;
    const animate = (): void => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointermove", pickBuilding);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();

      for (const mesh of buildingMeshes) {
        mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose());
        } else {
          material.dispose();
        }
      }

      renderer.dispose();
    };
  }, [model, onFileSelected]);

  return (
    <section className="panel city-panel">
      <div className="city-header">
        <h3>3D City View</h3>
        <span className="muted">Drag = orbit, Wheel = zoom, Click building = file details</span>
      </div>
      <canvas className="city-canvas" ref={canvasRef} />
      <div className="city-hover">
        {hovered ? (
          <>
            <strong>{hovered.path}</strong>
            <span>
              LOC: {hovered.loc} | Complexity: {hovered.complexity} | Risk: {hovered.risk.toFixed(3)} |
              {hovered.inCycle ? " In cycle" : " No cycle"}
            </span>
          </>
        ) : (
          <span className="muted">Hover a building for metrics.</span>
        )}
      </div>
    </section>
  );
}
