/**
 * Unified Cloud - Public Support Ticketing System Client Module
 * Production-ready modal, validation, attachment handling, and real-time thread tracking.
 */

(function () {
  'use strict';

  // Rule Check: strictly exclude homepage and intro page from displaying entry points
  function isHomepageOrIntro() {
    const p = window.location.pathname.toLowerCase();
    const h = (window.location.hash || '').toLowerCase();

    // Intro page (Fly into the future.html)
    if (p.includes('fly into the future') || p.includes('fly into the future.html')) return true;

    // Homepage root (when on index.html with no hash or hero layers active)
    if ((p === '/' || p.endsWith('/index.html') || p === '') && (!h || h === '#' || h === '#a' || h === '#b' || h === '#c')) {
      return true;
    }

    return false;
  }
  const isExcludedPage = isHomepageOrIntro;

  let catalogData = {
    categories: [],
    priorities: [],
    products: []
  };

  let activeAttachments = [];
  let currentLookupTicket = null;

  // Initialize Support Component
  async function initSupportModule() {
    // Inject CSS if not present
    if (!document.querySelector('link[href*="support-ticket.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'assets/css/support-ticket.css';
      document.head.appendChild(link);
    }

    // Do NOT build modal DOM eagerly on excluded homepage during load!
    // Modal will build lazily when triggered or if page hash explicitly targets #support.
    if (!isHomepageOrIntro() || window.location.hash === '#support' || window.location.hash === '#p-support') {
      buildModalDOM();
      fetchCatalog();
    }

    // Setup entry points based on page rules
    setupPageEntryPoints();

    // Handle initial hash
    if (window.location.hash === '#support' || window.location.hash === '#p-support') {
      window.openSupportTicketModal('submit');
    }

    window.addEventListener('hashchange', () => {
      if (window.location.hash === '#support' || window.location.hash === '#p-support') {
        window.openSupportTicketModal('submit');
      }
      setupPageEntryPoints();
    });
  }

  let cartObserverAttached = false;

  function syncFloatingButtonWithCart() {
    const trigger = document.getElementById('unifiedSupportFloatingBtn');
    if (!trigger) return;
    const cartEl = document.getElementById('cart');
    const isCartOpen = (cartEl && cartEl.classList.contains('on')) ||
                       document.body.classList.contains('cart-drawer-open');
    // Only write when the state actually changes. classList.add/remove always rewrite the class
    // attribute (even when nothing changes), which queues a new mutation record; inside the
    // MutationObserver below that re-triggered this function forever and froze the page on the
    // second navigation.
    if (trigger.classList.contains('cart-hidden') !== isCartOpen) {
      trigger.classList.toggle('cart-hidden', isCartOpen);
    }
  }

  // Setup Entry Points according to rules
  function setupPageEntryPoints() {
    let trigger = document.getElementById('unifiedSupportFloatingBtn');

    if (isHomepageOrIntro()) {
      // Excluded on homepage and intro page
      if (trigger) {
        trigger.style.display = 'none';
        trigger.remove();
      }
      return;
    }

    // Show floating button on applicable pages
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.id = 'unifiedSupportFloatingBtn';
      trigger.className = 'spt-floating-trigger';
      trigger.type = 'button';
      trigger.setAttribute('aria-label', 'Open Support Desk');
      trigger.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>Support Tickets</span>
      `;
      trigger.addEventListener('click', () => {
        window.openSupportTicketModal('submit');
      });
      document.body.appendChild(trigger);
    }

    trigger.style.display = 'flex';
    syncFloatingButtonWithCart();

    if (!cartObserverAttached && typeof MutationObserver !== 'undefined') {
      cartObserverAttached = true;
      const observer = new MutationObserver(() => {
        syncFloatingButtonWithCart();
      });
      // Watch only the two elements whose classes signal an open cart (body.cart-drawer-open and #cart.on).
      // Observing the whole subtree also fired for the header, slide panels and overlays, which change
      // class on every animation frame.
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      const cartEl = document.getElementById('cart');
      if (cartEl) observer.observe(cartEl, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // Fetch product catalog for support dropdowns
  async function fetchCatalog() {
    try {
      const res = await fetch('/api/support/catalog');
      if (res.ok) {
        catalogData = await res.json();
        populateCatalogDropdowns();
      }
    } catch (e) {
      console.warn('Support catalog fetch error:', e);
    }
  }

  function populateCatalogDropdowns() {
    const catSelect = document.getElementById('sptCategorySelect');
    if (catSelect && catalogData.categories) {
      catSelect.innerHTML = catalogData.categories.map(c => 
        `<option value="${c.id}">${c.name}</option>`
      ).join('');
    }

    const prodSelect = document.getElementById('sptProductSelect');
    if (prodSelect && catalogData.products) {
      prodSelect.innerHTML = `<option value="">-- General Issue / No Specific Product --</option>` +
        catalogData.products.map(p => 
          `<option value="${p.code || p.id}">[${p.category}] ${p.name}</option>`
        ).join('');
    }
  }

  // Build Modal DOM
  function buildModalDOM() {
    if (document.getElementById('unifiedSupportModal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'unifiedSupportModal';
    overlay.className = 'spt-modal-overlay';
    overlay.style.display = 'none'; // Critical: Prevents any flash of unstyled content
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
      <div class="spt-modal-card">
        <!-- Header -->
        <div class="spt-modal-header">
          <div class="spt-header-left">
            <div class="spt-header-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div>
              <div class="spt-modal-title">Unified IT 24/7 Support Desk</div>
              <div class="spt-modal-subtitle">Enterprise Cloud Infrastructure & SLA-Backed Incident Management</div>
            </div>
          </div>
          <button type="button" class="spt-close-btn" id="sptCloseBtn" aria-label="Close modal">&times;</button>
        </div>

        <!-- Navigation Tabs -->
        <div class="spt-tabs-nav">
          <button type="button" class="spt-tab-btn active" id="sptTabBtnSubmit" data-tab="submit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create New Ticket
          </button>
          <button type="button" class="spt-tab-btn" id="sptTabBtnTrack" data-tab="track">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Track Ticket & Replies
          </button>
        </div>

        <!-- Scrollable Modal Body -->
        <div class="spt-modal-body">
          <!-- VIEW 1: SUBMIT NEW TICKET -->
          <div id="sptSubmitView">
            <div id="sptSuccessAlert" style="display:none;" class="spt-success-box">
              <div style="font-size:24px; margin-bottom:8px;">✅</div>
              <h3 style="color:#fff; font-size:18px; margin-bottom:6px;">Support Ticket Registered Successfully</h3>
              <p style="color:var(--spt-text-muted); font-size:13px; max-width:540px; margin:0 auto 12px;">
                Our cloud engineering team has received your ticket. Please save your reference number to track updates or attach additional diagnostics.
              </p>
              <div>
                <span class="spt-ref-display" id="sptSuccessRefNum">TCK-2026-XXXXX</span>
              </div>
              <div style="display:flex; gap:10px; justify-content:center; margin-top:14px;">
                <button type="button" class="spt-btn spt-btn-secondary" id="sptCopyRefBtn">Copy Reference</button>
                <button type="button" class="spt-btn spt-btn-primary" id="sptViewCreatedBtn">Track Ticket Now &rarr;</button>
              </div>
            </div>

            <form id="sptTicketForm">
              <div id="sptFormErrorAlert" style="display:none; padding:12px; border-radius:8px; background:rgba(244,63,94,0.15); border:1px solid rgba(244,63,94,0.4); color:#fecdd3; font-size:13px; margin-bottom:16px;"></div>

              <div class="spt-form-group">
                <label class="spt-form-label" for="sptSubject">Ticket Subject <span class="req">*</span></label>
                <input type="text" id="sptSubject" class="spt-input" required placeholder="e.g. BGP latency anomaly or Cloud VPS disk expansion request" minlength="3">
              </div>

              <div class="spt-form-grid">
                <div class="spt-form-group">
                  <label class="spt-form-label" for="sptCategorySelect">Issue Category <span class="req">*</span></label>
                  <select id="sptCategorySelect" class="spt-select">
                    <option value="TECHNICAL">Technical Support & Troubleshooting</option>
                    <option value="INFRASTRUCTURE">Cloud Infrastructure, VMs & Network</option>
                    <option value="BILLING">Billing, Invoicing & Tax Challan</option>
                    <option value="EMAIL_HOSTING">Business Email & Hybrid 365</option>
                    <option value="SECURITY">Cyber Security & SSL Certificates</option>
                  </select>
                </div>

                <div class="spt-form-group">
                  <label class="spt-form-label" for="sptProductSelect">Related Service / Product</label>
                  <select id="sptProductSelect" class="spt-select">
                    <option value="">-- General Issue / No Specific Product --</option>
                  </select>
                </div>
              </div>

              <!-- Priority Selector -->
              <div class="spt-form-group">
                <label class="spt-form-label">Impact & Priority Level <span class="req">*</span></label>
                <div class="spt-prio-chips" id="sptPrioChips">
                  <button type="button" class="spt-prio-chip" data-prio="LOW">
                    <div>🟢 Low</div>
                    <small style="opacity:0.7;">SLA: 72 hrs</small>
                  </button>
                  <button type="button" class="spt-prio-chip active" data-prio="NORMAL">
                    <div>🔵 Normal</div>
                    <small style="opacity:0.7;">SLA: 24 hrs</small>
                  </button>
                  <button type="button" class="spt-prio-chip" data-prio="HIGH">
                    <div>🟠 High</div>
                    <small style="opacity:0.7;">SLA: 6 hrs</small>
                  </button>
                  <button type="button" class="spt-prio-chip" data-prio="CRITICAL">
                    <div>🔴 Critical</div>
                    <small style="opacity:0.7;">SLA: 2 hrs</small>
                  </button>
                </div>
                <input type="hidden" id="sptPriorityInput" value="NORMAL">
              </div>

              <div class="spt-form-grid">
                <div class="spt-form-group">
                  <label class="spt-form-label" for="sptRequesterName">Your Full Name <span class="req">*</span></label>
                  <input type="text" id="sptRequesterName" class="spt-input" required placeholder="e.g. Tanvir Rahman">
                </div>

                <div class="spt-form-group">
                  <label class="spt-form-label" for="sptRequesterEmail">Registered / Work Email <span class="req">*</span></label>
                  <input type="email" id="sptRequesterEmail" class="spt-input" required placeholder="name@company.com">
                </div>
              </div>

              <div class="spt-form-grid">
                <div class="spt-form-group">
                  <label class="spt-form-label" for="sptRequesterPhone">Phone / Mobile (Optional)</label>
                  <input type="tel" id="sptRequesterPhone" class="spt-input" placeholder="+880 1700 000000">
                </div>

                <div class="spt-form-group">
                  <label class="spt-form-label" for="sptRelatedResource">Related VM / Order / IP (Optional)</label>
                  <input type="text" id="sptRelatedResource" class="spt-input" placeholder="e.g. vm-dhaka-04 or 103.145.22.10">
                </div>
              </div>

              <div class="spt-form-group">
                <label class="spt-form-label" for="sptDescription">Detailed Issue Description <span class="req">*</span></label>
                <textarea id="sptDescription" class="spt-textarea" required placeholder="Please describe the symptoms, steps to reproduce, error codes, and business impact..." minlength="5"></textarea>
              </div>

              <!-- Attachments Area -->
              <div class="spt-form-group">
                <label class="spt-form-label">Diagnostics & Attachments (Screenshots, Logs, PDF - Max 10MB)</label>
                <div class="spt-attach-dropzone" id="sptDropzone" onclick="document.getElementById('sptFileInput').click()">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--spt-teal); margin-bottom:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <div style="font-size:13px; font-weight:600; color:#fff;">Click to select file or drag &amp; drop</div>
                  <div style="font-size:11px; color:var(--spt-text-muted);">Permitted: PNG, JPG, WEBP, PDF, TXT, LOG, ZIP</div>
                </div>
                <input type="file" id="sptFileInput" style="display:none;" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.log,.zip">
                <div class="spt-attach-list" id="sptAttachList"></div>
              </div>

              <div class="spt-form-actions">
                <button type="button" class="spt-btn spt-btn-secondary" onclick="window.closeSupportTicketModal()">Cancel</button>
                <button type="submit" class="spt-btn spt-btn-primary" id="sptSubmitBtn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  Submit Support Ticket
                </button>
              </div>
            </form>
          </div>

          <!-- VIEW 2: TRACK TICKET & REPLIES -->
          <div id="sptTrackView" style="display:none;">
            <!-- Lookup Form -->
            <form id="sptLookupForm" style="margin-bottom:20px; background:rgba(255,255,255,0.02); padding:16px; border-radius:10px; border:1px solid var(--spt-border);">
              <div class="spt-form-grid" style="margin-bottom:12px;">
                <div class="spt-form-group" style="margin-bottom:0;">
                  <label class="spt-form-label" for="sptLookupRef">Ticket Reference Number</label>
                  <input type="text" id="sptLookupRef" class="spt-input" required placeholder="e.g. TCK-2026-901">
                </div>
                <div class="spt-form-group" style="margin-bottom:0;">
                  <label class="spt-form-label" for="sptLookupEmail">Registered Email Address</label>
                  <input type="email" id="sptLookupEmail" class="spt-input" required placeholder="name@company.com">
                </div>
              </div>
              <div style="display:flex; justify-content:flex-end;">
                <button type="submit" class="spt-btn spt-btn-primary" id="sptLookupBtn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Find Ticket Thread
                </button>
              </div>
            </form>

            <div id="sptLookupStatusAlert" style="display:none;"></div>

            <!-- Thread Details View (Shown after successful lookup) -->
            <div id="sptThreadContainer" style="display:none;" class="spt-thread-view">
              <div class="spt-ticket-banner" id="sptTicketHeaderBanner">
                <!-- Dynamically rendered -->
              </div>

              <!-- Message History Thread -->
              <h4 style="color:#fff; font-size:14px; margin-top:12px;">Conversation History &amp; Staff Updates</h4>
              <div class="spt-messages-list" id="sptThreadMessages"></div>

              <!-- Reply Form -->
              <form id="sptThreadReplyForm" style="background:rgba(255,255,255,0.03); padding:16px; border-radius:10px; border:1px solid var(--spt-border);">
                <label class="spt-form-label" for="sptThreadReplyMsg">Post a Reply / Follow-up Information</label>
                <textarea id="sptThreadReplyMsg" class="spt-textarea" required placeholder="Type your response or answer engineer questions..." minlength="2"></textarea>
                <div style="display:flex; justify-content:flex-end; margin-top:12px;">
                  <button type="submit" class="spt-btn spt-btn-primary" id="sptSendReplyBtn">
                    Send Reply
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Bind Event Listeners
    setupModalEventListeners();
  }

  function setupModalEventListeners() {
    const modal = document.getElementById('unifiedSupportModal');
    const closeBtn = document.getElementById('sptCloseBtn');

    closeBtn.addEventListener('click', window.closeSupportTicketModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) window.closeSupportTicketModal();
    });

    // Tab Switching
    document.getElementById('sptTabBtnSubmit').addEventListener('click', () => switchTab('submit'));
    document.getElementById('sptTabBtnTrack').addEventListener('click', () => switchTab('track'));

    // Priority chips
    document.querySelectorAll('#sptPrioChips .spt-prio-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#sptPrioChips .spt-prio-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('sptPriorityInput').value = chip.getAttribute('data-prio');
      });
    });

    // File attachments
    const fileInput = document.getElementById('sptFileInput');
    fileInput.addEventListener('change', handleFileSelection);

    // Form Submissions
    document.getElementById('sptTicketForm').addEventListener('submit', handleTicketSubmit);
    document.getElementById('sptLookupForm').addEventListener('submit', handleLookupSubmit);
    document.getElementById('sptThreadReplyForm').addEventListener('submit', handleThreadReplySubmit);

    // Copy ref button
    document.getElementById('sptCopyRefBtn').addEventListener('click', () => {
      const ref = document.getElementById('sptSuccessRefNum').textContent;
      navigator.clipboard.writeText(ref).then(() => {
        const btn = document.getElementById('sptCopyRefBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Reference'; }, 2000);
      });
    });

    // Track button from success
    document.getElementById('sptViewCreatedBtn').addEventListener('click', () => {
      const ref = document.getElementById('sptSuccessRefNum').textContent;
      const email = document.getElementById('sptRequesterEmail').value;
      switchTab('track');
      document.getElementById('sptLookupRef').value = ref;
      document.getElementById('sptLookupEmail').value = email;
      document.getElementById('sptLookupBtn').click();
    });
  }

  function switchTab(tabName) {
    const submitBtn = document.getElementById('sptTabBtnSubmit');
    const trackBtn = document.getElementById('sptTabBtnTrack');
    const submitView = document.getElementById('sptSubmitView');
    const trackView = document.getElementById('sptTrackView');

    if (tabName === 'submit') {
      submitBtn.classList.add('active');
      trackBtn.classList.remove('active');
      submitView.style.display = 'block';
      trackView.style.display = 'none';
    } else {
      trackBtn.classList.add('active');
      submitBtn.classList.remove('active');
      trackView.style.display = 'block';
      submitView.style.display = 'none';
    }
  }

  // Handle File Selection
  async function handleFileSelection(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File exceeds 10MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result;
      try {
        const res = await fetch('/api/support/attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64Data
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Upload failed');

        activeAttachments.push({
          fileName: data.fileName,
          filePath: data.filePath,
          fileSize: data.fileSize,
          mimeType: data.mimeType
        });
        renderAttachmentList();
      } catch (err) {
        alert('Attachment failed: ' + err.message);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function renderAttachmentList() {
    const list = document.getElementById('sptAttachList');
    list.innerHTML = activeAttachments.map((att, idx) => `
      <div class="spt-attach-badge">
        <span>📎 ${att.fileName}</span>
        <span class="spt-attach-remove" onclick="window.__removeSupportAttach(${idx})">&times;</span>
      </div>
    `).join('');
  }

  window.__removeSupportAttach = function (idx) {
    activeAttachments.splice(idx, 1);
    renderAttachmentList();
  };

  // Submit Ticket Form
  async function handleTicketSubmit(e) {
    e.preventDefault();
    const errorBox = document.getElementById('sptFormErrorAlert');
    const submitBtn = document.getElementById('sptSubmitBtn');
    errorBox.style.display = 'none';

    const payload = {
      subject: document.getElementById('sptSubject').value.trim(),
      category: document.getElementById('sptCategorySelect').value,
      relatedProductCode: document.getElementById('sptProductSelect').value || null,
      priority: document.getElementById('sptPriorityInput').value,
      requesterName: document.getElementById('sptRequesterName').value.trim(),
      requesterEmail: document.getElementById('sptRequesterEmail').value.trim(),
      buyerPhone: document.getElementById('sptRequesterPhone').value.trim() || null,
      relatedServiceId: document.getElementById('sptRelatedResource').value.trim() || null,
      description: document.getElementById('sptDescription').value.trim(),
      attachments: activeAttachments
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Submitting...</span>`;

    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Submission error');

      document.getElementById('sptTicketForm').style.display = 'none';
      const successBox = document.getElementById('sptSuccessAlert');
      document.getElementById('sptSuccessRefNum').textContent = data.ticketNumber;
      successBox.style.display = 'block';

      activeAttachments = [];
      renderAttachmentList();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Submit Support Ticket
      `;
    }
  }

  // Lookup Ticket Thread
  async function handleLookupSubmit(e) {
    e.preventDefault();
    const ref = document.getElementById('sptLookupRef').value.trim();
    const email = document.getElementById('sptLookupEmail').value.trim();
    const alertBox = document.getElementById('sptLookupStatusAlert');
    const container = document.getElementById('sptThreadContainer');

    alertBox.style.display = 'none';
    container.style.display = 'none';

    try {
      const res = await fetch(`/api/support/tickets/lookup?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ticket not found');

      currentLookupTicket = data.ticket;
      renderThreadView(data);
      container.style.display = 'flex';
    } catch (err) {
      alertBox.className = 'spt-form-status error';
      alertBox.style.cssText = 'display:block; padding:12px; border-radius:8px; background:rgba(244,63,94,0.15); border:1px solid rgba(244,63,94,0.4); color:#fecdd3; font-size:13px; margin-bottom:16px;';
      alertBox.textContent = err.message;
    }
  }

  function renderThreadView(data) {
    const t = data.ticket;
    const banner = document.getElementById('sptTicketHeaderBanner');

    const statusBadge = `<span class="spt-badge spt-badge-${t.status.toLowerCase()}">${t.status}</span>`;
    const prioBadge = `<span class="spt-badge" style="background:rgba(255,255,255,0.08);color:#fff;">${t.priority}</span>`;

    banner.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
        <div>
          <div style="font-family:monospace; color:var(--spt-teal); font-weight:700; font-size:13px;">${t.ticket_number}</div>
          <h3 style="color:#fff; font-size:16px; margin:4px 0;">${t.subject}</h3>
        </div>
        <div style="display:flex; gap:6px;">
          ${statusBadge}
          ${prioBadge}
        </div>
      </div>
      <div style="font-size:12.5px; color:var(--spt-text-muted); display:flex; flex-wrap:wrap; gap:16px;">
        <span><strong>Category:</strong> ${t.category}</span>
        <span><strong>Requester:</strong> ${t.requester_name}</span>
        <span><strong>SLA Target:</strong> ${t.sla_due_at ? t.sla_due_at.slice(0, 16) : 'Standard'}</span>
      </div>
    `;

    const msgsList = document.getElementById('sptThreadMessages');
    msgsList.innerHTML = data.messages.map(m => {
      const isStaff = m.author_type === 'STAFF';
      const isPartner = m.author_type === 'PARTNER';
      const cls = isStaff ? 'staff' : (isPartner ? 'partner' : '');
      const badgeRole = isStaff ? '<span style="color:var(--spt-teal); font-size:11px; margin-left:6px;">[Unified Support Engineer]</span>' : (isPartner ? '<span style="color:var(--spt-purple); font-size:11px; margin-left:6px;">[Partner Reseller Desk]</span>' : '');

      return `
        <div class="spt-msg-item ${cls}">
          <div class="spt-msg-header">
            <span class="spt-msg-author">${m.author_name} ${badgeRole}</span>
            <span class="spt-msg-time">${m.created_at ? m.created_at.slice(0, 16) : ''}</span>
          </div>
          <div class="spt-msg-body">${m.message}</div>
        </div>
      `;
    }).join('');
  }

  // Handle Thread Reply
  async function handleThreadReplySubmit(e) {
    e.preventDefault();
    if (!currentLookupTicket) return;

    const msg = document.getElementById('sptThreadReplyMsg').value.trim();
    const email = document.getElementById('sptLookupEmail').value.trim();
    const btn = document.getElementById('sptSendReplyBtn');

    btn.disabled = true;
    try {
      const res = await fetch(`/api/support/tickets/${currentLookupTicket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Reply failed');

      document.getElementById('sptThreadReplyMsg').value = '';
      // Refresh lookup thread
      document.getElementById('sptLookupBtn').click();
    } catch (err) {
      alert('Failed to post reply: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // Global APIs
  window.openSupportTicketModal = function (mode = 'submit', ticketRef = '', email = '') {
    buildModalDOM();
    if (!catalogData.categories || !catalogData.categories.length) {
      fetchCatalog();
    }
    const modal = document.getElementById('unifiedSupportModal');
    if (!modal) return;
    modal.style.display = 'flex';
    void modal.offsetWidth; // Force layout reflow for animation
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (mode === 'track') {
      switchTab('track');
      if (ticketRef) document.getElementById('sptLookupRef').value = ticketRef;
      if (email) document.getElementById('sptLookupEmail').value = email;
      if (ticketRef && email) document.getElementById('sptLookupBtn').click();
    } else {
      switchTab('submit');
      document.getElementById('sptTicketForm').style.display = 'block';
      document.getElementById('sptSuccessAlert').style.display = 'none';
    }
  };

  window.closeSupportTicketModal = function () {
    const modal = document.getElementById('unifiedSupportModal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      setTimeout(() => {
        if (!modal.classList.contains('active')) {
          modal.style.display = 'none';
        }
      }, 260);
    }
  };

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupportModule);
  } else {
    initSupportModule();
  }
})();
