import { safeStorage } from './config.js';
import { logWarn } from './errorLog.js';

// The Terms of Use and Privacy Policy live on the landing site
// (AppBlips-Landing: public/legal.json, shown as each page's "Last updated").
// The user agrees on onboarding's first slide; once either date there is newer
// than the one they agreed to, the app asks again (components/DesktopOnboarding
// with `termsOnly`).
export const TERMS_URL = 'https://www.appblips.com/terms';
export const PRIVACY_URL = 'https://www.appblips.com/privacy';
// The canonical host, so the fetch isn't redirected (a redirect would lose the
// cross-origin header the file is served with).
export const LEGAL_DATES_URL = 'https://appblips.com/legal.json';

// The dates as of this build: used offline, or when the landing site can't be
// reached, so a check that fails never asks for (or skips) more than this.
export const BUNDLED_LEGAL_DATES = { terms: '2026-11-17', privacy: '2026-11-17' };

const AGREEMENT_KEY = 'orion-legal-agreement';
const FETCH_TIMEOUT_MS = 8000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOCUMENTS = ['terms', 'privacy'];

// ISO dates compare correctly as strings.
const later = (a, b) => (a > b ? a : b);

// The newer of the landing site's dates and this build's, per document, so a
// cached or stale file can't move a date backwards.
const mergeDates = (fetched) => Object.fromEntries(DOCUMENTS.map((doc) => [
  doc,
  DATE_RE.test(fetched?.[doc]) ? later(fetched[doc], BUNDLED_LEGAL_DATES[doc]) : BUNDLED_LEGAL_DATES[doc],
]));

export const fetchLegalDates = async () => {
  try {
    const response = await fetch(LEGAL_DATES_URL, { cache: 'no-cache', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return mergeDates(await response.json());
  } catch (err) {
    logWarn('Could not check for updated terms; using the dates in this version', err);
    return { ...BUNDLED_LEGAL_DATES };
  }
};

// { terms, privacy, agreedAt } as last agreed, or null.
export const loadAgreement = () => {
  try {
    const saved = JSON.parse(safeStorage('local')?.getItem(AGREEMENT_KEY) || 'null');
    return DOCUMENTS.every((doc) => DATE_RE.test(saved?.[doc])) ? saved : null;
  } catch {
    return null;
  }
};

// Saves agreement to the given dates and returns the record. A failed save
// only means the user is asked again next time.
export const saveAgreement = (dates) => {
  const agreement = { terms: dates.terms, privacy: dates.privacy, agreedAt: new Date().toISOString() };
  try {
    safeStorage('local')?.setItem(AGREEMENT_KEY, JSON.stringify(agreement));
  } catch (err) {
    logWarn('Could not save the terms agreement', err);
  }
  return agreement;
};

export const needsAgreement = (agreement, dates) =>
  !agreement || DOCUMENTS.some((doc) => dates[doc] > agreement[doc]);
