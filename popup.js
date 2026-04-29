(async function () {
  const loginView = document.getElementById('login-view');
  const mainView = document.getElementById('main-view');
  const btnConnect = document.getElementById('btn-connect');
  const btnSwitchOrg = document.getElementById('btn-switch-org');
  const btnGetDraft = document.getElementById('btn-get-draft');
  const btnEditSelection = document.getElementById('btn-edit-selection');
  const btnVoice = document.getElementById('btn-voice');
  const btnInsert = document.getElementById('btn-insert');
  const btnCopy = document.getElementById('btn-copy');
  const btnDiscard = document.getElementById('btn-discard');
  const btnSettings = document.getElementById('btn-settings');
  const btnLogout = document.getElementById('btn-logout');
  const agentPicker = document.getElementById('agent-picker');
  const draftText = document.getElementById('draft-text');
  const orgName = document.getElementById('org-name');
  const userEmail = document.getElementById('user-email');

  function showView(view) {
    loginView.style.display = 'none';
    mainView.style.display = 'none';
    view.style.display = 'block';
  }

  async function checkAuth() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_AUTH' }, (response) => {
        resolve(response?.auth);
      });
    });
  }

  async function refreshUI() {
    const auth = await checkAuth();
    if (auth && auth.bb_key) {
      orgName.textContent = auth.org_name || 'Unknown org';
      userEmail.textContent = auth.org_id || 'Connected';
      btnLogout.style.display = 'inline-block';
      showView(mainView);
      await loadAgents();
    } else {
      showView(loginView);
    }
  }

  async function loadAgents() {
    const agents = [
      { id: 'sove-da', name: 'Sove-DA' },
    ];

    try {
      const resp = await fetch('https://cdn.bebond.net/extensions/bb-ai-writer/agents.json');
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) agents = data;
      }
    } catch (_) {}

    agentPicker.innerHTML = '';
    for (const agent of agents) {
      const opt = document.createElement('option');
      opt.value = agent.id;
      opt.textContent = agent.name;
      agentPicker.appendChild(opt);
    }
  }

  btnConnect.addEventListener('click', async () => {
    btnConnect.textContent = 'Connecting...';
    btnConnect.disabled = true;
    chrome.runtime.sendMessage({ type: 'LOGIN' }, (response) => {
      if (response?.success) {
        refreshUI();
      } else {
        alert('Login failed: ' + (response?.error || 'unknown error'));
        btnConnect.textContent = 'Connect Bebond';
        btnConnect.disabled = false;
      }
    });
  });

  btnSwitchOrg.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SWITCH_ORG' }, (response) => {
      if (response?.success) {
        refreshUI();
      }
    });
  });

  btnGetDraft.addEventListener('click', async () => {
    const agentId = agentPicker.value;
    draftText.value = 'Generating draft...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PAGE' }, (response) => {
      const pageContent = response?.content || '';

      chrome.runtime.sendMessage({ type: 'GET_AUTH' }, async (authResp) => {
        const auth = authResp?.auth;
        if (!auth?.bb_key) {
          draftText.value = 'Not connected.';
          return;
        }

        try {
          const resp = await fetch('https://sove-da.bebond.net/draft', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${auth.bb_key}`,
              'X-Org-Id': auth.org_id,
            },
            body: JSON.stringify({
              context: '',
              page_content: pageContent,
              locale: 'nl-NL',
            }),
          });

          if (!resp.ok) {
            draftText.value = `Error ${resp.status}`;
            return;
          }
          const data = await resp.json();
          draftText.value = data.draft || data.text || JSON.stringify(data);
        } catch (err) {
          draftText.value = `Error: ${err.message}`;
        }
      });
    });
  });

  btnEditSelection.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString(),
    });

    const selection = results?.[0]?.result?.trim();
    if (!selection) {
      draftText.value = 'No text selected. Highlight text on the page first.';
      return;
    }

    draftText.value = 'Editing selection...';

    chrome.runtime.sendMessage({ type: 'GET_AUTH' }, async (authResp) => {
      const auth = authResp?.auth;
      if (!auth?.bb_key) {
        draftText.value = 'Not connected.';
        return;
      }

      try {
        const resp = await fetch('https://sove-da.bebond.net/draft', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.bb_key}`,
            'X-Org-Id': auth.org_id,
          },
          body: JSON.stringify({
            context: selection,
            locale: 'nl-NL',
          }),
        });

        if (!resp.ok) {
          draftText.value = `Error ${resp.status}`;
          return;
        }
        const data = await resp.json();
        draftText.value = data.draft || data.text || JSON.stringify(data);
      } catch (err) {
        draftText.value = `Error: ${err.message}`;
      }
    });
  });

  btnInsert.addEventListener('click', async () => {
    const text = draftText.value;
    if (!text) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.tabs.sendMessage(tab.id, { type: 'INSERT_TEXT', text });
  });

  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(draftText.value);
    btnCopy.textContent = 'Copied!';
    setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
  });

  btnDiscard.addEventListener('click', () => {
    draftText.value = '';
  });

  btnVoice.addEventListener('click', () => {
    alert('Voice input works in the floating panel on the page. Highlight text → right-click → "Ask the agent" → use the 🎤 button there.');
  });

  btnLogout.addEventListener('click', () => {
    if (confirm('Disconnect Bebond? You will need to log in again.')) {
      chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
        refreshUI();
      });
    }
  });

  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  refreshUI();
})();
