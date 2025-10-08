# MY YT SUMMARIZER – Quick Start

Follow these steps exactly. No coding background is required.

## 1. Install prerequisites (first time only)
1. Install [Node.js 18+](https://nodejs.org/) (includes npm).
2. Install Google Chrome if you do not already have it.

## 2. Prepare environment secrets
1. In this folder, duplicate the example file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` with any text editor and fill in:
   - `AI_MODEL_API_KEY` – your Google Generative AI API key.
   - `AI_MODEL` – model name, e.g. `models/gemini-1.5-flash-latest`.
   Save the file.

## 3. Install project dependencies
Run once (or after pulling new code):
```bash
npm install
```

## 4. Build the Chrome extension bundle
Every time you change `.env` or the source files:
```bash
npm run build
```
- This creates a fresh `dist/` folder that Chrome will load.
- If anything goes wrong, the script stops and prints a clear error message (look for `[build]` in the terminal).

## 5. Load the extension in Chrome
1. Open a new tab and visit `chrome://extensions/`.
2. Toggle **Developer mode** on (top-right corner).
3. Click **Load unpacked**.
4. Choose the `dist/` folder created in step 4.
5. Confirm that “MY YT SUMMARIZER” appears in the list.

## 6. Use the summarizer
1. Go to any YouTube video that has captions/transcripts enabled.
2. Wait for the page to finish loading; a light-blue **Summarize** button appears next to the Subscribe button.
3. Click **Summarize**.
4. A sidebar slides in from the right:
   - While the transcript loads, a status message says “Loading transcript…”.
   - While the AI is working, the status says “Generating summary…”.
   - When finished, the summary text appears, and you can press **Copy Summary** to copy it to your clipboard.
5. Click the “×” button to hide the sidebar.

## 7. Where to look when something breaks
- **On the YouTube page:** open Chrome DevTools (`Cmd+Option+I` on macOS / `Ctrl+Shift+I` on Windows), choose the **Console** tab, and filter for `[MY YT SUMMARIZER]`. You will see step-by-step logs such as panel discovery, transcript loading counts, and copy errors.
- **Background service worker:** in `chrome://extensions/`, find “MY YT SUMMARIZER” and click **Service Worker** → **Inspect views**. The console there includes API call status lines like `[MY YT SUMMARIZER/BG] Summary generated successfully.` or detailed Google API errors.
- **Build failures:** the terminal running `npm run build` prints `[build] Failed: ...` messages that explain missing env variables or file issues.

If you share these logs, include the full error line so we can diagnose the root cause quickly.

## 8. Updating or rebuilding
- After changing any file in `src/` or updating `.env`, run `npm run build` again, then click **Reload** under “MY YT SUMMARIZER” on the `chrome://extensions/` page.
- To remove the extension, go to `chrome://extensions/`, click **Remove**, and confirm.
