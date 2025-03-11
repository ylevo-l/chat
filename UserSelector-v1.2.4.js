export class UserSelector {
  constructor(cfg = {}, docRef = document) {
    this.document = docRef;
    this.config = { candidateSelector: ".bg-shade-lower.border-surface-tint, .betterhover\\:group-hover\\:bg-shade-lower", onSelect: null, ...cfg };
    this.cssClasses = { highlight: "chat-hover-highlight", noSelect: "no-select", altNav: "alt-navigation-mode" };
    this.state = {
      shiftActive: false,
      altNav: false,
      activeElem: null,
      activeBlock: [],
      hiddenActions: [],
      updater: null,
      mouse: { pos: { x: 0, y: 0 }, lastPos: { x: -1, y: -1 }, disabledUntil: 0 },
      viewport: { virtualOffset: 0, scrollOffset: 0 },
      typing: { seq: "", timeout: null, duration: 500 }
    };
    this.ui = { candidates: [], overlay: this._createOverlay(), cursorTooltip: this._createCursorTooltip() };
    this._injectStyles();
    this._setupEventListeners();
    this._setupMutationObserver();
  }
  incrementHighlightDown() { if (this.state.shiftActive) this._navigateHighlight(true); }
  incrementHighlightUp() { if (this.state.shiftActive) this._navigateHighlight(false); }
  _createOverlay() {
    const ovl = this.document.createElement("div");
    ovl.className = "hover-tooltip-overlay";
    ovl.innerHTML = `<div class="hover-tooltip"><span class="username-color-dot"></span> View Chat Log</div>`;
    this.document.body.appendChild(ovl);
    return ovl;
  }
  _createCursorTooltip() {
    const tip = this.document.createElement("div");
    tip.className = "cursor-tooltip";
    tip.style.willChange = "transform";
    tip.style.pointerEvents = "none";
    tip.innerHTML = `<div class="cursor-tooltip-content"><span class="username-color-dot"></span> Selection</div>`;
    this.document.body.appendChild(tip);
    return tip;
  }
  _injectStyles() {
    const style = this.document.createElement("style");
    style.textContent = this._getStyleRules();
    this.document.head.appendChild(style);
  }
  _getStyleRules() {
    return `:root{--highlight-border-color:rgba(80,80,90,.8);--highlight-bg-color:rgba(20,21,23,.15);--highlight-border-radius:8px;--highlight-box-shadow:0 4px 12px rgba(0,0,0,.25);--tooltip-bg-color:rgba(37,38,40,255);--tooltip-text-color:rgba(255,255,255,.95);--tooltip-padding:6px 10px;--tooltip-border-radius:6px;--tooltip-font-size:.7rem;--tooltip-border-color:rgba(70,70,80,.7);--tooltip-shadow:0 2px 10px rgba(0,0,0,.35)}.hover-tooltip-overlay{position:absolute;pointer-events:none;border:1px solid var(--highlight-border-color);background:var(--highlight-bg-color);border-radius:var(--highlight-border-radius);box-shadow:var(--highlight-box-shadow);z-index:1000;opacity:0;transition:opacity .2s ease-out,transform .15s ease-out;will-change:opacity,transform}.hover-tooltip-overlay.active{opacity:1}.${this.cssClasses.highlight}{cursor:pointer!important}.${this.cssClasses.noSelect}{user-select:none}body.selection-mode .${this.cssClasses.highlight} *{pointer-events:none!important}body.${this.cssClasses.altNav} *{cursor:none!important}.hover-tooltip{position:absolute;bottom:100%;left:50%;transform:translate(-50%,-8px);background:var(--tooltip-bg-color);color:var(--tooltip-text-color);padding:var(--tooltip-padding);border-radius:var(--tooltip-border-radius);font-size:var(--tooltip-font-size);white-space:nowrap;pointer-events:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;will-change:transform;display:flex;align-items:center;gap:6px;border:1px solid var(--tooltip-border-color);box-shadow:var(--tooltip-shadow);font-weight:500;letter-spacing:.2px;transition:transform .15s ease-out,opacity .15s ease-out}.cursor-tooltip{position:fixed;pointer-events:none;z-index:10000;opacity:0;transition:opacity .15s ease-out,transform .1s ease-out;will-change:transform,opacity;backface-visibility:hidden;transform:translate(0,0);filter:drop-shadow(0 1px 3px rgba(0,0,0,.2))}.cursor-tooltip.active{opacity:1}.cursor-tooltip-content{background:var(--tooltip-bg-color);color:var(--tooltip-text-color);padding:var(--tooltip-padding);border-radius:var(--tooltip-border-radius);font-size:var(--tooltip-font-size);white-space:nowrap;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;box-shadow:var(--tooltip-shadow);will-change:contents;display:flex;align-items:center;gap:6px;border:1px solid var(--tooltip-border-color);font-weight:500;letter-spacing:.2px;backdrop-filter:blur(2px)}.username-color-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background-color:#fff;border:1px solid rgba(255,255,255,.3);box-shadow:0 0 3px rgba(0,0,0,.2);flex-shrink:0}`;
  }
  _setupEventListeners() {
    this.document.addEventListener("mousemove", e => { this.state.mouse.pos = { x: e.clientX, y: e.clientY }; }, { passive: true });
    window.addEventListener("scroll", () => {
      if (this.state.shiftActive && !this.state.activeElem) { this._refreshCandidates(); this._ensureHighlight(); }
      if (this.state.activeElem) this._updateOverlayPosition();
    }, { passive: true });
    const events = {
      keydown: this._handleKeydown.bind(this),
      keyup: this._handleKeyup.bind(this),
      mousemove: this._handleMousemove.bind(this),
      click: this._handleClick.bind(this),
      mousedown: this._handleMousedown.bind(this),
      mouseup: this._handleMouseup.bind(this),
      wheel: this._handleWheel.bind(this)
    };
    Object.entries(events).forEach(([evt, fn]) => { this.document.addEventListener(evt, fn, { passive: evt !== "wheel" }); });
  }
  _setupMutationObserver() {
    new MutationObserver(() => {
      if (this.state.shiftActive) { this._refreshCandidates(); if (!this.state.activeElem) this._ensureHighlight(); }
      if (this.state.activeElem) this._updateOverlayPosition();
    }).observe(this.document.body, { childList: true, subtree: true });
  }
  _handleKeydown(e) {
    if (e.key === "Shift" && !this.state.shiftActive) { this._activateSelectionMode(); return; }
    if (this.state.shiftActive && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) { this._enterAltNav(); this._processTyping(e.key); return; }
    if (e.key === "Enter" && this.state.activeElem) { this._triggerAction(this.state.activeElem); e.preventDefault(); e.stopPropagation(); return; }
    if (this.state.shiftActive && ["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
      this._enterAltNav();
      if (e.key === "ArrowUp") { this.incrementHighlightUp(); e.preventDefault(); }
      else if (e.key === "ArrowDown") { this.incrementHighlightDown(); e.preventDefault(); }
    }
  }
  _handleKeyup(e) { if (e.key === "Shift") this._deactivateSelectionMode(); }
  _handleMousemove(e) {
    if (!this.state.shiftActive) { if (this.state.activeElem) this._resetHighlight(); return; }
    this.state.mouse.pos = { x: e.clientX, y: e.clientY };
    this.state.mouse.lastPos = { x: e.clientX, y: e.clientY + this.state.viewport.virtualOffset + this.state.viewport.scrollOffset };
    if (this.state.altNav) requestAnimationFrame(() => this._updateCursorTooltip());
    if (Date.now() < this.state.mouse.disabledUntil) return;
    this._refreshCandidates();
    this._ensureHighlight();
  }
  _handleClick(e) {
    if (this.state.activeElem) {
      const elem = this.state.activeElem;
      this._resetHighlight();
      this._triggerAction(elem);
      e.preventDefault();
      e.stopPropagation();
    }
  }
  _handleMousedown(e) { if (this.state.shiftActive) e.preventDefault(); }
  _handleMouseup(e) { if (this.state.shiftActive) e.preventDefault(); }
  _handleWheel(e) {
    if (!this.state.shiftActive) return;
    e.preventDefault();
    this._enterAltNav();
    this.state.mouse.pos = { x: e.clientX, y: e.clientY };
    this._updateCursorTooltip();
    this._refreshCandidates();
    if (!this.state.activeElem && this.ui.candidates.length) { this._highlightBlock(this.ui.candidates[0]); this._updateCursorTooltip(); return; }
    if (!this.state.activeElem) return;
    const curIndex = this.ui.candidates.indexOf(this.state.activeElem);
    if (curIndex < 0) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    const nextElem = this._findNextUnique(curIndex, dir);
    if (!nextElem) return;
    this._updateCursorTooltip();
    this._highlightBlock(nextElem);
    this._updateVirtualPos(e.clientX, e.clientY);
  }
  _activateSelectionMode() {
    this.state.shiftActive = true;
    this.document.body.classList.add(this.cssClasses.noSelect, "selection-mode");
    this.state.viewport.virtualOffset = 0;
    this.state.viewport.scrollOffset = 0;
    this._refreshCandidates();
    if (this.ui.candidates.length) this._ensureHighlight();
  }
  _deactivateSelectionMode() {
    this.state.shiftActive = false;
    this.document.body.classList.remove(this.cssClasses.noSelect, "selection-mode");
    this._exitAltNav();
    this._resetHighlight();
    this.ui.candidates = [];
    this.state.viewport.virtualOffset = 0;
    this.state.viewport.scrollOffset = 0;
    this.state.mouse.disabledUntil = 0;
    this.state.typing.seq = "";
    clearTimeout(this.state.typing.timeout);
    this.state.typing.timeout = null;
  }
  _enterAltNav() {
    if (!this.state.altNav) {
      this.state.altNav = true;
      this.document.body.classList.add(this.cssClasses.altNav);
      this.ui.cursorTooltip.style.transition = "none";
      this.ui.cursorTooltip.classList.add("active");
      this._updateCursorTooltip();
      void this.ui.cursorTooltip.offsetWidth;
      this.ui.cursorTooltip.style.transition = "";
    }
  }
  _exitAltNav() { if (this.state.altNav) { this.state.altNav = false; this.document.body.classList.remove(this.cssClasses.altNav); this.ui.cursorTooltip.classList.remove("active"); } }
  _refreshCandidates() {
    if (!this.state.shiftActive) return;
    const newCandidates = Array.from(this.document.querySelectorAll(this.config.candidateSelector))
      .filter(el => this._getUserName(el));
    const changed = newCandidates.length !== this.ui.candidates.length || !newCandidates.every((el, i) => el === this.ui.candidates[i]);
    if (changed) {
      this.ui.candidates = newCandidates;
      if (!this.ui.candidates.includes(this.state.activeElem)) this._resetHighlight();
    }
  }
  _findCandidateUnderCursor() {
    const { x, y } = this.state.mouse.pos;
    const adjustedY = y + this.state.viewport.virtualOffset + this.state.viewport.scrollOffset;
    const elemAtPoint = this.document.elementFromPoint(x, adjustedY);
    if (elemAtPoint) {
      const candidate = elemAtPoint.closest(this.config.candidateSelector);
      if (candidate && this.ui.candidates.includes(candidate)) return candidate;
    }
    return this.ui.candidates.find(el => {
      const r = el.getBoundingClientRect();
      return adjustedY >= r.top && adjustedY <= r.bottom;
    }) || null;
  }
  _getBlockElements(elem) {
    const name = this._getUserName(elem);
    if (!name) return [elem];
    const idx = this.ui.candidates.indexOf(elem);
    if (idx === -1) return [elem];
    let start = idx;
    while (start > 0 && this._getUserName(this.ui.candidates[start - 1]) === name) start--;
    let end = idx;
    while (end < this.ui.candidates.length - 1 && this._getUserName(this.ui.candidates[end + 1]) === name) end++;
    return this.ui.candidates.slice(start, end + 1);
  }
  _findNextUnique(curIdx, dir) {
    let nextIdx = curIdx + dir;
    const curName = this._getUserName(this.ui.candidates[curIdx]);
    while (nextIdx >= 0 && nextIdx < this.ui.candidates.length && this._getUserName(this.ui.candidates[nextIdx]) === curName) nextIdx += dir;
    return nextIdx >= 0 && nextIdx < this.ui.candidates.length ? this.ui.candidates[nextIdx] : null;
  }
  _highlightBlock(elem) {
    if (!elem) return;
    if (this.state.activeElem && this._getUserName(this.state.activeElem) === this._getUserName(elem)) return;
    this._resetHighlight();
    const block = this._getBlockElements(elem);
    this.state.activeBlock = block;
    this.state.activeElem = elem;
    block.forEach(el => {
      el.classList.add(this.cssClasses.highlight);
      const actions = el.querySelector("#chat-message-actions");
      if (actions) {
        this.state.hiddenActions.push({ element: actions, origDisplay: actions.style.display || "" });
        actions.style.display = "none";
      }
    });
    this._updateTooltipContent();
    this._updateOverlayPosition();
    requestAnimationFrame(() => { this.ui.overlay.classList.add("active"); });
    if (this.state.altNav) this._updateCursorTooltip();
    this._startUpdater();
  }
  _updateTooltipContent() {
    if (!this.state.activeElem) return;
    const user = this._getUserName(this.state.activeElem) || "Chat";
    const tip = this.ui.overlay.querySelector(".hover-tooltip");
    if (tip) {
      const dot = tip.querySelector(".username-color-dot");
      if (dot) dot.style.backgroundColor = this._getUserColor(this.state.activeElem);
      const lastNode = tip.childNodes[tip.childNodes.length - 1];
      if (lastNode.nodeType === Node.TEXT_NODE) lastNode.textContent = ` ${user} | Log`;
      else tip.appendChild(document.createTextNode(` ${user} | Log`));
    }
  }
  _resetHighlight() {
    if (this.state.activeBlock.length) {
      this.state.activeBlock.forEach(el => {
        el.classList.remove(this.cssClasses.highlight);
        const actions = el.querySelector("#chat-message-actions");
        if (actions) {
          const hidden = this.state.hiddenActions.find(item => item.element === actions);
          if (hidden) actions.style.display = hidden.origDisplay;
        }
      });
      this.state.activeBlock = [];
    }
    this.ui.overlay.classList.remove("active");
    this.state.hiddenActions = [];
    this.state.activeElem = null;
    this._stopUpdater();
  }
  _updateOverlayPosition() {
    if (!this.state.activeBlock.length) return;
    const rect = this._getBlockRect();
    if (!rect) return;
    this.ui.overlay.style.transition = "none";
    Object.assign(this.ui.overlay.style, {
      width: `${rect.width}px`,
      height: `${rect.height + 4}px`,
      top: `${rect.top + window.scrollY}px`,
      left: `${rect.left + window.scrollX}px`
    });
    const tip = this.ui.overlay.querySelector(".hover-tooltip");
    if (tip) { tip.style.transform = "translate(-50%,-6px)"; tip.style.left = "50%"; }
  }
  _updateCursorTooltip() {
    if (this.state.altNav) {
      const activeUser = this.state.activeElem ? this._getUserName(this.state.activeElem) : "Selection";
      const contentEl = this.ui.cursorTooltip.querySelector(".cursor-tooltip-content");
      const dot = contentEl.querySelector(".username-color-dot");
      if (this.state.activeElem) {
        const userColor = this._getUserColor(this.state.activeElem);
        if (dot) dot.style.backgroundColor = userColor;
      } else if (dot) dot.style.backgroundColor = "#ffffff";
      const lastNode = contentEl.childNodes[contentEl.childNodes.length - 1];
      if (lastNode.nodeType === Node.TEXT_NODE && lastNode.textContent !== ` ${activeUser}`) lastNode.textContent = ` ${activeUser}`;
      this.ui.cursorTooltip.style.willChange = "transform";
      this.ui.cursorTooltip.style.left = `${this.state.mouse.pos.x}px`;
      this.ui.cursorTooltip.style.top = `${this.state.mouse.pos.y}px`;
    }
  }
  _startUpdater() {
    if (this.state.updater) return;
    const update = () => {
      if (this.state.activeElem) {
        this._updateOverlayPosition();
        if (this.state.altNav) this._updateCursorTooltip();
        this.state.updater = requestAnimationFrame(update);
      }
    };
    this.state.updater = requestAnimationFrame(update);
  }
  _stopUpdater() {
    if (this.state.updater) { cancelAnimationFrame(this.state.updater); this.state.updater = null; }
  }
  _ensureHighlight() {
    const candidate = this._findCandidateUnderCursor();
    if (!candidate) return;
    if (this.state.activeElem && candidate !== this.state.activeElem) {
      if (this.state.altNav) this._updateCursorTooltip();
      this._highlightBlock(candidate);
    } else if (!this.state.activeElem) this._highlightBlock(candidate);
  }
  _navigateHighlight(down = true) {
    this._enterAltNav();
    this._refreshCandidates();
    if (!this.state.activeElem && this.ui.candidates.length) {
      const idx = down ? 0 : this.ui.candidates.length - 1;
      this._highlightBlock(this.ui.candidates[idx]);
      this._updateCursorTooltip();
      return;
    }
    if (!this.state.activeElem) return;
    const curIndex = this.ui.candidates.indexOf(this.state.activeElem);
    if (curIndex < 0) return;
    const nextIndex = down && curIndex < this.ui.candidates.length - 1 ? curIndex + 1 : !down && curIndex > 0 ? curIndex - 1 : curIndex;
    if (nextIndex !== curIndex) {
      const nextElem = this.ui.candidates[nextIndex];
      this._highlightBlock(nextElem);
      this._updateVirtualPos(this.state.mouse.pos.x, this.state.mouse.pos.y);
      this._updateCursorTooltip();
    }
  }
  _processTyping(key) {
    requestAnimationFrame(() => {
      this.state.typing.seq += key.toLowerCase();
      clearTimeout(this.state.typing.timeout);
      this._selectByTyping();
      this.state.typing.timeout = setTimeout(() => { this.state.typing.seq = ""; }, this.state.typing.duration);
    });
  }
  _selectByTyping() {
    if (!this.state.typing.seq) return;
    this._enterAltNav();
    const seq = this.state.typing.seq.toLowerCase();
    this._refreshCandidates();
    let matches = this.ui.candidates.filter(el => {
      const user = this._getUserName(el);
      return user && user.toLowerCase().startsWith(seq);
    });
    if ((!matches || matches.length === 0) && seq.length > 1) {
      matches = this.ui.candidates.filter(el => {
        const user = this._getUserName(el);
        return user && user.toLowerCase().includes(seq);
      });
    }
    if (!matches || matches.length === 0) return;
    if (this.state.activeElem) {
      const curName = this._getUserName(this.state.activeElem);
      const curIdx = this.ui.candidates.indexOf(this.state.activeElem);
      const nextMatch = matches.find(el => {
        const idx = this.ui.candidates.indexOf(el);
        const name = this._getUserName(el);
        return name !== curName && idx > curIdx;
      });
      if (nextMatch) {
        this._highlightBlock(nextMatch);
        this._updateVirtualPos(this.state.mouse.pos.x, this.state.mouse.pos.y);
        this._updateCursorTooltip();
        return;
      }
    }
    const sorted = [...matches].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const topMatch = sorted[0];
    this._highlightBlock(topMatch);
    this._updateVirtualPos(this.state.mouse.pos.x, this.state.mouse.pos.y);
    this._updateCursorTooltip();
  }
  _updateVirtualPos(x, y) {
    if (!this.state.activeElem) return;
    const rect = this.state.activeElem.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    this.state.viewport.virtualOffset = mid - y;
    this.state.mouse.lastPos = { x, y: y + this.state.viewport.virtualOffset + this.state.viewport.scrollOffset };
    this.state.mouse.disabledUntil = Date.now() + 300;
  }
  _isInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.bottom <= (window.innerHeight || this.document.documentElement.clientHeight) && r.right <= (window.innerWidth || this.document.documentElement.clientWidth);
  }
  _getBlockRect() {
    if (!this.state.activeBlock.length) return null;
    let r = this.state.activeBlock[0].getBoundingClientRect();
    for (let i = 1; i < this.state.activeBlock.length; i++) {
      const nr = this.state.activeBlock[i].getBoundingClientRect();
      r = { top: Math.min(r.top, nr.top), left: Math.min(r.left, nr.left), right: Math.max(r.right, nr.right), bottom: Math.max(r.bottom, nr.bottom) };
    }
    return { top: r.top, left: r.left, width: r.right - r.left, height: r.bottom - r.top };
  }
  _triggerAction(el) {
    if (typeof this.config.onSelect === "function") this.config.onSelect(el, this._getUserName(el));
    else el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }
  _getUserName(el) {
    const btn = el.querySelector("button.font-bold[title]");
    return btn ? btn.getAttribute("title") : null;
  }
  _getUserColor(el) {
    const btn = el.querySelector("button.font-bold[title]");
    if (!btn) return "#ffffff";
    if (btn.hasAttribute("data-color")) return btn.getAttribute("data-color");
    if (btn.style.color) return btn.style.color;
    const colorElem = btn.querySelector("[style*='color']") || btn.querySelector(".user-color");
    if (colorElem) {
      const s = window.getComputedStyle(colorElem);
      return s.color || s.backgroundColor;
    }
    const s = window.getComputedStyle(btn);
    return s.color || "#ffffff";
  }
}
