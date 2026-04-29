# bb-ai-writer

Chrome extension template for Bebond in-browser AI-writer workflows.

## What it does

Reusable Chrome extension for drafting text inline on any page using Bebond AI agents. User authenticates via full-screen Bebond OAuth (account.bebond.net), picks org, then drafts with agents.

**Customer 1:** Sove-DA on FreeScout (AyeCode/GD support replies).

## Architecture

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest — identity, activeTab, storage, contextMenus, scripting |
| `background.js` | OAuth flow via `chrome.identity.launchWebAuthFlow`, context menu, message hub |
| `content.js` | Page scraper, floating panel, voice input (Web Speech API), insert into page |
| `popup.html/js/css` | Extension popup — org display, agent picker, draft area, actions |
| `settings.html/js` | Options page — agent, locale, debug, disconnect |
| `configs/sove-da.json` | Sove-DA agent config (FreeScout selectors, endpoint, locale) |
| `configs/schema.json` | JSON schema for per-agent config |

## OAuth Flow

```
Extension popup → "Connect Bebond" button
  → chrome.identity.launchWebAuthFlow
    → account.bebond.net/oauth/authorize?client_id=bb-ai-writer&...
      → Full-screen login + org picker + scope confirmation (BEB-884)
        → Redirect back with code + org_id
          → Exchange code for bb_key scoped to org
            → Stored in chrome.storage.local
```

**Note:** Requires BEB-884 (account.bebond.net OAuth org-picker) to be deployed for full flow. Extension is ready; the backend endpoint is the dependency.

## Per-customer config

Adding a new agent = new JSON config in `configs/`:

```json
{
  "agent_id": "sove-da",
  "agent_name": "Sove Directory Agent",
  "agent_endpoint": "https://sove-da.bebond.net/draft",
  "default_locale": "nl-NL",
  "host_patterns": ["https://*.ayecode.io/*"],
  "scrape_selector": ".conv-messages",
  "insert_selector": ".reply-editor, #reply-content"
}
```

## Install (dev)

1. `chrome://extensions` → Developer mode → Load unpacked → select this dir
2. Click extension icon → "Connect Bebond" (needs BEB-884 backend)

## Tickets

- BEB-881 — this extension (template)
- BEB-884 — account.bebond.net OAuth org-picker (paired dependency)
- BEB-877 — Sove-DA parent (customer 1)
- BEB-849 — Studio writer (web-component sibling)
