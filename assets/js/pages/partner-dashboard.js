/* Moved out of partner-dashboard.html so the Content-Security-Policy can forbid inline script. */
// 1. Pristine Micro-Stardust Three.js Particle Background (No messy square blocks)
let particleMat = null;
let particlePoints = null;
const THEMES = {
  cosmic: {
    name: 'Cosmic Deep Space',
    icon: '🌌',
    color: new THREE.Color().setHSL(195 / 360, 0.85, 0.70)
  },
  twilight: {
    name: 'Twilight Horizon',
    icon: '🌆',
    color: new THREE.Color().setHSL(280 / 360, 0.85, 0.72)
  },
  cyber: {
    name: 'Cyber Matrix Grid',
    icon: '⚡',
    color: new THREE.Color().setHSL(165 / 360, 0.95, 0.65)
  },
  obsidian: {
    name: 'Midnight Obsidian',
    icon: '🌑',
    color: new THREE.Color().setHSL(215 / 360, 0.20, 0.80)
  }
};

try {
  const cv = document.getElementById('ptn-canvas');
  if (!cv) throw new Error('No canvas element');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 10;

  // 800 delicate microscopic circular star points
  const N = 800;
  const pos = new Float32Array(N * 3);
  const sd = new Float32Array(N);
  const sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 36;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 16 - 2;
    sd[i] = Math.random();
    sz[i] = 0.5 + Math.random() * 1.2;
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
      uTint: { value: new THREE.Color().setHSL(195 / 360, 0.85, 0.70) }
    },
    vertexShader: `
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime, uPx;
      varying float vTw;
      void main() {
        vec3 p = position;
        float sp = 0.08 + aSeed * 0.22;
        p.y = mod(p.y - uTime * sp + 10.0, 20.0) - 10.0;
        p.x += sin(uTime * 0.2 + aSeed * 12.0) * 0.15;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vTw = pow(0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 2.5)), 3.0);
        // Strictly clamp point size between 1.0px and 2.5px to guarantee micro-stardust dots!
        gl_PointSize = clamp(aSize * (1.0 + vTw * 1.2) * (24.0 / -mv.z) * uPx, 1.0, 2.6);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uTint;
      varying float vTw;
      void main() {
        // Force true mathematical circle discard to prevent square sprites
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float gl = smoothstep(0.5, 0.0, d);
        vec3 col = mix(uTint, vec3(0.95, 0.98, 1.0), vTw * 0.6);
        float a = gl * gl * 0.38;
        gl_FragColor = vec4(col * a, a);
      }
    `
  });

  particlePoints = new THREE.Points(geo, particleMat);
  scene.add(particlePoints);

  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    if (particleMat) {
      particleMat.uniforms.uTime.value = clock.getElapsedTime();
      particleMat.uniforms.uPx.value = renderer.getPixelRatio();
    }
    renderer.render(scene, camera);
  }
  loop();
} catch (e) {
  console.warn('[Partner ThreeJS background]', e);
}

// Background Theme Management for Partner Portal
function applyPartnerTheme(themeKey) {
  if (!THEMES[themeKey]) themeKey = 'cosmic';
  document.body.setAttribute('data-partner-theme', themeKey);

  const themeBtnIcon = document.getElementById('ptn-theme-btn-icon');
  const themeBtnLabel = document.getElementById('ptn-theme-btn-label');
  if (themeBtnIcon) themeBtnIcon.textContent = THEMES[themeKey].icon;
  if (themeBtnLabel) themeBtnLabel.textContent = THEMES[themeKey].name;

  document.querySelectorAll('.partner-theme-option-btn').forEach(btn => {
    if (btn.getAttribute('data-theme') === themeKey) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (particleMat && particleMat.uniforms && particleMat.uniforms.uTint) {
    particleMat.uniforms.uTint.value = THEMES[themeKey].color;
    if (particlePoints) {
      particlePoints.visible = (themeKey !== 'obsidian'); // Completely clean stealth mode for obsidian!
    }
  }

  localStorage.setItem('unified_partner_theme', themeKey);
}

const ptnThemeBtn = document.getElementById('ptn-theme-btn');
const ptnThemeDropdown = document.getElementById('ptn-theme-dropdown');
if (ptnThemeBtn && ptnThemeDropdown) {
  ptnThemeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ptnThemeDropdown.style.display = ptnThemeDropdown.style.display === 'block' ? 'none' : 'block';
  });
  document.addEventListener('click', () => {
    ptnThemeDropdown.style.display = 'none';
  });
  document.querySelectorAll('.partner-theme-option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const selected = btn.getAttribute('data-theme');
      applyPartnerTheme(selected);
      ptnThemeDropdown.style.display = 'none';
    });
  });
}

applyPartnerTheme(localStorage.getItem('unified_partner_theme') || 'cosmic');

// 2. Auth State & Dashboard Loading
let currentPartner = null;

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.authenticated && (data.user.role === 'PARTNER' || data.user.role === 'ADMIN')) {
      showDashboard(data.partner);
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('dashboard-view').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
}

function showDashboard(partner) {
  currentPartner = partner;
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('dashboard-view').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'inline-flex';

  loadOverview();
  loadRewards();
  loadSales();
  loadCustomersAndServices();
  loadAnalytics('30d');
  loadReferrals();
  loadDocs();
  loadPartnerTickets();
}

// Login Form
document.getElementById('partner-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('login-error');
  errBox.style.display = 'none';

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.message || 'Login failed');
    showDashboard(data.partner);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = 'block';
  }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  showLogin();
});

// Tab Navigation
document.querySelectorAll('.ptn-dash-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.ptn-dash-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.ptn-dash-section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.getAttribute('data-tab')).classList.add('active');
  });
});

// Load Overview Data
async function loadOverview() {
  const res = await fetch('/api/partner/overview');
  const data = await res.json();
  if (!data.partner) return;

  document.getElementById('partner-company-title').textContent = data.partner.company_name;
  const currentTierName = data.metrics.currentTier ? data.metrics.currentTier.name : data.partner.tier_name;
  const currentMargin = data.metrics.currentTier ? Math.round(data.metrics.currentTier.discountRate * 100) : Math.round(data.partner.tier_discount_rate * 100);
  const currentSpend = Number(data.metrics.currentSpend || 0);

  const hasCustomDiscount = Boolean(data.metrics.hasCustomDiscount || (data.partner && data.partner.has_custom_discount));
  const effectiveRate = data.metrics.effectiveDiscountRate || (data.partner && data.partner.effective_discount_rate) || (currentMargin / 100);
  const effectiveMarginPct = Math.round(effectiveRate * 100);

  if (hasCustomDiscount) {
    document.getElementById('partner-status-tag').innerHTML = `Active ${currentTierName} &bull; <span style="color:#facc15; font-weight:700;">${effectiveMarginPct}% Special Discount</span>`;
    document.getElementById('metric-margin').textContent = `${effectiveMarginPct}%`;
    const marginSub = document.getElementById('metric-margin-sub');
    if (marginSub) marginSub.innerHTML = `<span style="color:#facc15; font-weight:600;">⭐ Special Approved Discount</span> (Base Tier: ${currentMargin}%)`;
  } else {
    document.getElementById('partner-status-tag').textContent = `Active ${currentTierName} (${currentMargin}% Margin)`;
    document.getElementById('metric-margin').textContent = `${currentMargin}%`;
    const marginSub = document.getElementById('metric-margin-sub');
    if (marginSub) marginSub.textContent = 'Applied to all eligible CloudStack VMs & Storage';
  }

  document.getElementById('partner-id-display').textContent = data.partner.id;
  document.getElementById('partner-contact-name').textContent = data.partner.contact_name;
  document.getElementById('metric-spend').textContent = `৳${currentSpend.toLocaleString('en-US')}`;
  document.getElementById('metric-services').textContent = data.metrics.activeServicesCount;
  document.getElementById('metric-customers').textContent = `Across ${data.metrics.customerCount} managed client organizations`;
  document.getElementById('metric-commissions').textContent = `৳${Number(data.metrics.commissionBalance).toLocaleString('en-US')}`;

  // Next tier progression & roadmap rendering
  const titleEl = document.getElementById('tier-progress-title');
  const textEl = document.getElementById('tier-progress-text');
  const fillEl = document.getElementById('tier-progress-fill');
  const descEl = document.getElementById('tier-progress-desc');

  if (data.metrics.isMaxTier || !data.metrics.nextTier) {
    if (titleEl) titleEl.textContent = `👑 Top Tier Achieved: ${currentTierName} (${currentMargin}% Margin)`;
    if (textEl) textEl.textContent = `৳${currentSpend.toLocaleString('en-US')} (Top Tier Unlocked)`;
    if (fillEl) {
      fillEl.style.width = '100%';
      fillEl.style.background = 'linear-gradient(90deg, var(--ptn-cyan), #facc15)';
    }
    if (descEl) descEl.textContent = `Congratulations! Your organization qualifies for our premier enterprise tier with maximum wholesale margins and dedicated engineering support.`;
  } else {
    const next = data.metrics.nextTier;
    const nextMargin = Math.round(next.discountRate * 100);
    if (titleEl) titleEl.textContent = `Progress Toward ${next.name} (${nextMargin}% Margin)`;
    if (textEl) textEl.textContent = `৳${currentSpend.toLocaleString('en-US')} / ৳${Number(next.targetSpend).toLocaleString('en-US')} (${next.percentAchieved}%)`;
    if (fillEl) fillEl.style.width = `${next.percentAchieved}%`;
    if (descEl) descEl.textContent = `Spend ৳${Number(next.amountRemaining).toLocaleString('en-US')} more in eligible monthly infrastructure to automatically unlock ${next.name} (${nextMargin}% Margin).`;
  }

  // Populate 4-tier spend roadmap
  const trackEl = document.getElementById('tier-milestones-track');
  if (trackEl && data.metrics.allTiers) {
    trackEl.innerHTML = data.metrics.allTiers.map(t => {
      const isCurrent = t.isCurrent;
      const isUnlocked = t.isUnlocked;
      const marginPct = Math.round(t.discountRate * 100);
      const spendReq = Number(t.minSpend).toLocaleString('en-US');

      let borderColor = 'rgba(255,255,255,0.08)';
      let bgColor = 'rgba(255,255,255,0.02)';
      let statusLabel = `<span style="color:var(--ptn-text-muted); font-size:11px;">Target: ৳${spendReq}/mo</span>`;

      if (isCurrent) {
        borderColor = 'var(--ptn-cyan)';
        bgColor = 'rgba(93, 224, 196, 0.08)';
        statusLabel = `<span class="ptn-badge-running" style="font-size:10.5px; padding:2px 8px;">CURRENT TIER</span>`;
      } else if (isUnlocked) {
        borderColor = 'rgba(74, 222, 128, 0.4)';
        bgColor = 'rgba(74, 222, 128, 0.04)';
        statusLabel = `<span style="color:#4ade80; font-size:11px; font-weight:600;">✓ Unlocked</span>`;
      }

      return `
        <div style="padding: 12px 14px; border-radius: 10px; border: 1.5px solid ${borderColor}; background: ${bgColor}; transition: all 0.2s ease;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${isCurrent ? 'var(--ptn-cyan)' : 'var(--ptn-text-muted)'};">${t.name}</span>
            ${statusLabel}
          </div>
          <div style="font-size: 16px; font-weight: 800; color: #fff;">${marginPct}% Margin</div>
          <div style="font-size: 11.5px; color: var(--ptn-text-muted); margin-top: 2px;">Min. Spend: ৳${spendReq}/mo</div>
        </div>
      `;
    }).join('');
  }

  // Populate Invoices
  const tbody = document.getElementById('overview-invoices-body');
  tbody.innerHTML = (data.recentInvoices || []).map(inv => `
    <tr>
      <td><strong style="color:#fff;">${inv.id}</strong></td>
      <td>${inv.date}</td>
      <td>${inv.description}</td>
      <td>${inv.gross}</td>
      <td><span style="color:var(--ptn-cyan); font-weight:700;">${inv.discount}</span></td>
      <td><strong style="color:#fff;">${inv.net}</strong></td>
      <td><span class="ptn-badge-running">${inv.status}</span></td>
    </tr>
  `).join('');
}

// Load Customers and Services
async function loadCustomersAndServices() {
  const srvRes = await fetch('/api/partner/services');
  const srvData = await srvRes.json();
  const srvTbody = document.getElementById('services-table-body');

  srvTbody.innerHTML = (srvData.services || []).map(s => `
    <tr>
      <td>
        <strong style="color:#fff;">${s.service_name}</strong><br>
        <small style="color:var(--ptn-text-muted);">${s.cloudstack_vm_id}</small>
      </td>
      <td>${s.customer_company || s.customer_name}</td>
      <td>${s.vcpu} vCPU / ${s.ram_gb}GB RAM / ${s.disk_gb}GB SSD</td>
      <td><code>${s.ip_address || 'Allocating...'}</code></td>
      <td>${s.region}</td>
      <td><span class="ptn-badge-running">${s.status}</span></td>
      <td>৳${Number(s.net_monthly_fee).toLocaleString('en-US', {minimumFractionDigits: 2})}/mo</td>
      <td>
        <button class="ptn-table-action-btn reboot-btn" data-id="${s.id}" data-name="${s.service_name}">
          Reboot VM
        </button>
      </td>
    </tr>
  `).join('');

  // Wire Reboot Action
  document.querySelectorAll('.reboot-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const srvId = btn.getAttribute('data-id');
      const srvName = btn.getAttribute('data-name');
      btn.disabled = true;
      btn.textContent = 'Rebooting...';

      try {
        const res = await fetch(`/api/partner/services/${srvId}/reboot`, { method: 'POST' });
        const data = await res.json();
        const banner = document.getElementById('service-action-banner');
        banner.textContent = data.message;
        banner.style.display = 'block';
        setTimeout(() => { banner.style.display = 'none'; }, 6000);
      } catch (e) {
        alert('Reboot error: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Reboot VM';
      }
    });
  });

  // Customers table
  const custRes = await fetch('/api/partner/customers');
  const custData = await custRes.json();
  const custTbody = document.getElementById('customers-table-body');
  custTbody.innerHTML = (custData.customers || []).map(c => `
    <tr>
      <td><strong style="color:#fff;">${c.customer_name}</strong></td>
      <td>${c.company}</td>
      <td>${c.customer_email}</td>
      <td><code>WHMCS-#${c.customer_whmcs_id}</code></td>
      <td>${c.service_count} Instance(s)</td>
      <td><span class="ptn-badge-running">${c.status}</span></td>
    </tr>
  `).join('');
}

// Load Analytics
async function loadAnalytics(filter = '30d') {
  const res = await fetch(`/api/partner/analytics?filter=${filter}`);
  const data = await res.json();

  document.getElementById('analytics-gross').textContent = data.summary.grossSales;
  document.getElementById('analytics-savings').textContent = data.summary.partnerDiscountSavings;
  document.getElementById('analytics-mrr').textContent = data.summary.recurringMRR;

  // Trend bars
  const trendContainer = document.getElementById('analytics-trend-bars');
  const maxGross = Math.max(...(data.monthlyTrends || []).map(x => x.gross), 600000);
  trendContainer.innerHTML = (data.monthlyTrends || []).map(t => {
    const heightPct = Math.min(100, Math.max(15, Math.round((t.gross / maxGross) * 100)));
    return `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
        <div style="font-size:11px; font-weight:700; color:var(--ptn-cyan); margin-bottom:6px;">৳${Number(t.savings).toLocaleString()} saved</div>
        <div style="width:100%; max-width:44px; height:${heightPct}%; background:linear-gradient(180deg, #5de0c4, #3f86e8); border-radius:6px 6px 0 0;"></div>
        <div style="font-size:12px; color:var(--ptn-text-muted); margin-top:8px;">${t.month}</div>
      </div>
    `;
  }).join('');
}

// Load Referrals
async function loadReferrals() {
  const res = await fetch('/api/partner/referrals');
  const data = await res.json();
  const tbody = document.getElementById('referrals-table-body');
  tbody.innerHTML = (data.referrals || []).map(r => `
    <tr>
      <td><strong style="color:#fff;">${r.referred_user_name}</strong></td>
      <td>${r.referred_user_email}</td>
      <td>৳${Number(r.order_value).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
      <td><span style="color:#4ade80; font-weight:700;">+৳${Number(r.commission_amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</span></td>
      <td><span class="ptn-badge-running">${r.conversion_status}</span></td>
      <td>${r.created_at.slice(0, 10)}</td>
    </tr>
  `).join('');
}

// Load Docs & Announcements
async function loadDocs() {
  const res = await fetch('/api/partner/docs');
  const data = await res.json();
  const container = document.getElementById('announcements-container');
  container.innerHTML = (data.announcements || []).map(a => `
    <div class="ptn-stat-card" style="padding:18px 22px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span class="ptn-nav-badge">${a.category}</span>
        <span style="font-size:12px; color:var(--ptn-text-muted);">${a.published_at.slice(0,10)}</span>
      </div>
      <h4 style="margin:4px 0 6px; font-size:16px; color:#fff;">${a.title}</h4>
      <p style="margin:0; font-size:13.5px; color:var(--ptn-text-muted); line-height:1.5;">${a.content}</p>
    </div>
  `).join('');
}

// Payout Request Handler
async function handlePayoutRequest() {
  const amount = prompt('Enter payout request amount in BDT (Minimum ৳5,000):', '12810');
  if (!amount) return;
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < 5000) {
    alert('Minimum payout request amount is ৳5,000 BDT.');
    return;
  }
  const paymentMethod = prompt('Enter payment method (e.g. Bank Transfer / bKash / Nagad):', 'bKash Merchant / Bank Transfer');
  if (!paymentMethod) return;
  const accountDetails = prompt('Enter Account / Wallet Details:', 'BRAC Bank A/C: 1501204892001 or bKash: 01711223344');
  if (!accountDetails) return;

  try {
    const res = await fetch('/api/partner/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: numAmount, paymentMethod, accountDetails })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.message || 'Payout request failed');
    alert(data.message);
    loadOverview();
  } catch (err) {
    alert('Payout Error: ' + err.message);
  }
}

// --- REWARD POINTS & SALES LEDGER SYSTEM ---
let currentRewardFilter = 'ALL';
let currentRewardSearch = '';

async function loadRewards(status = currentRewardFilter, search = currentRewardSearch) {
  currentRewardFilter = status;
  currentRewardSearch = search;

  try {
    // 1. Fetch summary
    const summaryRes = await fetch('/api/partner/rewards/summary');
    const summary = await summaryRes.json();

    if (summary && !summary.error) {
      const formatBdt = (val) => '৳' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formatPts = (val) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const elSales = document.getElementById('rew-summary-sales');
      if (elSales) elSales.textContent = formatBdt(summary.totalEligibleSales);
      const elEarned = document.getElementById('rew-summary-earned');
      if (elEarned) elEarned.textContent = formatPts(summary.totalPointsEarned) + ' pts';
      const elAvail = document.getElementById('rew-summary-available');
      if (elAvail) elAvail.textContent = formatPts(summary.availablePoints) + ' pts';
      const elPending = document.getElementById('rew-summary-pending');
      if (elPending) elPending.textContent = formatPts(summary.pendingPoints) + ' pts';
      const elRedeemed = document.getElementById('rew-summary-redeemed');
      if (elRedeemed) elRedeemed.textContent = formatPts(summary.redeemedPoints) + ' pts';

      const overviewMetric = document.getElementById('metric-reward-pts');
      if (overviewMetric) overviewMetric.textContent = formatPts(summary.availablePoints) + ' pts';
    }

    // 2. Fetch transactions
    let txUrl = `/api/partner/rewards/transactions?status=${status}`;
    if (search) txUrl += `&search=${encodeURIComponent(search)}`;
    const txRes = await fetch(txUrl);
    const txData = await txRes.json();

    const tbody = document.getElementById('rew-transactions-tbody');
    if (!tbody) return;

    if (!txData.transactions || txData.transactions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding: 36px 20px; color: var(--ptn-text-muted);">
            <div style="font-size:26px; margin-bottom:8px;">🎁</div>
            <div style="font-size:15px; color:#fff; font-weight:600; margin-bottom:4px;">No Reward Transactions Found</div>
            <div style="font-size:13px;">Reward points will accumulate automatically as qualifying client services are billed.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = txData.transactions.map(t => {
      const isPos = t.points >= 0;
      const statusBadge = t.status === 'APPROVED'
        ? '<span class="ptn-badge-running">APPROVED</span>'
        : (t.status === 'PENDING'
          ? '<span class="ptn-badge-tag" style="background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid rgba(245,158,11,0.35);">PENDING</span>'
          : '<span class="ptn-badge-tag" style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.35);">REVERSED</span>');

      const pointColor = isPos ? '#4ade80' : '#f87171';
      const pointPrefix = isPos ? '+' : '';

      return `
        <tr>
          <td><code style="color:var(--ptn-cyan); font-weight:600;">${t.id}</code></td>
          <td><strong>${t.order_number || 'N/A'}</strong></td>
          <td>${t.customer_name || 'Standard Client'}</td>
          <td>
            <span style="color:#fff;">${t.service_name || 'Cloud Service'}</span><br>
            <small style="color:var(--ptn-text-muted);">${t.category || 'Infrastructure'}</small>
          </td>
          <td>৳${Number(Math.abs(t.eligible_sale_amount)).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
          <td>
            <strong style="color:${pointColor}; font-size:14px;">${pointPrefix}${Number(t.points).toLocaleString('en-US', {minimumFractionDigits: 2})} pts</strong>
          </td>
          <td style="font-size:12.5px; color:var(--ptn-text-muted);">${t.created_at ? t.created_at.slice(0, 16) : 'Just now'}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="ptn-table-action-btn btn-view-tx-detail" data-id="${t.id}" style="font-size:11.5px; padding:4px 8px;">
              View
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Wire View Detail buttons
    document.querySelectorAll('.btn-view-tx-detail').forEach(b => {
      b.addEventListener('click', () => openTransactionDetail(b.getAttribute('data-id')));
    });
  } catch (err) {
    console.error('Error loading rewards:', err);
  }
}

// Load Sales Ledger
async function loadSales(search = '') {
  try {
    let url = '/api/partner/sales';
    if (search) url += `?search=${encodeURIComponent(search)}`;
    const res = await fetch(url);
    const data = await res.json();
    const tbody = document.getElementById('sales-table-tbody');
    if (!tbody) return;

    if (!data.sales || data.sales.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding: 36px 20px; color: var(--ptn-text-muted);">
            <div style="font-size:14px; color:#fff;">No sales recorded in ledger yet.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.sales.map(s => {
      const isPaid = s.payment_status === 'PAID';
      const payBadge = isPaid
        ? '<span class="ptn-badge-running">PAID</span>'
        : '<span class="ptn-badge-tag" style="background:rgba(239,68,68,0.2); color:#f87171;">' + s.payment_status + '</span>';

      const deductions = Number(s.discount_amount || 0) + Number(s.tax_amount || 0);

      return `
        <tr>
          <td><strong style="color:var(--ptn-cyan);">${s.order_number}</strong></td>
          <td>
            <span style="color:#fff;">${s.customer_name}</span><br>
            <small style="color:var(--ptn-text-muted);">${s.customer_email}</small>
          </td>
          <td>
            <span style="color:#fff;">${s.service_name}</span><br>
            <span class="ptn-badge-tag" style="font-size:10px;">${s.category}</span>
          </td>
          <td>৳${Number(s.gross_amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
          <td style="color:var(--ptn-text-muted);">-৳${deductions.toFixed(2)}</td>
          <td><strong style="color:#fff;">৳${Number(s.eligible_net_amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</strong></td>
          <td>${payBadge}</td>
          <td>
            <span style="color:#4ade80; font-weight:700;">+${Number(s.points_earned || (s.eligible_net_amount * 0.10)).toFixed(2)} pts</span>
          </td>
          <td style="font-size:12px; color:var(--ptn-text-muted);">${s.created_at ? s.created_at.slice(0, 10) : ''}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading sales ledger:', err);
  }
}

// Open Transaction Detail Modal
async function openTransactionDetail(txId) {
  const modal = document.getElementById('modal-tx-detail');
  const content = document.getElementById('tx-detail-content');
  content.innerHTML = '<div style="text-align:center; padding:20px;">Loading transaction details...</div>';
  modal.style.display = 'flex';

  try {
    const res = await fetch(`/api/partner/rewards/transactions/${txId}`);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.message || 'Failed to load transaction');
    const t = data.transaction;

    const isPos = t.points >= 0;
    const ptsColor = isPos ? '#4ade80' : '#f87171';
    const netAmt = Math.abs(t.eligible_sale_amount || 0);
    const ratePct = (Number(t.reward_rate) * 100).toFixed(0);

    content.innerHTML = `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <span style="font-size:11px; text-transform:uppercase; color:var(--ptn-text-muted); font-weight:700;">Transaction ID</span>
            <div style="font-family:monospace; font-size:14px; color:var(--ptn-cyan); font-weight:700;">${t.id}</div>
          </div>
          <span class="ptn-badge-running">${t.status}</span>
        </div>
        <div style="font-size:13px; color:var(--ptn-text-muted); margin-bottom:8px;">
          <strong>Type:</strong> <code>${t.transaction_type}</code> &bull; <strong>Processed:</strong> ${t.created_at}
        </div>
        <div style="font-size:13.5px; color:#fff; line-height:1.4;">${t.description || 'Eligible Sale Reward'}</div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="ptn-stat-card" style="padding:14px;">
          <div style="font-size:11px; color:var(--ptn-text-muted); text-transform:uppercase; font-weight:600;">Associated Sale / Order</div>
          <div style="font-size:15px; font-weight:700; color:#fff; margin-top:4px;">${t.order_number || 'N/A'}</div>
          <div style="font-size:12px; color:var(--ptn-text-muted); margin-top:2px;">${t.customer_name || 'Direct Customer'} (${t.customer_email || ''})</div>
        </div>

        <div class="ptn-stat-card" style="padding:14px;">
          <div style="font-size:11px; color:var(--ptn-text-muted); text-transform:uppercase; font-weight:600;">Cloud Service</div>
          <div style="font-size:15px; font-weight:700; color:#fff; margin-top:4px;">${t.service_name || 'Infrastructure Service'}</div>
          <div style="font-size:12px; color:var(--ptn-text-muted); margin-top:2px;">Category: ${t.category || 'VPS'}</div>
        </div>
      </div>

      <div style="background:rgba(93,224,196,0.06); border:1px solid rgba(93,224,196,0.25); border-radius:10px; padding:16px;">
        <div style="font-size:11px; text-transform:uppercase; color:var(--ptn-cyan); font-weight:700; letter-spacing:0.05em; margin-bottom:8px;">
          Reward Transaction Summary
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="color:var(--ptn-text-muted);">Net Eligible Sale Amount:</span>
          <strong style="color:#fff;">৳${netAmt.toLocaleString('en-US', {minimumFractionDigits: 2})} BDT</strong>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; display:flex; justify-content:space-between; align-items:center;">
          <span style="color:#fff; font-weight:600;">Reward Points Awarded:</span>
          <strong style="font-size:17px; color:${ptsColor};">${Number(t.points).toLocaleString('en-US', {minimumFractionDigits: 2})} Points</strong>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div style="color:#f87171; padding:20px;">${err.message}</div>`;
  }
}

// Transaction Detail Modal Close
const txModal = document.getElementById('modal-tx-detail');
const closeTxBtn = document.getElementById('btn-close-tx-modal');
if (closeTxBtn) closeTxBtn.addEventListener('click', () => { txModal.style.display = 'none'; });
const dismissTxBtn = document.getElementById('btn-dismiss-tx-modal');
if (dismissTxBtn) dismissTxBtn.addEventListener('click', () => { txModal.style.display = 'none'; });

// Reward Filters & Search
document.querySelectorAll('.rew-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rew-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const status = btn.getAttribute('data-status');
    loadRewards(status, currentRewardSearch);
  });
});

const rewSearchInput = document.getElementById('rew-search-input');
if (rewSearchInput) {
  let timeout;
  rewSearchInput.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      loadRewards(currentRewardFilter, rewSearchInput.value);
    }, 300);
  });
}

const salesSearchInput = document.getElementById('sales-search-input');
if (salesSearchInput) {
  let timeout;
  salesSearchInput.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      loadSales(salesSearchInput.value);
    }, 300);
  });
}

const refreshRewBtn = document.getElementById('btn-refresh-rewards');
if (refreshRewBtn) refreshRewBtn.addEventListener('click', () => loadRewards());

// =========================================================================
// PARTNER / RESELLER SUPPORT TICKETING OPERATIONS
// =========================================================================
let currentPartnerTicketFilter = 'ALL';
let currentPartnerTicketSearch = '';
let activePartnerTicket = null;
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadPartnerTickets(status = currentPartnerTicketFilter, search = currentPartnerTicketSearch) {
  currentPartnerTicketFilter = status;
  currentPartnerTicketSearch = search;
  const tbody = document.getElementById('ptn-tickets-table-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px 20px; color: var(--ptn-text-muted);">Loading tickets...</td></tr>`;

  try {
    let url = `/api/partner/support/tickets?status=${encodeURIComponent(status)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.metrics) {
      document.getElementById('ptn-metric-total-tickets').textContent = data.metrics.total || 0;
      document.getElementById('ptn-metric-open-tickets').textContent = data.metrics.open || 0;
      document.getElementById('ptn-metric-escalated-tickets').textContent = data.metrics.escalated || 0;
      document.getElementById('ptn-metric-resolved-tickets').textContent = data.metrics.resolved || 0;
    }

    if (!data.tickets || data.tickets.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 36px 20px; color: var(--ptn-text-muted);">
            <div style="font-size: 14px; color: #fff;">No support tickets found matching criteria.</div>
            <div style="font-size: 12px; margin-top: 4px;">Click "New Ticket for Buyer" to file an issue for one of your clients.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.tickets.map(t => {
      const isEscalated = t.is_escalated || t.status === 'ESCALATED';
      let statusBadge = `<span class="ptn-badge-tag">${t.status}</span>`;
      if (isEscalated) {
        statusBadge = `<span class="ptn-badge-tag" style="background: rgba(244,63,94,0.2); color: #fb7185; border: 1px solid rgba(244,63,94,0.35);">ESCALATED TO NOC</span>`;
      } else if (t.status === 'OPEN') {
        statusBadge = `<span class="ptn-badge-tag" style="background: rgba(56,189,248,0.2); color: #38bdf8;">OPEN</span>`;
      } else if (t.status === 'IN_PROGRESS') {
        statusBadge = `<span class="ptn-badge-tag" style="background: rgba(245,158,11,0.2); color: #fbbf24;">IN PROGRESS</span>`;
      } else if (t.status === 'RESOLVED') {
        statusBadge = `<span class="ptn-badge-running">RESOLVED</span>`;
      } else if (t.status === 'WAITING_BUYER') {
        statusBadge = `<span class="ptn-badge-tag" style="background: rgba(192,132,252,0.2); color: #c084fc;">WAITING BUYER</span>`;
      }

      const prioColor = t.priority === 'CRITICAL' ? '#f43f5e' : (t.priority === 'HIGH' ? '#f59e0b' : '#38bdf8');
      const buyerLabel = t.managed_customer_name || t.buyer_name || t.requester_name;

      return `
        <tr>
          <td><strong style="color: var(--ptn-cyan); font-family: monospace;">${t.ticket_number}</strong></td>
          <td>
            <span style="color: #fff; font-weight: 600;">${t.subject}</span><br>
            <small style="color: var(--ptn-text-muted);">Updated: ${t.updated_at ? t.updated_at.slice(0, 16) : ''}</small>
          </td>
          <td>
            <span style="color: #fff;">${buyerLabel}</span><br>
            <small style="color: var(--ptn-text-muted);">${t.buyer_email || t.requester_email}</small>
          </td>
          <td><span style="font-size: 12px; color: var(--ptn-text-muted);">${t.category}</span></td>
          <td>
            <span style="font-weight: 700; color: ${prioColor}; font-size: 12px;">${t.priority}</span>
          </td>
          <td>${statusBadge}</td>
          <td>
            <button type="button" class="ptn-btn ptn-btn-secondary ptn-btn-sm btn-open-ticket-detail" data-id="${t.id}" style="padding: 5px 12px; font-size: 12px;">
              Manage &amp; Reply
            </button>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-open-ticket-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        openPartnerTicketDetail(btn.getAttribute('data-id'));
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#f87171; padding:24px;">Failed to load tickets: ${err.message}</td></tr>`;
  }
}

// Load Managed Buyers for Dropdowns
async function loadPartnerCustomersForTickets() {
  try {
    const res = await fetch('/api/partner/support/customers');
    const data = await res.json();
    partnerManagedBuyers = data.customers || [];

    const sel = document.getElementById('ptn-create-customer-select');
    if (sel) {
      sel.innerHTML = '<option value="">-- Choose Managed Buyer --</option>' +
        partnerManagedBuyers.map(c => 
          `<option value="${c.id}">${c.customer_name} (${c.company || c.customer_email})</option>`
        ).join('');
    }
  } catch (err) {
    console.warn('Failed to load partner customers for ticket select:', err);
  }
}

// Buyer selection change -> update related service dropdown
const custSelect = document.getElementById('ptn-create-customer-select');
if (custSelect) {
  custSelect.addEventListener('change', () => {
    const custId = custSelect.value;
    const buyer = partnerManagedBuyers.find(b => b.id === custId);
    const srvSelect = document.getElementById('ptn-create-service-select');
    if (!srvSelect) return;

    if (buyer && buyer.services && buyer.services.length > 0) {
      srvSelect.innerHTML = '<option value="">-- General / No Specific Resource --</option>' +
        buyer.services.map(s => 
          `<option value="${s.id}">[${s.product_code}] ${s.service_name} (${s.ip_address || 'CloudStack VM'})</option>`
        ).join('');
    } else {
      srvSelect.innerHTML = '<option value="">-- No Active Services Assigned --</option>';
    }
  });
}

// Open Create Ticket Modal
function openPartnerCreateTicketModal() {
  loadPartnerCustomersForTickets();
  document.getElementById('partner-create-ticket-form').reset();
  document.getElementById('partner-create-ticket-error').style.display = 'none';
  document.getElementById('modal-partner-create-ticket').style.display = 'flex';
}

// Open Ticket Detail Workspace Modal
async function openPartnerTicketDetail(ticketId) {
  const modal = document.getElementById('modal-partner-ticket-detail');
  modal.style.display = 'flex';
  const thread = document.getElementById('ptn-detail-messages-thread');
  thread.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--ptn-text-muted);">Loading conversation thread...</div>`;
  document.getElementById('ptn-reply-textarea').value = '';

  try {
    const res = await fetch(`/api/partner/support/tickets/${ticketId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to load ticket details');

    activePartnerTicket = data.ticket;
    const t = data.ticket;

    document.getElementById('ptn-detail-modal-ref').textContent = t.ticket_number;
    document.getElementById('ptn-detail-modal-title').textContent = t.subject;
    document.getElementById('ptn-detail-buyer-name').textContent = t.buyer_name || t.requester_name;
    document.getElementById('ptn-detail-buyer-email').textContent = t.buyer_email || t.requester_email;
    document.getElementById('ptn-detail-service').textContent = t.related_service_id || t.related_product_code || 'Cloud Platform';

    document.getElementById('ptn-detail-status-badge').innerHTML = `<span class="ptn-badge-tag">${t.status}</span>`;
    document.getElementById('ptn-detail-prio-badge').innerHTML = `<span style="color:var(--ptn-cyan); font-weight:700;">${t.priority}</span>`;

    // Escalation Banner
    const escBanner = document.getElementById('ptn-detail-escalation-banner');
    if (t.is_escalated || t.status === 'ESCALATED') {
      escBanner.style.display = 'block';
      document.getElementById('ptn-detail-escalation-reason').textContent = t.escalation_reason || 'Escalated to 24/7 Platform Operations NOC';
      document.getElementById('btn-partner-escalate-ticket').style.display = 'none';
    } else {
      escBanner.style.display = 'none';
      document.getElementById('btn-partner-escalate-ticket').style.display = 'inline-flex';
    }

    // Messages Thread (Internal staff notes are excluded by API)
    thread.innerHTML = (data.messages || []).map(m => {
      const isStaff = m.author_type === 'STAFF';
      const isPartner = m.author_type === 'PARTNER';
      const authorBadge = isStaff 
        ? '<span style="color: var(--ptn-cyan); font-size: 11px;">[Unified NOC Engineer]</span>' 
        : (isPartner ? '<span style="color: var(--ptn-purple); font-size: 11px;">[Your Reseller Team]</span>' : '<span style="color: #94a3b8; font-size: 11px;">[Buyer]</span>');

      const bgStyle = isStaff 
        ? 'background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(14, 165, 233, 0.25);' 
        : (isPartner ? 'background: rgba(192, 132, 252, 0.08); border: 1px solid rgba(192, 132, 252, 0.25);' : 'background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08);');

      return `
        <div style="padding: 12px 16px; border-radius: 8px; ${bgStyle}">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px;">
            <strong style="color: #fff;">${m.author_name} ${authorBadge}</strong>
            <span style="color: var(--ptn-text-muted);">${m.created_at ? m.created_at.slice(0, 16) : ''}</span>
          </div>
          <div style="color: #e2e8f0; font-size: 13.5px; white-space: pre-wrap; line-height: 1.5;">${m.message}</div>
        </div>
      `;
    }).join('');

  } catch (err) {
    thread.innerHTML = `<div style="color: #f87171; padding: 20px;">${err.message}</div>`;
  }
}

// Submit Reseller Reply
document.getElementById('btn-submit-partner-reply').addEventListener('click', async () => {
  if (!activePartnerTicket) return;
  const msg = document.getElementById('ptn-reply-textarea').value.trim();
  if (!msg) {
    alert('Please enter a reply message.');
    return;
  }

  const btn = document.getElementById('btn-submit-partner-reply');
  btn.disabled = true;
  try {
    const res = await fetch(`/api/partner/support/tickets/${activePartnerTicket.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to submit reply');

    document.getElementById('ptn-reply-textarea').value = '';
    openPartnerTicketDetail(activePartnerTicket.id);
    loadPartnerTickets();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

// Reseller Resolve Ticket
document.getElementById('btn-partner-resolve-ticket').addEventListener('click', async () => {
  if (!activePartnerTicket) return;
  if (!confirm(`Mark ticket ${activePartnerTicket.ticket_number} as RESOLVED?`)) return;

  try {
    const res = await fetch(`/api/partner/support/tickets/${activePartnerTicket.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED', reason: 'Resolved directly by partner support engineer.' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to update status');

    openPartnerTicketDetail(activePartnerTicket.id);
    loadPartnerTickets();
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

// Reseller Escalate Ticket
document.getElementById('btn-partner-escalate-ticket').addEventListener('click', () => {
  if (!activePartnerTicket) return;
  document.getElementById('ptn-escalate-reason').value = '';
  document.getElementById('modal-partner-escalate').style.display = 'flex';
});

document.getElementById('partner-escalate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activePartnerTicket) return;
  const reason = document.getElementById('ptn-escalate-reason').value.trim();

  try {
    const res = await fetch(`/api/partner/support/tickets/${activePartnerTicket.id}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Escalation failed');

    document.getElementById('modal-partner-escalate').style.display = 'none';
    openPartnerTicketDetail(activePartnerTicket.id);
    loadPartnerTickets();
  } catch (err) {
    alert('Escalation failed: ' + err.message);
  }
});

// Create Ticket Submit
document.getElementById('partner-create-ticket-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('partner-create-ticket-error');
  errBox.style.display = 'none';

  const custId = document.getElementById('ptn-create-customer-select').value;
  const srvId = document.getElementById('ptn-create-service-select').value;
  const subject = document.getElementById('ptn-create-subject').value.trim();
  const category = document.getElementById('ptn-create-category').value;
  const priority = document.getElementById('ptn-create-priority').value;
  const description = document.getElementById('ptn-create-description').value.trim();

  const btn = document.getElementById('btn-submit-create-ticket');
  btn.disabled = true;

  try {
    const res = await fetch('/api/partner/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: custId,
        relatedServiceId: srvId || null,
        subject,
        category,
        priority,
        description
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to create ticket');

    document.getElementById('modal-partner-create-ticket').style.display = 'none';
    loadPartnerTickets();
    openPartnerTicketDetail(data.ticketId);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
});

// Wire buttons & modal close
document.getElementById('btn-open-partner-create-ticket').addEventListener('click', openPartnerCreateTicketModal);
document.getElementById('quick-ticket-btn')?.addEventListener('click', () => {
  document.getElementById('btn-tab-tickets').click();
  openPartnerCreateTicketModal();
});
document.getElementById('btn-refresh-partner-tickets').addEventListener('click', () => loadPartnerTickets());

document.getElementById('btn-close-partner-ticket-modal').addEventListener('click', () => {
  document.getElementById('modal-partner-ticket-detail').style.display = 'none';
});
document.getElementById('btn-close-create-ticket-modal').addEventListener('click', () => {
  document.getElementById('modal-partner-create-ticket').style.display = 'none';
});
document.getElementById('btn-cancel-create-ticket').addEventListener('click', () => {
  document.getElementById('modal-partner-create-ticket').style.display = 'none';
});
document.getElementById('btn-close-escalate-modal').addEventListener('click', () => {
  document.getElementById('modal-partner-escalate').style.display = 'none';
});
document.getElementById('btn-cancel-escalate').addEventListener('click', () => {
  document.getElementById('modal-partner-escalate').style.display = 'none';
});

// Partner Ticket Filters & Search
document.querySelectorAll('.ptn-ticket-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ptn-ticket-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const status = btn.getAttribute('data-status');
    loadPartnerTickets(status, currentPartnerTicketSearch);
  });
});

const ptnTicketSearch = document.getElementById('ptn-ticket-search-input');
if (ptnTicketSearch) {
  let timeout;
  ptnTicketSearch.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      loadPartnerTickets(currentPartnerTicketFilter, ptnTicketSearch.value.trim());
    }, 300);
  });
}

checkAuth();
