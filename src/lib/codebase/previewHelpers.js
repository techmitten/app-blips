import { mimeTypeFor } from './paths.js';
import { originalPosition } from '../sourceMap.js';

// Desktop serves imported images/fonts from the project's blobs folder
// (electron/main.js serveAsset); elsewhere they are inlined from the cache.
export function makeAssetUrl({ projectId, isDesktop, bytesOf }) {
  return (path, hash) => {
    const ext = (path.match(/\.([a-z0-9]{1,8})$/i)?.[1] || 'bin').toLowerCase();
    if (isDesktop && projectId) return `appblips://assets/${projectId}/${hash}.${ext}`;
    const bytes = bytesOf?.(hash);
    if (!bytes) return '';
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${mimeTypeFor(path)};base64,${btoa(binary)}`;
  };
}

// Line in the preview document -> project file and line, through the bundle's
// source map. null when the line isn't inside the bundle.
export function mapPreviewLine(preview, line, column) {
  if (!preview?.map || !preview.bundleLine || !line) return null;
  const bundleLine = line - preview.bundleLine + 1;
  if (bundleLine < 1) return null;
  const pos = originalPosition(preview.map, bundleLine, column);
  if (!pos) return null;
  const source = pos.source.replace(/^(vfs|router-shim):/, '');
  if (source.startsWith('<')) return null;
  return { file: source, line: pos.line, column: pos.column };
}
