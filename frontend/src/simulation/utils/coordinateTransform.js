const DEFAULT_CONFIG = {
  origin: { x: 0, y: 0, z: 0 },
  scale: 1,
  rotation_degrees: 0,
  invert_z: false,
};

function finite(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

export function simulationToThree(position, config = DEFAULT_CONFIG) {
  const scale = finite(config.scale, 1) || 1;
  const origin = { ...DEFAULT_CONFIG.origin, ...(config.origin || {}) };
  const x = finite(position.x);
  const y = finite(position.y);
  const sourceZ = config.invert_z ? -finite(position.z) : finite(position.z);
  const angle = (finite(config.rotation_degrees) * Math.PI) / 180;
  return {
    x: (x * Math.cos(angle) - sourceZ * Math.sin(angle)) * scale + finite(origin.x),
    y: y * scale + finite(origin.y),
    z: (x * Math.sin(angle) + sourceZ * Math.cos(angle)) * scale + finite(origin.z),
  };
}

export function threeToSimulation(position, config = DEFAULT_CONFIG) {
  const scale = finite(config.scale, 1) || 1;
  const origin = { ...DEFAULT_CONFIG.origin, ...(config.origin || {}) };
  const x = (finite(position.x) - finite(origin.x)) / scale;
  const z = (finite(position.z) - finite(origin.z)) / scale;
  const y = (finite(position.y) - finite(origin.y)) / scale;
  const angle = (-finite(config.rotation_degrees) * Math.PI) / 180;
  const sx = x * Math.cos(angle) - z * Math.sin(angle);
  let sz = x * Math.sin(angle) + z * Math.cos(angle);
  if (config.invert_z) sz = -sz;
  return { x: sx, y, z: sz };
}

export function simulationHeadingToThree(heading, config = DEFAULT_CONFIG) {
  const sourceHeading = (finite(heading) * Math.PI) / 180;
  const angle = (finite(config.rotation_degrees) * Math.PI) / 180;
  const dx = Math.sin(sourceHeading);
  const dz = (config.invert_z ? -1 : 1) * Math.cos(sourceHeading);
  const transformedX = dx * Math.cos(angle) - dz * Math.sin(angle);
  const transformedZ = dx * Math.sin(angle) + dz * Math.cos(angle);
  return Math.atan2(transformedX, transformedZ);
}

export function isValidEntity(entity) {
  return Boolean(
    entity &&
      typeof entity.id === "string" &&
      ["car", "person", "scooter"].includes(entity.type) &&
      [entity.x, entity.y ?? 0, entity.z, entity.heading ?? 0, entity.speed ?? 0].every((value) =>
        Number.isFinite(Number(value)),
      ),
  );
}
