// Commands operate only on the app's embedded generated-page frame. Never
// accept JavaScript, arbitrary selectors, or screen coordinates from the model.
const FRAME_GEOMETRY = `(() => {
  const frame = document.querySelector('iframe[data-appblips-browser]');
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    token: frame.dataset.browserToken, focused: document.activeElement === frame, dpr: devicePixelRatio };
})()`;

// The preview is often shown zoomed out to fit the workspace, and
// capturePage copies the pixels as displayed: a 1280px desktop page shown at
// half size became a 640px image whose small text the reviewer can't read.
// When that happens, Chromium re-renders the region at the page's own width
// (DevTools protocol, clip scale); capturePage stays the fallback.
// viewportWidth is the frame's innerWidth from the latest inspection; it only
// ever sets a scale, clamped, so a wrong value can't do more than blur.
// `rect` is in CSS pixels (the DevTools clip takes those); capturePage takes
// device-independent pixels, so it gets the rectangle scaled by the zoom.
async function capturePreview(contents, rect, frame, viewportWidth, zoom = 1) {
  const shown = rect.width * zoom * (frame.dpr || 1);
  const scale = Number.isFinite(viewportWidth) ? Math.min(4, viewportWidth / shown) : 1;
  if (scale > 1.05) {
    const debug = contents.debugger;
    const attachedHere = !debug.isAttached();
    try {
      if (attachedHere) debug.attach('1.3');
      const { data } = await debug.sendCommand('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale } });
      if (data) return `data:image/png;base64,${data}`;
    } catch { /* another debugger or an old protocol: take the plain capture */ } finally {
      if (attachedHere) { try { debug.detach(); } catch { /* already detached */ } }
    }
  }
  const dip = Object.fromEntries(Object.entries(rect).map(([k, v]) => [k, Math.round(v * zoom)]));
  return (await contents.capturePage(dip)).toDataURL();
}

// Whether the frame is on top at a point (CSS pixels): nothing of the app
// (a dialog, a menu, the toolbar) covers it there.
const frameOnTop = (contents, x, y) => contents.executeJavaScript(
  `document.elementFromPoint(${Math.round(x)}, ${Math.round(y)}) === document.querySelector('iframe[data-appblips-browser]')`,
);

export async function executeBrowserInput(window, args) {
  if (!window || window.isDestroyed()) throw new Error('Browser window is unavailable.');
  if (!args || typeof args.token !== 'string') throw new Error('Missing browser document token.');
  const contents = window.webContents;
  const frame = await contents.executeJavaScript(FRAME_GEOMETRY);
  if (!frame || frame.token !== args.token || frame.width < 1 || frame.height < 1) throw new Error('Browser document changed. Inspect it again.');
  // The page reports CSS pixels; the window's size and capturePage's
  // rectangle are device-independent pixels, which differ by the page zoom
  // (View menu). Mixing them at a zoom other than 100% shifted the capture
  // onto the app's own UI.
  const zoom = contents.getZoomFactor?.() || 1;
  const [width, height] = window.getContentSize().map((v) => v / zoom);
  if (args.action === 'screenshot') {
    // The centre and the four corners: a dialog over one edge is not a
    // frame to photograph either.
    const inset = 2;
    const points = [
      [frame.x + frame.width / 2, frame.y + frame.height / 2],
      [frame.x + inset, frame.y + inset], [frame.x + frame.width - inset, frame.y + inset],
      [frame.x + inset, frame.y + frame.height - inset], [frame.x + frame.width - inset, frame.y + frame.height - inset],
    ].filter(([px, py]) => px >= 0 && py >= 0 && px < width && py < height);
    for (const [px, py] of points) {
      if (!(await frameOnTop(contents, px, py))) throw new Error('Browser is covered by another part of the app.');
    }
    const x = Math.max(0, Math.ceil(frame.x));
    const y = Math.max(0, Math.ceil(frame.y));
    const rect = { x, y, width: Math.floor(Math.min(width, frame.x + frame.width) - x), height: Math.floor(Math.min(height, frame.y + frame.height) - y) };
    if (rect.width <= 0 || rect.height <= 0) throw new Error('Browser is outside the visible workspace.');
    return { dataUrl: await capturePreview(contents, rect, frame, args.viewportWidth, zoom), croppedToVisibleArea: true };
  }
  if (!['click', 'type', 'press'].includes(args.action)) throw new Error('Unsupported browser input.');
  if (![args.x, args.y].every(Number.isFinite) || args.x < 0 || args.x > 1 || args.y < 0 || args.y > 1) throw new Error('Browser coordinates must be inside the frame.');
  const x = Math.round(frame.x + args.x * frame.width);
  const y = Math.round(frame.y + args.y * frame.height);
  if (x < 0 || y < 0 || x >= width || y >= height) throw new Error('Target is outside the visible browser area.');
  if (!(await frameOnTop(contents, x, y))) throw new Error('Browser target is covered by another part of the app.');
  if (args.action === 'type' && (typeof args.text !== 'string' || args.text.length > 2000)) throw new Error('Text must be at most 2000 characters.');
  const keys = {
    Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
    Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
    ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  };
  if (args.action === 'press' && !Object.hasOwn(keys, args.key)) throw new Error('Unsupported browser key.');
  window.focus();
  // Use Chromium's input routing so events reach sandboxed child frames even
  // when they run in a separate renderer. Never expose general CDP commands.
  const attachedHere = !contents.debugger.isAttached();
  if (attachedHere) contents.debugger.attach('1.3');
  try {
    await contents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    if (args.action === 'click') {
      await contents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await contents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    } else {
      const current = await contents.executeJavaScript(FRAME_GEOMETRY);
      if (current?.token !== args.token || !current.focused) throw new Error('Browser lost focus or navigated.');
      if (args.action === 'type') {
        const select = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: process.platform === 'darwin' ? 4 : 2 };
        await contents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...select });
        await contents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...select });
        await contents.debugger.sendCommand('Input.insertText', { text: args.text });
      }
      else {
        const key = keys[args.key];
        await contents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...key, ...(args.key === 'Enter' ? { text: '\r' } : args.key === 'Space' ? { text: ' ' } : {}) });
        // Give a game's update loop a chance to observe the pressed key.
        await new Promise((resolve) => setTimeout(resolve, 100));
        await contents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
      }
    }
  } finally { if (attachedHere && contents.debugger.isAttached()) contents.debugger.detach(); }
  return { success: true, inputMode: 'native browser input' };
}
