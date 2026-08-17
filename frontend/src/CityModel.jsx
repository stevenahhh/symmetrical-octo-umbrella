import { Html, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import commonElements from "../../common/data/common_elemetns.json";

const BLOCKED_ELEMENT_IDS = new Set(["BLD_C1001"]);
const BUILDING_MAP = {
  대학본부: "BLD_A1",
  약학대학: "BLD_A2",
  천연물신약연구소: "BLD_A3",
  생활관: "BLD_A4",
  박물관: "BLD_B1",
  "70주년기념관": "BLD_B2",
  생명대: "BLD_B3",
  도서관: "BLD_C1",
  학생회관: "BLD_E1",
  사범대: "BLD_E2",
  창업보육센터: "BLD_D1",
  공과대1호: "BLD_D2",
  공과대2호: "BLD_D3",
  공과대3호: "BLD_D4",
};

const FOCUS_CAMERA_OFFSET = new THREE.Vector3(60, 50, 60);
const ELEMENT_NAME_MAP = new Map(
  commonElements.elements.map((element) => [element.element_id, element.name]),
);

function getSelectableMeta(object) {
  const rawName =
    object?.parent && object.parent.name !== "Scene"
      ? object.parent.name
      : object?.name;

  if (!rawName) return null;

  const elementId = BUILDING_MAP[rawName] || rawName;
  const lowerName = `${rawName}`.toLowerCase();

  if (
    lowerName.includes("학교") ||
    lowerName.includes("topography") ||
    lowerName.includes("terrain") ||
    lowerName.includes("ground") ||
    BLOCKED_ELEMENT_IDS.has(elementId)
  ) {
    return null;
  }

  if (!elementId.startsWith("BLD_")) {
    return null;
  }

  return {
    name: rawName,
    elementId,
  };
}

function getSelectableRoot(object) {
  let cursor = object;
  let root = null;

  while (cursor && cursor.name !== "Scene") {
    if (getSelectableMeta(cursor)) {
      root = cursor;
    }
    cursor = cursor.parent;
  }

  return root || object;
}

function buildLabelAnchors(scene) {
  const anchors = new Map();

  scene.traverse((child) => {
    if (!child.isMesh) return;

    const root = getSelectableRoot(child);
    const meta = getSelectableMeta(root);
    if (!meta || anchors.has(meta.elementId)) return;

    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    anchors.set(meta.elementId, {
      name: meta.name,
      displayName: ELEMENT_NAME_MAP.get(meta.elementId) || meta.name,
      elementId: meta.elementId,
      position: [center.x, box.max.y + 6, center.z],
    });
  });

  return Array.from(anchors.values());
}

export function CityModel({
  onSelect,
  selectedId,
  onBuildingClick,
  controlsRef,
  isNight = false,
  ...props
}) {
  const { scene } = useGLTF("/uni.glb");
  const { camera } = useThree();
  const [targetPos, setTargetPos] = useState(null);
  const [isAutoFocusing, setIsAutoFocusing] = useState(false);
  const [labelScale, setLabelScale] = useState(1);

  useEffect(() => {
    const controls = controlsRef?.current;
    if (!controls) return;

    const handleInteraction = () => {
      if (!isAutoFocusing) {
        setTargetPos(null);
      }
    };

    controls.addEventListener("start", handleInteraction);
    return () => controls.removeEventListener("start", handleInteraction);
  }, [controlsRef, isAutoFocusing]);

  useEffect(() => {
    const controls = controlsRef?.current;

    const updateLabelScale = () => {
      const distance = controls
        ? camera.position.distanceTo(controls.target)
        : camera.position.length();
      const nextScale = THREE.MathUtils.clamp(165 / Math.max(distance, 1), 0.72, 1.45);

      setLabelScale((current) =>
        Math.abs(current - nextScale) < 0.02 ? current : nextScale,
      );
    };

    updateLabelScale();

    if (!controls) return;

    controls.addEventListener("change", updateLabelScale);
    return () => controls.removeEventListener("change", updateLabelScale);
  }, [camera, controlsRef]);

  useEffect(() => {
    if (!scene) return;

    scene.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;
      child.material = child.material.clone();

      if (!child.userData.originalColor && child.material.color) {
        child.userData.originalColor = child.material.color.clone();
      }
    });
  }, [scene]);

  const labelAnchors = useMemo(() => {
    if (!scene) return [];
    return buildLabelAnchors(scene);
  }, [scene]);

  const center = useMemo(() => {
    if (labelAnchors.length === 0) return new THREE.Vector3(0, 0, 0);
    const c = new THREE.Vector3();
    labelAnchors.forEach(anchor => c.add(new THREE.Vector3(...anchor.position)));
    c.divideScalar(labelAnchors.length);
    return c;
  }, [labelAnchors]);

  useFrame(() => {
    const controls = controlsRef?.current;

    if (scene) {
      scene.traverse((child) => {
        if (!child.isMesh || !child.userData.originalColor) return;

        const meta = getSelectableMeta(child);
        const isSelected = meta?.name === selectedId || child.name === selectedId;
        const baseColor = child.userData.originalColor.clone();
        const targetColor = isSelected
          ? new THREE.Color("#ffb8c6")
          : isNight
            ? baseColor.clone().lerp(new THREE.Color("#c8d6e5"), 0.16)
            : baseColor;

        child.material.color.lerp(targetColor, 0.05);
      });
    }

    if (targetPos && controls) {
      controls.target.lerp(targetPos, 0.08);
      const desiredCamPos = targetPos.clone().add(FOCUS_CAMERA_OFFSET);
      camera.position.lerp(desiredCamPos, 0.04);
      controls.update();

      if (
        controls.target.distanceTo(targetPos) < 0.8 &&
        camera.position.distanceTo(desiredCamPos) < 1.2
      ) {
        setIsAutoFocusing(false);
      }
    }
  });

  const handleClick = (e) => {
    if (e.delta > 2) return;

    const root = getSelectableRoot(e.object);
    const meta = getSelectableMeta(root);
    if (!meta) return;

    e.stopPropagation();

    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    setIsAutoFocusing(true);
    setTargetPos(center);

    const size = new THREE.Vector3();
    box.getSize(size);
    const area = Math.max(1, Math.round(size.x * size.z));

    if (onSelect) {
      onSelect(meta.name, area, [center.x, box.max.y + 6, center.z]);
    }

    if (onBuildingClick) {
      onBuildingClick({
        name: meta.elementId,
        parent: { name: meta.elementId },
      });
    }
  };

  const handlePointerOver = (e) => {
    const meta = getSelectableMeta(e.object);
    if (!meta) return;

    e.stopPropagation();
    document.body.style.cursor = "pointer";
  };

  const handleLabelClick = (anchor) => {
    if (onSelect) {
      onSelect(anchor.name, 1200, anchor.position);
    }

    if (onBuildingClick) {
      onBuildingClick({
        name: anchor.elementId,
        parent: { name: anchor.elementId },
      });
    }
  };

  return (
    <group position={[-center.x, 0, -center.z]}>
      <primitive
        object={scene}
        {...props}
        onPointerUp={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      />

      {labelAnchors.map((anchor) => {
        const isSelected = anchor.name === selectedId;

        return (
          <Html
            key={anchor.elementId}
            position={anchor.position}
            zIndexRange={[120, 0]}
          >
            <div
              className="pointer-events-auto flex flex-col items-center whitespace-nowrap"
              style={{
                transform: `translate(-50%, calc(-100% - 4px)) scale(${labelScale})`,
                transformOrigin: "bottom center",
              }}
            >
              <button
                type="button"
                onClick={() => handleLabelClick(anchor)}
                className={`rounded-[10px] border px-3 py-1 text-[11px] font-black whitespace-nowrap shadow-[0_10px_24px_rgba(15,23,42,0.35)] ${
                  isSelected
                    ? "border-[var(--colors-primary)] bg-[var(--colors-surface-1)] text-[var(--colors-primary)]"
                    : "border-[var(--colors-hairline)] bg-[var(--colors-surface-1)] text-[var(--colors-ink)]"
                }`}
              >
                {anchor.displayName}
              </button>
            </div>
          </Html>
        );
      })}
    </group>
  );
}

useGLTF.preload("/uni.glb");
