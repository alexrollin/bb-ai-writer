(function () {
  let panel = null;
  let currentConfig = null;

  function loadConfigForHost(hostname) {
    const configs = [
      {
        agent_id: 'sove-da',
        agent_name: 'Sove Directory Agent',
        agent_endpoint: 'https://sove-da.bebond.net/draft',
        default_locale: 'nl-NL',
        scrape_selector: '.conv-messages',
        insert_selector: '.reply-editor, #reply-content',
      },
    ];

    for (const config of configs) {
      for (const pattern of config.host_patterns || ['*']) {
        if (pattern === '*' || hostname.match(globToRegex(pattern))) {
          return config;
        }
      }
    }
    return configs[0];
  }

  function globToRegex(glob) {
    return new RegExp(
      glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    );
  }

  function scrapePageContent(selector) {
    if (!selector) return '';
    const el = document.querySelector(selector);
    return el ? el.innerText : '';
  }

  function getSelectedText() {
    const sel = window.getSelection();
    return sel ? sel.toString().trim() : '';
  }

  function insertIntoPage(text, selector) {
    const selectors = selector.split(',').map((s) => s.trim());
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
          const start = el.selectionStart;
          const before = el.value.substring(0, start);
          const after = el.value.substring(el.selectionEnd);
          el.value = before + text + after;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          el.focus();
          document.execCommand('insertText', false, text);
        }
        return true;
      }
    }
    return false;
  }

  function createPanel() {
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'bb-ai-writer-panel';
    panel.innerHTML = `
      <div class="bb-panel-header">
        <span class="bb-panel-title">Bebond AI Writer</span>
        <button class="bb-panel-close" title="Close">&times;</button>
      </div>
      <div class="bb-panel-body">
        <textarea class="bb-draft-area" placeholder="Draft text will appear here..."></textarea>
      </div>
      <div class="bb-panel-footer">
        <button class="bb-btn bb-btn-insert" title="Insert into page">Insert</button>
        <button class="bb-btn bb-btn-copy" title="Copy to clipboard">Copy</button>
        <button class="bb-btn bb-btn-voice" title="Voice edit">🎤</button>
        <button class="bb-btn bb-btn-discard" title="Discard draft">Discard</button>
      </div>
    `;

    panel.querySelector('.bb-panel-close').addEventListener('click', () => hidePanel());
    panel.querySelector('.bb-btn-insert').addEventListener('click', () => {
      const text = panel.querySelector('.bb-draft-area').value;
      if (text && currentConfig) {
        const inserted = insertIntoPage(text, currentConfig.insert_selector);
        if (!inserted) {
          panel.querySelector('.bb-draft-area').placeholder = 'Could not find input field. Copy instead.';
        }
      }
    });
    panel.querySelector('.bb-btn-copy').addEventListener('click', () => {
      const text = panel.querySelector('.bb-draft-area').value;
      if (text) {
        navigator.clipboard.writeText(text);
        panel.querySelector('.bb-btn-copy').textContent = 'Copied!';
        setTimeout(() => { panel.querySelector('.bb-btn-copy').textContent = 'Copy'; }, 1500);
      }
    });
    panel.querySelector('.bb-btn-voice').addEventListener('click', startVoiceInput);
    panel.querySelector('.bb-btn-discard').addEventListener('click', () => {
      panel.querySelector('.bb-draft-area').value = '';
    });

    document.body.appendChild(panel);
    return panel;
  }

  function showPanel(draftText) {
    const p = createPanel();
    p.querySelector('.bb-draft-area').value = draftText || '';
    p.classList.add('bb-panel-visible');
  }

  function hidePanel() {
    if (panel) {
      panel.classList.remove('bb-panel-visible');
    }
  }

  let recognition = null;
  let isListening = false;

  function startVoiceInput() {
    if (isListening) {
      stopVoiceInput();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition not supported in this browser.');
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = (currentConfig && currentConfig.default_locale) || 'nl-NL';
    recognition.interimResults = true;
    recognition.continuous = true;

    const textarea = panel.querySelector('.bb-draft-area');
    const voiceBtn = panel.querySelector('.bb-btn-voice');
    const originalText = textarea.value;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      textarea.value = originalText + (originalText ? '\n' : '') + transcript;
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      stopVoiceInput();
    };

    recognition.onend = () => {
      stopVoiceInput();
    };

    recognition.start();
    isListening = true;
    voiceBtn.classList.add('bb-voice-active');
    voiceBtn.textContent = '⏹';
  }

  function stopVoiceInput() {
    if (recognition) {
      recognition.stop();
      recognition = null;
    }
    isListening = false;
    const voiceBtn = panel.querySelector('.bb-btn-voice');
    if (voiceBtn) {
      voiceBtn.classList.remove('bb-voice-active');
      voiceBtn.textContent = '🎤';
    }
  }

  async function requestDraft(context) {
    const auth = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_AUTH' }, (response) => resolve(response?.auth));
    });

    if (!auth || !auth.bb_key) {
      showPanel('[Not connected — click the extension icon to log in via Bebond]');
      return;
    }

    const config = currentConfig || loadConfigForHost(window.location.hostname);
    showPanel('Generating draft...');

    try {
      const resp = await fetch(config.agent_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.bb_key}`,
          'X-Org-Id': auth.org_id,
        },
        body: JSON.stringify({
          context,
          locale: config.default_locale,
          page_content: scrapePageContent(config.scrape_selector),
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        showPanel(`Error (${resp.status}): ${text}`);
        return;
      }

      const data = await resp.json();
      showPanel(data.draft || data.text || JSON.stringify(data));
    } catch (err) {
      showPanel(`Network error: ${err.message}`);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ASK_AGENT' && message.selection) {
      currentConfig = currentConfig || loadConfigForHost(window.location.hostname);
      requestDraft(message.selection);
    }

    if (message.type === 'SHOW_PANEL') {
      currentConfig = message.config || currentConfig || loadConfigForHost(window.location.hostname);
      const text = message.draftText || '';
      showPanel(text);
    }

    if (message.type === 'INSERT_TEXT' && message.text) {
      currentConfig = currentConfig || loadConfigForHost(window.location.hostname);
      insertIntoPage(message.text, currentConfig.insert_selector);
    }

    if (message.type === 'SCRAPE_PAGE') {
      currentConfig = currentConfig || loadConfigForHost(window.location.hostname);
      const content = scrapePageContent(currentConfig.scrape_selector);
      sendResponse({ content });
    }
  });
})();
