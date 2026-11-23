import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ArrowUpToLine, ArrowDownToLine, ArrowLeft, Sparkles, Upload, Loader2, Wand2, Link2, Type, Check, AlertTriangle,
  ArrowUp, ArrowDown, CopyPlus, Trash2, ExternalLink, MessageSquarePlus, Captions, Lock, Unlock, Images, ChevronRight,
  ArrowUpDown, Scaling, Image as ImageIcon,
} from 'lucide-react';
import { compressImageDataUrl } from '../lib/attachments';
import { galleryPath } from '../lib/galleryImages';
import useGalleryThumbnails from '../hooks/useGalleryThumbnails';
import Modal, { ModalCloseButton } from './Modal';
import PhoneTools from './PhoneTools';
import { useCompactLayout, usePreviewPaneRef } from '../hooks/usePhoneTools';
import { logError } from '../lib/errorLog';
import { ELEMENT_SHORTCUT_HINTS, elementShortcutAction } from '../lib/shortcuts';

// Contextual toolbar for the Website Studio's click-to-edit mode. It docks
// under the preview toolbar (PreviewPane owns the dock, so the bar slides in
// once and stays put while the selection changes) and speaks the same
// language as the bars above it: segmented tracks, ghost keys, one filled
// key. Text is edited IN PLACE on the page (the bridge's contentEditable
// session -- see src/previewBridge.js), so this bar owns everything else:
// image URL / My images picker / upload, in-context alt text, link/button
// label + URL (with page/section suggestions and a new-tab toggle), fill
// color (sections, buttons, links) / wallpaper, hierarchy navigation
// (select-parent, select-child, breadcrumbs), and the structure keys (move,
// duplicate, delete -- also Alt+arrows, Mod+D, Del).

const PAGE_ROOT_TAGS = new Set(['html', 'head', 'body']);

const ROLE_LABELS = {
  text: 'Text',
  heading: 'Heading',
  button: 'Button',
  link: 'Link',
  image: 'Image',
  container: 'Section',
};

// The thumbnail renders in the app's own (privileged) page, so only load
// image URLs that can't do anything but show a picture.
const safeThumbSrc = (value) => {
  const url = String(value || '').trim();
  return /^(https?:|blob:|data:image\/)/i.test(url) ? url : '';
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Failed to read the image file.'));
  reader.readAsDataURL(file);
});

const rgbToHex = (rgb) => {
  if (!rgb || typeof rgb !== 'string') return null;
  const m = rgb.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
  const hex = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
};

const buildDraftSummary = ({ element, labelText, href, newTab, initialNewTab, src, alt, bgColor, currentBgHex }) => {
  const parts = [];
  const draftText = element?.draftText ?? (labelText !== undefined ? labelText : null);
  if (typeof draftText === 'string' && draftText.trim() && draftText.trim() !== (element?.text || '').trim()) {
    parts.push(`change text to "${draftText.trim()}"`);
  }
  if (typeof href === 'string' && href.trim() && href.trim() !== (element?.attributes?.href || '')) {
    parts.push(`set link URL to "${href.trim()}"${newTab !== initialNewTab ? (newTab ? ' (open in new tab)' : ' (open in same tab)') : ''}`);
  }
  if (typeof src === 'string' && src.trim() && src.trim() !== (element?.attributes?.src || '') && !src.startsWith('data:')) {
    parts.push(`replace image with "${src.trim()}"`);
  }
  if (typeof alt === 'string' && alt.trim() !== (element?.attributes?.alt || '')) {
    parts.push(`set alt text to "${alt.trim()}"`);
  }
  if (typeof bgColor === 'string' && currentBgHex && bgColor.toLowerCase() !== currentBgHex.toLowerCase()) {
    parts.push(`set background color to ${bgColor}`);
  }
  return parts.length ? `Please ${parts.join(', ')}.` : '';
};

export default function ElementToolbar({
  element,
  isApplying = false,
  error = null,
  onApply,
  onAction,
  linkTargets = [],
  onEditWithAI,
  onCancel,
  onSelectParent,
  onSelectChild = null,
  onStartInlineEdit = null,
  galleryImages = [],
  galleryBytesVersion = 0,
  onUploadGalleryImage = null,
  // The preview pane is too narrow for the floating dock: use the phone layout.
  forceCompact = false,
}) {
  const role = element.role || 'container';
  const isImage = role === 'image';
  const isContainer = role === 'container';
  const isClickable = role === 'link' || role === 'button';
  const isTextRole = !isImage && !isContainer;
  // Both <a> links and <button> elements support editing their label + destination in place.
  const showLink = role === 'link' || role === 'button';
  const showBackground = isContainer || isClickable || Boolean(element.backgroundImage);
  const showWallpaper = showBackground && !isClickable;
  const hasEditableFields = isImage || showLink || showBackground;
  const canRestructure = Boolean(onAction) && !PAGE_ROOT_TAGS.has(element.tag);

  const [src, setSrc] = useState(element.attributes?.src || '');
  const [alt, setAlt] = useState(element.attributes?.alt || '');
  const [altOpen, setAltOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [altDraft, setAltDraft] = useState('');
  const [labelText, setLabelText] = useState(element.draftText ?? element.text ?? '');
  const [href, setHref] = useState(element.attributes?.href || '');
  const initialNewTab = element.attributes?.target === '_blank';
  const [newTab, setNewTab] = useState(initialNewTab);
  const linkListId = useId();
  const currentBgHex = rgbToHex(element.backgroundColor) || '#ffffff';
  const [bgColor, setBgColor] = useState(currentBgHex);
  const [bgImage, setBgImage] = useState('');
  const [pendingGalleryList, setPendingGalleryList] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Natural size of an uploaded replacement, and whether to resize to it.
  const [uploadedSize, setUploadedSize] = useState(null);
  const [fitToImage, setFitToImage] = useState(false);
  const initialBoxW = element.boundingBox?.width > 0 ? Math.round(element.boundingBox.width) : null;
  const initialBoxH = element.boundingBox?.height > 0 ? Math.round(element.boundingBox.height) : null;
  const [imgWidth, setImgWidth] = useState(initialBoxW ? String(initialBoxW) : '');
  const [imgHeight, setImgHeight] = useState(initialBoxH ? String(initialBoxH) : '');
  const [lockAspect, setLockAspect] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(
    initialBoxW && initialBoxH ? initialBoxW / initialBoxH : null,
  );
  const [prevResizeSeq, setPrevResizeSeq] = useState(element.resizeSeq || 0);
  if ((element.resizeSeq || 0) !== prevResizeSeq) {
    setPrevResizeSeq(element.resizeSeq || 0);
    setImgWidth(initialBoxW ? String(initialBoxW) : '');
    setImgHeight(initialBoxH ? String(initialBoxH) : '');
    if (initialBoxW && initialBoxH) setAspectRatio(initialBoxW / initialBoxH);
  }
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const initialDraftSummary = buildDraftSummary({
    element,
    labelText: element.draftText ?? element.text ?? '',
    href: element.attributes?.href || '',
    newTab: initialNewTab,
    initialNewTab,
    src: element.attributes?.src || '',
    alt: element.attributes?.alt || '',
    bgColor: currentBgHex,
    currentBgHex,
  });
  // A failed in-place apply opens the bar with the error already set -- skip
  // straight to the AI input with the preserved draft prefilled.
  const [showAiInput, setShowAiInput] = useState(Boolean(error));
  const [aiInstruction, setAiInstruction] = useState(initialDraftSummary);
  const [prevError, setPrevError] = useState(error);
  if (error !== prevError) {
    setPrevError(error);
    if (error) {
      setShowAiInput(true);
      if (!aiInstruction.trim()) {
        const draft = buildDraftSummary({
          element, labelText, href, newTab, initialNewTab, src, alt, bgColor, currentBgHex,
        });
        if (draft) setAiInstruction(draft);
      }
    }
  }

  const imageFileRef = useRef(null);
  const bgFileRef = useRef(null);
  const galleryPopRef = useRef(null);
  // Phone layout: one top row plus labelled tools at the bottom of the pane
  // (PhoneTools). `sheet` is the open tool; Ask AI is showAiInput, as on the
  // wide bar, so a failed apply still lands on it.
  const compact = useCompactLayout() || forceCompact;
  const [sheet, setSheet] = useState(null);
  const [setPhoneRoot, pane] = usePreviewPaneRef(null);
  const thumbs = useGalleryThumbnails(isImage ? galleryImages : [], galleryBytesVersion);

  useLayoutEffect(() => {
    if (!galleryOpen) return undefined;
    const updatePosition = () => {
      const pop = galleryPopRef.current;
      const anchor = pop?.parentElement;
      if (!pop || !anchor) return;
      const anchorRect = anchor.getBoundingClientRect();
      const popWidth = pop.offsetWidth || 260;
      const vw = window.innerWidth || document.documentElement.clientWidth || 800;
      let dx = 0;
      if (anchorRect.left + popWidth > vw - 8) {
        dx = (vw - 8) - (anchorRect.left + popWidth);
      }
      if (anchorRect.left + dx < 8) {
        dx = 8 - anchorRect.left;
      }
      pop.style.left = `${Math.round(dx)}px`;
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [galleryOpen]);

  useEffect(() => {
    if (!galleryOpen) return undefined;
    const dismiss = (e) => {
      if (e.type === 'keydown') {
        if (e.key === 'Escape') { setGalleryOpen(false); e.stopPropagation(); }
      } else if (galleryPopRef.current && !galleryPopRef.current.parentElement?.contains(e.target)) {
        setGalleryOpen(false);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss, true);
    };
  }, [galleryOpen]);

  const resolveThumbUrl = (rawValue) => {
    const direct = safeThumbSrc(rawValue);
    if (direct) return direct;
    const trimmed = String(rawValue || '').trim();
    if (trimmed.startsWith('images/') && galleryImages.length) {
      const found = galleryImages.find((img) => galleryPath(img) === trimmed);
      if (found) return thumbs[found.hash] || '';
    }
    return '';
  };

  const handleSelectGalleryImage = (img) => {
    if (!img) return;
    const nextSrc = galleryPath(img);
    setSrc(nextSrc);
    if (img.width && img.height) {
      setUploadedSize({ width: img.width, height: img.height });
    }
    if (!alt.trim() || alt.trim() === (element.attributes?.alt || '').trim()) {
      const inferredAlt = String(img.name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
      if (inferredAlt && !alt.trim()) setAlt(inferredAlt);
    }
    setGalleryOpen(false);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setUploadError(null);
    if (!file.type?.startsWith('image/')) {
      setUploadError('Please choose an image file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Image must be smaller than 8MB.');
      return;
    }
    try {
      setIsUploading(true);
      if (isImage && typeof onUploadGalleryImage === 'function') {
        const { images, errors, list } = await onUploadGalleryImage([file]);
        const added = images?.[0];
        if (!added) {
          setUploadError(errors?.[0] || `${file.name} couldn't be added.`);
          return;
        }
        setSrc(galleryPath(added));
        setPendingGalleryList(list || null);
        if (added.width && added.height) {
          setUploadedSize({ width: added.width, height: added.height });
        }
        if (!alt.trim()) {
          const inferredAlt = String(added.name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
          if (inferredAlt) setAlt(inferredAlt);
        }
        setGalleryOpen(false);
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      const compressed = await compressImageDataUrl(dataUrl);
      if (isImage) {
        setSrc(compressed);
        const size = await new Promise((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
          probe.onerror = () => resolve(null);
          probe.src = compressed;
        });
        setUploadedSize(size);
      } else {
        setBgImage(compressed);
      }
    } catch (err) {
      logError(`Could not process image ${file.name} (${file.size} bytes)`, err);
      setUploadError(err?.message || 'Failed to process the image.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleWidthChange = (raw) => {
    const clean = raw.replace(/[^\d]/g, '').slice(0, 4);
    setImgWidth(clean);
    if (fitToImage) setFitToImage(false);
    const n = parseInt(clean, 10);
    if (lockAspect && aspectRatio && n > 0) {
      setImgHeight(String(Math.max(1, Math.round(n / aspectRatio))));
    }
  };

  const handleHeightChange = (raw) => {
    const clean = raw.replace(/[^\d]/g, '').slice(0, 4);
    setImgHeight(clean);
    if (fitToImage) setFitToImage(false);
    const n = parseInt(clean, 10);
    if (lockAspect && aspectRatio && n > 0) {
      setImgWidth(String(Math.max(1, Math.round(n * aspectRatio))));
    }
  };

  const toggleLockAspect = () => {
    setLockAspect((wasLocked) => {
      if (!wasLocked) {
        const w = parseInt(imgWidth, 10);
        const h = parseInt(imgHeight, 10);
        if (w > 0 && h > 0) setAspectRatio(w / h);
      }
      return !wasLocked;
    });
  };

  const handleApply = () => {
    const changes = {};
    if (isImage) {
      if (src.trim() && src.trim() !== (element.attributes?.src || '')) changes.src = src.trim();
      if (changes.src && fitToImage && uploadedSize) changes.fitImage = uploadedSize;
      else {
        const w = parseInt(imgWidth, 10);
        const h = parseInt(imgHeight, 10);
        const wChanged = Number.isFinite(w) && w > 0 && w !== initialBoxW;
        const hChanged = Number.isFinite(h) && h > 0 && h !== initialBoxH;
        if (wChanged || hChanged) {
          changes.imageSize = {};
          if (w > 0 && (wChanged || (hChanged && initialBoxW))) changes.imageSize.width = w;
          if (h > 0 && (hChanged || (wChanged && initialBoxH))) changes.imageSize.height = h;
        }
      }
      if (alt.trim() !== (element.attributes?.alt || '')) changes.alt = alt.trim();
    }
    if (showLink) {
      const nextLabel = labelText.trim();
      if (nextLabel && nextLabel !== (element.text || '').trim()) {
        changes.text = nextLabel;
      }
      const origHref = element.attributes?.href || '';
      if (href.trim() !== origHref) {
        changes.href = href.trim() || null;
      }
      if (newTab !== initialNewTab && (href.trim() || origHref)) {
        changes.target = newTab ? '_blank' : null;
      }
    }
    if (showBackground) {
      if (bgColor.toLowerCase() !== currentBgHex.toLowerCase()) changes.backgroundColor = bgColor;
      if (bgImage) changes.backgroundImage = bgImage;
    }
    const saveExtra = pendingGalleryList ? { imagesToSave: pendingGalleryList } : {};
    onApply(changes, saveExtra);
  };

  // Apply runs the edit now; Add to chat only prefills the prompt box.
  const handleAiSend = (run) => {
    onEditWithAI(aiInstruction, { run });
  };

  const submitOnEnter = (fn) => (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      fn();
    }
  };

  const busy = isApplying || isUploading;
  const message = error || uploadError;
  const currentDraftSummary = buildDraftSummary({
    element, labelText, href, newTab, initialNewTab, src, alt, bgColor, currentBgHex,
  });
  const displayChip = element.displayLabel || ROLE_LABELS[role] || 'Element';
  const visibleAncestors = Array.isArray(element.ancestors) ? element.ancestors.slice(-2) : [];
  const nextChildCrumb = Array.isArray(element.childStack) && element.childStack.length > 0
    ? element.childStack[0]
    : null;
  const showBreadcrumbs = visibleAncestors.length > 0 || Boolean(nextChildCrumb);
  const thumbUrl = isImage ? resolveThumbUrl(src || element.attributes?.src) : '';

  const fileInput = (ref) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        handleFile(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  const uploadButton = (ref, label, tip) => (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      disabled={busy}
      className="nav-btn nav-btn-secondary element-bar-btn element-bar-btn-collapsible"
      aria-label={label}
      data-tip={tip}
    >
      {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
      <span>{label}</span>
    </button>
  );

  const galleryBody = (
    <>
      <div className="element-bar-pop-heading">
        My images {galleryImages.length ? `(${galleryImages.length})` : ''}
      </div>
      {galleryImages.length === 0 ? (
        <div className="element-bar-gallery-empty">
          <p>No images in this project yet.</p>
          <button
            type="button"
            onClick={() => imageFileRef.current?.click()}
            className="nav-btn nav-btn-secondary element-bar-btn w-full justify-center"
          >
            <Upload size={14} />
            <span>Upload image</span>
          </button>
        </div>
      ) : (
        <div className="element-bar-gallery-grid" role="listbox" aria-label="Project images">
          {galleryImages.map((img) => {
            const path = galleryPath(img);
            const isSelected = src.trim() === path;
            const thumb = thumbs[img.hash];
            return (
              <button
                key={img.hash || path}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelectGalleryImage(img)}
                className={`element-bar-gallery-item ${isSelected ? 'element-bar-gallery-item-active' : ''}`}
                title={`${img.name} (${path})`}
              >
                {thumb ? (
                  <img src={thumb} alt={img.name} className="element-bar-gallery-thumb" />
                ) : (
                  <span className="element-bar-gallery-thumb element-bar-gallery-placeholder" />
                )}
                <span className="element-bar-gallery-name">{img.name}</span>
                {isSelected && <Check size={13} className="shrink-0 text-blue-600" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  const structureKey = (action, Icon, label, disabled, extraClass = '', tipSuffix = '') => (
    <button
      type="button"
      onClick={() => onAction(action)}
      disabled={busy || disabled}
      className={`nav-btn nav-ghost nav-btn-icon element-bar-btn-icon ${extraClass} disabled:opacity-40 disabled:cursor-not-allowed`}
      aria-label={label}
      aria-keyshortcuts={action === 'delete' ? 'Delete' : undefined}
      data-tip={`${label} (${ELEMENT_SHORTCUT_HINTS[action]})${tipSuffix ? `, ${tipSuffix}` : ''}`}
      data-tip-align="end"
    >
      <Icon size={16} />
    </button>
  );

  const openAi = () => {
    if (!aiInstruction.trim() && currentDraftSummary) setAiInstruction(currentDraftSummary);
    setShowAiInput(true);
  };

  if (compact) {
    const canEditText = isTextRole && onStartInlineEdit && element.text;
    const phoneActive = showAiInput ? 'ai' : sheet;
    const togglePhone = (id) => {
      if (id === 'ai') {
        if (showAiInput) setShowAiInput(false);
        else { setSheet(null); openAi(); }
        return;
      }
      setShowAiInput(false);
      setSheet(phoneActive === id ? null : id);
    };
    const phoneTabs = [
      ...(canEditText ? [{ id: 'text', label: 'Text', title: 'Edit text', icon: <Type size={19} />, onSelect: onStartInlineEdit }] : []),
      ...(isImage ? [
        { id: 'image', label: 'Image', title: 'Image', icon: <ImageIcon size={19} /> },
        { id: 'size', label: 'Size', title: 'Image size', detail: imgWidth && imgHeight ? `${imgWidth} × ${imgHeight}` : undefined, icon: <Scaling size={19} /> },
        { id: 'alt', label: 'Alt text', title: 'Alt text', icon: <Captions size={19} /> },
      ] : []),
      ...(showLink ? [{ id: 'link', label: 'Link', title: 'Link', icon: <Link2 size={19} /> }] : []),
      ...(showBackground ? [{ id: 'fill', label: 'Fill', title: 'Fill color', detail: bgColor, icon: <span className="phone-tools-icon-color" style={{ background: bgColor }} /> }] : []),
      ...(showWallpaper ? [{ id: 'wallpaper', label: 'Wallpaper', title: 'Wallpaper', icon: <Images size={19} /> }] : []),
      ...(canRestructure ? [{ id: 'arrange', label: 'Arrange', title: 'Arrange', icon: <ArrowUpDown size={19} /> }] : []),
      { id: 'ai', label: 'Ask AI', title: 'Ask AI', icon: <Wand2 size={19} /> },
    ];

    const phoneSheet = () => {
      if (phoneActive === 'ai') {
        return (
          <div className="phone-form">
            {message && <p className="phone-tools-message phone-tools-message-inline" role="alert">{message}</p>}
            <label className="phone-field">
              <span>What should change?</span>
              <textarea
                rows={2}
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder={`e.g. "make this ${(ROLE_LABELS[role] || 'element').toLowerCase()} stand out more"`}
                className="element-bar-input phone-input phone-textarea"
              />
            </label>
            <div className="phone-row">
              <button type="button" onClick={() => handleAiSend(false)} className="nav-btn nav-ghost element-bar-btn phone-row-btn">
                <MessageSquarePlus size={15} />
                <span>Add to chat</span>
              </button>
              <button
                type="button"
                onClick={() => handleAiSend(true)}
                disabled={!aiInstruction.trim()}
                className="nav-btn brand-fill-text preview-key bg-brand hover:bg-brand-hover text-white border border-transparent shadow-2xs disabled:opacity-50 phone-row-btn"
              >
                <Sparkles size={15} />
                <span>Apply with AI</span>
              </button>
            </div>
          </div>
        );
      }
      if (phoneActive === 'image') {
        return (
          <div className="phone-form">
            <div className="phone-row">
              {thumbUrl && <img src={thumbUrl} alt="" className="element-bar-thumb phone-thumb" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
              {fileInput(imageFileRef)}
              <button type="button" onClick={() => imageFileRef.current?.click()} disabled={busy} className="nav-btn nav-btn-secondary element-bar-btn phone-row-btn">
                {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span>Upload from device</span>
              </button>
            </div>
            {galleryImages.length > 0 && <div className="phone-gallery">{galleryBody}</div>}
            <label className="phone-field">
              <span>Or paste an image address</span>
              <input
                type="url"
                value={src.startsWith('data:') ? '' : src}
                placeholder={src.startsWith('data:') ? 'Uploaded image' : 'https://…'}
                onChange={(e) => setSrc(e.target.value)}
                onKeyDown={submitOnEnter(handleApply)}
                className="element-bar-input phone-input"
                disabled={busy}
              />
            </label>
            {uploadedSize && (
              <label className="phone-switch">
                <span>Fit size to the new image</span>
                <input type="checkbox" checked={fitToImage} onChange={(e) => setFitToImage(e.target.checked)} disabled={busy} />
              </label>
            )}
          </div>
        );
      }
      if (phoneActive === 'size') {
        return (
          <div className="phone-form">
            <div className="phone-row phone-dims">
              <label className="phone-field">
                <span>Width (px)</span>
                <input type="text" inputMode="numeric" value={imgWidth} onChange={(e) => handleWidthChange(e.target.value)} onKeyDown={submitOnEnter(handleApply)} className="element-bar-input phone-input" disabled={busy || fitToImage} />
              </label>
              <button
                type="button"
                onClick={toggleLockAspect}
                aria-pressed={lockAspect}
                aria-label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon element-bar-toggle phone-lock"
                disabled={busy || fitToImage}
              >
                {lockAspect ? <Lock size={16} /> : <Unlock size={16} />}
              </button>
              <label className="phone-field">
                <span>Height (px)</span>
                <input type="text" inputMode="numeric" value={imgHeight} onChange={(e) => handleHeightChange(e.target.value)} onKeyDown={submitOnEnter(handleApply)} className="element-bar-input phone-input" disabled={busy || fitToImage} />
              </label>
            </div>
            <p className="phone-hint">{lockAspect ? 'Locked: changing one side keeps the proportions.' : 'Unlocked: each side changes on its own.'}</p>
          </div>
        );
      }
      if (phoneActive === 'alt') {
        return (
          <div className="phone-form">
            <label className="phone-field">
              <span>Describe the image</span>
              <textarea
                rows={2}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="e.g. Fresh loaves cooling on a rack"
                className="element-bar-input phone-input phone-textarea"
                disabled={busy}
              />
            </label>
            <p className="phone-hint">Read out by screen readers, and shown if the image can&apos;t load.</p>
          </div>
        );
      }
      if (phoneActive === 'link') {
        return (
          <div className="phone-form">
            <label className="phone-field">
              <span>Goes to</span>
              <input
                type="text"
                inputMode="url"
                value={href}
                onChange={(e) => setHref(e.target.value)}
                onKeyDown={submitOnEnter(handleApply)}
                placeholder={linkTargets.length ? 'A page, #section or https://…' : 'https://…'}
                list={linkTargets.length ? linkListId : undefined}
                className="element-bar-input phone-input"
                disabled={isApplying}
              />
              {linkTargets.length > 0 && (
                <datalist id={linkListId}>
                  {linkTargets.map((t) => <option key={t.value} value={t.value} label={t.label} />)}
                </datalist>
              )}
            </label>
            <label className="phone-switch">
              <span>Open in a new tab</span>
              <input type="checkbox" checked={newTab} onChange={(e) => setNewTab(e.target.checked)} disabled={isApplying} />
            </label>
          </div>
        );
      }
      if (phoneActive === 'fill') {
        return (
          <div className="phone-form">
            <div className="phone-row">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(bgColor) ? bgColor : '#ffffff'}
                onChange={(e) => setBgColor(e.target.value)}
                disabled={isApplying}
                className="element-bar-swatch phone-swatch"
                aria-label="Pick a fill color"
              />
              <label className="phone-field phone-grow">
                <span>Color code</span>
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)}
                  onKeyDown={submitOnEnter(handleApply)}
                  spellCheck={false}
                  className="element-bar-input phone-input element-bar-hex"
                  disabled={isApplying}
                />
              </label>
            </div>
          </div>
        );
      }
      if (phoneActive === 'wallpaper') {
        return (
          <div className="phone-form">
            <div className="phone-row">
              {fileInput(bgFileRef)}
              <button type="button" onClick={() => bgFileRef.current?.click()} disabled={busy} className="nav-btn nav-btn-secondary element-bar-btn phone-row-btn">
                {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span>{bgImage || element.backgroundImage ? 'Replace background image' : 'Upload background image'}</span>
              </button>
            </div>
            {bgImage && (
              <span className="element-bar-ready">
                <img src={bgImage} alt="" className="element-bar-thumb element-bar-thumb-sm" />
                <Check size={13} aria-hidden="true" />
                Ready, tap Apply
                <button type="button" onClick={() => setBgImage('')} className="element-bar-ready-clear" aria-label="Discard uploaded wallpaper">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        );
      }
      if (phoneActive === 'arrange') {
        const tile = (action, Icon, label, disabled, danger = false) => (
          <button
            type="button"
            className={`phone-tools-tile ${danger ? 'phone-tools-tile-danger' : ''}`}
            onClick={() => onAction(action)}
            disabled={busy || disabled}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
        return (
          <div className="phone-tools-tiles">
            {tile('move-up', ArrowUp, 'Move up', !element.prevSibling)}
            {tile('move-down', ArrowDown, 'Move down', !element.nextSibling)}
            {tile('duplicate', CopyPlus, 'Duplicate', false)}
            {tile('delete', Trash2, 'Delete', false, true)}
          </div>
        );
      }
      return null;
    };

    return (
      <div
        ref={setPhoneRoot}
        className="element-bar element-bar-compact"
        role="toolbar"
        aria-label={`Edit selected ${ROLE_LABELS[role] || 'element'}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            if (phoneActive) togglePhone(phoneActive);
            else onCancel();
          }
        }}
      >
        <div className="element-bar-id">
          <span className="element-bar-chip" title={`Selected <${element.tag}>`}>{displayChip}</span>
          {element.parentSelectable && onSelectParent && (
            <button type="button" onClick={() => onSelectParent(1)} className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon" aria-label="Select parent element">
              <ArrowUpToLine size={16} />
            </button>
          )}
          {element.childSelectable && onSelectChild && (
            <button type="button" onClick={() => onSelectChild(1)} className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon" aria-label="Select child element">
              <ArrowDownToLine size={16} />
            </button>
          )}
        </div>
        <div className="element-bar-actions">
          {hasEditableFields && (
            <button
              type="button"
              onClick={handleApply}
              disabled={busy}
              className="nav-btn brand-fill-text preview-key bg-brand hover:bg-brand-hover text-white border border-transparent shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApplying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              <span>{isApplying ? 'Applying…' : 'Apply'}</span>
            </button>
          )}
          <button type="button" onClick={onCancel} className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon" aria-label="Close editor">
            <X size={16} />
          </button>
        </div>
        <PhoneTools
          pane={pane}
          tabs={phoneTabs}
          active={phoneActive}
          onToggle={togglePhone}
          ariaLabel={`${ROLE_LABELS[role] || 'Element'} tools`}
          message={message}
        >
          {phoneSheet()}
        </PhoneTools>
      </div>
    );
  }

  return (
    <div
      className="element-bar"
      role="toolbar"
      aria-label={`Edit selected ${ROLE_LABELS[role] || 'element'}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          if (galleryOpen) {
            setGalleryOpen(false);
            e.stopPropagation();
            return;
          }
          onCancel();
          return;
        }
        const action = canRestructure && !busy ? elementShortcutAction(e.nativeEvent) : null;
        if (action) {
          e.preventDefault();
          onAction(action);
        }
      }}
    >
      {/* Selection identity & nested hierarchy navigation */}
      <div className="element-bar-id">
        <span className="element-bar-chip" title={`Selected <${element.tag}>`}>
          {displayChip}
        </span>
        {element.parentSelectable && onSelectParent && (
          <button
            type="button"
            onClick={() => onSelectParent(1)}
            className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon"
            aria-label="Select parent element"
            data-tip={`Select parent (${element.parentTag ? `<${element.parentTag}>` : 'container'})`}
          >
            <ArrowUpToLine size={16} />
          </button>
        )}
        {element.childSelectable && onSelectChild && (
          <button
            type="button"
            onClick={() => onSelectChild(1)}
            className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon"
            aria-label="Select child element"
            data-tip={`Return to child (${nextChildCrumb?.label || 'child'})`}
          >
            <ArrowDownToLine size={16} />
          </button>
        )}
        {showBreadcrumbs && (
          <nav className="element-bar-breadcrumbs" aria-label="Element hierarchy">
            {visibleAncestors.map((anc) => (
              <span key={`anc-${anc.stepsUp}`} className="element-bar-crumb-wrap">
                <button
                  type="button"
                  onClick={() => onSelectParent?.(anc.stepsUp)}
                  className="element-bar-crumb"
                  title={`Select ${anc.label} (<${anc.tag}>)`}
                >
                  {anc.label}
                </button>
                <ChevronRight size={11} className="element-bar-crumb-sep" aria-hidden="true" />
              </span>
            ))}
            <span className="element-bar-crumb element-bar-crumb-current" aria-current="true">
              {displayChip}
            </span>
            {nextChildCrumb && (
              <span className="element-bar-crumb-wrap">
                <ChevronRight size={11} className="element-bar-crumb-sep" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onSelectChild?.(1)}
                  className="element-bar-crumb element-bar-crumb-child"
                  title={`Return to ${nextChildCrumb.label} (<${nextChildCrumb.tag}>)`}
                >
                  {nextChildCrumb.label}
                </button>
              </span>
            )}
          </nav>
        )}
      </div>
      <span className="chrome-divider element-bar-divider" aria-hidden="true" />

      {/* What you can change */}
      <div className="element-bar-body">
        {showAiInput ? (
          <>
            {message && (
              <p className="element-bar-message" title={message}>
                <AlertTriangle size={14} className="shrink-0" />
                <span>{message}</span>
              </p>
            )}
            {element.draftText && element.draftText !== element.text && (
              <span className="element-bar-draft-badge" title={`Preserved draft: "${element.draftText}"`}>
                Draft saved: “{element.draftText.slice(0, 48)}{element.draftText.length > 48 ? '…' : ''}”
              </span>
            )}
            <input
              type="text"
              autoFocus
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              onKeyDown={submitOnEnter(() => handleAiSend(Boolean(aiInstruction.trim())))}
              placeholder='Describe the change, e.g. "make this section darker with a subtle gradient"'
              aria-label="Describe the change for AI"
              className="element-bar-input element-bar-grow"
            />
          </>
        ) : (
          <>
            {isImage && (
              <>
                {thumbUrl && (
                  <img
                    src={thumbUrl}
                    alt=""
                    className="element-bar-thumb"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                {/* The web address lives in a modal (below) so the bar stays one
                    compact row; the thumbnail shows which image is set. */}
                <button
                  type="button"
                  onClick={() => { setUrlDraft(src.startsWith('data:') ? '' : src); setUrlOpen(true); }}
                  disabled={busy}
                  aria-label="Image URL"
                  data-tip="Use an image from a web address"
                  className="nav-btn nav-btn-secondary element-bar-btn element-bar-btn-collapsible"
                >
                  <Link2 size={14} />
                  <span>Image URL</span>
                </button>
                <div className="element-bar-anchor">
                  <button
                    type="button"
                    onClick={() => setGalleryOpen((o) => !o)}
                    disabled={busy}
                    aria-haspopup="dialog"
                    aria-expanded={galleryOpen}
                    aria-label="Choose from My images"
                    data-tip={galleryOpen ? undefined : 'Pick from your project images (My images)'}
                    className="nav-btn nav-btn-secondary element-bar-btn element-bar-btn-collapsible"
                  >
                    <Images size={14} />
                    <span>My images{galleryImages.length ? ` (${galleryImages.length})` : ''}</span>
                  </button>
                  {galleryOpen && (
                    <div
                      ref={galleryPopRef}
                      className="element-bar-pop element-bar-pop-gallery"
                      role="dialog"
                      aria-label="My images"
                    >
                      {galleryBody}
                    </div>
                  )}
                </div>
                {fileInput(imageFileRef)}
                {uploadButton(imageFileRef, 'Upload', 'Upload an image from your computer')}
                <input
                  type="text"
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                  onKeyDown={submitOnEnter(handleApply)}
                  placeholder="Alt text (describes image)"
                  aria-label="Alt text"
                  className="element-bar-input element-bar-alt-input"
                  disabled={busy}
                />
                <div className="element-bar-dims" role="group" aria-label="Image dimensions">
                  <label className="element-bar-dim" data-tip="Image width in pixels">
                    <span className="element-bar-dim-tag">W</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={imgWidth}
                      onChange={(e) => handleWidthChange(e.target.value)}
                      onKeyDown={submitOnEnter(handleApply)}
                      aria-label="Image width"
                      className="element-bar-input element-bar-dim-input"
                      disabled={busy || fitToImage}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={toggleLockAspect}
                    aria-pressed={lockAspect}
                    aria-label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                    data-tip={lockAspect ? 'Aspect ratio locked (proportional)' : 'Aspect ratio unlocked'}
                    className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon element-bar-toggle"
                    disabled={busy || fitToImage}
                  >
                    {lockAspect ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                  <label className="element-bar-dim" data-tip="Image height in pixels">
                    <span className="element-bar-dim-tag">H</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={imgHeight}
                      onChange={(e) => handleHeightChange(e.target.value)}
                      onKeyDown={submitOnEnter(handleApply)}
                      aria-label="Image height"
                      className="element-bar-input element-bar-dim-input"
                      disabled={busy || fitToImage}
                    />
                  </label>
                </div>
                {uploadedSize && (
                  <label className="element-bar-field" data-tip="Keep the width, and change the height to match the new image's proportions">
                    <input
                      type="checkbox"
                      checked={fitToImage}
                      onChange={(e) => setFitToImage(e.target.checked)}
                      disabled={busy}
                    />
                    <span>Fit size to image</span>
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => { setAltDraft(alt); setAltOpen(true); }}
                  disabled={isApplying}
                  className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon"
                  aria-label={alt.trim() ? 'Edit alt text' : 'Set alt text'}
                  data-tip={alt.trim() ? `Alt text: ${alt.trim()}` : 'Set alt text (describes the image for screen readers)'}
                >
                  <Captions size={16} />
                </button>
              </>
            )}

            {showLink && (
              <>
                <label className="element-bar-field element-bar-label-field">
                  <Type size={14} className="element-bar-field-icon" aria-hidden="true" />
                  <input
                    type="text"
                    value={labelText}
                    onChange={(e) => setLabelText(e.target.value)}
                    onKeyDown={submitOnEnter(handleApply)}
                    placeholder={role === 'button' ? 'Button label' : 'Link label'}
                    aria-label={role === 'button' ? 'Button label' : 'Link label'}
                    className="element-bar-input element-bar-input-icon"
                    disabled={isApplying}
                  />
                </label>
                <label className="element-bar-field element-bar-grow">
                  <Link2 size={15} className="element-bar-field-icon" aria-hidden="true" />
                  <input
                    type="text"
                    value={href}
                    onChange={(e) => setHref(e.target.value)}
                    onKeyDown={submitOnEnter(handleApply)}
                    placeholder={linkTargets.length ? 'Link URL, page or #section' : 'Link URL  https://…'}
                    aria-label="Link URL"
                    list={linkTargets.length ? linkListId : undefined}
                    className="element-bar-input element-bar-input-icon"
                    disabled={isApplying}
                  />
                  {linkTargets.length > 0 && (
                    <datalist id={linkListId}>
                      {linkTargets.map((t) => <option key={t.value} value={t.value} label={t.label} />)}
                    </datalist>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setNewTab((on) => !on)}
                  aria-pressed={newTab}
                  aria-label="Open link in a new tab"
                  className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon element-bar-toggle"
                  data-tip={newTab ? 'Opens in a new tab' : 'Opens in the same tab'}
                  disabled={isApplying}
                >
                  <ExternalLink size={16} />
                </button>
              </>
            )}

            {showBackground && (
              <>
                <span className="element-bar-label">Fill</span>
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(bgColor) ? bgColor : '#ffffff'}
                  onChange={(e) => setBgColor(e.target.value)}
                  disabled={isApplying}
                  className="element-bar-swatch"
                  aria-label="Pick background color"
                  title="Pick a background color"
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => {
                    const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                    setBgColor(v);
                  }}
                  onKeyDown={submitOnEnter(handleApply)}
                  aria-label="Background color hex"
                  spellCheck={false}
                  className="element-bar-input element-bar-hex"
                  disabled={isApplying}
                />
              </>
            )}

            {showWallpaper && (
              <>
                <span className="chrome-divider element-bar-divider" aria-hidden="true" />
                <span className="element-bar-label">Wallpaper</span>
                {fileInput(bgFileRef)}
                {uploadButton(
                  bgFileRef,
                  bgImage ? 'Change' : 'Upload',
                  element.backgroundImage && !bgImage
                    ? 'Replace this background image'
                    : 'Set a background image from your computer',
                )}
                {bgImage && (
                  <span className="element-bar-ready">
                    <img src={bgImage} alt="" className="element-bar-thumb element-bar-thumb-sm" />
                    <Check size={13} aria-hidden="true" />
                    Ready
                    <button
                      type="button"
                      onClick={() => setBgImage('')}
                      className="element-bar-ready-clear"
                      aria-label="Discard uploaded wallpaper"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
              </>
            )}

            {isTextRole && onStartInlineEdit && element.text && (
              <button
                type="button"
                onClick={onStartInlineEdit}
                className="nav-btn nav-ghost element-bar-btn"
                aria-label="Edit text in place"
                data-tip="Format or edit this text directly on the page"
              >
                <Type size={14} />
                <span>Format text</span>
              </button>
            )}

            {isTextRole && !hasEditableFields && !message && (
              <p className="element-bar-hint">
                <Type size={14} className="shrink-0" aria-hidden="true" />
                <span>Click the text on the page or Format text to edit it in place</span>
              </p>
            )}

            {message && (
              <p className="element-bar-message" title={message}>
                <AlertTriangle size={14} className="shrink-0" />
                <span>{message}</span>
              </p>
            )}
          </>
        )}
      </div>

      {/* What you can do with it, quietest first; one filled key. */}
      <div className="element-bar-actions">
        {showAiInput ? (
          <>
            {hasEditableFields && (
              <button
                type="button"
                onClick={() => setShowAiInput(false)}
                className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon"
                aria-label="Back to direct edits"
                data-tip="Back to direct edits"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleAiSend(false)}
              className="nav-btn nav-ghost element-bar-btn"
              data-tip="Add this element and your request to the chat box, to send later"
            >
              <MessageSquarePlus size={15} />
              <span>Add to chat</span>
            </button>
            <button
              type="button"
              onClick={() => handleAiSend(true)}
              disabled={!aiInstruction.trim()}
              className="nav-btn brand-fill-text preview-key bg-brand hover:bg-brand-hover text-white border border-transparent shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
              data-tip="AI makes this change now, as a new version"
              data-tip-align="end"
            >
              <Sparkles size={15} />
              <span>Apply with AI</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={openAi}
              className="nav-btn nav-ghost element-bar-btn element-bar-btn-collapsible"
              aria-label="Ask AI"
              data-tip="Describe the change and let AI make it"
            >
              <Wand2 size={15} />
              <span>Ask AI</span>
            </button>
            {hasEditableFields && (
              <button
                type="button"
                onClick={handleApply}
                disabled={busy}
                className="nav-btn brand-fill-text preview-key bg-brand hover:bg-brand-hover text-white border border-transparent shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                data-tip="Applied instantly and saved as a new version"
                data-tip-align="end"
              >
                {isApplying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                <span>{isApplying ? 'Applying…' : 'Apply'}</span>
              </button>
            )}
          </>
        )}
        {canRestructure && !showAiInput && (
          <>
            <span className="chrome-divider element-bar-divider" aria-hidden="true" />
            <div className="element-bar-struct" role="group" aria-label="Arrange">
              {structureKey('move-up', ArrowUp, 'Move up', !element.prevSibling, '', 'or drag it in drag mode')}
              {structureKey('move-down', ArrowDown, 'Move down', !element.nextSibling, '', 'or drag it in drag mode')}
              {structureKey('duplicate', CopyPlus, 'Duplicate', false)}
              {structureKey('delete', Trash2, 'Delete', false, 'element-bar-danger')}
            </div>
          </>
        )}
        <span className="chrome-divider element-bar-divider" aria-hidden="true" />
        <button
          type="button"
          onClick={onCancel}
          className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon"
          aria-label="Close editor"
          data-tip="Close"
          data-tip-align="end"
        >
          <X size={16} />
        </button>
      </div>
      {/* Portaled to body: the bar is docked inside the preview chrome, which
          would clip or offset a fixed overlay. */}
      {urlOpen && createPortal(
        <Modal zIndex={70}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base 2xl:text-lg font-semibold text-slate-900">Image URL</h2>
            <ModalCloseButton onClick={() => setUrlOpen(false)} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (urlDraft.trim()) setSrc(urlDraft.trim());
              setUrlOpen(false);
            }}
            className="p-6 space-y-4"
          >
            <input
              autoFocus
              type="url"
              inputMode="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setUrlOpen(false); }}
              placeholder="https://example.com/photo.jpg"
              aria-label="Image URL"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-xs text-slate-400">
              Paste the web address of an image. Click Apply in the bar to use it.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUrlOpen(false)}
                className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg px-5 py-2 font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </form>
        </Modal>,
        document.body,
      )}
      {altOpen && createPortal(
        <Modal zIndex={70}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base 2xl:text-lg font-semibold text-slate-900">Image alt text</h2>
            <ModalCloseButton onClick={() => setAltOpen(false)} />
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); setAlt(altDraft.trim()); setAltOpen(false); }}
            className="p-6 space-y-4"
          >
            <textarea
              autoFocus
              rows={3}
              value={altDraft}
              onChange={(e) => setAltDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setAltOpen(false); }}
              placeholder="e.g. A golden retriever catching a frisbee on a beach"
              aria-label="Alt text"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
            <p className="text-xs text-slate-400">
              Describes the picture for people who use screen readers. It also shows if the image can't load. Click Apply in the bar to save it.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAltOpen(false)}
                className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg px-5 py-2 font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </form>
        </Modal>,
        document.body,
      )}
    </div>
  );
}
