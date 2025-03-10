export class UserSelector {
  constructor(options = {}, doc = document) {
    this.doc = doc;
    this.options = Object.assign(
      {
        candidateSelector: ".bg-shade-lower.border-surface-tint, .betterhover\\:group-hover\\:bg-shade-lower",
        onSelect: null
      },
      options
    );
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
    this.typedSequence = "";
    this.typedTimeoutId = null;
    this.typedTimeoutDuration = 500; // Increased timeout for better typing experience
    new MutationObserver(() => {
      if (this.shiftActive) {
        this._refreshCandidates();
        if (!this.activeElement) {
          this._ensureHighlight();
        }
      }
      if (this.activeElement) {
        this._updateOverlayPosition();
      }
    }).observe(this.doc.body, { childList: true, subtree: true });
    window.addEventListener("scroll", () => {
      if (this.shiftActive && !this.activeElement) {
        this._refreshCandidates();
        this._ensureHighlight();
      }
      if (this.activeElement) {
        this._updateOverlayPosition();
      }
    }, { passive: true });
  }
  incrementHighlightDown() {
    if (this.shiftActive) this._handleIncrement(true);
  }
  incrementHighlightUp() {
    if (this.shiftActive) this._handleIncrement(false);
  }
  _createOverlay() {
    const e = this.doc.createElement("div");
    e.className = "hover-tooltip-overlay";
    e.innerHTML = `<div class="hover-tooltip">View Chat Log</div>`;
    this.doc.body.appendChild(e);
    return e;
  }
  get _styleContent() {
    return `:root {
--highlight-border-color: #3b82f6;
--highlight-bg-color: rgba(59,130,246,0.12);
--highlight-border-radius: 8px;
--highlight-box-shadow: 0 4px 12px rgba(59,130,246,0.2);
--tooltip-bg-color: #3b82f6;
--tooltip-text-color: #fff;
--tooltip-padding: 2px 5px;
--tooltip-border-radius: 4px;
--tooltip-font-size: 0.7rem;
}
.hover-tooltip-overlay {
  position: absolute;
  pointer-events: none;
  border: 1px solid var(--highlight-border-color);
  background: var(--highlight-bg-color);
  border-radius: var(--highlight-border-radius);
  box-shadow: var(--highlight-box-shadow);
  z-index: 1000;
  opacity: 0;
  transition: opacity 0.15s ease-out;
}
.hover-tooltip-overlay.active {
  opacity: 1;
}
.${this.highlightClass} {
  cursor: pointer !important;
}
.${this.noSelectClass} {
  user-select: none;
}
body.selection-mode .${this.highlightClass} * {
  pointer-events: none !important;
}
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
    const e = this.doc.createElement("style");
    e.textContent = this._styleContent;
    this.doc.head.appendChild(e);
  }
  _bindEvents() {
    ["keydown", "keyup", "mousemove", "click", "mousedown", "mouseup", "wheel"].forEach(a => {
      const b = a === "wheel" ? { passive: false } : true;
      this.doc.addEventListener(a, c => this[`_handle${a.charAt(0).toUpperCase() + a.slice(1)}`](c), b);
    });
  }
  _handleKeydown(e) {
    if (e.key === "Shift" && !this.shiftActive) {
      this.shiftActive = true;
      this.doc.body.classList.add(this.noSelectClass, "selection-mode");
      this.virtualOffset = 0;
      this.scrollOffsetY = 0;
      this._refreshCandidates();
      if (this.candidateElements.length) {
        this._ensureHighlight();
      }
    } else if (this.shiftActive && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Get the actual character (handles shift+number and special keys correctly)
      const char = e.key;
      this.typedSequence += char.toLowerCase();
      clearTimeout(this.typedTimeoutId);
      this._trySelectByTypedSequence();
      this.typedTimeoutId = setTimeout(() => {
        this.typedSequence = "";
      }, this.typedTimeoutDuration);
    } else if (e.key === "Enter" && this.activeElement) {
      this._triggerAction(this.activeElement);
      e.preventDefault();
      e.stopPropagation();
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
      this.typedSequence = "";
      clearTimeout(this.typedTimeoutId);
      this.typedTimeoutId = null;
    }
  }
  _handleMousemove(e) {
    if (!this.shiftActive) {
      if (this.activeElement) {
        this._resetHighlight();
      }
      return;
    }
    if (Date.now() < this.mouseDisabledUntil) return;
    const n = { x: e.clientX, y: e.clientY + this.virtualOffset + this.scrollOffsetY };
    if (n.x === this.lastMousePos.x && n.y === this.lastMousePos.y) return;
    this.lastMousePos = n;
    this.mousePos = n;
    this._refreshCandidates();
    this._ensureHighlight();
  }
  _handleClick(e) {
    if (this.activeElement) {
      const n = this.activeElement;
      this._resetHighlight();
      this._triggerAction(n);
      e.preventDefault();
      e.stopPropagation();
    }
  }
  _triggerAction(e) {
    if (typeof this.options.onSelect === "function") {
      this.options.onSelect(e, this._uniqueName(e));
    } else {
      e.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
  }
  _handleMousedown(e) {
    if (this.shiftActive) e.preventDefault();
  }
  _handleMouseup(e) {
    if (this.shiftActive) e.preventDefault();
  }
  _handleWheel(e) {
    if (this.shiftActive && this.activeElement) {
      e.preventDefault();
      this._refreshCandidates();
      const n = this.candidateElements.indexOf(this.activeElement);
      if (n < 0) return;
      let r = e.deltaY > 0 ? 1 : -1;
      let i = n + r;
      const s = this._uniqueName(this.candidateElements[n]);
      while (i >= 0 && i < this.candidateElements.length && this._uniqueName(this.candidateElements[i]) === s) {
        i += r;
      }
      if (i < 0 || i >= this.candidateElements.length) return;
      this._highlightBlock(this.candidateElements[i]);
      const o = this._getBlockRect();
      if (o) {
        const c = o.top + o.height / 2;
        this.virtualOffset = c - e.clientY;
        this.mousePos = { x: o.left + o.width / 2, y: c };
        this.lastMousePos = { ...this.mousePos };
        this.mouseDisabledUntil = Date.now() + 300;
      }
    }
  }
  _refreshCandidates() {
    if (!this.shiftActive) return;
    const n = Array.from(this.doc.querySelectorAll(this.options.candidateSelector));
    const r = n.filter(e => this._uniqueName(e));
    if (r.length !== this.candidateElements.length || !r.every((e, i) => e === this.candidateElements[i])) {
      this.candidateElements = r;
      if (!this.candidateElements.includes(this.activeElement)) {
        this._resetHighlight();
      }
    }
  }
  _uniqueName(e) {
    const n = e.querySelector("button.font-bold[title]");
    return n ? n.getAttribute("title") : null;
  }
  _findCandidateUnderMouse(x, y) {
    const n = this.doc.elementFromPoint(x, y);
    if (n) {
      const r = n.closest(this.options.candidateSelector);
      if (r && this.candidateElements.includes(r)) {
        const [i, s] = this._computeGap(r);
        if (this._isInGap(y, i, s)) {
          return r;
        }
      }
    }
    const o = this.candidateElements.filter(e => {
      const n = e.getBoundingClientRect();
      return y >= n.top && y <= n.bottom;
    });
    if (!o.length) return null;
    for (const c of o) {
      const [d, l] = this._computeGap(c);
      if (this._isInGap(y, d, l)) {
        return c;
      }
    }
    return o[0];
  }
  _computeGap(e) {
    const { top: n, height: r } = e.getBoundingClientRect();
    const i = n + r / 2;
    return [i - 7.5, i + 7.5];
  }
  _isInGap(e, n, r) {
    return e >= n && e <= r;
  }
  _getBlockElements(e) {
    const n = this._uniqueName(e);
    if (!n) return [e];
    const r = this.candidateElements.indexOf(e);
    if (r === -1) return [e];
    let i = r;
    while (i > 0 && this._uniqueName(this.candidateElements[i - 1]) === n) {
      i--;
    }
    let s = r;
    while (s < this.candidateElements.length - 1 && this._uniqueName(this.candidateElements[s + 1]) === n) {
      s++;
    }
    return this.candidateElements.slice(i, s + 1);
  }
  _getBlockRect() {
    if (!this.activeBlock.length) return null;
    let e = this.activeBlock[0].getBoundingClientRect();
    for (let n = 1; n < this.activeBlock.length; n++) {
      const r = this.activeBlock[n].getBoundingClientRect();
      e = {
        top: Math.min(e.top, r.top),
        left: Math.min(e.left, r.left),
        right: Math.max(e.right, r.right),
        bottom: Math.max(e.bottom, r.bottom)
      };
    }
    return {
      top: e.top,
      left: e.left,
      width: e.right - e.left,
      height: e.bottom - e.top
    };
  }
  _highlightBlock(e) {
    if (!e) return;
    if (this.activeElement && this._uniqueName(this.activeElement) === this._uniqueName(e)) return;
    this._resetHighlight();
    const n = this._getBlockElements(e);
    this.activeBlock = n;
    this.activeElement = e;
    n.forEach(r => {
      r.classList.add(this.highlightClass);
      const i = r.querySelector("#chat-message-actions");
      if (i) {
        this.hiddenActions.push({ element: i, originalDisplay: i.style.display || "" });
        i.style.display = "none";
      }
    });
    const r = e.querySelector("button.font-bold[title]");
    const i = r ? r.getAttribute("title") : "Chat";
    const s = this.overlay.querySelector(".hover-tooltip");
    if (s) s.textContent = `${i} | Log`;
    this.overlay.classList.add("active");
    this._updateOverlayPosition();
    this._startUpdater();
  }
  _updateOverlayPosition() {
    if (!this.activeBlock.length) return;
    const e = this._getBlockRect();
    if (!e) return;
    const n = e.top + window.scrollY;
    const r = e.left + window.scrollX;
    this.overlay.style.transition = "none";
    Object.assign(this.overlay.style, {
      width: `${e.width}px`,
      height: `${e.height + 4}px`,
      top: `${n}px`,
      left: `${r}px`
    });
    const i = this.overlay.querySelector(".hover-tooltip");
    if (i) {
      i.style.transform = "translate(-50%, -6px)";
      i.style.left = "50%";
    }
  }
  _resetHighlight() {
    if (this.activeBlock.length) {
      this.activeBlock.forEach(e => {
        e.classList.remove(this.highlightClass);
        const n = e.querySelector("#chat-message-actions");
        if (n) {
          const r = this.hiddenActions.find(a => a.element === n);
          if (r) n.style.display = r.originalDisplay;
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
    const e = () => {
      if (this.activeElement) {
        this._updateOverlayPosition();
        this.updaterId = requestAnimationFrame(e);
      }
    };
    this.updaterId = requestAnimationFrame(e);
  }
  _stopUpdater() {
    if (this.updaterId) {
      cancelAnimationFrame(this.updaterId);
      this.updaterId = null;
    }
  }
  _ensureHighlight() {
    const e = this._findCandidateUnderMouse(this.mousePos.x, this.mousePos.y);
    if (!e) return;
    if (this.activeElement) {
      const [n, r] = this._computeGap(this.activeElement);
      if (this._isInGap(this.mousePos.y, n, r)) {
        if (e !== this.activeElement) {
          this._highlightBlock(e);
        }
      } else {
        this._highlightBlock(e);
      }
    } else {
      this._highlightBlock(e);
    }
  }
  _handleIncrement(e = true) {
    this._refreshCandidates();
    if (!this.activeElement) return;
    const n = this.candidateElements.indexOf(this.activeElement);
    if (n < 0) return;
    let r = n;
    if (e && n < this.candidateElements.length - 1) {
      r = n + 1;
    } else if (!e && n > 0) {
      r = n - 1;
    }
    if (r !== n) {
      this._highlightBlock(this.candidateElements[r]);
    }
  }
  _trySelectByTypedSequence() {
    if (!this.typedSequence) return;
    
    const lowerSeq = this.typedSequence.toLowerCase();
    
    let matches = this.candidateElements.filter(el => {
      const userName = this._uniqueName(el);
      return userName && userName.toLowerCase().startsWith(lowerSeq);
    });
    
    if ((!matches || matches.length === 0) && lowerSeq.length > 1) {
      matches = this.candidateElements.filter(el => {
        const userName = this._uniqueName(el);
        return userName && userName.toLowerCase().includes(lowerSeq);
      });
    }
    
    if (matches && matches.length > 0) {
      matches.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return rectB.top - rectA.top;
      });
      
      const mostRecentMatch = matches[0];
      this._highlightBlock(mostRecentMatch);
      
      const rect = mostRecentMatch.getBoundingClientRect();
      const isInView = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
      
      if (!isInView) {
        mostRecentMatch.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }
}
