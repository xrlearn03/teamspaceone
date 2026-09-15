import React, { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { VisemeWeights } from "./visemes";

interface AvatarModelProps {
  scene: THREE.Group;
  animations?: THREE.AnimationClip[];
  weights: VisemeWeights;
  /** Kept for API compatibility; the GLB's idle animation is used instead. */
  speaking?: boolean;
  onError?: () => void;
}

function findMorphMeshes(scene: THREE.Group): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      meshes.push(mesh);
    }
  });
  return meshes;
}

function AvatarModel({ scene, animations, weights, speaking: _speaking, onError }: AvatarModelProps) {
  const meshes = useMemo(() => findMorphMeshes(scene), [scene]);
  const { actions } = useAnimations(animations ?? [], scene);
  const timeRef = useRef(0);
  const nextBlinkRef = useRef(0);
  const blinkRef = useRef(0);
  const loggedRef = useRef(false);

  useEffect(() => {
    const idle = actions?.["avaturn_animation"];
    if (idle) {
      idle.setEffectiveTimeScale(1);
      idle.setEffectiveWeight(1);
      idle.play();
    }
  }, [actions]);

  useEffect(() => {
    if (meshes.length === 0) {
      console.warn("[AiAvatar3D] no morph-target meshes found; using fallback");
      onError?.();
      return;
    }
    if (!loggedRef.current) {
      loggedRef.current = true;
      console.log("[AiAvatar3D] morph meshes:", meshes.map((m) => m.name).join(", "));
    }
  }, [meshes, onError]);

  useFrame((_, delta) => {
    timeRef.current += delta;

    const now = timeRef.current;
    if (now > nextBlinkRef.current) {
      blinkRef.current = 1;
      nextBlinkRef.current = now + 2 + Math.random() * 4;
    }
    if (blinkRef.current > 0) {
      blinkRef.current = Math.max(0, blinkRef.current - delta * 8);
    }

    for (const mesh of meshes) {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
      const dict = mesh.morphTargetDictionary;

      for (const [name, value] of Object.entries(weights)) {
        const index = dict[name];
        if (index !== undefined) {
          mesh.morphTargetInfluences[index] = THREE.MathUtils.lerp(
            mesh.morphTargetInfluences[index] ?? 0,
            value ?? 0,
            0.25,
          );
        }
      }

      if (dict.eyeBlinkLeft !== undefined) {
        const i = dict.eyeBlinkLeft;
        mesh.morphTargetInfluences[i] = THREE.MathUtils.lerp(
          mesh.morphTargetInfluences[i],
          blinkRef.current,
          0.4,
        );
      }
      if (dict.eyeBlinkRight !== undefined) {
        const i = dict.eyeBlinkRight;
        mesh.morphTargetInfluences[i] = THREE.MathUtils.lerp(
          mesh.morphTargetInfluences[i],
          blinkRef.current,
          0.4,
        );
      }
    }
  });

  return (
    <primitive object={scene} scale={1.5} position={[0, -1.4, 0]} rotation={[0, 0.5, 0]} />
  );
}

interface LoadedAvatarProps extends AvatarModelProps {}

function LoadedAvatar({ scene, animations, weights, speaking, onError }: LoadedAvatarProps) {
  return (
    <div className="h-full w-full">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 1.03, 1.8], fov: 30 }}
      >
        <color attach="background" args={["#0b1220"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 5]} intensity={1.2} />
        <directionalLight position={[-3, 2, -2]} intensity={0.3} />
        <AvatarModel scene={scene} animations={animations} weights={weights} speaking={speaking} onError={onError} />
        <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} target={[0, 1.03, 0]} />
      </Canvas>
    </div>
  );
}

interface AvatarLoaderProps {
  url: string;
  weights: VisemeWeights;
  speaking?: boolean;
  onError?: () => void;
}

function AvatarLoader({ url, weights, speaking, onError }: AvatarLoaderProps) {
  const absoluteUrl = useMemo(() => {
    if (url.startsWith("http") || typeof document === "undefined") return url;
    return new URL(url, document.baseURI).href;
  }, [url]);
  const { scene, animations } = useGLTF(absoluteUrl);
  return <LoadedAvatar scene={scene} animations={animations} weights={weights} speaking={speaking} onError={onError} />;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onError?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ModelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

export interface AiAvatar3DProps {
  /** GLB URL.  Leave undefined to render the fallback instead. */
  url?: string;
  /** Facial blendshape weights produced by `useLipSync`. */
  weights?: VisemeWeights;
  /** True while speech audio is playing; drives subtle idle emphasis. */
  speaking?: boolean;
  /** Rendered when no model URL is supplied or the GLB fails to load. */
  fallback?: React.ReactNode;
}

export function AiAvatar3D({ url, weights, speaking, fallback }: AiAvatar3DProps) {
  const [loadFailed, setLoadFailed] = useState(!url);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => setIsClient(true), []);

  if (!url || loadFailed || !isClient) {
    return fallback ?? null;
  }

  return (
    <Suspense fallback={fallback ?? <div className="flex h-full items-center justify-center text-white/60">Loading 3D avatar…</div>}>
      <ModelErrorBoundary onError={() => setLoadFailed(true)}>
        <AvatarLoader url={url} weights={weights ?? {}} speaking={speaking} onError={() => setLoadFailed(true)} />
      </ModelErrorBoundary>
    </Suspense>
  );
}
