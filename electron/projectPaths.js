import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// snapd copies revision-specific data on refresh/revert, but an absolute path
// saved in settings still names the old revision, which confinement can deny.
// Use the running revision's copy; never try to read or move the old revision.
function currentSnapPath(saved, env) {
  if (!isAbsolute(saved) || !env.SNAP_USER_DATA || !isAbsolute(env.SNAP_USER_DATA)) return saved;
  const parts = relative(dirname(resolve(env.SNAP_USER_DATA)), resolve(saved)).split(sep);
  if (!/^(?:[0-9]+|x[0-9]+|current)$/.test(parts[0])) return saved;
  return join(env.SNAP_USER_DATA, ...parts.slice(1));
}

export function resolveProjectsPath({
  saved, userData, legacy, hasProjects, platform = process.platform, env = process.env,
}) {
  const snap = platform === 'linux' && Boolean(env.SNAP);
  if (typeof saved === 'string' && saved) return snap ? currentSnapPath(saved, env) : saved;
  if (hasProjects(legacy)) return legacy;
  const previousDefault = join(userData, 'Projects');
  // Keep existing projects in place, including snapd's copied data, even if
  // settings.json was absent. New Snap installs use the revision-independent area.
  if (snap && hasProjects(previousDefault)) return previousDefault;
  return snap && env.SNAP_USER_COMMON && isAbsolute(env.SNAP_USER_COMMON)
    ? join(env.SNAP_USER_COMMON, 'Projects')
    : previousDefault;
}
