// Is this a .deb install? The update notice uses this to tell people how to
// update: download the new .deb and install it by hand. A .deb can't update
// itself, since that needs the user's password.
//
// A packaged Linux build that isn't running as an AppImage came from the .deb
// (the only other Linux target in electron-builder.yml).
export function debInstall({ isPackaged, platform = process.platform, env = process.env }) {
  if (!isPackaged || platform !== 'linux' || env.APPIMAGE) return null;
  return { deb: true };
}
