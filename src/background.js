import { EXT_CONFIG } from './config.js';

const LOG_PREFIX = '[MY YT SUMMARIZER/BG]';
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const log = (...args) => console.info(LOG_PREFIX, ...args);
const warn = (...args) => console.warn(LOG_PREFIX, ...args);
const error = (...args) => console.error(LOG_PREFIX, ...args);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'SUMMARIZE_TRANSCRIPT') {
    return false;
  }

  const { transcript, title } = message.payload ?? {};
  log('Received summarization request.', { title: title?.slice?.(0, 60), transcriptLength: transcript?.length });

  if (!transcript) {
    sendResponse({ error: 'Transcript payload missing.' });
    return false;
  }

  summarizeTranscript({ transcript, title })
    .then((summary) => {
      log('Summary generated successfully.');
      sendResponse({ summary });
    })
    .catch((err) => {
      error('Summarization failed.', err);
      sendResponse({ error: err?.message ?? 'Unknown error while summarizing.' });
    });

  return true;
});

async function summarizeTranscript({ transcript, title }) {
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) {
    throw new Error('Transcript text was empty after trimming.');
  }

  if (!EXT_CONFIG?.AI_MODEL || !EXT_CONFIG?.AI_MODEL_API_KEY) {
    throw new Error('Extension is missing AI configuration. Run `npm run build` after creating your .env file.');
  }

  const maxChars = 24000;
  const safeTranscript =
    trimmedTranscript.length > maxChars
      ? `${trimmedTranscript.slice(0, maxChars)}\n\n[Transcript truncated due to length]`
      : trimmedTranscript;

  const systemPrompt = [
    'You are a helpful assistant that summarizes YouTube video transcripts.',
    'Always respond in the same language used in the transcript.',
    'Return a concise multi-paragraph summary that highlights the main ideas.',
    'Do not hallucinate details that are not present in the transcript.',
  ].join(' ');

  const userPrompt = [
    `Video title: ${title ?? 'Untitled video'}`,
    'Transcript:',
    safeTranscript,
  ].join('\n\n');

  const url = `${GOOGLE_API_BASE}/models/${encodeURIComponent(
    EXT_CONFIG.AI_MODEL,
  )}:generateContent?key=${encodeURIComponent(EXT_CONFIG.AI_MODEL_API_KEY)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      top_p: 0.9,
      max_output_tokens: 1024,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API error (${response.status}): ${text}`);
  }

  const payload = await response.json();
  const firstCandidate = payload?.candidates?.[0];
  const text =
    firstCandidate?.content?.parts?.map((part) => part.text).join('\n').trim() ??
    firstCandidate?.output ??
    '';

  if (!text) {
    warn('Empty summary returned from API.', payload);
    throw new Error('AI model did not return any text. Check your API quota or model selection.');
  }

  return text;
}
