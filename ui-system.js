export function createUIController({
  heartsContainer,
  phaseChip,
  materialsBar,
  timeToggleButton,
  infoToggleButton,
  infoBox,
  maxPlayerHp,
  materialSlotConfig,
}) {
  const uiState = {
    hp: -1,
    phase: "",
    materials: {},
  };
  const materialSlotRefs = new Map();

  function setup() {
    if (!materialsBar) return;
    materialsBar.innerHTML = "";
    materialSlotRefs.clear();

    materialSlotConfig.forEach((slot) => {
      const el = document.createElement("div");
      el.className = `material-slot${slot.future ? " future" : ""}`;
      el.dataset.material = slot.key;
      el.innerHTML = `<span class="material-name">${slot.label}</span><span class="material-count">0</span>`;
      materialsBar.appendChild(el);
      materialSlotRefs.set(slot.key, el);
    });
  }

  function renderHearts(hp) {
    if (!heartsContainer) return;
    if (uiState.hp === hp) return;
    uiState.hp = hp;

    heartsContainer.innerHTML = "";
    for (let i = 0; i < maxPlayerHp; i += 1) {
      const heart = document.createElement("span");
      heart.className = i < hp ? "heart" : "heart empty";
      heartsContainer.appendChild(heart);
    }
  }

  function renderPhaseChip(isNight) {
    if (!phaseChip) return;
    const phase = isNight ? "Natt" : "Dag";
    if (uiState.phase !== phase) {
      uiState.phase = phase;
      phaseChip.textContent = phase;
      phaseChip.classList.toggle("night", phase === "Natt");
    }
  }

  function renderMaterials(selectedMaterial, currentValues) {
    materialSlotConfig.forEach((slot) => {
      const el = materialSlotRefs.get(slot.key);
      if (!el) return;

      const count = currentValues[slot.key] ?? 0;
      if (uiState.materials[slot.key] !== count) {
        uiState.materials[slot.key] = count;
        const countEl = el.querySelector(".material-count");
        if (countEl) countEl.textContent = String(count);
      }

      if (!slot.future) {
        el.classList.toggle("selected", selectedMaterial === slot.key);
      }
    });
  }

  function render({ hp, isNight, selectedMaterial, materials }) {
    renderHearts(hp);
    renderPhaseChip(isNight);
    renderMaterials(selectedMaterial, materials);
  }

  function updateTimeToggle(isNight) {
    if (!timeToggleButton) return;
    timeToggleButton.textContent = isNight ? "Byt till dag" : "Byt till natt";
  }

  function bindInfoToggle() {
    if (!infoToggleButton || !infoBox) return;
    infoToggleButton.addEventListener("click", () => {
      const isHidden = infoBox.classList.toggle("hidden");
      infoToggleButton.setAttribute("aria-expanded", isHidden ? "false" : "true");
    });
  }

  return {
    setup,
    render,
    updateTimeToggle,
    bindInfoToggle,
  };
}
