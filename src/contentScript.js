const LOG_PREFIX = '[MY YT SUMMARIZER]';
const WATCH_PATH = '/watch';

const state = {
  sidebar: null,
  summaryText: '',
  transcriptText: '',
  initializedVideoId: null,
  processing: false,
  feedbackTimeoutId: null,
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (...args) => console.info(LOG_PREFIX, ...args);
const warn = (...args) => console.warn(LOG_PREFIX, ...args);
const error = (...args) => console.error(LOG_PREFIX, ...args);

const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function renderSimpleMarkdown(markdown) {
  const lines = markdown.split('\n');
  const html = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    html.push(`<p>${paragraph.join(' ')}</p>`);
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      const level = Math.min(3, headingMatch[1].length);
      html.push(`<h${level}>${escapeHtml(headingMatch[2].trim())}</h${level}>`);
      continue;
    }

    paragraph.push(escapeHtml(line.trim()));
  }

  flushParagraph();

  return html.join('\n');
}

function isWatchPage() {
  return window.location.pathname === WATCH_PATH;
}

function currentVideoId() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('v');
  } catch (err) {
    return null;
  }
}

function ensureSidebar() {
  if (state.sidebar) {
    return state.sidebar;
  }

  const sidebar = document.createElement('aside');
  sidebar.id = 'my-yt-summarizer-sidebar';

  const header = document.createElement('header');

  const copyTranscriptButton = document.createElement('button');
  copyTranscriptButton.className = 'my-yt-summarizer-copy-transcript';
  copyTranscriptButton.type = 'button';
  copyTranscriptButton.textContent = 'Copy Transcript';
  copyTranscriptButton.addEventListener('click', async () => {
    if (!state.transcriptText) {
      warn('Transcript not available to copy.');
      showClipboardFeedback('Transcript not ready yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(state.transcriptText);
      log('Transcript copied to clipboard.');
      showClipboardFeedback('Transcript copied to clipboard.');
    } catch (err) {
      error('Failed to copy transcript.', err);
      showClipboardFeedback('Failed to copy transcript.');
    }
  });

  const copyButton = document.createElement('button');
  copyButton.className = 'my-yt-summarizer-copy';
  copyButton.type = 'button';
  copyButton.textContent = 'Copy Summary';
  copyButton.addEventListener('click', async () => {
    if (!state.summaryText) {
      warn('Nothing to copy yet.');
      showClipboardFeedback('No summary available yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(state.summaryText);
      log('Summary copied to clipboard.');
      showClipboardFeedback('Summary copied to clipboard.');
    } catch (err) {
      error('Failed to copy summary.', err);
      showClipboardFeedback('Failed to copy summary.');
    }
  });

  const closeButton = document.createElement('button');
  closeButton.className = 'my-yt-summarizer-close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close summarizer panel');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', () => {
    sidebar.classList.remove('open');
  });

  const feedback = document.createElement('div');
  feedback.className = 'my-yt-summarizer-feedback my-yt-summarizer-hidden';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');

  header.appendChild(copyTranscriptButton);
  header.appendChild(copyButton);
  header.appendChild(closeButton);
  header.appendChild(feedback);

  const main = document.createElement('section');
  main.id = 'my-yt-summarizer-sidebar-main';

  const status = document.createElement('div');
  status.className = 'my-yt-summarizer-status';
  status.textContent = 'Click "Summarize" to generate a summary.';

  const summary = document.createElement('div');
  summary.className = 'my-yt-summarizer-summary my-yt-summarizer-hidden';

  const errorBox = document.createElement('div');
  errorBox.className = 'my-yt-summarizer-error my-yt-summarizer-hidden';

  const footerNote = document.createElement('div');
  footerNote.className = 'my-yt-summarizer-footer-note';
  footerNote.textContent = 'Tip: keep this tab focused while the transcript loads.';

  main.appendChild(status);
  main.appendChild(summary);
  main.appendChild(errorBox);
  main.appendChild(footerNote);

  sidebar.appendChild(header);
  sidebar.appendChild(main);

  document.body.appendChild(sidebar);
  state.sidebar = {
    container: sidebar,
    status,
    summary,
    errorBox,
    feedback,
  };

  return state.sidebar;
}

function showClipboardFeedback(message) {
  const sidebar = ensureSidebar();

  if (!sidebar.feedback) {
    return;
  }

  sidebar.feedback.textContent = message;
  sidebar.feedback.classList.remove('my-yt-summarizer-hidden');

  if (state.feedbackTimeoutId) {
    clearTimeout(state.feedbackTimeoutId);
  }

  state.feedbackTimeoutId = setTimeout(() => {
    sidebar.feedback.classList.add('my-yt-summarizer-hidden');
    sidebar.feedback.textContent = '';
    state.feedbackTimeoutId = null;
  }, 2000);
}

function updateSidebarState({ status, summary, error }) {
  const sidebar = ensureSidebar();

  if (typeof status === 'string') {
    sidebar.status.textContent = status;
    sidebar.status.classList.remove('my-yt-summarizer-hidden');
  } else if (status === null) {
    sidebar.status.classList.add('my-yt-summarizer-hidden');
  }

  if (typeof summary === 'string') {
    sidebar.summary.innerHTML = renderSimpleMarkdown(summary);
    sidebar.summary.classList.remove('my-yt-summarizer-hidden');
    state.summaryText = summary;
  } else if (summary === null) {
    sidebar.summary.classList.add('my-yt-summarizer-hidden');
    state.summaryText = '';
  }

  if (typeof error === 'string' && error.length > 0) {
    sidebar.errorBox.textContent = error;
    sidebar.errorBox.classList.remove('my-yt-summarizer-hidden');
  } else if (error === null) {
    sidebar.errorBox.textContent = '';
    sidebar.errorBox.classList.add('my-yt-summarizer-hidden');
  }
}

function ensureSummarizeButton() {
  if (document.getElementById('my-yt-summarizer-button')) {
    return;
  }

  const actionBar =
    document.querySelector('ytd-watch-metadata #actions') ||
    document.querySelector('ytd-watch-metadata #top-row') ||
    document.querySelector('#actions');

  if (!actionBar) {
    return;
  }

  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'inline-flex';
  buttonContainer.style.marginLeft = '12px';

  const button = document.createElement('button');
  button.id = 'my-yt-summarizer-button';
  button.type = 'button';
  button.textContent = 'Summarize';
  button.addEventListener('click', async () => {
    log('Summarize button clicked.');
    await handleSummarizeClick();
  });

  buttonContainer.appendChild(button);
  actionBar.appendChild(buttonContainer);
  log('Summarize button injected.');
}

async function handleSummarizeClick() {
  if (state.processing) {
    warn('Summarization already in progress.');
    return;
  }

  const sidebar = ensureSidebar();
  sidebar.container.classList.add('open');
  state.transcriptText = '';

  const videoTitle =
    document.querySelector('h1.ytd-watch-metadata')?.innerText?.trim() ?? 'Untitled video';

  try {
    state.processing = true;
    updateSidebarState({
      status: 'Loading transcript from YouTube…',
      summary: null,
      error: null,
    });

    const transcript = await collectTranscript();
    state.transcriptText = transcript;

    if (!transcript || transcript.trim().length === 0) {
      throw new Error(
        'Transcript could not be found. Some videos disable transcripts or they may be unavailable for this language.',
      );
    }

    updateSidebarState({
      status: 'Generating summary with Google AI…',
      summary: null,
      error: null,
    });

    const response = await chrome.runtime.sendMessage({
      type: 'SUMMARIZE_TRANSCRIPT',
      payload: {
        transcript,
        title: videoTitle,
      },
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    updateSidebarState({
      status: null,
      summary: response.summary,
      error: null,
    });
  } catch (err) {
    const message = err?.message ?? 'Unknown error occurred.';
    error('Summarization failed:', err);
    updateSidebarState({
      status: null,
      summary: null,
      error: message,
    });
    state.transcriptText = '';
  } finally {
    state.processing = false;
  }
}

// Heuristic: Try multiple strategies to open the transcript panel and collect segments.
async function collectTranscript() {
  log('Starting transcript extraction.');
  // If transcript already open, proceed to collect.
  let segments = collectTranscriptSegments();
  if (!segments || segments.length === 0) {
    await tryOpenTranscriptPanel();
    // wait for panel to render
    await wait(800);
    await ensureTranscriptFullyLoaded();
    segments = collectTranscriptSegments();
  }
  if (!segments || segments.length === 0) return null;
  // Join all lines, stripping extra spaces
  return segments.map(s => s.trim()).filter(Boolean).join('\n');
}

function collectTranscriptSegments() {
  const candidates = [
    'ytd-transcript-segment-renderer',
    'ytd-transcript-renderer ytd-transcript-segment-renderer',
    'ytd-transcript-segment-list-renderer #segments-container ytd-transcript-segment-renderer'
  ];
  let nodes = [];
  for (const sel of candidates) {
    nodes = Array.from(document.querySelectorAll(sel));
    if (nodes.length) break;
  }
  if (!nodes.length) return [];
  return nodes.map(n => {
    const textNode = n.querySelector('.segment-text, .cue, yt-formatted-string, .segment-text-content');
    const text = textNode ? textNode.innerText : n.innerText;
    return (text || '').trim();
  });
}

async function ensureTranscriptFullyLoaded() {
  // Scroll the transcript container to load all entries (virtualized list)
  const scrollContainers = [
    'ytd-transcript-renderer #segments-container',
    'ytd-transcript-segment-list-renderer #segments-container',
    'ytd-engagement-panel-section-list-renderer[section-identifier="engagement-panel-searchable-transcript"] #contents'
  ];
  let container = null;
  for (const sel of scrollContainers) {
    container = document.querySelector(sel);
    if (container) break;
  }
  if (!container) return;

  let lastCount = 0;
  for (let i = 0; i < 60; i++) { // ~9s max
    container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
    await wait(150);
    const segments = collectTranscriptSegments();
    if (segments.length === lastCount) {
      await wait(200);
      const current = collectTranscriptSegments().length;
      if (current === segments.length) break;
    }
    lastCount = segments.length;
  }
}

function normalizeText(s = '') {
  try {
    return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  } catch { return (s || '').toLowerCase(); }
}

function isTranscriptLabel(el) {
  const hints = [
    'transcript',      // en
    'trascriz',        // it: trascrizione
    'transkrip',       // de/sk/cs variations
    'transcrip',       // es/fr/pt stems
    'transkript',      // da/no/sv
    '文字記錄', '文字记录', '字幕', '抄本',
  ];
  const txt = normalizeText((el.textContent || '') + ' ' + (el.getAttribute?.('aria-label') || ''));
  return hints.some(h => txt.includes(h));
}

async function tryOpenTranscriptPanel() {
  // Strategy 0: Try dedicated toggles (locale-agnostic)
  const toggleCandidates = [
    '[target-id="engagement-panel-searchable-transcript"]',
    '[data-target-id="engagement-panel-searchable-transcript"]',
    'button[aria-controls="engagement-panel-searchable-transcript"]',
    '[aria-controls*="transcript"]',
  ];
  for (const sel of toggleCandidates) {
    const t = document.querySelector(sel);
    if (!t) continue;
    t.click();
    await wait(700);
    if (collectTranscriptSegments().length) return true;
  }

  // Strategy 1: Direct click visible items with transcript-like labels
  const clickable = Array.from(document.querySelectorAll('tp-yt-paper-item, ytd-menu-service-item-renderer, button, a'))
    .filter(isTranscriptLabel);
  for (const el of clickable) {
    el.click();
    await wait(600);
    if (collectTranscriptSegments().length) return true;
  }

  // Strategy 2: Open overflow menu then click transcript entry
  const overflowSelectors = [
    'ytd-watch-metadata ytd-menu-renderer yt-icon-button',
    'ytd-menu-renderer yt-button-shape button[aria-haspopup="menu"]',
    'ytd-watch-metadata #menu yt-icon-button',
    'ytd-menu-renderer yt-icon-button',
  ];
  for (const sel of overflowSelectors) {
    const moreBtn = document.querySelector(sel);
    if (!moreBtn) continue;
    moreBtn.click();
    await wait(500);
    const menuItems = Array.from(document.querySelectorAll('ytd-menu-popup-renderer tp-yt-paper-item, ytd-menu-popup-renderer ytd-menu-service-item-renderer'));
    const showBtn = menuItems.find(isTranscriptLabel);
    if (showBtn) {
      showBtn.click();
      await wait(800);
      if (collectTranscriptSegments().length) return true;
    }
  }

  // Strategy 3: Directly unhide the engagement panel if present
  const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[section-identifier="engagement-panel-searchable-transcript"]');
  if (panel) {
    panel.style.display = 'block';
    panel.removeAttribute('hidden');
    await wait(800);
    if (collectTranscriptSegments().length) return true;
  }

  return false;
}

function resetForNewVideo(videoId) {
  state.initializedVideoId = videoId;
  state.summaryText = '';
  state.processing = false;

  const sidebar = state.sidebar?.container;
  if (sidebar) {
    sidebar.classList.remove('open');
  }

  updateSidebarState({
    status: 'Click "Summarize" to generate a summary.',
    summary: null,
    error: null,
  });
}

function handlePageUpdate() {
  const videoId = currentVideoId();
  if (!isWatchPage() || !videoId) {
    return;
  }

  if (state.initializedVideoId !== videoId) {
    log(`Detected video navigation. Current video id: ${videoId}`);
    resetForNewVideo(videoId);
  }

  ensureSummarizeButton();
}

function bootstrap() {
  const observer = new MutationObserver(() => {
    if (isWatchPage()) {
      ensureSummarizeButton();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('yt-navigate-finish', () => {
    log('Navigation finish event detected.');
    handlePageUpdate();
  });

  window.addEventListener('yt-page-data-updated', () => {
    log('YouTube page data updated.');
    handlePageUpdate();
  });

  handlePageUpdate();
  log('Content script initialized.');
}

bootstrap();
