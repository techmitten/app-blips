// Identifies the preview bridge's postMessage channel. Shared by the parent
// (../previewBridge.js and its importers) and the in-frame script, which has
// both values spliced into its prelude.
export const BRIDGE_CHANNEL = 'orion-preview-bridge';
export const BRIDGE_PROTOCOL_VERSION = 1;
