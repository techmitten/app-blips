// The Whisper model voice input uses (src/lib/whisperWorker.js), downloaded
// from Hugging Face the first time the user agrees to it: one fixed revision,
// each file checked against its SHA-256 before it's used or kept. Kept files
// live in this origin's Cache Storage under the file's download URL.

export const MODEL_REPO = 'onnx-community/whisper-base';
export const MODEL_REVISION = '1846881b6b3a3024392c1eea3ad983695bc23925';
// [size in bytes, sha256]. The q8 ("quantized") encoder and merged decoder
// are what transformers.js loads for dtype 'q8'.
export const MODEL_FILES = {
  'config.json': [2243, 'f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b'],
  'generation_config.json': [3832, '61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0'],
  'preprocessor_config.json': [339, 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'],
  'tokenizer.json': [2480466, '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566'],
  'tokenizer_config.json': [282682, '2e036e4dbacfdeb7242c7d4ec4149f4a16e86026048f94d1637e3a8ee9c6a573'],
  'onnx/encoder_model_quantized.onnx': [23201314, '5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46'],
  'onnx/decoder_model_merged_quantized.onnx': [53693315, 'fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b'],
};
export const MODEL_TOTAL_BYTES = Object.values(MODEL_FILES).reduce((sum, [size]) => sum + size, 0);
// For the download prompt: "about 76 MB".
export const MODEL_SIZE_LABEL = `about ${Math.round(MODEL_TOTAL_BYTES / 1024 / 1024)} MB`;

export const CACHE_PREFIX = 'appblips-whisper-';
export const CACHE_NAME = `${CACHE_PREFIX}${MODEL_REVISION}`;

export const modelFileUrl = (name) => `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/${name}`;

// Whether every file is already kept, so voice input can start without
// asking. Only verified files are ever stored (the worker checks sizes again
// when it loads them). Without Cache Storage nothing is kept, so it's false.
export async function isModelSaved() {
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const name of Object.keys(MODEL_FILES)) {
      if (!(await cache.match(modelFileUrl(name)))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
