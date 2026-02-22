const SAVE_KEY = "minecraft_like_build_v1";

export function saveBuildState(placedBlocks) {
  try {
    const payload = { placedBlocks };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (_error) {
    // Ignore storage errors to avoid breaking gameplay.
  }
}

export function loadBuildState({ worldWidth, blockSize, buildMaterials }) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.placedBlocks)) return [];

    const loaded = [];
    for (const block of parsed.placedBlocks) {
      if (!block || typeof block !== "object") continue;
      if (typeof block.x !== "number" || typeof block.y !== "number") continue;
      if (typeof block.size !== "number" || block.size <= 0) continue;
      if (!buildMaterials.includes(block.material)) continue;
      loaded.push({
        x: Math.max(0, Math.min(block.x, worldWidth - blockSize)),
        y: block.y,
        size: blockSize,
        material: block.material,
      });
    }
    return loaded;
  } catch (_error) {
    return [];
  }
}
