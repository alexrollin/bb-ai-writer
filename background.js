const OAUTH_CONFIG = {
  client_id: 'bb-ai-writer',
  authorize_url: 'https://account.bebond.net/oauth/authorize',
  token_url: 'https://api.bebond.net/v1/oauth/token',
  redirect_path: '/callback',
  scopes: 'read_agents call_agents',
};

function getRedirectUrl() {
  return chrome.identity.getRedirectURL(OAUTH_CONFIG.redirect_path);
}

async function getStoredAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['bb_key', 'org_id', 'org_name', 'expires_at'], (result) => {
      resolve(result);
    });
  });
}

async function storeAuth(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      bb_key: data.bb_key,
      org_id: data.org_id,
      org_name: data.org_name,
      expires_at: data.expires_at,
    }, resolve);
  });
}

async function clearAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['bb_key', 'org_id', 'org_name', 'expires_at'], resolve);
  });
}

function isTokenValid(auth) {
  if (!auth.bb_key || !auth.org_id) return false;
  if (auth.expires_at && Date.now() > auth.expires_at) return false;
  return true;
}

async function launchOAuthFlow() {
  const redirectUrl = getRedirectUrl();
  const state = crypto.randomUUID();
  const authUrl = `${OAUTH_CONFIG.authorize_url}?client_id=${OAUTH_CONFIG.client_id}&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=${encodeURIComponent(OAUTH_CONFIG.scopes)}&state=${state}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!responseUrl) {
          reject(new Error('No response URL returned'));
          return;
        }

        const url = new URL(responseUrl);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const orgId = url.searchParams.get('org_id');

        if (returnedState !== state) {
          reject(new Error('State mismatch — possible CSRF'));
          return;
        }
        if (!code) {
          const error = url.searchParams.get('error') || 'unknown';
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        exchangeCodeForToken(code, orgId)
          .then(resolve)
          .catch(reject);
      }
    );
  });
}

async function exchangeCodeForToken(code, orgId) {
  const resp = await fetch(OAUTH_CONFIG.token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: OAUTH_CONFIG.client_id,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  await storeAuth({
    bb_key: data.bb_key,
    org_id: data.org_id || orgId,
    org_name: data.org_name,
    expires_at: data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 3600000,
  });

  return data;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOGIN') {
    launchOAuthFlow()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'LOGOUT') {
    clearAuth().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'GET_AUTH') {
    getStoredAuth().then((auth) => sendResponse({ auth }));
    return true;
  }

  if (message.type === 'SWITCH_ORG') {
    launchOAuthFlow()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'bb-ask-agent',
    title: 'Ask the agent',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'bb-ask-agent' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'ASK_AGENT',
      selection: info.selectionText,
    });
  }
});
