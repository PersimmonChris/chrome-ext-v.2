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
      showClipboardFeedback('Transcript not ready yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(state.transcriptText);
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
      showClipboardFeedback('No summary available yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(state.summaryText);
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
  footerNote.textContent = '';

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
    await handleSummarizeClick();
  });

  buttonContainer.appendChild(button);
  actionBar.appendChild(buttonContainer);
}

async function handleSummarizeClick() {
  if (state.processing) {
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

async function collectTranscript() {
  const panel = await ensureTranscriptPanel();
  const transcript = await gatherTranscriptSegments(panel);
  await collapseTranscriptPanel(panel);
  return transcript;
}

async function ensureTranscriptPanel() {
  const start = performance.now();

  // Strategy 1: Look for clickable elements with transcript-related text
  const clickableElements = Array.from(document.querySelectorAll('tp-yt-paper-item, ytd-menu-service-item-renderer, button, a'));
  const transcriptElements = clickableElements.filter(el => {
    const text = (el.textContent || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    return text.includes('transcript') || ariaLabel.includes('transcript');
  });

  if (transcriptElements.length > 0) {
    transcriptElements[0].click();
    await wait(2000); // Wait longer for panel to fully load
  }

  const lookupPanel = () =>
    document.querySelector(
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
    );

  let panel = lookupPanel();
  const timeoutMs = 8000;

  while (!panel && performance.now() - start < timeoutMs) {
    await wait(250);
    panel = lookupPanel();
  }

  if (!panel) {
    throw new Error('Transcript panel is not available on this video.');
  }

  panel.removeAttribute('hidden');
  panel.removeAttribute('collapsed');
  panel.style.display = 'block';
  panel.style.visibility = 'visible';
  panel.style.transform = 'translateX(0)';
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');

  const engagementContainer = panel.closest('ytd-engagement-panel');
  if (engagementContainer) {
    engagementContainer.removeAttribute('hidden');
    engagementContainer.style.display = 'block';
    engagementContainer.setAttribute('active-panel', 'engagement-panel-searchable-transcript');
    engagementContainer.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  }

  await wait(300);
  return panel;
}

async function gatherTranscriptSegments(panel) {
  // Wait for transcript renderer to appear
  let transcriptRenderer = null;
  for (let i = 0; i < 20; i++) {
    transcriptRenderer = panel.querySelector('ytd-transcript-renderer') || panel.querySelector('#transcript');
    if (transcriptRenderer) break;
    await wait(250);
  }

  if (!transcriptRenderer) {
    throw new Error('Transcript renderer not found after opening panel.');
  }

  const scrollContainer =
    transcriptRenderer.querySelector('#segments-container') ||
    transcriptRenderer.querySelector('ytd-transcript-section-renderer #contents') ||
    transcriptRenderer;

  let previousCount = 0;
  let stableIterations = 0;
  const maxIterations = 40;

  for (let i = 0; i < maxIterations; i += 1) {
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'auto' });
    await wait(200);
    const segments = panel.querySelectorAll('ytd-transcript-segment-renderer');
    if (segments.length === previousCount) {
      stableIterations += 1;
      if (stableIterations >= 3) {
        break;
      }
    } else {
      stableIterations = 0;
      previousCount = segments.length;
      // Loading segments...
    }
  }

  const allSegments = Array.from(panel.querySelectorAll('ytd-transcript-segment-renderer'));
  if (!allSegments.length) {
    throw new Error('Transcript segments are empty after loading.');
  }

  const transcriptText = allSegments
    .map((segment) => {
      const text =
        segment.querySelector('.segment-text')?.innerText ||
        segment.querySelector('yt-formatted-string')?.innerText ||
        '';
      return text.trim();
    })
    .filter(Boolean)
    .join(' ');

  if (!transcriptText) {
    throw new Error('Transcript text could not be read from the page.');
  }

  return transcriptText;
}

async function collapseTranscriptPanel(panel) {
  panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  panel.style.display = 'none';
  panel.style.transform = '';

  const engagementContainer = panel.closest('ytd-engagement-panel');
  if (engagementContainer) {
    engagementContainer.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
    engagementContainer.removeAttribute('active-panel');
    engagementContainer.style.display = 'none';
  }

  await wait(150);
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
    handlePageUpdate();
  });

  window.addEventListener('yt-page-data-updated', () => {
    handlePageUpdate();
  });

  handlePageUpdate();
}

bootstrap();
