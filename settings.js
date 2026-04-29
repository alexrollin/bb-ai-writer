(async function () {
  const optAgent = document.getElementById('opt-agent');
  const optLocale = document.getElementById('opt-locale');
  const optDebug = document.getElementById('opt-debug');
  const debugLog = document.getElementById('debug-log');
  const btnSave = document.getElementById('btn-save');
  const btnDisconnect = document.getElementById('btn-disconnect');

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        const settings = result.settings || {};
        optAgent.value = settings.agent || 'sove-da';
        optLocale.value = settings.locale || 'nl-NL';
        optDebug.checked = settings.debug || false;
        resolve(settings);
      });
    });
  }

  async function saveSettings() {
    const settings = {
      agent: optAgent.value,
      locale: optLocale.value,
      debug: optDebug.checked,
    };
    return new Promise((resolve) => {
      chrome.storage.local.set({ settings }, resolve);
    });
  }

  btnSave.addEventListener('click', async () => {
    await saveSettings();
    btnSave.textContent = 'Saved!';
    setTimeout(() => { btnSave.textContent = 'Save settings'; }, 1500);
  });

  btnDisconnect.addEventListener('click', () => {
    if (confirm('Disconnect Bebond? You will need to log in again.')) {
      chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
        window.close();
      });
    }
  });

  if (optDebug.checked) {
    debugLog.style.display = 'block';
  }

  optDebug.addEventListener('change', () => {
    debugLog.style.display = optDebug.checked ? 'block' : 'none';
  });

  await loadSettings();
})();
