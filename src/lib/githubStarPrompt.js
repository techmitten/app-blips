// Keep a lifetime count (including deleted projects), capped at the threshold.
// Autosaves and renames of the same project must not advance the prompt.
export const GITHUB_STAR_THRESHOLD = 3;
export const GITHUB_REPO_URL = 'https://github.com/TechMitten/app-blips';
const STORAGE_KEY = 'appblips-github-star-prompt';
let memory = { projectIds: [], dismissed: false };

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.projectIds)) {
      memory = {
        projectIds: [...new Set(saved.projectIds.filter(id => typeof id === 'string'))].slice(0, GITHUB_STAR_THRESHOLD),
        dismissed: saved.dismissed === true,
      };
    }
  } catch { /* Optional preference: use memory if storage is unavailable. */ }
  return memory;
}

function writeState(state) {
  memory = state;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Keep the in-memory value. */ }
}

export function trackStarPromptProjects(projects) {
  const state = readState();
  const projectIds = [...new Set([
    ...state.projectIds,
    ...projects.filter(project => (project.versionCount ?? project.versions?.length ?? 0) > 0).map(project => project.id),
  ])].slice(0, GITHUB_STAR_THRESHOLD);
  writeState({ ...state, projectIds });
  return !state.dismissed && projectIds.length >= GITHUB_STAR_THRESHOLD;
}

export function dismissStarPrompt() {
  writeState({ ...readState(), dismissed: true });
}
