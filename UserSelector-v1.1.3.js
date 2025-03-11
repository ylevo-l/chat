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
    this.altNavModeClass = "alt-navigation-mode";
    this.shiftActive = false;
    this.altNavigationMode = false;
    this.activeElement = null;
    this.activeBlock = [];
    this.hiddenActions = [];
    this.mousePos = { x: 0, y: 0 };
    this.lastMousePos = { x: -1, y: -1 };
    this.candidateElements = [];
    this.overlay = this._createOverlay();
    this.cursorTooltip = this._createCursorTooltip();
    this._injectStyles();
    this._bindEvents();
    this.updaterId = null;
    this.mouseDisabledUntil = 0;
    this.virtualOffset = 0;
    this.scrollOffsetY = 0;
    this.typedSequence = "";
    this.typedTimeoutId = null;
    this.typedTimeoutDuration = 500;
    
    this.doc.addEventListener('mousemove', (e) => {
      this.mousePos = { x: e.clientX, y: e.clientY };
    }, { passive: true });
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
    e.innerHTML = `<div class="hover-tooltip"><span class="username-color-dot"></span> View Chat Log</div>`;
    this.doc.body.appendChild(e);
    return e;
  }
  
  _createCursorTooltip() {
    const e = this.doc.createElement("div");
    e.className = "cursor-tooltip";
    e.style.willChange = "transform";
    e.style.pointerEvents = "none";
    e.innerHTML = `
      <div class="cursor-tooltip-content"><span class="username-color-dot"></span> Selection</div>
    `;
    this.doc.body.appendChild(e);
    return e;
  }
  get _styleContent() {
    return `:root {
--highlight-border-color: rgba(80, 80, 90, 0.8);
--highlight-bg-color: rgba(59, 59, 70, 0.15);
--highlight-border-radius: 8px;
--highlight-box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
--tooltip-bg-color: rgba(37, 38, 40, 255);
--tooltip-text-color: rgba(255, 255, 255, 0.95);
--tooltip-padding: 6px 10px;
--tooltip-border-radius: 6px;
--tooltip-font-size: 0.7rem;
--tooltip-border-color: rgba(70, 70, 80, 0.7);
--tooltip-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
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
  transition: opacity 0.2s ease-out, transform 0.15s ease-out;
  will-change: opacity, transform;
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
body.${this.altNavModeClass} * {
  cursor: none !important;
}
.hover-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translate(-50%, -8px);
  background: var(--tooltip-bg-color);
  color: var(--tooltip-text-color);
  padding: var(--tooltip-padding);
  border-radius: var(--tooltip-border-radius);
  font-size: var(--tooltip-font-size);
  white-space: nowrap;
  pointer-events: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  will-change: transform;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--tooltip-border-color);
  box-shadow: var(--tooltip-shadow);
  font-weight: 500;
  letter-spacing: 0.2px;
  transition: transform 0.15s ease-out, opacity 0.15s ease-out;
}
.cursor-tooltip {
  position: fixed;
  pointer-events: none;
  z-index: 10000;
  opacity: 0;
  transition: opacity 0.15s ease-out, transform 0.1s ease-out;
  will-change: transform, opacity;
  backface-visibility: hidden;
  transform: translate(0, 0);
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.2));
}
.cursor-tooltip.active {
  opacity: 1;
}
.cursor-tooltip-content {
  background: var(--tooltip-bg-color);
  color: var(--tooltip-text-color);
  padding: var(--tooltip-padding);
  border-radius: var(--tooltip-border-radius);
  font-size: var(--tooltip-font-size);
  white-space: nowrap;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  box-shadow: var(--tooltip-shadow);
  will-change: contents;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--tooltip-border-color);
  font-weight: 500;
  letter-spacing: 0.2px;
  backdrop-filter: blur(2px);
}
.username-color-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
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
      this._enterAltNavigationMode();
      
      requestAnimationFrame(() => {
        const char = e.key;
        this.typedSequence += char.toLowerCase();
        
        clearTimeout(this.typedTimeoutId);
        
        this._trySelectByTypedSequence();
        
        this.typedTimeoutId = setTimeout(() => {
          this.typedSequence = "";
        }, this.typedTimeoutDuration);
      });
    } else if (e.key === "Enter" && this.activeElement) {
      this._triggerAction(this.activeElement);
      e.preventDefault();
      e.stopPropagation();
    } else if (this.shiftActive && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Home" || e.key === "End" || e.key === "PageUp" || e.key === "PageDown")) {
      this._enterAltNavigationMode();
      
      if (e.key === "ArrowUp") {
        this.incrementHighlightUp();
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        this.incrementHighlightDown();
        e.preventDefault();
      }
    }
  }
  _handleKeyup(e) {
    if (e.key === "Shift") {
      this.shiftActive = false;
      this.doc.body.classList.remove(this.noSelectClass, "selection-mode");
      this._exitAltNavigationMode();
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
    
    this.mousePos = { x: e.clientX, y: e.clientY };
    
    this.lastMousePos = { 
      x: e.clientX, 
      y: e.clientY + this.virtualOffset + this.scrollOffsetY 
    };
    
    if (this.altNavigationMode) {
      requestAnimationFrame(() => {
        this._updateCursorTooltip(0, 0, true);
      });
    }
    
    if (Date.now() >= this.mouseDisabledUntil && this.altNavigationMode) {
      this._exitAltNavigationMode();
    }
    
    if (Date.now() < this.mouseDisabledUntil) return;
    
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
    if (this.shiftActive) {
      e.preventDefault();
      
      this._enterAltNavigationMode();
      
      this.mousePos = { x: e.clientX, y: e.clientY };
      
      this._updateCursorTooltip(0, 0, true);
      
      this._refreshCandidates();
      
      if (!this.activeElement && this.candidateElements.length > 0) {
        this._highlightBlock(this.candidateElements[0]);
        this._updateCursorTooltip(0, 0, true);
        return;
      }
      
      if (!this.activeElement) return;
      
      const n = this.candidateElements.indexOf(this.activeElement);
      if (n < 0) return;
      
      let r = e.deltaY > 0 ? 1 : -1;
      let i = n + r;
      
      const s = this._uniqueName(this.candidateElements[n]);
      while (i >= 0 && i < this.candidateElements.length && this._uniqueName(this.candidateElements[i]) === s) {
        i += r;
      }
      
      if (i < 0 || i >= this.candidateElements.length) return;
      
      this._updateCursorTooltip(0, 0, true);
      
      this._highlightBlock(this.candidateElements[i]);
      
      const o = this._getBlockRect();
      if (o) {
        const c = o.top + o.height / 2;
        this.virtualOffset = c - e.clientY;
        this.lastMousePos = { x: e.clientX, y: e.clientY + this.virtualOffset + this.scrollOffsetY };
        this.mouseDisabledUntil = Date.now() + 300;
        
        requestAnimationFrame(() => {
          this._updateCursorTooltip(0, 0, true);
        });
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

  _getUsernameColor(e) {
    const nameButton = e.querySelector("button.font-bold[title]");
    if (!nameButton) return "#ffffff";
    
    
    if (nameButton.hasAttribute("data-color")) {
      return nameButton.getAttribute("data-color");
    }
    
    if (nameButton.style.color) {
      return nameButton.style.color;
    }
    
    const colorIndicator = nameButton.querySelector("[style*='color']") || 
                          nameButton.querySelector(".user-color");
    if (colorIndicator) {
      const style = window.getComputedStyle(colorIndicator);
      return style.color || style.backgroundColor;
    }
    
    const style = window.getComputedStyle(nameButton);
    return style.color || "#ffffff";
  }
  
  _findCandidateUnderMouse(x, y) {
    const adjustedY = y + this.virtualOffset + this.scrollOffsetY;
    
    const elementAtPoint = this.doc.elementFromPoint(x, adjustedY);
    if (elementAtPoint) {
      const candidate = elementAtPoint.closest(this.options.candidateSelector);
      if (candidate && this.candidateElements.includes(candidate)) {
        return candidate;
      }
    }
    
    const candidatesInRange = this.candidateElements.filter(elem => {
      const rect = elem.getBoundingClientRect();
      return adjustedY >= rect.top && adjustedY <= rect.bottom;
    });
    
    if (!candidatesInRange.length) return null;
    
    return candidatesInRange[0];
  }
  
  _isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
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
    
    if (s) {
      const colorDot = s.querySelector(".username-color-dot");
      if (colorDot) {
        const userColor = this._getUsernameColor(e);
        colorDot.style.backgroundColor = userColor;
      }
      
      const textNode = s.childNodes[s.childNodes.length - 1];
      if (textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = ` ${i} | Log`;
      } else {
        s.appendChild(document.createTextNode(` ${i} | Log`));
      }
    }
    
    this._updateOverlayPosition();
    
    requestAnimationFrame(() => {
      this.overlay.classList.add("active");
    });
    
    if (this.altNavigationMode) {
      this._updateCursorTooltip(0, 0, true);
    }
    
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
  
  _enterAltNavigationMode() {
    if (!this.altNavigationMode) {
      this.altNavigationMode = true;
      this.doc.body.classList.add(this.altNavModeClass);
      
      this.cursorTooltip.style.transition = "none";
      this.cursorTooltip.classList.add("active");
      this._updateCursorTooltip(0, 0, true);
      
      void this.cursorTooltip.offsetWidth;
      this.cursorTooltip.style.transition = "";
    }
  }
  
  _exitAltNavigationMode() {
    if (this.altNavigationMode) {
      this.altNavigationMode = false;
      this.doc.body.classList.remove(this.altNavModeClass);
      this.cursorTooltip.classList.remove("active");
    }
  }
  
  _updateCursorTooltip(x, y, useMousePosition = false) {
    if (this.altNavigationMode) {
      const activeUser = this.activeElement ? this._uniqueName(this.activeElement) : "Selection";
      const contentEl = this.cursorTooltip.querySelector(".cursor-tooltip-content");
      const colorDot = contentEl.querySelector(".username-color-dot");
      
      if (this.activeElement) {
        const userColor = this._getUsernameColor(this.activeElement);
        if (colorDot) {
          colorDot.style.backgroundColor = userColor;
        }
      } else if (colorDot) {
        colorDot.style.backgroundColor = "#ffffff";
      }
      
      const textNode = contentEl.childNodes[contentEl.childNodes.length - 1];
      if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent !== ` ${activeUser}`) {
        textNode.textContent = ` ${activeUser}`;
      }
      
      this.cursorTooltip.style.willChange = "transform";
      
      if (useMousePosition) {
        this.cursorTooltip.style.left = `${this.mousePos.x}px`;
        this.cursorTooltip.style.top = `${this.mousePos.y}px`;
      } else {
        this.cursorTooltip.style.left = `${x}px`;
        this.cursorTooltip.style.top = `${y}px`;
      }
    }
  }
  
  _startUpdater() {
    if (this.updaterId) return;
    const e = () => {
      if (this.activeElement) {
        this._updateOverlayPosition();
        
        if (this.altNavigationMode) {
          this._updateCursorTooltip(0, 0, true);
        }
        
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
    const candidate = this._findCandidateUnderMouse(this.mousePos.x, this.mousePos.y);
    if (!candidate) return;
    
    if (this.activeElement && candidate !== this.activeElement) {
      if (this.altNavigationMode) {
        this._updateCursorTooltip(0, 0, true);
      }
      
      this._highlightBlock(candidate);
    } else if (!this.activeElement) {
      this._highlightBlock(candidate);
    }
  }
  _handleIncrement(e = true) {
    this._enterAltNavigationMode();
    
    this._refreshCandidates();
    
    if (!this.activeElement && this.candidateElements.length > 0) {
      const initialIndex = e ? 0 : this.candidateElements.length - 1;
      this._highlightBlock(this.candidateElements[initialIndex]);
      this._updateCursorTooltip(0, 0, true);
      return;
    }
    
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
      this._updateCursorTooltip(0, 0, true);
      
      this._highlightBlock(this.candidateElements[r]);
      
      const rect = this.candidateElements[r].getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      this.virtualOffset = midpoint - this.mousePos.y;
      this.lastMousePos = { 
        x: this.mousePos.x, 
        y: this.mousePos.y + this.virtualOffset + this.scrollOffsetY 
      };
      
      if (!this._isInViewport(this.candidateElements[r])) {
        this.candidateElements[r].scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
      
      this._updateCursorTooltip(0, 0, true);
    }
  }
  _trySelectByTypedSequence() {
    if (!this.typedSequence) return;
    
    this._enterAltNavigationMode();
    
    const lowerSeq = this.typedSequence.toLowerCase();
    
    this._refreshCandidates();
    
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
      this._updateCursorTooltip(0, 0, true);
      
      if (this.activeElement) {
        const currentName = this._uniqueName(this.activeElement);
        const currentIndex = this.candidateElements.indexOf(this.activeElement);
        
        const nextMatch = matches.find(el => {
          const index = this.candidateElements.indexOf(el);
          const name = this._uniqueName(el);
          return name !== currentName && index > currentIndex;
        });
        
        if (nextMatch) {
          this._highlightBlock(nextMatch);
          const rect = nextMatch.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          this.virtualOffset = midpoint - this.mousePos.y;
          this.lastMousePos = { 
            x: this.mousePos.x, 
            y: this.mousePos.y + this.virtualOffset + this.scrollOffsetY 
          };
          
          if (!this._isInViewport(nextMatch)) {
            nextMatch.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          
          this._updateCursorTooltip(0, 0, true);
          return;
        }
      }
      
      matches.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return rectA.top - rectB.top;
      });
      
      const topMatch = matches[0];
      
      this._highlightBlock(topMatch);
      
      const rect = topMatch.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      this.virtualOffset = midpoint - this.mousePos.y;
      this.lastMousePos = { 
        x: this.mousePos.x, 
        y: this.mousePos.y + this.virtualOffset + this.scrollOffsetY 
      };
      
      if (!this._isInViewport(topMatch)) {
        topMatch.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      
      this._updateCursorTooltip(0, 0, true);
    }
  }
}
