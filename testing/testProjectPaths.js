import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveProjectsPath } from '../electron/projectPaths.js';

const base = '/home/techray/snap/appblips';
const options = {
  platform: 'linux',
  env: { SNAP: '/snap/appblips/2', SNAP_USER_DATA: `${base}/2`, SNAP_USER_COMMON: `${base}/common` },
  userData: `${base}/2/.config/appblips`,
  legacy: '/home/techray/Documents/AppBlips/Projects',
  hasProjects: () => false,
};

test('Snap refresh rebases the saved projects path to the running revision', () => {
  assert.equal(resolveProjectsPath({ ...options, saved: `${base}/1/.config/appblips/Projects` }), `${base}/2/.config/appblips/Projects`);
  assert.equal(resolveProjectsPath({ ...options, saved: `${base}/x1/Custom projects` }), `${base}/2/Custom projects`);
  assert.equal(resolveProjectsPath({ ...options, saved: `${base}/current/.config/appblips/Projects` }), `${base}/2/.config/appblips/Projects`);
  // Also handles reverting to an earlier revision.
  assert.equal(resolveProjectsPath({ ...options, saved: `${base}/3/.config/appblips/Projects` }), `${base}/2/.config/appblips/Projects`);
});

test('Snap keeps shared data, chosen external folders and other snaps unchanged', () => {
  for (const saved of [`${base}/common/Projects`, '/home/techray/Projects', '/media/usb/Projects', '/home/techray/snap/other/1/Projects']) {
    assert.equal(resolveProjectsPath({ ...options, saved }), saved);
  }
});

test('new Snap installs use shared storage; existing project folders are preserved', () => {
  assert.equal(resolveProjectsPath(options), `${base}/common/Projects`);
  assert.equal(resolveProjectsPath({ ...options, hasProjects: (path) => path === `${options.userData}/Projects` }), `${options.userData}/Projects`);
  assert.equal(resolveProjectsPath({ ...options, hasProjects: (path) => path === options.legacy }), options.legacy);
});

test('non-Snap installs and incomplete Snap environments keep their previous defaults', () => {
  for (const extra of [{ platform: 'win32' }, { env: {} }, { env: { SNAP: '/snap/appblips/2' } }]) {
    assert.equal(resolveProjectsPath({ ...options, ...extra }), `${options.userData}/Projects`);
    const saved = `${base}/1/Projects`;
    assert.equal(resolveProjectsPath({ ...options, ...extra, saved }), saved);
  }
});
