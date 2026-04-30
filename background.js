// Bebond AI Writer — auth via canonical OAuthRepl pattern.
// Pattern: https://account.bebond.net/oauth/repl?app=ai-writer&redirect=<chrome-redirect-url>
// On approve, OAuthRepl redirects to the extension's chromiumapp.org URL with
// ?bb_key=…&org_id=…&app=… — we parse and store, no token-exchange step.

const APP = 'ai-writer';
const OAUTH_BASE = 'https://account.bebond.net/oauth/repl';

function getRedirectUrl() {
  return chrome.identity.getRedirectURL('callback');
}

async function getStoredAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['bb_key', 'org_id', 'app', 'expires_at'], resolve);
  });
}

async function storeAuth(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

async function clearAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['bb_key', 'org_id', 'app', 'expires_at'], resolve);
  });
}

function isTokenValid(auth) {
  if (!auth.bb_key || !auth.org_id) return false;
  if (!auth.bb_key.startsWith('bb_')) return false;
  if (auth.expires_at && Date.now() > auth.expires_at) return false;
  return true;
}

async function launchOAuthFlow() {
  const redirectUrl = getRedirectUrl();
  const authUrl = `${OAUTH_BASE}?app=${encodeURIComponent(APP)}&redirect=${encodeURIComponent(redirectUrl)}`;

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (rurl) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!rurl) return reject(new Error('No response URL returned'));
        resolve(rurl);
      },
    );
  });

  const url = new URL(responseUrl);
  const bbKey = url.searchParams.get('bb_key');
  const orgId = url.searchParams.get('org_id');
  const errorReason = url.searchParams.get('error');
  if (errorReason) throw new Error(`Login denied: ${errorReason}`);
  if (!bbKey || !bbKey.startsWith('bb_')) throw new Error('No bb_key in callback');
  if (!orgId) throw new Error('No org_id in callback');

  const data = {
    bb_key: bbKey,
    org_id: orgId,
    app: APP,
    expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days; rotate via login again
  };
  await storeAuth(data);
  return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'LOGIN' || message.type === 'SWITCH_ORG') {
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
    getStoredAuth().then((auth) => sendResponse({ auth, valid: isTokenValid(auth) }));
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
