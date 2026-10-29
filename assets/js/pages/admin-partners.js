/* Moved out of admin-partners.html so the Content-Security-Policy can forbid inline script. */

// Value placed inside a data-on…="fn('…')" attribute: escape it as a JS string literal first (\ and '),
// then for the HTML attribute. assets/js/csp-handlers.js parses the call, so a value can never become code.
function handlerArg(v) {
  const js = String(v === null || v === undefined ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return js.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// =========================================================================
// 1. Ambient Dynamic Three.js Particle Background (Compatible with Website)
// =========================================================================
try {
  const cv = document.getElementById('ptn-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 10;

  const N = 1800;
  const pos = new Float32Array(N * 3);
  const sd = new Float32Array(N);
  const sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 32;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 18 - 2;
    sd[i] = Math.random();
    sz[i] = 0.5 + Math.random() * 1.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));

  particleMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPx: { value: renderer.getPixelRatio() },
      uTint: { value: new THREE.Color().setHSL(190 / 360, 0.85, 0.65) }
    },
    vertexShader: `
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime, uPx;
      varying float vTw;
      void main() {
        vec3 p = position;
        float sp = 0.15 + aSeed * 0.45;
        p.y = mod(p.y - uTime * sp + 9.0, 18.0) - 9.0;
        p.x += sin(uTime * 0.3 + aSeed * 18.0) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vTw = pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed * 3.0)), 4.0);
        gl_PointSize = aSize * (1.0 + vTw * 1.5) * (30.0 / -mv.z) * uPx;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uTint;
      varying float vTw;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float gl = smoothstep(0.5, 0.0, d);
        vec3 col = mix(uTint, vec3(0.9, 0.98, 1.0), vTw * 0.7);
        float a = gl * gl * 0.55;
        gl_FragColor = vec4(col * a, a);
      }
    `
  });
  scene.add(new THREE.Points(geo, particleMat));

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  onResize();

  const clock = new THREE.Clock();
  function renderLoop() {
    requestAnimationFrame(renderLoop);
    if (particleMat) {
      particleMat.uniforms.uTime.value = clock.getElapsedTime();
      particleMat.uniforms.uPx.value = renderer.getPixelRatio();
    }
    renderer.render(scene, camera);
  }
  renderLoop();
} catch (e) {
  console.warn('[ThreeJS ambient background]', e);
}

// =========================================================================
// Background Theme Management (Compatible with Website Presets)
// =========================================================================
const THEMES = {
  cosmic: {
    name: 'Cosmic Deep Space',
    icon: '🌌',
    color: new THREE.Color().setHSL(190 / 360, 0.85, 0.65)
  },
  twilight: {
    name: 'Twilight Horizon',
    icon: '🌆',
    color: new THREE.Color().setHSL(280 / 360, 0.85, 0.68)
  },
  cyber: {
    name: 'Cyber Matrix Grid',
    icon: '⚡',
    color: new THREE.Color().setHSL(165 / 360, 0.95, 0.62)
  },
  obsidian: {
    name: 'Midnight Obsidian',
    icon: '🌑',
    color: new THREE.Color().setHSL(215 / 360, 0.25, 0.80)
  }
};

function applyAdminTheme(themeKey) {
  if (!THEMES[themeKey]) themeKey = 'cosmic';
  document.body.setAttribute('data-admin-theme', themeKey);

  const themeBtnIcon = document.getElementById('theme-btn-icon');
  const themeBtnLabel = document.getElementById('theme-btn-label');
  if (themeBtnIcon) themeBtnIcon.textContent = THEMES[themeKey].icon;
  if (themeBtnLabel) themeBtnLabel.textContent = THEMES[themeKey].name;

  document.querySelectorAll('.admin-theme-option-btn').forEach(btn => {
    if (btn.getAttribute('data-theme') === themeKey) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (particleMat && particleMat.uniforms && particleMat.uniforms.uTint) {
    particleMat.uniforms.uTint.value = THEMES[themeKey].color;
  }

  localStorage.setItem('unified_admin_theme', themeKey);
}

const themeBtn = document.getElementById('admin-theme-btn');
const themeDropdown = document.getElementById('admin-theme-dropdown');
if (themeBtn && themeDropdown) {
  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    themeDropdown.style.display = themeDropdown.style.display === 'block' ? 'none' : 'block';
  });
  document.addEventListener('click', () => {
    themeDropdown.style.display = 'none';
  });
  document.querySelectorAll('.admin-theme-option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const selected = btn.getAttribute('data-theme');
      applyAdminTheme(selected);
      themeDropdown.style.display = 'none';
      showBanner(`Background theme switched to ${THEMES[selected].name}`);
    });
  });
}

// Apply saved theme on boot
applyAdminTheme(localStorage.getItem('unified_admin_theme') || 'cosmic');

// Live BST Dhaka Clock
function updateClock() {
  const now = new Date();
  const options = { timeZone: 'Asia/Dhaka', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const clockEl = document.getElementById('live-bst-clock');
  if (clockEl) {
    clockEl.textContent = `Dhaka: ${now.toLocaleTimeString('en-US', options)} (BST)`;
  }
}
setInterval(updateClock, 1000);
updateClock();

// =========================================================================
// 2. Authentication & Admin Application Core
// =========================================================================
let cachedApps = [];
let cachedPartners = [];
let cachedRules = [];
let cachedAudit = [];
let cachedPayouts = [];
let cachedAdminPolicy = null;
let cachedAdminRewardTx = [];

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SECURITY_ADMIN', 'INFRASTRUCTURE_ADMIN', 'FINANCE_ADMIN', 'PARTNER_MANAGER', 'SUPPORT_ADMIN', 'CONTENT_ADMIN', 'AUDITOR'];

async function checkAdminAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated && ADMIN_ROLES.includes(data.user.role)) {
      showAdminDashboard(data.user);
    } else {
      showAdminLogin();
    }
  } catch {
    showAdminLogin();
  }
}

function showAdminLogin() {
  document.getElementById('admin-login-view').style.display = 'block';
  document.getElementById('admin-dashboard-view').style.display = 'none';
  document.getElementById('admin-logout-btn').style.display = 'none';
  document.getElementById('export-menu-btn').style.display = 'none';
  document.getElementById('admin-nav-meta').style.display = 'none';
}

function showAdminDashboard(user) {
  document.getElementById('admin-login-view').style.display = 'none';
  document.getElementById('admin-dashboard-view').style.display = 'block';
  document.getElementById('admin-logout-btn').style.display = 'inline-flex';
  document.getElementById('export-menu-btn').style.display = 'inline-flex';
  document.getElementById('admin-nav-meta').style.display = 'flex';
  if (user && user.email) {
    document.getElementById('admin-user-email').textContent = user.email;
  }

  refreshAllData();
}

// Refresh all data
async function refreshAllData() {
  await Promise.all([
    loadApplications(),
    loadPartners(),
    loadTiers(),
    loadPricingRules(),
    loadPayouts(),
    loadAuditLogs(),
    loadRewardsAdmin()
  ]);
  updateKpis();
}

document.getElementById('admin-refresh-btn').addEventListener('click', () => {
  refreshAllData();
  showBanner('Refreshed latest data across all modules.');
});

// Update Executive KPI Strip
function updateKpis() {
  const pendingApps = cachedApps.filter(a => a.status === 'PENDING').length;
  document.getElementById('kpi-pending-apps').textContent = pendingApps;
  document.getElementById('badge-apps-count').textContent = pendingApps;
  if (pendingApps > 0) {
    document.getElementById('badge-apps-count').className = 'admin-tab-badge badge-pending';
  } else {
    document.getElementById('badge-apps-count').className = 'admin-tab-badge';
  }

  const activePartners = cachedPartners.filter(p => p.status === 'ACTIVE').length;
  document.getElementById('kpi-active-partners').textContent = activePartners;
  document.getElementById('badge-partners-count').textContent = cachedPartners.length;

  const totalSpend = cachedPartners.reduce((acc, p) => acc + Number(p.monthly_eligible_spend || 0), 0);
  document.getElementById('kpi-network-spend').textContent = '৳' + totalSpend.toLocaleString('en-US');

  const pendingPayouts = cachedPayouts.filter(p => p.status === 'PENDING');
  const pendingPayoutSum = pendingPayouts.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  document.getElementById('kpi-pending-payouts').textContent = '৳' + pendingPayoutSum.toLocaleString('en-US');
  document.getElementById('badge-payouts-count').textContent = pendingPayouts.length;

  document.getElementById('badge-rules-count').textContent = cachedRules.length;
  document.getElementById('badge-audit-count').textContent = cachedAudit.length;
}

// Password visibility toggle
const togglePassBtn = document.getElementById('toggle-password-btn');
if (togglePassBtn) {
  togglePassBtn.addEventListener('click', () => {
    const passInput = document.getElementById('admin-password');
    const eyeIcon = document.getElementById('eye-icon');
    if (passInput.type === 'password') {
      passInput.type = 'text';
      eyeIcon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
    } else {
      passInput.type = 'password';
      eyeIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
  });
}

// Quick-fill credentials helper
window.fillAdminCreds = function(email, pass) {
  const emailInput = document.getElementById('admin-email');
  const passInput = document.getElementById('admin-password');
  if (emailInput && passInput) {
    emailInput.value = email;
    passInput.value = pass;
    emailInput.style.borderColor = '#facc15';
    passInput.style.borderColor = '#facc15';
    setTimeout(() => {
      emailInput.style.borderColor = '';
      passInput.style.borderColor = '';
    }, 1000);
  }
};

// Admin Login
document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('admin-login-error');
  const errText = document.getElementById('admin-login-error-text');
  errBox.style.display = 'none';

  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.message || 'Login failed');
    if (!ADMIN_ROLES.includes(data.user.role)) throw new Error('Account does not possess administrator privileges.');
    showAdminDashboard(data.user);
  } catch (err) {
    if (errText) errText.textContent = err.message;
    else errBox.textContent = err.message;
    errBox.style.display = 'flex';
  }
});

// Logout
document.getElementById('admin-logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  showAdminLogin();
});

// Tab Switching
window.switchAdminTab = function(targetTab) {
  if (!targetTab) return;
  if (targetTab === 'partners') targetTab = 'tab-partners';
  if (targetTab === 'apps') targetTab = 'tab-apps';
  if (targetTab === 'rewards') targetTab = 'tab-rewards-mgmt';
  const btn = document.querySelector(`.admin-tab-btn[data-tab="${targetTab}"]`);
  const section = document.getElementById(targetTab);
  if (btn && section) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.ptn-admin-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    section.classList.add('active');
  }
};

document.querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    window.switchAdminTab(btn.getAttribute('data-tab'));
  });
});

// Check URL query or hash on load
try {
  const uParams = new URLSearchParams(window.location.search);
  const qTab = uParams.get('tab') || window.location.hash.replace('#', '');
  if (qTab) {
    setTimeout(() => window.switchAdminTab(qTab), 50);
  }
} catch (_) {}

// Wire KPI Box Clicks to Navigate directly to Relevant Tabs
document.querySelectorAll('.admin-kpi-box[data-goto-tab]').forEach(kpi => {
  kpi.addEventListener('click', () => {
    const targetTab = kpi.getAttribute('data-goto-tab');
    const tabBtn = document.querySelector(`.admin-tab-btn[data-tab="${targetTab}"]`);
    if (tabBtn) {
      tabBtn.click();
      if (targetTab === 'tab-apps') {
        const statusSelect = document.getElementById('app-filter-status');
        if (statusSelect && statusSelect.value !== 'PENDING') {
          statusSelect.value = 'PENDING';
          loadApplications();
        }
      }
    }
  });
});

// Export Dropdown
const exportBtn = document.getElementById('export-menu-btn');
const exportMenu = document.getElementById('export-dropdown-menu');
exportBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exportMenu.style.display = exportMenu.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', () => { exportMenu.style.display = 'none'; });

// Toast Notification Banner
function showBanner(msg) {
  const banner = document.getElementById('admin-action-banner');
  banner.textContent = msg;
  banner.style.display = 'block';
  setTimeout(() => { banner.style.display = 'none'; }, 6000);
}

// Modal Close Helper
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const modalId = btn.getAttribute('data-close');
    document.getElementById(modalId).style.display = 'none';
  });
});

// =========================================================================
// 3. Tab 1: Partner Applications Management
// =========================================================================
async function loadApplications() {
  const status = document.getElementById('app-filter-status').value;
  const res = await fetch(`/api/admin/applications?status=${status}`);
  const data = await res.json();
  cachedApps = data.applications || [];
  renderApplications();
}

function renderApplications() {
  const query = (document.getElementById('app-search-input').value || '').toLowerCase().trim();
  const filtered = cachedApps.filter(a => {
    if (!query) return true;
    return a.company_name.toLowerCase().includes(query) ||
           a.contact_name.toLowerCase().includes(query) ||
           a.email.toLowerCase().includes(query) ||
           a.reference_no.toLowerCase().includes(query);
  });

  const tbody = document.getElementById('admin-apps-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--ptn-text-muted);">No partner applications found matching criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => `
    <tr>
      <td><strong style="color:var(--ptn-cyan);">${a.reference_no}</strong></td>
      <td>
        <strong style="color:#fff;">${a.company_name}</strong><br>
        <small style="color:var(--ptn-text-muted);">${a.contact_name}</small>
        <div style="margin-top:4px; display:flex; gap:4px; font-size:10.5px;">
          <span style="background:${a.trade_license_pdf ? 'rgba(93,224,196,0.15)' : 'rgba(255,255,255,0.06)'}; color:${a.trade_license_pdf ? 'var(--ptn-cyan)' : 'var(--ptn-text-muted)'}; padding:1px 5px; border-radius:3px; border:1px solid ${a.trade_license_pdf ? 'rgba(93,224,196,0.3)' : 'rgba(255,255,255,0.1)'};">Trade License ${a.trade_license_pdf ? '✓ PDF' : '—'}</span>
          <span style="background:${a.nid_document_pdf ? 'rgba(93,224,196,0.15)' : 'rgba(255,255,255,0.06)'}; color:${a.nid_document_pdf ? 'var(--ptn-cyan)' : 'var(--ptn-text-muted)'}; padding:1px 5px; border-radius:3px; border:1px solid ${a.nid_document_pdf ? 'rgba(93,224,196,0.3)' : 'rgba(255,255,255,0.1)'};">NID ${a.nid_document_pdf ? '✓ PDF' : '—'}</span>
        </div>
      </td>
      <td>${a.email}<br><small style="color:var(--ptn-text-muted);">${a.phone}</small></td>
      <td>${a.business_type}</td>
      <td><strong>${a.estimated_monthly_spend}</strong><br><small style="color:var(--ptn-text-muted);">${a.expected_customers}</small></td>
      <td>
        <span class="${a.status === 'APPROVED' ? 'ptn-badge-running' : a.status === 'PENDING' ? 'ptn-badge-pending' : 'ptn-badge-pending'}" style="${a.status === 'REJECTED' ? 'background:rgba(239,68,68,0.2); color:#f87171;' : ''}">
          ${a.status}
        </span>
      </td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="ptn-table-action-btn view-app-btn" data-id="${a.id}">
            Details
          </button>
          ${a.status === 'PENDING' ? `
            <button class="ptn-table-action-btn approve-app-btn" data-id="${a.id}" data-ref="${a.reference_no}" data-company="${a.company_name}" style="background:var(--ptn-cyan); color:#070a14;">
              Approve
            </button>
            <button class="ptn-table-action-btn btn-danger reject-app-btn" data-id="${a.id}">
              Reject
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  // Wire View Details Modal
  document.querySelectorAll('.view-app-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const app = cachedApps.find(x => x.id === id);
      if (!app) return;
      showAppDetailModal(app);
    });
  });

  // Wire Approve Modal
  document.querySelectorAll('.approve-app-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openApproveModal(btn.getAttribute('data-id'), btn.getAttribute('data-ref'), btn.getAttribute('data-company'));
    });
  });

  // Wire Reject Action
  document.querySelectorAll('.reject-app-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to decline this partner application?')) return;
      const res = await fetch(`/api/admin/applications/${btn.getAttribute('data-id')}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes: 'Declined during review.' })
      });
      const data = await res.json();
      showBanner(data.message);
      loadApplications();
    });
  });
}

document.getElementById('app-search-input').addEventListener('input', renderApplications);
document.getElementById('app-filter-status').addEventListener('change', loadApplications);

// Global helper for opening PDF in new tab
window.viewDocPdf = function(appId, docType) {
  const app = cachedApps.find(x => x.id === appId);
  if (!app) return;
  const dataUri = docType === 'trade_license' ? app.trade_license_pdf : app.nid_document_pdf;
  if (!dataUri) return alert('No PDF document available.');

  try {
    const parts = dataUri.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf';
    const b64 = atob(parts[1] || parts[0]);
    const u8 = new Uint8Array(b64.length);
    for (let i = 0; i < b64.length; i++) u8[i] = b64.charCodeAt(i);
    const blob = new Blob([u8], { type: mime });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (e) {
    window.open(dataUri, '_blank');
  }
};

function showAppDetailModal(app) {
  const container = document.getElementById('modal-detail-content');
  const services = (app.services_of_interest || '').split(',').map(s => `<span class="ptn-badge-tag">${s.trim()}</span>`).join(' ');

  container.innerHTML = `
    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:10px; margin-bottom:16px; border:1px solid rgba(255,255,255,0.06);">
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <span style="color:var(--ptn-cyan); font-weight:700;">${app.reference_no}</span>
        <span class="ptn-badge-pending">${app.status}</span>
      </div>
      <h4 style="margin:0 0 4px; font-size:18px; color:#fff;">${app.company_name}</h4>
      <p style="margin:0; color:var(--ptn-text-muted); font-size:13px;">Applicant: ${app.contact_name} &bull; ${app.email} &bull; ${app.phone}</p>
      ${app.website ? `<p style="margin:4px 0 0; font-size:13px;"><a href="${app.website}" target="_blank" style="color:var(--ptn-cyan);">${app.website}</a></p>` : ''}
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
      <div><strong style="color:var(--ptn-text-muted);">Country:</strong> ${app.country}</div>
      <div><strong style="color:var(--ptn-text-muted);">Business Type:</strong> ${app.business_type}</div>
      <div><strong style="color:var(--ptn-text-muted);">Partnership Model:</strong> ${app.partnership_model}</div>
      <div><strong style="color:var(--ptn-text-muted);">Expected Customers:</strong> ${app.expected_customers}</div>
      <div style="grid-column:1/-1;"><strong style="color:var(--ptn-text-muted);">Target Monthly Spend:</strong> <span style="color:#60a5fa; font-weight:700;">${app.estimated_monthly_spend}</span></div>
    </div>

    <!-- Verification Documents Section -->
    <div style="margin-bottom:16px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:14px;">
      <strong style="display:block; margin-bottom:10px; color:#e2e8f0; font-size:13.5px;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--ptn-cyan)" stroke-width="2" style="vertical-align:middle; margin-right:6px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Uploaded Verification Documents (Mandatory PDF)
      </strong>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <!-- Trade License -->
        <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:12px;">
          <div style="font-weight:600; color:#fff; font-size:13px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span style="color:#ef4444; font-size:11px; background:rgba(239,68,68,0.15); padding:2px 6px; border-radius:4px; border:1px solid rgba(239,68,68,0.3); font-weight:700;">PDF</span>
            Trade License
          </div>
          <div style="font-size:12px; color:var(--ptn-text-muted); margin-bottom:8px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${app.trade_license_filename || 'Trade_License.pdf'}">
            ${app.trade_license_filename || 'Trade_License.pdf'}
          </div>
          ${app.trade_license_pdf ? `
            <div style="display:flex; gap:6px;">
              <button type="button" class="ptn-btn ptn-btn-secondary ptn-btn-sm" style="padding:4px 10px; font-size:11.5px;" data-onclick="window.viewDocPdf('${handlerArg(app.id)}', 'trade_license')">
                Preview PDF
              </button>
              <a href="${app.trade_license_pdf}" download="${app.trade_license_filename || 'Trade_License.pdf'}" class="ptn-btn ptn-btn-primary ptn-btn-sm" style="padding:4px 10px; font-size:11.5px; text-decoration:none;">
                Download
              </a>
            </div>
          ` : `
            <span style="color:var(--ptn-text-muted); font-size:12px;">No document uploaded</span>
          `}
        </div>

        <!-- NID Document -->
        <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:12px;">
          <div style="font-weight:600; color:#fff; font-size:13px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span style="color:#ef4444; font-size:11px; background:rgba(239,68,68,0.15); padding:2px 6px; border-radius:4px; border:1px solid rgba(239,68,68,0.3); font-weight:700;">PDF</span>
            National ID (NID)
          </div>
          <div style="font-size:12px; color:var(--ptn-text-muted); margin-bottom:8px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${app.nid_document_filename || 'NID_Document.pdf'}">
            ${app.nid_document_filename || 'NID_Document.pdf'}
          </div>
          ${app.nid_document_pdf ? `
            <div style="display:flex; gap:6px;">
              <button type="button" class="ptn-btn ptn-btn-secondary ptn-btn-sm" style="padding:4px 10px; font-size:11.5px;" data-onclick="window.viewDocPdf('${handlerArg(app.id)}', 'nid')">
                Preview PDF
              </button>
              <a href="${app.nid_document_pdf}" download="${app.nid_document_filename || 'NID_Document.pdf'}" class="ptn-btn ptn-btn-primary ptn-btn-sm" style="padding:4px 10px; font-size:11.5px; text-decoration:none;">
                Download
              </a>
            </div>
          ` : `
            <span style="color:var(--ptn-text-muted); font-size:12px;">No document uploaded</span>
          `}
        </div>
      </div>
    </div>

    <div style="margin-bottom:16px;">
      <strong style="display:block; margin-bottom:6px; color:var(--ptn-text-muted);">Services of Interest:</strong>
      <div>${services || 'None specified'}</div>
    </div>

    <div style="margin-bottom:12px;">
      <strong style="display:block; margin-bottom:6px; color:var(--ptn-text-muted);">Business &amp; Infrastructure Description:</strong>
      <p style="background:rgba(0,0,0,0.3); padding:12px; border-radius:8px; margin:0; line-height:1.5;">${app.business_description}</p>
    </div>
  `;

  const proceedBtn = document.getElementById('modal-open-approve-btn');
  if (app.status === 'PENDING') {
    proceedBtn.style.display = 'inline-flex';
    proceedBtn.onclick = () => {
      document.getElementById('app-detail-modal').style.display = 'none';
      openApproveModal(app.id, app.reference_no, app.company_name);
    };
  } else {
    proceedBtn.style.display = 'none';
  }

  document.getElementById('app-detail-modal').style.display = 'flex';
}

function openApproveModal(id, ref, company) {
  document.getElementById('modal-app-id').value = id;
  document.getElementById('modal-app-info').textContent = `Application ${ref} - ${company}`;
  document.getElementById('approve-modal').style.display = 'flex';
}

// Approve Form Submit
document.getElementById('approve-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const appId = document.getElementById('modal-app-id').value;
  const tierId = document.getElementById('modal-tier-select').value;
  const adminNotes = document.getElementById('modal-admin-notes').value;
  const initialPassword = document.getElementById('modal-initial-pass').value;

  const res = await fetch(`/api/admin/applications/${appId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tierId, adminNotes, initialPassword })
  });
  const data = await res.json();
  document.getElementById('approve-modal').style.display = 'none';
  showBanner(data.message);
  refreshAllData();
});

// =========================================================================
// 4. Tab 2: Partner Directory
// =========================================================================
async function loadPartners() {
  const res = await fetch('/api/admin/partners');
  const data = await res.json();
  cachedPartners = data.partners || [];
  renderPartners();
}

function renderPartners() {
  const query = (document.getElementById('partner-search-input').value || '').toLowerCase().trim();
  const filtered = cachedPartners.filter(p => {
    if (!query) return true;
    return p.company_name.toLowerCase().includes(query) ||
           p.contact_name.toLowerCase().includes(query) ||
           p.email.toLowerCase().includes(query) ||
           p.id.toLowerCase().includes(query);
  });

  const tbody = document.getElementById('admin-partners-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--ptn-text-muted);">No partner records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td><code style="color:var(--ptn-cyan);">${p.id}</code></td>
      <td>
        <strong style="color:#fff;">${p.company_name}</strong><br>
        <small style="color:var(--ptn-text-muted);">${p.business_type} &bull; ${p.country}</small>
      </td>
      <td>${p.contact_name}<br><small style="color:var(--ptn-text-muted);">${p.email}</small></td>
      <td>
        <div style="display:flex; flex-direction:column; gap:3px;">
          <span class="ptn-badge-running" style="font-size:12px; font-weight:700; width:fit-content; background:rgba(56, 189, 248, 0.14); border-color:rgba(56, 189, 248, 0.4); color:#38bdf8;">
            ${p.tier_name} (${Math.round(p.tier_discount_rate * 100)}%)
          </span>
          <small style="color:var(--ptn-text-muted); font-size:10.5px;">Automatic &bull; Spend-based</small>
          ${(p.custom_discount_rate || p.agreement_discount_rate) ? `
            <span style="font-size:11px; font-weight:700; color:#facc15; margin-top:1px;">
              ⭐ Special Discount: ${Math.round((p.custom_discount_rate || p.agreement_discount_rate) * 100)}%
            </span>
          ` : ''}
        </div>
      </td>
      <td>
        <strong style="color:#60a5fa; font-size:13.5px;">৳${Number(p.monthly_eligible_spend || 0).toLocaleString()}</strong>
        <br><small style="color:var(--ptn-text-muted); font-size:10.5px;">Verified Spend</small>
      </td>
      <td>
        <span class="${p.status === 'ACTIVE' ? 'ptn-badge-running' : 'ptn-badge-pending'}">${p.status}</span>
      </td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="ptn-table-action-btn btn-gold agreement-btn" data-id="${p.id}" data-company="${p.company_name}" data-discount="${p.custom_discount_rate ? Math.round(p.custom_discount_rate * 100) : (p.agreement_discount_rate ? Math.round(p.agreement_discount_rate * 100) : Math.round(p.tier_discount_rate * 100))}" title="Give custom discount to partner">
            Give Discount
          </button>
          <button class="ptn-table-action-btn toggle-status-btn" data-id="${p.id}" data-status="${p.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}">
            ${p.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Wire Give Discount Modal
  document.querySelectorAll('.agreement-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-agreement-partner-id').value = btn.getAttribute('data-id');
      document.getElementById('modal-agreement-partner-name').textContent = `Assign Special Commercial Discount for: ${btn.getAttribute('data-company')}`;
      const currentDisc = btn.getAttribute('data-discount') || '20';
      document.getElementById('modal-custom-rate').value = currentDisc;
      document.getElementById('modal-effective-from').value = new Date().toISOString().slice(0, 10);
      document.getElementById('agreement-modal').style.display = 'flex';
    });
  });

  // Wire status toggle
  document.querySelectorAll('.toggle-status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await fetch(`/api/admin/partners/${btn.getAttribute('data-id')}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: btn.getAttribute('data-status') })
      });
      const data = await res.json();
      showBanner(data.message);
      loadPartners();
    });
  });
}

document.getElementById('partner-search-input').addEventListener('input', renderPartners);

// Agreement / Custom Discount Form Submit
document.getElementById('agreement-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const partnerId = document.getElementById('modal-agreement-partner-id').value;
  const customDiscountRate = document.getElementById('modal-custom-rate').value;
  const effectiveFrom = document.getElementById('modal-effective-from').value;
  const effectiveUntil = document.getElementById('modal-effective-until').value;
  const creditLimit = document.getElementById('modal-credit-limit').value;
  const notes = document.getElementById('modal-agreement-notes').value;

  const res = await fetch(`/api/admin/partners/${partnerId}/discount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customDiscountRate, effectiveFrom, effectiveUntil, creditLimit, notes })
  });
  const data = await res.json();
  document.getElementById('agreement-modal').style.display = 'none';
  if (!res.ok || data.error) {
    if (res.status === 401) {
      alert('Administrative authentication required. Please sign in with your admin account.');
      showAdminLogin();
      return;
    }
    alert(data.message || data.error || 'Failed to issue discount');
  } else {
    showBanner(data.message || 'Custom commercial discount agreement applied successfully.');
    refreshAllData();
  }
});

// =========================================================================
// 5. Tab 3: Tier Configuration Matrix
// =========================================================================
async function loadTiers() {
  const res = await fetch('/api/admin/tiers');
  const data = await res.json();
  const container = document.getElementById('tiers-cards-container');

  container.innerHTML = (data.tiers || []).map(t => `
    <div class="ptn-stat-card" style="padding: 24px; position:relative;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:12px;">
        <h4 style="margin: 0; font-size: 18px; color: #fff;">${t.name}</h4>
        <span class="ptn-nav-badge">${Math.round(t.discount_rate * 100)}% Margin</span>
      </div>

      <div class="ptn-field" style="margin-bottom: 12px;">
        <label>Discount Rate (Decimal)</label>
        <input type="number" step="0.01" min="0" max="0.30" class="ptn-input tier-discount-input" data-id="${t.id}" value="${t.discount_rate}">
      </div>

      <div class="ptn-field" style="margin-bottom: 12px;">
        <label>Min Monthly Spend (৳ BDT)</label>
        <input type="number" step="1000" class="ptn-input tier-spend-input" data-id="${t.id}" value="${t.min_monthly_spend}">
      </div>

      <div class="ptn-field" style="margin-bottom: 16px;">
        <label>Support SLA</label>
        <input type="text" class="ptn-input tier-support-input" data-id="${t.id}" value="${t.support_level}">
      </div>

      <button class="ptn-btn ptn-btn-primary ptn-btn-sm save-tier-btn" data-id="${t.id}" style="width:100%;">
        Save Tier Configuration
      </button>
    </div>
  `).join('');

  document.querySelectorAll('.save-tier-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const discount = document.querySelector(`.tier-discount-input[data-id="${id}"]`).value;
      const spend = document.querySelector(`.tier-spend-input[data-id="${id}"]`).value;
      const support = document.querySelector(`.tier-support-input[data-id="${id}"]`).value;

      btn.disabled = true;
      btn.textContent = 'Saving...';
      const res = await fetch(`/api/admin/tiers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountRate: discount, minMonthlySpend: spend, supportLevel: support })
      });
      const data = await res.json();
      btn.disabled = false;
      btn.textContent = 'Save Tier Configuration';
      showBanner(data.message);
    });
  });
}

// =========================================================================
// 6. Tab 4: Product Pricing Rules & Safeguards
// =========================================================================
async function loadPricingRules() {
  const res = await fetch('/api/admin/pricing-rules');
  const data = await res.json();
  cachedRules = data.rules || [];
  renderPricingRules();
}

function renderPricingRules() {
  const query = (document.getElementById('rules-search-input').value || '').toLowerCase().trim();
  const cat = document.getElementById('rules-filter-cat').value;

  const filtered = cachedRules.filter(r => {
    if (cat !== 'ALL' && r.category !== cat) return false;
    if (!query) return true;
    return r.product_code.toLowerCase().includes(query) ||
           r.product_name.toLowerCase().includes(query) ||
           r.category.toLowerCase().includes(query);
  });

  const tbody = document.getElementById('admin-rules-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--ptn-text-muted);">No products match filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><code style="color:var(--ptn-cyan);">${r.product_code}</code></td>
      <td><strong style="color:#fff;">${r.product_name}</strong></td>
      <td><span class="ptn-badge-tag">${r.category}</span></td>
      <td><strong style="color:#60a5fa;">৳${Number(r.base_price_monthly).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
      <td>
        <span class="${r.is_discountable ? 'ptn-badge-running' : 'ptn-badge-pending'}" style="${!r.is_discountable ? 'background:rgba(239,68,68,0.2); color:#f87171;' : ''}">
          ${r.is_discountable ? 'Eligible' : 'Excluded'}
        </span>
      </td>
      <td>${Math.round(r.max_discount_rate * 100)}% Max</td>
      <td><small style="color:var(--ptn-text-muted);">${r.exclusion_reason || 'Standard Core Infrastructure'}</small></td>
      <td>
        <button class="ptn-table-action-btn edit-rule-btn" data-id="${r.id}">
          Edit
        </button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.edit-rule-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const rule = cachedRules.find(x => x.id === btn.getAttribute('data-id'));
      if (!rule) return;
      document.getElementById('modal-rule-id').value = rule.id;
      document.getElementById('modal-rule-title').textContent = `${rule.product_code} - ${rule.product_name} (${rule.category})`;
      document.getElementById('modal-rule-discountable').checked = Boolean(rule.is_discountable);
      document.getElementById('modal-rule-ceiling').value = rule.max_discount_rate;
      document.getElementById('modal-rule-commission').value = rule.fixed_commission_rate || 0.10;
      document.getElementById('modal-rule-reason').value = rule.exclusion_reason || '';
      document.getElementById('rule-edit-modal').style.display = 'flex';
    });
  });
}

document.getElementById('rules-search-input').addEventListener('input', renderPricingRules);
document.getElementById('rules-filter-cat').addEventListener('change', renderPricingRules);

// Rule Edit Submit
document.getElementById('rule-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('modal-rule-id').value;
  const isDiscountable = document.getElementById('modal-rule-discountable').checked;
  const maxDiscountRate = document.getElementById('modal-rule-ceiling').value;
  const fixedCommissionRate = document.getElementById('modal-rule-commission').value;
  const exclusionReason = document.getElementById('modal-rule-reason').value;

  const res = await fetch(`/api/admin/pricing-rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isDiscountable, maxDiscountRate, fixedCommissionRate, exclusionReason })
  });
  const data = await res.json();
  document.getElementById('rule-edit-modal').style.display = 'none';
  showBanner(data.message);
  loadPricingRules();
});

// =========================================================================
// 7. Tab 5: Commission Payouts
// =========================================================================
async function loadPayouts() {
  const res = await fetch('/api/admin/payouts');
  const data = await res.json();
  cachedPayouts = data.payouts || [];
  renderPayouts();
}

function renderPayouts() {
  const tbody = document.getElementById('admin-payouts-tbody');
  if (cachedPayouts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--ptn-text-muted);">No payout requests recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = cachedPayouts.map(p => `
    <tr>
      <td><code style="color:var(--ptn-cyan);">${p.id}</code></td>
      <td>
        <strong style="color:#fff;">${p.company_name}</strong><br>
        <small style="color:var(--ptn-text-muted);">${p.partner_email}</small>
      </td>
      <td><strong style="color:#4ade80; font-size:15px;">৳${Number(p.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
      <td>${p.payment_method}<br><small style="color:var(--ptn-text-muted);">${p.account_details}</small></td>
      <td>${p.requested_at.slice(0, 10)}</td>
      <td><span class="${p.status === 'PAID' ? 'ptn-badge-running' : 'ptn-badge-pending'}">${p.status}</span></td>
      <td>
        ${p.status === 'PENDING' ? `
          <button class="ptn-table-action-btn approve-payout-btn" data-id="${p.id}" style="background:var(--ptn-cyan); color:#070a14;">
            Approve &amp; Pay
          </button>
        ` : `<small style="color:var(--ptn-text-muted);">${p.transaction_ref || 'Settled'}</small>`}
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.approve-payout-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const txRef = prompt('Enter Bank/bKash Settlement Reference Number:', 'TX-SETTLE-' + Date.now());
      if (!txRef) return;
      const res = await fetch(`/api/admin/payouts/${btn.getAttribute('data-id')}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionRef: txRef })
      });
      const data = await res.json();
      showBanner(data.message);
      refreshAllData();
    });
  });
}

// =========================================================================
// 8. Tab 6: Security Audit Trail
// =========================================================================
async function loadAuditLogs() {
  const res = await fetch('/api/admin/audit-logs');
  const data = await res.json();
  cachedAudit = data.logs || [];
  renderAuditLogs();
}

function renderAuditLogs() {
  const query = (document.getElementById('audit-search-input').value || '').toLowerCase().trim();
  const filtered = cachedAudit.filter(l => {
    if (!query) return true;
    return l.action.toLowerCase().includes(query) ||
           (l.actor_email && l.actor_email.toLowerCase().includes(query)) ||
           l.entity_type.toLowerCase().includes(query);
  });

  const tbody = document.getElementById('admin-audit-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--ptn-text-muted);">No audit log events recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td><small class="mono" style="color:var(--ptn-text-muted);">${l.created_at}</small></td>
      <td><span class="ptn-nav-badge" style="font-size:10px;">${l.actor_type}</span></td>
      <td>${l.actor_email || 'anonymous'}</td>
      <td><strong style="color:var(--ptn-cyan);">${l.action}</strong></td>
      <td><code style="color:#cbd5e1;">${l.entity_type}</code></td>
      <td><code style="color:var(--ptn-text-muted);">${l.ip_address}</code></td>
      <td><code style="font-size:11px; max-width:240px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${l.details_json || '{}'}">${l.details_json || '{}'}</code></td>
    </tr>
  `).join('');
}

document.getElementById('audit-search-input').addEventListener('input', renderAuditLogs);

// =========================================================================
// 9. Tab: Reward Points System Management
// =========================================================================
function populatePartnerSelects() {
  const partnerSelects = ['adm-rew-partner-filter', 'modal-adj-partner-id', 'modal-sim-partner-id'];
  partnerSelects.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const currVal = sel.value;
    if (selId === 'adm-rew-partner-filter') {
      sel.innerHTML = '<option value="">All Reseller Partners</option>' + cachedPartners.map(p => `<option value="${p.id}">${p.company_name} (${p.id})</option>`).join('');
    } else {
      sel.innerHTML = '<option value="">-- Choose Reseller Partner --</option>' + cachedPartners.map(p => `<option value="${p.id}">${p.company_name} (${p.id})</option>`).join('');
    }
    if (currVal) sel.value = currVal;
  });
}

async function loadRewardsAdmin() {
  try {
    const res = await fetch('/api/admin/rewards/overview');
    const data = await res.json();
    cachedAdminPolicy = data.policy || {};
    const stats = data.stats || {};

    // Update KPIs
    const elEarned = document.getElementById('adm-kpi-earned');
    if (elEarned) elEarned.textContent = Number(stats.totalPointsEarned || 0).toLocaleString('en-US', { minimumFractionDigits: 0 }) + ' pts';

    const elAvail = document.getElementById('adm-kpi-available');
    if (elAvail) elAvail.textContent = Number(stats.totalAvailablePoints || 0).toLocaleString('en-US', { minimumFractionDigits: 0 }) + ' pts';

    const elPending = document.getElementById('adm-kpi-pending');
    if (elPending) elPending.textContent = Number(stats.totalPendingPoints || 0).toLocaleString('en-US', { minimumFractionDigits: 0 }) + ' pts';

    const elRev = document.getElementById('adm-kpi-reversed');
    if (elRev) elRev.textContent = Number(stats.totalReversedPoints || 0).toLocaleString('en-US', { minimumFractionDigits: 0 }) + ' pts';

    const elSales = document.getElementById('adm-kpi-sales');
    if (elSales) elSales.textContent = '৳' + Number(stats.totalEligibleSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

    const poolEl = document.getElementById('kpi-total-points');
    if (poolEl) poolEl.textContent = Number(stats.totalAvailablePoints || 0).toLocaleString('en-US', { minimumFractionDigits: 0 }) + ' pts';

    const badgeCount = document.getElementById('badge-rewards-count');
    if (badgeCount && cachedAdminPolicy.reward_rate !== undefined) {
      badgeCount.textContent = (cachedAdminPolicy.reward_rate * 100).toFixed(0) + '% Active';
    }

    // Fill Policy Form
    if (cachedAdminPolicy.reward_rate !== undefined) {
      const elRate = document.getElementById('adm-policy-rate');
      if (elRate) elRate.value = cachedAdminPolicy.reward_rate;

      const elPtsVal = document.getElementById('adm-policy-points-val');
      if (elPtsVal) elPtsVal.value = cachedAdminPolicy.points_per_bdt;

      const elMinRed = document.getElementById('adm-policy-min-redeem');
      if (elMinRed) elMinRed.value = cachedAdminPolicy.min_redemption_points;

      const elAutoApprove = document.getElementById('adm-policy-auto-approve');
      if (elAutoApprove) elAutoApprove.checked = Boolean(cachedAdminPolicy.auto_approve);

      const elRenewals = document.getElementById('adm-policy-renewals');
      if (elRenewals) elRenewals.checked = Boolean(cachedAdminPolicy.apply_to_renewals);

      const elAntiAbuse = document.getElementById('adm-policy-anti-abuse');
      if (elAntiAbuse) elAntiAbuse.checked = Boolean(cachedAdminPolicy.anti_abuse_self_referral);

      const elRedeem = document.getElementById('adm-policy-redeem-enabled');
      if (elRedeem) elRedeem.checked = Boolean(cachedAdminPolicy.redemption_enabled);

      let cats = [];
      try {
        cats = typeof cachedAdminPolicy.eligible_categories === 'string'
          ? JSON.parse(cachedAdminPolicy.eligible_categories)
          : cachedAdminPolicy.eligible_categories;
      } catch (e) { cats = []; }

      if (Array.isArray(cats)) {
        document.querySelectorAll('#adm-policy-categories-wrap input[type="checkbox"]').forEach(cb => {
          cb.checked = cats.includes(cb.value);
        });
      }
    }

    populatePartnerSelects();
    await loadAdminRewardTransactions();
  } catch (err) {
    console.error('Failed to load admin rewards overview:', err);
  }
}

async function loadAdminRewardTransactions() {
  try {
    const status = document.getElementById('adm-rew-status-filter').value;
    const partnerId = document.getElementById('adm-rew-partner-filter').value;
    const search = (document.getElementById('adm-rew-search').value || '').trim();

    let url = '/api/admin/rewards/transactions?limit=100';
    if (status && status !== 'ALL') url += '&status=' + encodeURIComponent(status);
    if (partnerId) url += '&partnerId=' + encodeURIComponent(partnerId);
    if (search) url += '&search=' + encodeURIComponent(search);

    const res = await fetch(url);
    const data = await res.json();
    cachedAdminRewardTx = data.transactions || [];
    renderAdminRewardTransactions();
  } catch (err) {
    console.error('Failed to load admin reward transactions:', err);
  }
}

function renderAdminRewardTransactions() {
  const tbody = document.getElementById('adm-rew-transactions-tbody');
  if (!tbody) return;

  if (!cachedAdminRewardTx.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:32px; color:var(--ptn-text-muted);">No reward transactions recorded matching criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = cachedAdminRewardTx.map(tx => {
    let statusBadge = '<span class="ptn-badge-running">APPROVED</span>';
    if (tx.status === 'PENDING') {
      statusBadge = '<span class="ptn-badge-pending" style="background:rgba(250,204,21,0.15); color:#facc15; border:1px solid rgba(250,204,21,0.35);">PENDING</span>';
    } else if (tx.status === 'REVERSED') {
      statusBadge = '<span class="ptn-badge-pending" style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.4);">REVERSED</span>';
    } else if (tx.status === 'REJECTED') {
      statusBadge = '<span class="ptn-badge-pending" style="background:rgba(100,116,139,0.2); color:#94a3b8;">REJECTED</span>';
    }

    let ptsFormatted = '';
    if (tx.points > 0) {
      ptsFormatted = `<strong style="color:#4ade80; font-size:13.5px;">+${Number(tx.points).toLocaleString('en-US', {minimumFractionDigits: 2})} pts</strong>`;
    } else if (tx.points < 0) {
      ptsFormatted = `<strong style="color:#f87171; font-size:13.5px;">${Number(tx.points).toLocaleString('en-US', {minimumFractionDigits: 2})} pts</strong>`;
    } else {
      ptsFormatted = `<span style="color:var(--ptn-text-muted);">0.00 pts</span>`;
    }

    let actionsHtml = '<span style="color:var(--ptn-text-muted); font-size:12px;">--</span>';
    if (tx.status === 'PENDING') {
      actionsHtml = `
        <div style="display:flex; gap:6px;">
          <button class="ptn-table-action-btn adm-tx-approve-btn" data-id="${tx.id}" style="background:#10b981; color:#fff; padding:3px 8px; font-size:11.5px;">Approve</button>
          <button class="ptn-table-action-btn adm-tx-reject-btn" data-id="${tx.id}" style="background:#ef4444; color:#fff; padding:3px 8px; font-size:11.5px;">Reject</button>
        </div>
      `;
    } else if (tx.status === 'APPROVED' && tx.transaction_type === 'SALE_REWARD') {
      actionsHtml = `
        <button class="ptn-table-action-btn adm-tx-refund-btn" data-order="${tx.order_number || tx.order_id}" style="color:#f87171; border-color:rgba(239,68,68,0.3); padding:3px 8px; font-size:11.5px;">
          Reverse
        </button>
      `;
    }

    return `
      <tr>
        <td><code style="color:var(--ptn-cyan); font-size:11.5px;">${tx.id}</code></td>
        <td>
          <strong style="color:#fff;">${tx.partner_name || tx.partner_id}</strong><br>
          <small style="color:var(--ptn-text-muted);">${tx.partner_email || tx.partner_id}</small>
        </td>
        <td><code style="color:#cbd5e1; font-size:12px;">${tx.order_number || tx.order_id || 'N/A'}</code></td>
        <td>${tx.customer_name || 'N/A'}<br><small style="color:var(--ptn-text-muted);">${tx.customer_email || ''}</small></td>
        <td>
          <strong style="font-size:12.5px;">${tx.service_name || tx.description || 'Cloud Service'}</strong><br>
          <span class="ptn-badge-tag" style="font-size:10px;">${tx.category || tx.transaction_type}</span>
        </td>
        <td><strong style="color:#60a5fa;">৳${Number(tx.eligible_sale_amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
        <td><span class="ptn-badge-running" style="font-size:11px;">${(Number(tx.reward_rate || 0) * 100).toFixed(1)}%</span></td>
        <td>${ptsFormatted}</td>
        <td><small class="mono" style="color:var(--ptn-text-muted);">${(tx.created_at || '').slice(0, 16).replace('T', ' ')}</small></td>
        <td>${statusBadge}</td>
        <td>${actionsHtml}</td>
      </tr>
    `;
  }).join('');

  // Wire action buttons
  document.querySelectorAll('.adm-tx-approve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      btn.disabled = true;
      btn.textContent = '...';
      const res = await fetch(`/api/admin/rewards/transactions/${id}/approve`, { method: 'POST' });
      const d = await res.json();
      showBanner(d.message || 'Transaction approved.');
      loadRewardsAdmin();
    });
  });

  document.querySelectorAll('.adm-tx-reject-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const reason = prompt('Enter mandatory rejection reason for partner audit ledger:', 'Ineligible promotion or fraudulent order');
      if (!reason) return;
      btn.disabled = true;
      btn.textContent = '...';
      const res = await fetch(`/api/admin/rewards/transactions/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const d = await res.json();
      showBanner(d.message || 'Transaction rejected.');
      loadRewardsAdmin();
    });
  });

  document.querySelectorAll('.adm-tx-refund-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.getAttribute('data-order');
      document.getElementById('modal-refund-order-id').value = orderId;
      document.getElementById('modal-admin-refund').style.display = 'flex';
    });
  });
}

// Modal Trigger Buttons
const btnOpenAdj = document.getElementById('btn-admin-open-adjust');
if (btnOpenAdj) {
  btnOpenAdj.addEventListener('click', () => {
    populatePartnerSelects();
    document.getElementById('modal-admin-adjust').style.display = 'flex';
  });
}

const btnOpenRef = document.getElementById('btn-admin-open-refund');
if (btnOpenRef) {
  btnOpenRef.addEventListener('click', () => {
    document.getElementById('modal-admin-refund').style.display = 'flex';
  });
}

const btnOpenSim = document.getElementById('btn-admin-open-sim');
if (btnOpenSim) {
  btnOpenSim.addEventListener('click', () => {
    populatePartnerSelects();
    updateAdminSimPreview();
    document.getElementById('modal-admin-simulate').style.display = 'flex';
  });
}

// Real-time Preview in Admin Simulate Modal
function updateAdminSimPreview() {
  const gross = Number(document.getElementById('modal-sim-gross').value) || 0;
  const discount = Number(document.getElementById('modal-sim-discount').value) || 0;
  const tax = Number(document.getElementById('modal-sim-tax').value) || 0;
  const net = Math.max(0, gross - discount - tax);
  const rate = cachedAdminPolicy ? Number(cachedAdminPolicy.reward_rate) : 0.10;
  const points = net * rate;

  const elNet = document.getElementById('modal-sim-net-display');
  if (elNet) elNet.textContent = '৳' + net.toLocaleString('en-US', {minimumFractionDigits: 2}) + ' BDT';

  const elRate = document.getElementById('modal-sim-rate-display');
  if (elRate) elRate.textContent = (rate * 100).toFixed(1) + '%';

  const elPts = document.getElementById('modal-sim-points-display');
  if (elPts) elPts.textContent = '+' + points.toLocaleString('en-US', {minimumFractionDigits: 2}) + ' pts';
}

['modal-sim-gross', 'modal-sim-discount', 'modal-sim-tax'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateAdminSimPreview);
});

// Form: Admin Reward Policy Update
const formPolicy = document.getElementById('admin-reward-policy-form');
if (formPolicy) {
  formPolicy.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rewardRate = Number(document.getElementById('adm-policy-rate').value);
    const pointsPerBdt = Number(document.getElementById('adm-policy-points-val').value);
    const minRedemptionPoints = Number(document.getElementById('adm-policy-min-redeem').value);
    const autoApprove = document.getElementById('adm-policy-auto-approve').checked ? 1 : 0;
    const applyToRenewals = document.getElementById('adm-policy-renewals').checked ? 1 : 0;
    const antiAbuseSelfReferral = document.getElementById('adm-policy-anti-abuse').checked ? 1 : 0;
    const redemptionEnabled = document.getElementById('adm-policy-redeem-enabled').checked ? 1 : 0;

    const checkedCats = [];
    document.querySelectorAll('#adm-policy-categories-wrap input[type="checkbox"]:checked').forEach(cb => {
      checkedCats.push(cb.value);
    });

    const btn = document.getElementById('btn-save-policy');
    btn.disabled = true;
    btn.textContent = 'Saving Settings...';

    try {
      const res = await fetch('/api/admin/rewards/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rewardRate,
          pointsPerBdt,
          minRedemptionPoints,
          autoApprove,
          applyToRenewals,
          antiAbuseSelfReferral,
          redemptionEnabled,
          eligibleCategories: checkedCats
        })
      });
      const d = await res.json();
      btn.disabled = false;
      btn.textContent = 'Save Reward Policy Settings';
      if (res.ok) {
        showBanner('Reward points policy updated successfully.');
        loadRewardsAdmin();
      } else {
        alert(d.message || 'Failed to update policy');
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Save Reward Policy Settings';
      alert('Network error saving policy');
    }
  });
}

// Form: Manual Adjustment
const formAdjust = document.getElementById('admin-adjust-form');
if (formAdjust) {
  formAdjust.addEventListener('submit', async (e) => {
    e.preventDefault();
    const partnerId = document.getElementById('modal-adj-partner-id').value;
    const type = document.getElementById('modal-adj-type').value;
    const points = document.getElementById('modal-adj-points').value;
    const reason = document.getElementById('modal-adj-reason').value;

    if (!partnerId) {
      alert('Please select a partner');
      return;
    }

    const btn = document.getElementById('btn-submit-adjust');
    btn.disabled = true;
    btn.textContent = 'Executing...';

    try {
      const res = await fetch('/api/admin/rewards/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId, type, points, reason })
      });
      const d = await res.json();
      btn.disabled = false;
      btn.textContent = 'Execute Adjustment';
      if (res.ok) {
        document.getElementById('modal-admin-adjust').style.display = 'none';
        document.getElementById('admin-adjust-form').reset();
        showBanner(d.message || 'Points adjustment recorded.');
        loadRewardsAdmin();
      } else {
        alert(d.message || 'Adjustment failed');
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Execute Adjustment';
      alert('Network error executing adjustment');
    }
  });
}

// Form: Refund Reversal
const formRefund = document.getElementById('admin-refund-form');
if (formRefund) {
  formRefund.addEventListener('submit', async (e) => {
    e.preventDefault();
    const orderId = document.getElementById('modal-refund-order-id').value.trim();
    const reason = document.getElementById('modal-refund-reason').value.trim();

    const btn = document.getElementById('btn-submit-refund');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
      const res = await fetch('/api/admin/rewards/process-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, reason })
      });
      const d = await res.json();
      btn.disabled = false;
      btn.textContent = 'Confirm Reversal';
      if (res.ok) {
        document.getElementById('modal-admin-refund').style.display = 'none';
        document.getElementById('admin-refund-form').reset();
        showBanner(d.message || 'Reward points reversed for refund.');
        loadRewardsAdmin();
      } else {
        alert(d.message || 'Reversal failed');
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Confirm Reversal';
      alert('Network error processing refund');
    }
  });
}

// Form: Simulate Partner Sale
const formSim = document.getElementById('admin-simulate-form');
if (formSim) {
  formSim.addEventListener('submit', async (e) => {
    e.preventDefault();
    const partnerId = document.getElementById('modal-sim-partner-id').value;
    const customerName = document.getElementById('modal-sim-customer-name').value;
    const customerEmail = document.getElementById('modal-sim-customer-email').value;
    const serviceName = document.getElementById('modal-sim-service-name').value;
    const category = document.getElementById('modal-sim-category').value;
    const grossAmount = document.getElementById('modal-sim-gross').value;
    const discountAmount = document.getElementById('modal-sim-discount').value;
    const taxAmount = document.getElementById('modal-sim-tax').value;

    if (!partnerId) {
      alert('Please select a partner');
      return;
    }

    const btn = document.getElementById('btn-submit-sim');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
      const res = await fetch('/api/admin/rewards/simulate-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerId,
          customerName,
          customerEmail,
          serviceName,
          category,
          grossAmount,
          discountAmount,
          taxAmount
        })
      });
      const d = await res.json();
      btn.disabled = false;
      btn.textContent = 'Process Sale & Award Points';
      if (res.ok) {
        document.getElementById('modal-admin-simulate').style.display = 'none';
        showBanner(d.message || 'Order simulated and reward points awarded.');
        loadRewardsAdmin();
      } else {
        alert(d.message || 'Simulation failed');
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Process Sale & Award Points';
      alert('Network error simulating order');
    }
  });
}

// Form: Update Partner Spend (BDT)
const formSpend = document.getElementById('admin-spend-form');
if (formSpend) {
  formSpend.addEventListener('submit', async (e) => {
    e.preventDefault();
    const partnerId = document.getElementById('spend-modal-partner-id').value;
    const monthlyEligibleSpend = document.getElementById('spend-modal-amount').value;

    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/spend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyEligibleSpend })
      });
      const d = await res.json();
      if (res.ok) {
        document.getElementById('modal-admin-spend').style.display = 'none';
        showBanner(d.message || 'Partner spending and tier updated successfully.');
        refreshAllData();
      } else {
        alert(d.message || 'Failed to update spending');
      }
    } catch (err) {
      alert('Network error updating partner spending');
    }
  });
}

// Search and Filters
const searchEl = document.getElementById('adm-rew-search');
if (searchEl) searchEl.addEventListener('input', loadAdminRewardTransactions);

const partnerFilterEl = document.getElementById('adm-rew-partner-filter');
if (partnerFilterEl) partnerFilterEl.addEventListener('change', loadAdminRewardTransactions);

const statusFilterEl = document.getElementById('adm-rew-status-filter');
if (statusFilterEl) statusFilterEl.addEventListener('change', loadAdminRewardTransactions);

// Initial Authentication Check
checkAdminAuth();
