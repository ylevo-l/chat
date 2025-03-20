export class UserSelector {
  constructor(options = {}, doc = document) {
    this.doc = doc;
    this.options = {
      candidateSelector: ".bg-shade-lower.border-surface-tint, .betterhover\\:group-hover\\:bg-shade-lower",
      onSelect: null,
      ...options
    };
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
    this.updaterId = null;
    this.mouseDisabledUntil = 0;
    this.virtualOffset = 0;
    this.scrollOffsetY = 0;
    this.typedSequence = "";
    this.typedTimeoutId = null;
    this.typedTimeoutDuration = 500;
    this.initialized = false;
    
    this.overlay = this._createOverlay();
    this.cursorTooltip = this._createCursorTooltip();
    this._injectStyles();
    
    this._initializationTimer = setTimeout(() => {
      this._setupEventListeners();
      this._performInitialCandidateScan();
      this.initialized = true;
    }, 100);
    
    this._setupMutationObserver();
  }

  _setupMutationObserver() {
    this.mutationObserver = new MutationObserver(() => {
      this._refreshCandidates(true);
      
      if (this.activeElement) {
        const activeUserName = this._uniqueName(this.activeElement);
        if (activeUserName) {
          const newBlock = this._getBlockElements(this.activeElement);
          
          if (newBlock.length !== this.activeBlock.length) {
            this.activeBlock.forEach(element => {
              element.classList.remove(this.highlightClass);
              
              const actions = element.querySelector("#chat-message-actions");
              if (actions) {
                const hiddenAction = this.hiddenActions.find(item => item.element === actions);
                if (hiddenAction) actions.style.display = hiddenAction.originalDisplay;
              }
            });
            
            this.hiddenActions = [];
            
            this.activeBlock = newBlock;
            
            newBlock.forEach(el => {
              el.classList.add(this.highlightClass);
              
              const actions = el.querySelector("#chat-message-actions");
              if (actions) {
                this.hiddenActions.push({
                  element: actions,
                  originalDisplay: actions.style.display || ""
                });
                actions.style.display = "none";
              }
            });
            
            this._updateOverlayPosition();
          } else {
            this._updateOverlayPosition();
          }
        }
      }
      
      if (this.shiftActive && !this.activeElement) {
        this._ensureHighlight();
      }
    });
    
    this.mutationObserver.observe(this.doc.body, {
      childList: true,
      subtree: true
    });
  }

  _performInitialCandidateScan() {
    this._refreshCandidates(true);
    
    this._periodicRefreshTimer = setInterval(() => {
      if (this.candidateElements.length === 0) {
        this._refreshCandidates(true);
      }
    }, 2000);
  }

  incrementHighlightDown() {
    if (this.shiftActive) this._handleIncrement(true);
  }

  incrementHighlightUp() {
    if (this.shiftActive) this._handleIncrement(false);
  }

  _createOverlay() {
    const el = this.doc.createElement("div");
    el.className = "hover-tooltip-overlay";
    el.innerHTML = `<div class="hover-tooltip"><span class="username-color-dot"></span> <span class="username-text"></span> | Log</div>`;
    this.doc.body.appendChild(el);
    return el;
  }

  _createCursorTooltip() {
    const el = this.doc.createElement("div");
    el.className = "cursor-tooltip";
    el.style.willChange = "transform";
    el.style.pointerEvents = "none";
    el.style.transform = "translate(-50%, -50%)";
    el.innerHTML = `<div class="cursor-tooltip-content"><span class="username-color-dot"></span> <span class="username-text">Selection</span></div>`;
    this.doc.body.appendChild(el);
    return el;
  }

  _injectStyles() {
    const style = this.doc.createElement("style");
    style.textContent = `:root{--highlight-border-color:rgba(80,80,90,.9);--highlight-border-width:2px;--highlight-bg-color:transparent;--highlight-border-radius:8px;--highlight-box-shadow:0 4px 12px rgba(0,0,0,.25);--tooltip-bg-color:rgba(37,38,40,255);--tooltip-text-color:rgba(255,255,255,.95);--tooltip-padding:6px 10px;--tooltip-border-radius:6px;--tooltip-font-size:.7rem;--tooltip-border-color:rgba(70,70,80,.7);--tooltip-shadow:0 2px 10px rgba(0,0,0,.35)}.hover-tooltip-overlay{position:absolute;pointer-events:none;border:var(--highlight-border-width) solid var(--highlight-border-color);background:var(--highlight-bg-color);border-radius:var(--highlight-border-radius);box-shadow:var(--highlight-box-shadow);z-index:1000;opacity:0;transition:opacity .2s ease-out,transform .15s ease-out;will-change:opacity,transform}.hover-tooltip-overlay.active{opacity:1}.${this.highlightClass}{cursor:pointer!important}.${this.noSelectClass}{user-select:none}body.selection-mode .${this.highlightClass} *{pointer-events:none!important}body.${this.altNavModeClass} *{cursor:none!important}.hover-tooltip{position:absolute;bottom:100%;left:50%;transform:translate(-50%,-8px);background:var(--tooltip-bg-color);color:var(--tooltip-text-color);padding:var(--tooltip-padding);border-radius:var(--tooltip-border-radius);font-size:var(--tooltip-font-size);white-space:nowrap;pointer-events:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;will-change:transform;display:flex;align-items:center;gap:6px;border:1px solid var(--tooltip-border-color);box-shadow:var(--tooltip-shadow);font-weight:500;letter-spacing:.2px;transition:transform .15s ease-out,opacity .15s ease-out}.hover-tooltip::after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);width:10px;height:8px;background-color:var(--tooltip-bg-color);clip-path:polygon(0 0, 100% 0, 50% 100%);border-left:1px solid var(--tooltip-border-color);border-right:1px solid var(--tooltip-border-color);border-bottom:none;z-index:1}.cursor-tooltip{position:fixed;pointer-events:none;z-index:10000;opacity:0;transition:opacity .15s ease-out;will-change:transform,opacity;backface-visibility:hidden;transform:translate(-50%,-50%);filter:drop-shadow(0 1px 3px rgba(0,0,0,.2))}.cursor-tooltip.active{opacity:1}.cursor-tooltip-content{background:var(--tooltip-bg-color);color:var(--tooltip-text-color);padding:var(--tooltip-padding);border-radius:var(--tooltip-border-radius);font-size:var(--tooltip-font-size);white-space:nowrap;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;box-shadow:0 3px 14px rgba(0,0,0,.35);will-change:contents;display:flex;align-items:center;gap:6px;border:1px solid var(--tooltip-border-color);font-weight:500;letter-spacing:.2px;backdrop-filter:blur(2px)}.username-color-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background-color:#fff;border:1px solid rgba(255,255,255,.3);box-shadow:0 0 3px rgba(0,0,0,.2);flex-shrink:0}.username-text{font-weight:600;}`;
    this.doc.head.appendChild(style);
  }

  _setupEventListeners() {
    this.doc.addEventListener('mousemove', e => {
      this.mousePos = { x: e.clientX, y: e.clientY };
    }, { passive: true });
    
    window.addEventListener("scroll", () => {
      if (this.shiftActive && !this.activeElement) {
        this._refreshCandidates();
        this._ensureHighlight();
      }
      if (this.activeElement) this._updateOverlayPosition();
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
    
    Object.entries(events).forEach(([event, handler]) => {
      this.doc.addEventListener(event, handler, { passive: event !== 'wheel' });
    });
  }

  _handleKeydown(e) {
    if (e.key === "Shift" && !this.shiftActive) {
      this.shiftActive = true;
      this.doc.body.classList.add(this.noSelectClass, "selection-mode");
      this.virtualOffset = this.scrollOffsetY = 0;
      this._refreshCandidates();
      if (this.candidateElements.length) this._ensureHighlight();
      return;
    }
    
    if (this.shiftActive && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      this._enterAltNavigationMode();
      requestAnimationFrame(() => {
        this.typedSequence += e.key.toLowerCase();
        clearTimeout(this.typedTimeoutId);
        this._trySelectByTypedSequence();
        this.typedTimeoutId = setTimeout(() => {
          this.typedSequence = "";
        }, this.typedTimeoutDuration);
      });
      return;
    }
    
    if (e.key === "Enter" && this.activeElement) {
      this._triggerAction(this.activeElement);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    if (this.shiftActive && ["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
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
      this.virtualOffset = this.scrollOffsetY = 0;
      this.mouseDisabledUntil = 0;
      this.typedSequence = "";
      clearTimeout(this.typedTimeoutId);
      this.typedTimeoutId = null;
    }
  }

  _handleMousemove(e) {
    if (!this.shiftActive) {
      if (this.activeElement) this._resetHighlight();
      return;
    }
    
    this.mousePos = { x: e.clientX, y: e.clientY };
    this.lastMousePos = { x: e.clientX, y: e.clientY + this.virtualOffset + this.scrollOffsetY };
    
    if (this.altNavigationMode) {
      requestAnimationFrame(() => this._updateCursorTooltip());
    }
    
    if (Date.now() >= this.mouseDisabledUntil && this.altNavigationMode) {
      this._exitAltNavigationMode();
    }
    
    if (Date.now() < this.mouseDisabledUntil) return;
    
    this._refreshCandidates();
    this._ensureHighlight();
  }

  _handleClick(e) {
    // Only process click actions when in selection mode (Shift is active)
    // or there's already an active element
    if (!this.shiftActive && !this.activeElement) {
      return;
    }
    
    if (this.activeElement) {
      const element = this.activeElement;
      this._resetHighlight();
      this._triggerAction(element);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // Only continue if we're in selection mode
    if (this.shiftActive) {
      const elementAtPoint = this.doc.elementFromPoint(e.clientX, e.clientY);
      if (elementAtPoint) {
        const candidate = elementAtPoint.closest(this.options.candidateSelector);
        if (candidate && this._uniqueName(candidate)) {
          if (!this.candidateElements.includes(candidate)) {
            this._refreshCandidates(true);
          }
          
          this._highlightBlock(candidate);
          this._triggerAction(candidate);
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }
  }

  _handleMousedown(e) {
    if (this.shiftActive) e.preventDefault();
  }

  _handleMouseup(e) {
    if (this.shiftActive) e.preventDefault();
  }

  _handleWheel(e) {
    if (!this.shiftActive) return;
    
    e.preventDefault();
    this._enterAltNavigationMode();
    this.mousePos = { x: e.clientX, y: e.clientY };
    this._updateCursorTooltip();
    this._refreshCandidates();
    
    if (!this.activeElement && this.candidateElements.length > 0) {
      this._highlightBlock(this.candidateElements[0]);
      this._updateCursorTooltip();
      return;
    }
    
    if (!this.activeElement) return;
    
    const currentIndex = this.candidateElements.indexOf(this.activeElement);
    if (currentIndex < 0) return;
    
    const direction = e.deltaY > 0 ? 1 : -1;
    let nextIndex = currentIndex + direction;
    
    const currentName = this._uniqueName(this.candidateElements[currentIndex]);
    while (
      nextIndex >= 0 && 
      nextIndex < this.candidateElements.length &&
      this._uniqueName(this.candidateElements[nextIndex]) === currentName
    ) {
      nextIndex += direction;
    }
    
    if (nextIndex < 0 || nextIndex >= this.candidateElements.length) return;
    
    this._updateCursorTooltip();
    this._highlightBlock(this.candidateElements[nextIndex]);
    
    const rect = this._getBlockRect();
    if (rect) {
      const midpoint = rect.top + rect.height / 2;
      this.virtualOffset = midpoint - e.clientY;
      this.lastMousePos = { 
        x: e.clientX, 
        y: e.clientY + this.virtualOffset + this.scrollOffsetY 
      };
      this.mouseDisabledUntil = Date.now() + 300;
      
      requestAnimationFrame(() => this._updateCursorTooltip());
    }
  }

  _triggerAction(element) {
    if (typeof this.options.onSelect === "function") {
      this.options.onSelect(element, this._uniqueName(element));
    } else {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
  }

  _refreshCandidates(force = false) {
    if (!this.shiftActive && !force) return;
    
    const elements = Array.from(this.doc.querySelectorAll(this.options.candidateSelector))
      .filter(e => this._uniqueName(e));
    
    const hasChanged = elements.length !== this.candidateElements.length ||
                      !elements.every((e, i) => e === this.candidateElements[i]);
    
    if (hasChanged) {
      this.candidateElements = elements;
      if (!this.candidateElements.includes(this.activeElement)) {
        this._resetHighlight();
      }
    }
  }

  _uniqueName(element) {
    const nameButton = element.querySelector("button.font-bold[title]");
    return nameButton ? nameButton.getAttribute("title") : null;
  }

  _getUsernameColor(element) {
    const nameButton = element.querySelector("button.font-bold[title]");
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
    this._refreshCandidates(true);
    
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
    
    return candidatesInRange.length ? candidatesInRange[0] : null;
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

  _getBlockElements(element) {
    const name = this._uniqueName(element);
    if (!name) return [element];
    
    const allElements = Array.from(this.doc.querySelectorAll(this.options.candidateSelector))
      .filter(e => this._uniqueName(e));
    
    const elementIndex = allElements.indexOf(element);
    if (elementIndex === -1) return [element];
    
    let blockStart = elementIndex;
    while (blockStart > 0 && this._uniqueName(allElements[blockStart - 1]) === name) {
      blockStart--;
    }
    
    let blockEnd = elementIndex;
    while (
      blockEnd < allElements.length - 1 &&
      this._uniqueName(allElements[blockEnd + 1]) === name
    ) {
      blockEnd++;
    }
    
    return allElements.slice(blockStart, blockEnd + 1);
  }

  _getBlockRect() {
    if (!this.activeBlock.length) return null;
    
    let rect = this.activeBlock[0].getBoundingClientRect();
    
    for (let i = 1; i < this.activeBlock.length; i++) {
      const elementRect = this.activeBlock[i].getBoundingClientRect();
      rect = {
        top: Math.min(rect.top, elementRect.top),
        left: Math.min(rect.left, elementRect.left),
        right: Math.max(rect.right, elementRect.right),
        bottom: Math.max(rect.bottom, elementRect.bottom)
      };
    }
    
    return {
      top: rect.top,
      left: rect.left,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top
    };
  }

  _highlightBlock(element) {
    if (!element) return;
    
    if (this.activeElement && this._uniqueName(this.activeElement) === this._uniqueName(element)) return;
    
    this._resetHighlight();
    
    const blockElements = this._getBlockElements(element);
    this.activeBlock = blockElements;
    this.activeElement = element;
    
    blockElements.forEach(el => {
      el.classList.add(this.highlightClass);
      
      const actions = el.querySelector("#chat-message-actions");
      if (actions) {
        this.hiddenActions.push({
          element: actions,
          originalDisplay: actions.style.display || ""
        });
        actions.style.display = "none";
      }
    });
    
    const nameButton = element.querySelector("button.font-bold[title]");
    const userName = nameButton ? nameButton.getAttribute("title") : "Chat";
    const tooltipContent = this.overlay.querySelector(".hover-tooltip");
    
    if (tooltipContent) {
      const userColor = this._getUsernameColor(element);
      const colorDot = tooltipContent.querySelector(".username-color-dot");
      if (colorDot) {
        colorDot.style.backgroundColor = userColor;
      }
      
      const usernameText = tooltipContent.querySelector(".username-text");
      if (usernameText) {
        usernameText.textContent = userName;
        usernameText.style.color = userColor;
      }
    }
    
    this._updateOverlayPosition();
    
    requestAnimationFrame(() => {
      this.overlay.classList.add("active");
    });
    
    if (this.altNavigationMode) {
      this._updateCursorTooltip();
    }
    
    this._startUpdater();
  }

  _updateOverlayPosition() {
    if (!this.activeBlock.length) return;
    
    const rect = this._getBlockRect();
    if (!rect) return;
    
    this.overlay.style.transition = "none";
    Object.assign(this.overlay.style, {
      width: `${rect.width}px`,
      height: `${rect.height + 4}px`,
      top: `${rect.top + window.scrollY}px`,
      left: `${rect.left + window.scrollX}px`
    });
    
    const tooltip = this.overlay.querySelector(".hover-tooltip");
    if (tooltip) {
      tooltip.style.transform = "translate(-50%, -6px)";
      tooltip.style.left = "50%";
    }
  }

  _resetHighlight() {
    if (this.activeBlock.length) {
      this.activeBlock.forEach(element => {
        element.classList.remove(this.highlightClass);
        
        const actions = element.querySelector("#chat-message-actions");
        if (actions) {
          const hiddenAction = this.hiddenActions.find(item => item.element === actions);
          if (hiddenAction) actions.style.display = hiddenAction.originalDisplay;
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
      this._updateCursorTooltip();
      
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

  _updateCursorTooltip() {
    if (this.altNavigationMode) {
      const activeUser = this.activeElement ? this._uniqueName(this.activeElement) : "Selection";
      const contentEl = this.cursorTooltip.querySelector(".cursor-tooltip-content");
      const colorDot = contentEl.querySelector(".username-color-dot");
      const usernameText = contentEl.querySelector(".username-text");
      
      if (this.activeElement) {
        const userColor = this._getUsernameColor(this.activeElement);
        if (colorDot) {
          colorDot.style.backgroundColor = userColor;
        }
        if (usernameText) {
          usernameText.textContent = activeUser;
          usernameText.style.color = userColor;
        }
      } else {
        if (colorDot) {
          colorDot.style.backgroundColor = "#ffffff";
        }
        if (usernameText) {
          usernameText.textContent = "Selection";
          usernameText.style.color = "#ffffff";
        }
      }
      
      this.cursorTooltip.style.left = `${this.mousePos.x}px`;
      this.cursorTooltip.style.top = `${this.mousePos.y}px`;
    }
  }

  _startUpdater() {
    if (this.updaterId) return;
    
    const update = () => {
      if (this.activeElement) {
        this._updateOverlayPosition();
        
        if (this.altNavigationMode) {
          this._updateCursorTooltip();
        }
        
        this.updaterId = requestAnimationFrame(update);
      }
    };
    
    this.updaterId = requestAnimationFrame(update);
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
        this._updateCursorTooltip();
      }
      
      this._highlightBlock(candidate);
    } else if (!this.activeElement) {
      this._highlightBlock(candidate);
    }
  }

  _handleIncrement(down = true) {
    this._enterAltNavigationMode();
    this._refreshCandidates(true);
    
    if (!this.activeElement && this.candidateElements.length > 0) {
      const initialIndex = down ? 0 : this.candidateElements.length - 1;
      this._highlightBlock(this.candidateElements[initialIndex]);
      this._updateCursorTooltip();
      return;
    }
    
    if (!this.activeElement) return;
    
    const currentIndex = this.candidateElements.indexOf(this.activeElement);
    if (currentIndex < 0) return;
    
    let nextIndex = currentIndex;
    if (down && currentIndex < this.candidateElements.length - 1) {
      nextIndex = currentIndex + 1;
    } else if (!down && currentIndex > 0) {
      nextIndex = currentIndex - 1;
    }
    
    if (nextIndex !== currentIndex) {
      this._updateCursorTooltip();
      this._highlightBlock(this.candidateElements[nextIndex]);
      
      const rect = this.candidateElements[nextIndex].getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      this.virtualOffset = midpoint - this.mousePos.y;
      this.lastMousePos = { 
        x: this.mousePos.x, 
        y: this.mousePos.y + this.virtualOffset + this.scrollOffsetY 
      };
      
      if (!this._isInViewport(this.candidateElements[nextIndex])) {
        this.candidateElements[nextIndex].scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
      
      this._updateCursorTooltip();
    }
  }

  _trySelectByTypedSequence() {
    if (!this.typedSequence) return;
    
    this._enterAltNavigationMode();
    
    const lowerSeq = this.typedSequence.toLowerCase();
    this._refreshCandidates(true);
    
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
    
    if (!matches || matches.length === 0) return;
    
    this._updateCursorTooltip();
    
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
        
        this._updateCursorTooltip();
        return;
      }
    }
    
    matches.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectB.top - rectA.top;
    });
    
    const bottomMatch = matches[0];
    this._highlightBlock(bottomMatch);
    
    const rect = bottomMatch.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    this.virtualOffset = midpoint - this.mousePos.y;
    this.lastMousePos = { 
      x: this.mousePos.x, 
      y: this.mousePos.y + this.virtualOffset + this.scrollOffsetY 
    };
    
    if (!this._isInViewport(bottomMatch)) {
      bottomMatch.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    this._updateCursorTooltip();
  }

  destroy() {
    if (this._initializationTimer) {
      clearTimeout(this._initializationTimer);
    }
    
    if (this._periodicRefreshTimer) {
      clearInterval(this._periodicRefreshTimer);
    }
    
    if (this.typedTimeoutId) {
      clearTimeout(this.typedTimeoutId);
    }
    
    if (this.updaterId) {
      cancelAnimationFrame(this.updaterId);
    }
    
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    
    if (this.cursorTooltip && this.cursorTooltip.parentNode) {
      this.cursorTooltip.parentNode.removeChild(this.cursorTooltip);
    }
    
    this.doc.body.classList.remove(this.noSelectClass, "selection-mode", this.altNavModeClass);
    
    this._resetHighlight();
  }
}
