import { Canvas, useFrame } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Group } from "three";

function Sculpture({ reduced }: { reduced: boolean }) {
  const group = useRef<Group>(null);
  useFrame(({ clock, pointer }) => {
    if (!group.current || reduced) return;
    group.current.rotation.y =
      Math.sin(clock.elapsedTime * 0.3) * 0.18 + pointer.x * 0.15;
    group.current.position.y = Math.sin(clock.elapsedTime * 0.7) * 0.06;
  });
  return (
    <group ref={group} rotation={[0.25, -0.3, -0.2]}>
      <mesh rotation={[0.6, 0.2, 0.4]}>
        <torusGeometry args={[1.18, 0.18, 24, 80]} />
        <meshStandardMaterial
          color="#b9bec8"
          roughness={0.3}
          metalness={0.05}
        />
      </mesh>
      <mesh rotation={[1.5, -0.4, -0.4]}>
        <torusGeometry args={[1.14, 0.14, 24, 80]} />
        <meshStandardMaterial color="#b9ace4" roughness={0.3} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.27, 32, 32]} />
        <meshStandardMaterial color="#717b8d" roughness={0.28} />
      </mesh>
      <mesh position={[-1.4, -0.5, 0.3]}>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshStandardMaterial color="#c6b8e8" />
      </mesh>
    </group>
  );
}
class CanvasBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="orbit-fallback">◎</div>
    ) : (
      this.props.children
    );
  }
}
export default function Orbit() {
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(q.matches);
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  return (
    <div className="orbit" aria-hidden="true">
      <CanvasBoundary>
        <Suspense fallback={<div className="orbit-fallback">◎</div>}>
          <Canvas
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 4.5], fov: 45 }}
            frameloop={reduced ? "demand" : "always"}
            gl={{ alpha: true, antialias: true }}
          >
            <ambientLight intensity={2} />
            <directionalLight position={[2, 4, 4]} intensity={3} />
            <Sculpture reduced={reduced} />
          </Canvas>
        </Suspense>
      </CanvasBoundary>
    </div>
  );
}
