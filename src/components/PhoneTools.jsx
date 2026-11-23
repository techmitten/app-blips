import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

// Phone layout for the click-to-edit bars (TextFormatToolbar, ElementToolbar).
// The top bar keeps to one row (what is selected, the commit key, close) and
// the tools move to a labelled bar docked at the bottom of the preview pane.
// The app shell follows the visual viewport (useVisualViewport), so that bar
// rides on top of the on-screen keyboard. Every tool has a word under its
// icon: touch screens never show tooltips. The layout switch and the pane
// lookup are in hooks/usePhoneTools.js.

// tabs: [{ id, label, title, detail?, icon, onSelect? }]. A tab with
// onSelect is an action (it runs instead of opening options).
export default function PhoneTools({
  pane,
  tabs,
  active = null,
  onToggle,
  sheetRef = null,
  ariaLabel,
  message = null,
  children = null,
}) {
  const activeTab = tabs.find((tab) => tab.id === active) || null;
  const tools = (
    <div className="phone-tools" role="toolbar" aria-label={ariaLabel}>
      {activeTab && (
        <div ref={sheetRef} className="phone-tools-sheet" role="group" aria-label={activeTab.title} tabIndex={-1}>
          <div className="phone-tools-sheet-head">
            <span>
              {activeTab.title}
              {activeTab.detail && <small>{activeTab.detail}</small>}
            </span>
            <button
              type="button"
              className="nav-btn nav-ghost nav-btn-icon element-bar-btn-icon"
              onClick={() => onToggle(activeTab.id)}
              aria-label={`Close ${activeTab.title.toLowerCase()} options`}
            >
              <ChevronDown size={18} />
            </button>
          </div>
          <div className="phone-tools-sheet-body">{children}</div>
        </div>
      )}
      {message && !activeTab && <p className="phone-tools-message" role="alert">{message}</p>}
      <div className="phone-tools-bar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`phone-tools-tab ${tab.danger ? 'phone-tools-tab-danger' : ''}`}
            aria-expanded={tab.onSelect ? undefined : active === tab.id}
            aria-label={tab.detail ? `${tab.title}: ${tab.detail}` : tab.title}
            disabled={tab.disabled}
            onClick={() => (tab.onSelect ? tab.onSelect() : onToggle(tab.id))}
          >
            <span className="phone-tools-icon" aria-hidden="true">{tab.icon}</span>
            <span aria-hidden="true">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
  return pane ? createPortal(tools, pane) : tools;
}
