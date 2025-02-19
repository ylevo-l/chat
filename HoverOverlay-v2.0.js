export class ChatHoverOverlay {
  constructor(options = {}, doc = document) {
    this.doc = doc;
    this.options = Object.assign({ candidateSelector: ".bg-shade-lower.border-surface-tint, .betterhover\\:group-hover\\:bg-shade-lower", onSelect: null }, options);
    this.highlightClass = "chat-hover-highlight";
    this.noSelectClass = "no-select";
    this.shiftActive = false;
    this.activeElement = null;
    this.activeBlock = [];
    this.hiddenActions = [];
    this.mousePos = { x: 0, y: 0 };
    this.lastMousePos = { x: -1, y: -1 };
    this.candidateElements = [];
    this.overlay = this._createOverlay();
    this._injectStyles();
    this._bindEvents();
    this.updaterId = null;
    this.mouseDisabledUntil = 0;
    this.virtualOffset = 0;
    this.scrollOffsetY = 0;
    new MutationObserver(() => {
      if (this.shiftActive) {
        this._refreshCandidates();
        if (this.activeElement) this._updateOverlayPosition();
      }
    }).observe(this.doc.body, { childList: true, subtree: true });
    window.addEventListener("scroll", () => { if (this.activeElement) this._updateOverlayPosition(); }, { passive: true });
  }
  _createOverlay() {
    const overlay = this.doc.createElement("div");
    overlay.className = "hover-tooltip-overlay";
    overlay.innerHTML = `<div class="hover-tooltip">View Chat Log</div>`;
    this.doc.body.appendChild(overlay);
    return overlay;
  }
  get _styleContent() {
    return `:root {
--highlight-border-color: #3b82f6;
--highlight-bg-color: rgba(59,130,246,0.08);
--highlight-border-radius: 8px;
--highlight-box-shadow: 0 4px 12px rgba(59,130,246,0.2);
--tooltip-bg-color: #3b82f6;
--tooltip-text-color: #fff;
--tooltip-padding: 2px 6px;
--tooltip-border-radius: 4px;
--tooltip-font-size: 0.75rem;
}
.hover-tooltip-overlay {
  position: absolute;
  pointer-events: none;
  border: 2px solid var(--highlight-border-color);
  background: var(--highlight-bg-color);
  border-radius: var(--highlight-border-radius);
  box-shadow: var(--highlight-box-shadow);
  z-index: 1000;
  opacity: 0;
  transition: opacity 0.15s ease-out;
}
.hover-tooltip-overlay.active { opacity: 1; }
.${this.highlightClass} { cursor: pointer !important; }
.${this.noSelectClass} { user-select: none; }
body.selection-mode .${this.highlightClass} * { pointer-events: none !important; }
.hover-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translate(-50%, -6px);
  background: var(--tooltip-bg-color);
  color: var(--tooltip-text-color);
  padding: var(--tooltip-padding);
  border-radius: var(--tooltip-border-radius);
  font-size: var(--tooltip-font-size);
  white-space: nowrap;
  pointer-events: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}`;
  }
  _injectStyles() {
    const st = this.doc.createElement("style");
    st.textContent = this._styleContent;
    this.doc.head.appendChild(st);
  }
  _bindEvents() {
    ["keydown", "keyup", "mousemove", "click", "mousedown", "mouseup", "wheel"].forEach(evt => {
      const opts = evt === "wheel" ? { passive: false, capture: true } : true;
      this.doc.addEventListener(evt, e => this[`_handle${evt.charAt(0).toUpperCase() + evt.slice(1)}`](e), opts);
    });
  }
  _handleKeydown(e) {
    if (e.key === "Shift" && !this.shiftActive) {
      this.shiftActive = true;
      this.doc.body.classList.add(this.noSelectClass, "selection-mode");
      this.virtualOffset = 0;
      this.scrollOffsetY = 0;
      this._refreshCandidates();
      if (this.candidateElements.length) this._ensureHighlight();
    }
  }
  _handleKeyup(e) {
    if (e.key === "Shift") {
      this.shiftActive = false;
      this.doc.body.classList.remove(this.noSelectClass, "selection-mode");
      this._resetHighlight();
      this.candidateElements = [];
      this.virtualOffset = 0;
      this.scrollOffsetY = 0;
      this.mouseDisabledUntil = 0;
    }
  }
  _handleMousemove(e) {
    if (!this.shiftActive) { if (this.activeElement) this._resetHighlight(); return; }
    if (Date.now() < this.mouseDisabledUntil) return;
    const pos = { x: e.clientX, y: e.clientY + this.virtualOffset + this.scrollOffsetY };
    if (pos.x === this.lastMousePos.x && pos.y === this.lastMousePos.y) return;
    this.lastMousePos = pos;
    this.mousePos = pos;
    this._refreshCandidates();
    this._ensureHighlight();
  }
  _handleClick(e) {
    if (this.activeElement) {
      const candidate = this.activeElement;
      this._resetHighlight();
      this._triggerAction(candidate);
      e.preventDefault();
      e.stopPropagation();
    }
  }
  _triggerAction(candidate) {
    if (typeof this.options.onSelect === "function") this.options.onSelect(candidate, this._uniqueName(candidate));
    else candidate.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }
  _handleMousedown(e) { if (this.shiftActive) e.preventDefault(); }
  _handleMouseup(e) { if (this.shiftActive) e.preventDefault(); }
  _handleWheel(e) {
    if (this.shiftActive && this.activeElement) {
      e.preventDefault();
      this._refreshCandidates();
      const currentIndex = this.candidateElements.indexOf(this.activeElement);
      let newIndex = currentIndex;
      if (e.deltaY < 0 && currentIndex > 0) newIndex = currentIndex - 1;
      else if (e.deltaY > 0 && currentIndex < this.candidateElements.length - 1) newIndex = currentIndex + 1;
      if (newIndex !== currentIndex) {
        this._highlightBlock(this.candidateElements[newIndex]);
        const rect = this._getBlockRect();
        const centerY = rect.top + rect.height / 2;
        this.virtualOffset = centerY - e.clientY;
        this.mousePos = { x: rect.left + rect.width / 2, y: centerY };
        this.lastMousePos = { ...this.mousePos };
        this.mouseDisabledUntil = Date.now() + 300;
      }
    }
  }
  _refreshCandidates() {
    if (!this.shiftActive) return;
    const all = Array.from(this.doc.querySelectorAll(this.options.candidateSelector));
    const blocks = [];
    let lastName = null;
    for (const cand of all) {
      const name = this._uniqueName(cand);
      if (name && name !== lastName) { blocks.push(cand); lastName = name; }
    }
    if (blocks.length !== this.candidateElements.length || !blocks.every((el, i) => el === this.candidateElements[i])) {
      this.candidateElements = blocks;
      if (!this.candidateElements.includes(this.activeElement)) { this._resetHighlight(); this._ensureHighlight(); }
    }
  }
  _uniqueName(el) {
    const btn = el.querySelector("button.font-bold[title]");
    return btn ? btn.getAttribute("title") : null;
  }
  _findCandidateUnderMouse(x, y) {
    let el = this.doc.elementFromPoint(x, y);
    if (el) {
      const candidate = el.closest(this.options.candidateSelector);
      if (candidate && this.candidateElements.includes(candidate)) {
        const [gapTop, gapBottom] = this._computeGap(candidate);
        if (this._isInGap(y, gapTop, gapBottom)) return candidate;
      }
    }
    const filtered = this.candidateElements.filter(candidate => {
      const { top, bottom } = candidate.getBoundingClientRect();
      const [gapTop, gapBottom] = this._computeGap(candidate);
      return y >= top && y <= bottom && this._isInGap(y, gapTop, gapBottom);
    });
    if (!filtered.length) return null;
    return filtered.reduce((prev, curr) => {
      const rectPrev = prev.getBoundingClientRect(), rectCurr = curr.getBoundingClientRect();
      const dxPrev = Math.min(Math.abs(x - rectPrev.left), Math.abs(x - rectPrev.right));
      const dxCurr = Math.min(Math.abs(x - rectCurr.left), Math.abs(x - rectCurr.right));
      return dxCurr < dxPrev ? curr : prev;
    });
  }
  _computeGap(el) {
    const { top, height } = el.getBoundingClientRect();
    const mid = top + height / 2;
    return [mid - 7.5, mid + 7.5];
  }
  _isInGap(y, gapTop, gapBottom) { return y >= gapTop && y <= gapBottom; }
  _getBlockElements(candidate) {
    const name = this._uniqueName(candidate), block = [candidate];
    let next = candidate.nextElementSibling;
    while (next && this._uniqueName(next) === name) { block.push(next); next = next.nextElementSibling; }
    return block;
  }
  _getBlockRect() {
    if (!this.activeBlock.length) return null;
    let rect = this.activeBlock[0].getBoundingClientRect();
    for (let i = 1; i < this.activeBlock.length; i++) {
      const r = this.activeBlock[i].getBoundingClientRect();
      rect = { top: Math.min(rect.top, r.top), left: Math.min(rect.left, r.left), right: Math.max(rect.right, r.right), bottom: Math.max(rect.bottom, r.bottom) };
    }
    return { top: rect.top, left: rect.left, width: rect.right - rect.left, height: rect.bottom - rect.top };
  }
  _highlightBlock(candidate) {
    if (!candidate) return;
    if (this.activeElement && this._uniqueName(this.activeElement) === this._uniqueName(candidate)) return;
    this._resetHighlight();
    const blockEls = this._getBlockElements(candidate);
    this.activeBlock = blockEls;
    this.activeElement = candidate;
    blockEls.forEach(el => {
      el.classList.add(this.highlightClass);
      const actions = el.querySelector("#chat-message-actions");
      if (actions) {
        this.hiddenActions.push({ element: actions, originalDisplay: actions.style.display || "" });
        actions.style.display = "none";
      }
    });
    const btn = candidate.querySelector("button.font-bold[title]"),
      person = btn ? btn.getAttribute("title") : "Chat",
      tooltip = this.overlay.querySelector(".hover-tooltip");
    if (tooltip) tooltip.textContent = `${person} | Log`;
    this.overlay.classList.add("active");
    this._updateOverlayPosition();
    this._startUpdater();
  }
  _updateOverlayPosition() {
    if (!this.activeBlock.length) return;
    const rect = this._getBlockRect(),
      top = rect.top + window.scrollY,
      left = rect.left + window.scrollX;
    this.overlay.style.transition = "none";
    Object.assign(this.overlay.style, { width: `${rect.width}px`, height: `${rect.height}px`, top: `${top}px`, left: `${left}px` });
    const tooltip = this.overlay.querySelector(".hover-tooltip");
    if (tooltip) { tooltip.style.transform = "translate(-50%, -6px)"; tooltip.style.left = "50%"; }
  }
  _resetHighlight() {
    if (this.activeBlock.length) {
      this.activeBlock.forEach(el => {
        el.classList.remove(this.highlightClass);
        const actions = el.querySelector("#chat-message-actions");
        if (actions) {
          const hidden = this.hiddenActions.find(item => item.element === actions);
          if (hidden) actions.style.display = hidden.originalDisplay;
        }
      });
      this.activeBlock = [];
    }
    this.overlay.classList.remove("active");
    this.hiddenActions = [];
    this.activeElement = null;
    this._stopUpdater();
  }
  _startUpdater() {
    if (this.updaterId) return;
    const update = () => {
      if (this.activeElement) {
        this._updateOverlayPosition();
        this.updaterId = requestAnimationFrame(update);
      }
    };
    this.updaterId = requestAnimationFrame(update);
  }
  _stopUpdater() { if (this.updaterId) { cancelAnimationFrame(this.updaterId); this.updaterId = null; } }
  _ensureHighlight() {
    const candidate = this._findCandidateUnderMouse(this.mousePos.x, this.mousePos.y);
    if (this.activeElement) {
      const [gapTop, gapBottom] = this._computeGap(this.activeElement);
      if (this._isInGap(this.mousePos.y, gapTop, gapBottom)) { if (candidate && candidate !== this.activeElement) this._highlightBlock(candidate); }
      else { if (candidate) this._highlightBlock(candidate); }
    } else { if (candidate) this._highlightBlock(candidate); }
  }
  _handleIncrement(isDown = true) {
    this._refreshCandidates();
    if (!this.activeElement) return;
    const currentIndex = this.candidateElements.indexOf(this.activeElement);
    let newIndex = currentIndex;
    if (isDown && currentIndex < this.candidateElements.length - 1) newIndex = currentIndex + 1;
    else if (!isDown && currentIndex > 0) newIndex = currentIndex - 1;
    if (newIndex !== currentIndex) this._highlightBlock(this.candidateElements[newIndex]);
  }
  incrementHighlightDown() { if (this.shiftActive) this._handleIncrement(true); }
  incrementHighlightUp() { if (this.shiftActive) this._handleIncrement(false); }
}
