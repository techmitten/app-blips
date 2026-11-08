// The screenshots a review cites as evidence for its problems. Code review
// was removed; this only shows the photos of reports older versions saved. They
// were saved as JPEGs in the project's content-addressed file store (IndexedDB in
// the browser, the project folder's blobs/ on desktop) and each problem keeps
// only the hash, so saved projects and JSON backups don't carry images inline.
// A backup restored elsewhere has the hashes but not the photos; the chat
// then shows the report without them.
import { ensureBlobs, blobBytes } from './blobStore.js';

// Object URLs for the stored photos that could be found, by hash. The caller
// revokes them.
export async function loadReviewPhotoUrls(projectId, hashes) {
  if (!projectId || !hashes.length) return {};
  await ensureBlobs(projectId, hashes);
  const urls = {};
  for (const hash of hashes) {
    const bytes = blobBytes(hash);
    if (bytes) urls[hash] = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  }
  return urls;
}
