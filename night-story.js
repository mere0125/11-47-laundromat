(() => {
  const clipboard = document.querySelector('.shift-clipboard');
  const repair = clipboard.querySelector('.shift-repair');
  const status = document.querySelector('#shift-repair-status');
  const sceneArea = document.querySelector('.scene-area');
  const sceneCanvas = document.querySelector('#room');

  const repairLabels = {
    waiting: 'Awaiting inspection',
    seen: 'Fault spotted',
    servicing: 'Under repair',
    fixed: 'Back in service'
  };

  function updateRepairNote() {
    if (roomPage.hidden) return;
    const dryer = [...laundryMachines.values()].find(machine => machine.rect.label === 'D 03');
    const attendant = minds.get('attendant');
    if (!dryer || !attendant) return;

    const landmarkId = machineId(dryer.index);
    let state = 'waiting';
    if (!dryer.fault) state = 'fixed';
    else if (attendant.phase === 'servicing' && attendant.machine === landmarkId) state = 'servicing';
    else if (attendant.landmarks.get(landmarkId)?.status === 'needs repair') state = 'seen';

    if (repair.dataset.repairState === state) return;
    repair.dataset.repairState = state;
    status.textContent = repairLabels[state];
  }

  document.querySelector('#follow-night-attendant').addEventListener('click', () => {
    const attendantButton = document.querySelector('#attention-register [data-person="attendant"]');
    if (!attendantButton) return;
    attendantButton.click();
    document.querySelector('#memory-view').click();
    sceneCanvas.focus({preventScroll: true});
    if (sceneArea.getBoundingClientRect().top > window.innerHeight - 100) {
      sceneArea.scrollIntoView({block: 'start'});
    }
  });

  document.querySelector('#open-layout-studio').addEventListener('click', () => window.openLayoutStudio());
  document.querySelector('#enter-laundromat').addEventListener('click', updateRepairNote);
  document.querySelector('#reset').addEventListener('click', updateRepairNote);
  window.setInterval(updateRepairNote, 300);
})();
