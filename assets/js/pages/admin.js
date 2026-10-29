/* Moved out of admin.html so the Content-Security-Policy can forbid inline script. */

// Value placed inside a data-on…="fn('…')" attribute: escape it as a JS string literal first (\ and '),
// then for the HTML attribute. assets/js/csp-handlers.js parses the call, so a value can never become code.
function handlerArg(v) {
  const js = String(v === null || v === undefined ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return js.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// State management
const AdminApp = {
  user: null,
  token: localStorage.getItem('uct_admin_token') || null,
  activeView: 'dashboard',
  dashboardData: null,
  customers: [],
  vms: [],
  invoices: []
};

// Global fetch interceptor ensuring Bearer token is attached
const _origFetch = window.fetch;
window.fetch = function(url, options = {}) {
  const token = localStorage.getItem('uct_admin_token');
  if (token && typeof url === 'string' && url.startsWith('/api/')) {
    options = options || {};
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) {
      if (!options.headers.has('Authorization')) {
        options.headers.set('Authorization', `Bearer ${token}`);
      }
    } else {
      if (!options.headers['Authorization'] && !options.headers['authorization']) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }
  return _origFetch(url, options);
};

// Initialize application on page load
document.addEventListener('DOMContentLoaded', () => {
  startLiveClock();
  checkAdminSession();
  updateSubdomainDisplay();
});

function updateSubdomainDisplay() {
  const host = window.location.hostname || 'admin.example.com';
  const el = document.getElementById('currentSubdomainTag');
  if (el) el.textContent = host;
}

function startLiveClock() {
  const clockEl = document.getElementById('liveUtcClock');
  if (!clockEl) return;
  setInterval(() => {
    const d = new Date();
    clockEl.textContent = d.toISOString().slice(11, 19) + ' UTC';
  }, 1000);
}

// Toast notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Modal Helpers
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Session Verification
async function checkAdminSession() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      const adminRoles = [
        'ADMIN', 'SUPER_ADMIN', 'SECURITY_ADMIN', 'INFRASTRUCTURE_ADMIN',
        'FINANCE_ADMIN', 'PARTNER_MANAGER', 'SUPPORT_ADMIN', 'CONTENT_ADMIN', 'AUDITOR'
      ];
      if (data.authenticated && data.user && adminRoles.includes(data.user.role)) {
        AdminApp.user = data.user;
        showAdminApp();
        return;
      }
    }
  } catch (e) {
    console.warn('Session check failed:', e);
  }
  showAuthOverlay();
}

function showAuthOverlay() {
  document.getElementById('authOverlay').style.display = 'flex';
  document.getElementById('adminAppWrapper').style.display = 'none';
}

function showAdminApp() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('adminAppWrapper').style.display = 'flex';

  // Update sidebar user display
  if (AdminApp.user) {
    document.getElementById('sidebarUserName').textContent = AdminApp.user.name || AdminApp.user.email.split('@')[0];
    document.getElementById('sidebarUserRole').textContent = AdminApp.user.role;
    const initials = (AdminApp.user.name || AdminApp.user.email).slice(0, 2).toUpperCase();
    document.getElementById('sidebarUserInitials').textContent = initials;
  }

  // Initial Data Loading
  loadDashboardData();
}

function fillAdminLogin(email, password, autoSubmit = false) {
  document.getElementById('authEmail').value = email;
  document.getElementById('authPassword').value = password;
  if (autoSubmit) {
    const fakeEvent = { preventDefault: () => {} };
    handleAdminLoginSubmit(fakeEvent);
  }
}

async function handleAdminLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const submitBtn = document.getElementById('authSubmitBtn');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying Credentials...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Login failed');
    }

    const adminRoles = [
      'ADMIN', 'SUPER_ADMIN', 'SECURITY_ADMIN', 'INFRASTRUCTURE_ADMIN',
      'FINANCE_ADMIN', 'PARTNER_MANAGER', 'SUPPORT_ADMIN', 'CONTENT_ADMIN', 'AUDITOR'
    ];

    if (!adminRoles.includes(data.user.role)) {
      throw new Error('Access denied. This account does not possess administrative privileges.');
    }

    if (data.token) {
      localStorage.setItem('uct_admin_token', data.token);
      AdminApp.token = data.token;
    }

    AdminApp.user = data.user;
    showToast(`Authenticated successfully as ${data.user.role}`, 'success');
    showAdminApp();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Authenticate & Access Portal';
  }
}

async function handleAdminLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // ignore
  }
  localStorage.removeItem('uct_admin_token');
  AdminApp.user = null;
  AdminApp.token = null;
  showToast('Session terminated successfully.', 'info');
  showAuthOverlay();
}

// View Navigation Switcher
function switchAdminView(viewName) {
  AdminApp.activeView = viewName;

  // Update sidebar active link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('onclick')?.includes(viewName)) {
      link.classList.add('active');
    }
  });

  // Switch visible view
  document.querySelectorAll('.admin-view').forEach(view => view.classList.remove('active'));
  const activeEl = document.getElementById(`view-${viewName}`);
  if (activeEl) activeEl.classList.add('active');

  // Trigger view data loading
  if (viewName === 'dashboard') loadDashboardData();
  else if (viewName === 'customers') loadCustomers();
  else if (viewName === 'partners') loadPartners();
  else if (viewName === 'cloud') loadVMs();
  else if (viewName === 'billing') loadInvoices();
  else if (viewName === 'support') loadSupportTickets();
  else if (viewName === 'cms') loadCMSData();
  else if (viewName === 'security') { loadSecurityEvents(); loadActiveSessions(); loadAdminUsers(); }
  else if (viewName === 'audit') loadFullAuditTrail();
}

// 1. Dashboard View Telemetry
async function loadDashboardData() {
  try {
    const [statsRes, actRes] = await Promise.all([
      fetch('/api/admin/dashboard/stats'),
      fetch('/api/admin/dashboard/activity')
    ]);

    if (statsRes.ok) {
      const stats = await statsRes.json();
      document.getElementById('kpiTotalCustomers').textContent = stats.customers.total;
      document.getElementById('kpiActiveCustBadge').textContent = `${stats.customers.active} Active`;
      document.getElementById('kpiSuspendedCustBadge').textContent = `${stats.customers.suspended} Suspended`;
      document.getElementById('sidebarCustCount').textContent = stats.customers.total;

      document.getElementById('kpiRunningVMs').textContent = stats.cloud.runningVMs;
      document.getElementById('kpiVMSubtext').textContent = `${stats.cloud.allocatedvCPUs} vCPUs • ${stats.cloud.allocatedRAMGB} GB RAM`;
      document.getElementById('sidebarVMCount').textContent = stats.cloud.runningVMs;

      document.getElementById('kpiMRR').textContent = `৳${stats.billing.mrrBDT.toLocaleString('en-US')}`;
      document.getElementById('kpiPaidInvBadge').textContent = `${stats.billing.paidInvoices} Paid`;
      document.getElementById('kpiOutstandingBadge').textContent = `৳${stats.billing.totalOutstandingBDT.toLocaleString('en-US')} Unpaid`;

      document.getElementById('kpiOpenTickets').textContent = stats.support.openTickets;
      document.getElementById('kpiCriticalTickets').textContent = `${stats.support.criticalTickets} Critical`;
      document.getElementById('kpiInProgressTickets').textContent = `${stats.support.inProgressTickets} in progress`;
      document.getElementById('sidebarTicketAlert').textContent = stats.support.openTickets;

      document.getElementById('sidebarPartnerCount').textContent = stats.partners.total;
    }

    if (actRes.ok) {
      const act = await actRes.json();
      renderDashboardActivityTable(act.securityEvents);
    }
  } catch (e) {
    console.error('Error loading dashboard:', e);
  }
}

function renderDashboardActivityTable(events) {
  const tbody = document.getElementById('dashboardActivityTableBody');
  if (!tbody) return;
  if (!events || events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No recent security activity logged.</td></tr>`;
    return;
  }

  tbody.innerHTML = events.map(ev => `
    <tr>
      <td class="mono">${ev.timestamp.replace('T', ' ').slice(0, 19)}</td>
      <td><span class="badge ${ev.event_type.includes('FAIL') ? 'badge-danger' : 'badge-info'}">${ev.event_type}</span></td>
      <td class="mono" style="color: #fff;">${ev.actor_email || 'anonymous'}</td>
      <td><span class="badge badge-purple">${ev.actor_role || 'UNKNOWN'}</span></td>
      <td><span class="badge ${ev.outcome === 'SUCCESS' ? 'badge-success' : 'badge-danger'}">${ev.outcome}</span></td>
      <td class="mono">${ev.ip_address || '127.0.0.1'}</td>
    </tr>
  `).join('');
}

// 2. Customer Management
let debounceCustTimer = null;
function debounceLoadCustomers() {
  clearTimeout(debounceCustTimer);
  debounceCustTimer = setTimeout(loadCustomers, 300);
}

async function loadCustomers() {
  const search = document.getElementById('custSearchInput')?.value || '';
  const status = document.getElementById('custStatusFilter')?.value || 'ALL';

  const tbody = document.getElementById('customersTableBody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">Searching customers...</td></tr>`;

  try {
    const res = await fetch(`/api/admin/customers?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
    if (!res.ok) throw new Error('Failed to load customers');
    const data = await res.json();

    if (data.customers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">No customer accounts found matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.customers.map(c => `
      <tr>
        <td>
          <div class="table-entity-title">
            ${c.company_name || `${c.first_name} ${c.last_name}`}
            <span class="table-entity-sub">${c.first_name} ${c.last_name} • ${c.city}, ${c.country}</span>
          </div>
        </td>
        <td class="mono" style="color: #fff;">${c.email}</td>
        <td>
          <span class="badge ${c.status === 'ACTIVE' ? 'badge-success' : (c.status === 'SUSPENDED' ? 'badge-danger' : 'badge-warning')}">
            ${c.status}
          </span>
        </td>
        <td><strong>${c.active_services_count || 0} Instances</strong></td>
        <td class="mono" style="color: var(--adm-teal);">৳${(c.total_spend_bdt || 0).toLocaleString('en-US')}</td>
        <td>${c.partner_company_name ? `<span class="badge badge-purple">${c.partner_company_name}</span>` : '<span style="color: var(--adm-text-subtle);">Direct Cloud Client</span>'}</td>
        <td>
          <div class="table-actions">
            <button class="btn-action-sm" data-onclick="inspectCustomer('${handlerArg(c.id)}')">Inspect</button>
            <button class="btn-action-sm ${c.status === 'ACTIVE' ? 'danger' : ''}" data-onclick="promptCustomerStatus('${handlerArg(c.id)}', '${handlerArg(c.status)}', '${handlerArg(c.company_name || c.email)}')">
              ${c.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
            </button>
            <button class="btn-action-sm" data-onclick="triggerCustomerPasswordReset('${handlerArg(c.id)}', '${handlerArg(c.email)}')">Reset Pass</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #fb7185; padding: 2rem;">Error: ${err.message}</td></tr>`;
  }
}

async function inspectCustomer(custId) {
  openModal('customerDetailModal');
  const content = document.getElementById('custModalContent');
  content.innerHTML = '<div style="padding: 2rem; text-align: center;">Fetching customer records...</div>';

  try {
    const res = await fetch(`/api/admin/customers/${custId}`);
    if (!res.ok) throw new Error('Failed to load customer profile');
    const data = await res.json();
    const c = data.customer;

    document.getElementById('custModalTitle').textContent = `Customer: ${c.company_name || `${c.first_name} ${c.last_name}`}`;

    content.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; background: rgba(0,0,0,0.25); padding: 1.25rem; border-radius: 8px;">
        <div>
          <div style="font-size: 0.75rem; color: var(--adm-text-subtle);">Client Name</div>
          <strong style="color: #fff;">${c.first_name} ${c.last_name}</strong>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--adm-text-subtle);">Email Address</div>
          <strong class="mono" style="color: #fff;">${c.email}</strong>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--adm-text-subtle);">Phone & City</div>
          <div>${c.phone || 'N/A'} • ${c.city}, ${c.country}</div>
        </div>
        <div>
          <div style="font-size: 0.75rem; color: var(--adm-text-subtle);">Account Status</div>
          <div>
            <span class="badge ${c.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${c.status}</span>
            ${c.suspension_reason ? `<span style="font-size: 0.75rem; color: #fb7185; margin-left: 0.5rem;">Reason: ${c.suspension_reason}</span>` : ''}
          </div>
        </div>
      </div>

      <h4 style="margin-bottom: 0.75rem; color: #fff;">Active Cloud Instances (${data.services.length})</h4>
      <div style="margin-bottom: 1.5rem;">
        ${data.services.length === 0 ? '<p style="color: var(--adm-text-subtle);">No active services.</p>' : `
          <table class="data-table">
            <thead><tr><th>Instance</th><th>Plan</th><th>IP</th><th>vCPU/RAM</th><th>Status</th></tr></thead>
            <tbody>
              ${data.services.map(s => `
                <tr>
                  <td style="color: #fff;">${s.service_name}</td>
                  <td><span class="badge badge-info">${s.plan_code}</span></td>
                  <td class="mono">${s.ip_address || 'DHCP'}</td>
                  <td>${s.vcpu} vCPU / ${s.ram_mb} MB</td>
                  <td><span class="badge ${s.status === 'RUNNING' ? 'badge-success' : 'badge-warning'}">${s.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>

      <h4 style="margin-bottom: 0.75rem; color: #fff;">Recent Invoices (${data.invoices.length})</h4>
      <div>
        ${data.invoices.length === 0 ? '<p style="color: var(--adm-text-subtle);">No invoices found.</p>' : `
          <table class="data-table">
            <thead><tr><th>Invoice #</th><th>Due Date</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              ${data.invoices.map(inv => `
                <tr>
                  <td class="mono" style="color: #fff;">${inv.invoice_number}</td>
                  <td>${inv.due_date}</td>
                  <td class="mono">৳${inv.total.toLocaleString('en-US')}</td>
                  <td><span class="badge ${inv.status === 'PAID' ? 'badge-success' : 'badge-warning'}">${inv.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div style="padding: 2rem; color: #fb7185;">Error: ${err.message}</div>`;
  }
}

function promptCustomerStatus(custId, currentStatus, name) {
  const targetStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  document.getElementById('suspendCustomerId').value = custId;
  document.getElementById('suspendTargetStatus').value = targetStatus;
  document.getElementById('suspendReasonInput').value = '';

  document.getElementById('suspendModalTitle').textContent = targetStatus === 'SUSPENDED' ? 'Suspend Customer Account' : 'Reactivate Customer Account';
  document.getElementById('suspendModalNotice').textContent = targetStatus === 'SUSPENDED' 
    ? `Are you sure you want to suspend "${name}"? Active virtual machines will be paused and portal access restricted.`
    : `Reactivate "${name}" account and restore compute instances?`;

  document.getElementById('suspendModalConfirmBtn').textContent = targetStatus === 'SUSPENDED' ? 'Confirm Suspension' : 'Confirm Reactivation';
  document.getElementById('suspendModalConfirmBtn').className = targetStatus === 'SUSPENDED' ? 'btn-admin btn-danger' : 'btn-admin btn-primary';

  openModal('suspendCustomerModal');
}

async function handleCustomerStatusSubmit(e) {
  e.preventDefault();
  const custId = document.getElementById('suspendCustomerId').value;
  const status = document.getElementById('suspendTargetStatus').value;
  const reason = document.getElementById('suspendReasonInput').value.trim();

  try {
    const res = await fetch(`/api/admin/customers/${custId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Status update failed');

    closeModal('suspendCustomerModal');
    showToast(data.message, 'success');
    loadCustomers();
    loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function triggerCustomerPasswordReset(custId, email) {
  if (!confirm(`Trigger a secure one-time password reset workflow for ${email}? A secure token will be generated without exposing raw passwords.`)) {
    return;
  }
  try {
    const res = await fetch(`/api/admin/customers/${custId}/reset-password`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to trigger password reset');
    alert(`Password Reset Token Generated for ${email}:\n\nToken: ${data.resetToken}\nExpires: ${data.expiresAt}\n\nThis token can now be used securely by customer authentication services.`);
    showToast('Password reset workflow executed successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openCreateCustomerModal() {
  openModal('createCustomerModal');
}

async function handleCreateCustomerSubmit(e) {
  e.preventDefault();
  const body = {
    firstName: document.getElementById('newCustFirstName').value,
    lastName: document.getElementById('newCustLastName').value,
    companyName: document.getElementById('newCustCompany').value,
    email: document.getElementById('newCustEmail').value,
    phone: document.getElementById('newCustPhone').value
  };
  try {
    const res = await fetch('/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Creation failed');
    closeModal('createCustomerModal');
    showToast('Customer account provisioned successfully.', 'success');
    loadCustomers();
    loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 3. Partner Management
async function loadPartners() {
  const tbody = document.getElementById('partnersTableBody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">Loading partners...</td></tr>`;

  try {
    const res = await fetch('/api/admin/partners');
    if (!res.ok) throw new Error('Failed to load partners');
    const data = await res.json();

    tbody.innerHTML = data.partners.map(p => `
      <tr>
        <td>
          <div class="table-entity-title">
            ${p.company_name}
            <span class="table-entity-sub">${p.email} • ${p.country}</span>
          </div>
        </td>
        <td>${p.contact_name}</td>
        <td>
          <span class="badge badge-purple">${p.tier_name}</span>
          <strong style="margin-left: 0.4rem; color: var(--adm-teal);">${Math.round(p.effective_discount_rate * 100)}% Margin</strong>
        </td>
        <td class="mono">৳${p.monthly_eligible_spend.toLocaleString('en-US')}</td>
        <td><span class="badge ${p.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${p.status}</span></td>
        <td>
          <a href="/admin/partners" class="btn-action-sm" target="_blank">Manage Partner</a>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #fb7185; padding: 2rem;">Error: ${err.message}</td></tr>`;
  }
}

// 4. Cloud Infrastructure & VM NOC
let debounceVMsTimer = null;
function debounceLoadVMs() {
  clearTimeout(debounceVMsTimer);
  debounceVMsTimer = setTimeout(loadVMs, 300);
}

async function loadVMs() {
  const search = document.getElementById('vmSearchInput')?.value || '';
  const status = document.getElementById('vmStatusFilter')?.value || 'ALL';
  const zone = document.getElementById('vmZoneFilter')?.value || 'ALL';

  const tbody = document.getElementById('vmsTableBody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">Querying hypervisors...</td></tr>`;

  try {
    const res = await fetch(`/api/admin/cloud/vms?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&zone=${encodeURIComponent(zone)}`);
    if (!res.ok) throw new Error('Failed to query VMs');
    const data = await res.json();

    if (data.vms.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">No virtual instances found.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.vms.map(vm => `
      <tr>
        <td>
          <div class="table-entity-title">
            ${vm.service_name}
            <span class="table-entity-sub mono">${vm.cloudstack_vm_id || vm.id}</span>
          </div>
        </td>
        <td>${vm.client_name || 'Enterprise'}</td>
        <td><span class="badge badge-info">${vm.zone}</span></td>
        <td class="mono" style="color: #fff;">${vm.ip_address || '103.145.22.x'}</td>
        <td>${vm.vcpu} vCPU / ${Math.round(vm.ram_mb / 1024)}GB / ${vm.disk_gb}GB</td>
        <td><span class="badge ${vm.status === 'RUNNING' ? 'badge-success' : (vm.status === 'STOPPED' ? 'badge-warning' : 'badge-danger')}">${vm.status}</span></td>
        <td>
          <div class="table-actions">
            ${vm.status === 'RUNNING' ? `
              <button class="btn-action-sm danger" data-onclick="promptVMAction('${handlerArg(vm.id)}', 'stop', '${handlerArg(vm.service_name)}')">Stop</button>
              <button class="btn-action-sm" data-onclick="promptVMAction('${handlerArg(vm.id)}', 'reboot', '${handlerArg(vm.service_name)}')">Reboot</button>
            ` : `
              <button class="btn-action-sm" data-onclick="promptVMAction('${handlerArg(vm.id)}', 'start', '${handlerArg(vm.service_name)}')">Start</button>
            `}
            <button class="btn-action-sm danger" data-onclick="promptVMAction('${handlerArg(vm.id)}', 'terminate', '${handlerArg(vm.service_name)}')">Terminate</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #fb7185; padding: 2rem;">Error: ${err.message}</td></tr>`;
  }
}

function promptVMAction(vmId, action, serviceName) {
  document.getElementById('vmActionId').value = vmId;
  document.getElementById('vmActionType').value = action;
  document.getElementById('vmReasonInput').value = '';

  document.getElementById('vmActionModalTitle').textContent = `Compute Operation: ${action.toUpperCase()} Instance`;
  document.getElementById('vmActionNotice').textContent = `Are you sure you want to execute '${action}' on "${serviceName}"?`;

  const reasonGroup = document.getElementById('vmReasonGroup');
  if (['stop', 'terminate'].includes(action)) {
    reasonGroup.style.display = 'block';
    document.getElementById('vmReasonInput').setAttribute('required', 'true');
  } else {
    reasonGroup.style.display = 'none';
    document.getElementById('vmReasonInput').removeAttribute('required');
  }

  openModal('vmActionModal');
}

async function handleVMActionSubmit(e) {
  e.preventDefault();
  const vmId = document.getElementById('vmActionId').value;
  const action = document.getElementById('vmActionType').value;
  const reason = document.getElementById('vmReasonInput').value.trim();

  try {
    const res = await fetch(`/api/admin/cloud/vms/${vmId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Operation failed');

    closeModal('vmActionModal');
    showToast(data.message, 'success');
    loadVMs();
    loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openReportIncidentModal() {
  openModal('reportIncidentModal');
}

async function handleReportIncidentSubmit(e) {
  e.preventDefault();
  const body = {
    zone: document.getElementById('incZone').value,
    component: document.getElementById('incComponent').value,
    severity: document.getElementById('incSeverity').value,
    title: document.getElementById('incTitle').value,
    description: document.getElementById('incDescription').value
  };
  try {
    const res = await fetch('/api/admin/cloud/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to log incident');
    closeModal('reportIncidentModal');
    showToast('NOC incident registered and dispatched.', 'warning');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 5. Billing & Invoices
async function loadInvoices() {
  const status = document.getElementById('invStatusFilter')?.value || 'ALL';
  const tbody = document.getElementById('invoicesTableBody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading invoices...</td></tr>`;

  try {
    const res = await fetch(`/api/admin/billing/invoices?status=${encodeURIComponent(status)}`);
    if (!res.ok) throw new Error('Failed to load invoices');
    const data = await res.json();

    if (data.invoices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">No invoices found.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.invoices.map(inv => `
      <tr>
        <td class="mono" style="color: #fff;">${inv.invoice_number}</td>
        <td>
          <div class="table-entity-title">
            ${inv.customer_company || inv.customer_name}
            <span class="table-entity-sub">${inv.customer_email}</span>
          </div>
        </td>
        <td class="mono" style="color: var(--adm-teal); font-weight: 700;">৳${inv.total.toLocaleString('en-US')}</td>
        <td>
          <span class="badge ${inv.status === 'PAID' ? 'badge-success' : (inv.status === 'REFUNDED' ? 'badge-danger' : 'badge-warning')}">
            ${inv.status}
          </span>
        </td>
        <td>${inv.due_date}</td>
        <td>${inv.payment_method || '<span style="color: var(--adm-text-subtle);">Awaiting Payment</span>'}</td>
        <td>
          ${inv.status === 'PAID' ? `
            <button class="btn-action-sm danger" data-onclick="promptRefund('${handlerArg(inv.id)}', '${handlerArg(inv.invoice_number)}', ${Number(inv.total) || 0})">Refund</button>
          ` : '<span style="color: var(--adm-text-subtle);">-</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #fb7185; padding: 2rem;">Error: ${err.message}</td></tr>`;
  }
}

function promptRefund(invId, invNumber, amount) {
  document.getElementById('refundInvoiceId').value = invId;
  document.getElementById('refundReasonInput').value = '';
  document.getElementById('refundNotice').textContent = `Are you sure you want to approve a financial refund for Invoice ${invNumber} in the amount of ৳${amount.toLocaleString('en-US')}?`;
  openModal('refundInvoiceModal');
}

async function handleRefundSubmit(e) {
  e.preventDefault();
  const invoiceId = document.getElementById('refundInvoiceId').value;
  const reason = document.getElementById('refundReasonInput').value.trim();

  try {
    const res = await fetch(`/api/admin/billing/invoices/${invoiceId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Refund approval failed');
    closeModal('refundInvoiceModal');
    showToast(data.message, 'success');
    loadInvoices();
    loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 6. Support Tickets - Centralized Admin & NOC Dispatch
let adminTicketsCurrentPage = 1;
let adminTicketsTotalPages = 1;
let adminTicketSearchDebounce = null;
let currentInspectedTicketId = null;
let adminStaffListCache = [];

function switchAdminTicketTab(tab) {
  const threadBtn = document.getElementById('tabBtnAdminThread');
  const auditBtn = document.getElementById('tabBtnAdminAudit');
  const threadContent = document.getElementById('tabContentAdminThread');
  const auditContent = document.getElementById('tabContentAdminAudit');

  if (tab === 'thread') {
    threadBtn.style.borderBottomColor = 'var(--adm-teal)';
    threadBtn.style.color = '#fff';
    auditBtn.style.borderBottomColor = 'transparent';
    auditBtn.style.color = 'var(--adm-text-muted)';
    threadContent.style.display = 'block';
    auditContent.style.display = 'none';
  } else {
    auditBtn.style.borderBottomColor = 'var(--adm-teal)';
    auditBtn.style.color = '#fff';
    threadBtn.style.borderBottomColor = 'transparent';
    threadBtn.style.color = 'var(--adm-text-muted)';
    threadContent.style.display = 'none';
    auditContent.style.display = 'block';
  }
}

async function loadAdminStaffList() {
  if (adminStaffListCache.length > 0) return adminStaffListCache;
  try {
    const res = await fetch('/api/admin/support/staff');
    if (res.ok) {
      const data = await res.json();
      adminStaffListCache = data.staff || [];
    }
  } catch (err) {
    console.error('Failed to load support staff list:', err);
  }
  return adminStaffListCache;
}

function changeAdminTicketPage(delta) {
  const target = adminTicketsCurrentPage + delta;
  if (target >= 1 && target <= adminTicketsTotalPages) {
    loadSupportTickets(target);
  }
}

// Attach search input listener once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('adminTicketSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(adminTicketSearchDebounce);
      adminTicketSearchDebounce = setTimeout(() => {
        loadSupportTickets(1);
      }, 350);
    });
  }
});

async function loadSupportTickets(page = 1) {
  adminTicketsCurrentPage = page;
  const status = document.getElementById('adminTicketStatusFilter')?.value || 'ALL';
  const priority = document.getElementById('adminTicketPriorityFilter')?.value || 'ALL';
  const category = document.getElementById('adminTicketCategoryFilter')?.value || 'ALL';
  const escalatedOnly = document.getElementById('adminTicketEscalatedOnly')?.checked ? '1' : '';
  const search = document.getElementById('adminTicketSearchInput')?.value.trim() || '';

  const tbody = document.getElementById('ticketsTableBody');
  tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 3rem; color: var(--adm-text-muted);">Fetching authoritative ticket queue...</td></tr>`;

  // 1. Fetch real-time dashboard overview metrics
  try {
    const ovRes = await fetch('/api/admin/support/overview');
    if (ovRes.ok) {
      const ov = await ovRes.json();
      const m = ov.metrics || {};
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setVal('kpi-spt-total', m.total || 0);
      setVal('kpi-spt-unassigned', m.unassigned || 0);
      setVal('kpi-spt-open', m.open || 0);
      setVal('kpi-spt-critical', m.critical || 0);
      setVal('kpi-spt-waiting', m.waiting || 0);
      setVal('kpi-spt-escalated', m.escalated || 0);
      setVal('kpi-spt-resolved', m.resolved || 0);
      setVal('kpi-spt-sla', m.slaBreaching || 0);
    }
  } catch (e) {
    console.warn('Overview KPI update failed:', e);
  }

  // 2. Fetch paginated ticket records
  try {
    const queryParams = new URLSearchParams({
      page: String(adminTicketsCurrentPage),
      limit: '10'
    });
    if (status !== 'ALL') queryParams.append('status', status);
    if (priority !== 'ALL') queryParams.append('priority', priority);
    if (category !== 'ALL') queryParams.append('category', category);
    if (escalatedOnly) queryParams.append('escalated', 'true');
    if (search) queryParams.append('search', search);

    const res = await fetch(`/api/admin/support/tickets?${queryParams.toString()}`);
    if (!res.ok) throw new Error('Failed to load support tickets');
    const data = await res.json();

    adminTicketsTotalPages = data.totalPages || 1;
    const totalCount = data.total || 0;

    const countDisplay = document.getElementById('adminTicketCountDisplay');
    if (countDisplay) countDisplay.textContent = `Showing ${data.tickets.length} of ${totalCount} tickets`;

    const pageInfo = document.getElementById('adminTicketPageInfo');
    if (pageInfo) pageInfo.textContent = `Page ${data.page} of ${adminTicketsTotalPages} (${totalCount} total)`;

    const prevBtn = document.getElementById('btnAdminTicketPrevPage');
    const nextBtn = document.getElementById('btnAdminTicketNextPage');
    if (prevBtn) prevBtn.disabled = data.page <= 1;
    if (nextBtn) nextBtn.disabled = data.page >= adminTicketsTotalPages;

    if (data.tickets.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 3rem; color: var(--adm-text-muted);">No support tickets found matching the specified filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.tickets.map(t => {
      // Status badge class
      let statusBadgeClass = 'badge-info';
      if (t.status === 'OPEN') statusBadgeClass = 'badge-danger';
      else if (t.status === 'ASSIGNED') statusBadgeClass = 'badge-primary';
      else if (t.status === 'IN_PROGRESS') statusBadgeClass = 'badge-warning';
      else if (t.status === 'WAITING_BUYER' || t.status === 'WAITING_RESELLER') statusBadgeClass = 'badge-purple';
      else if (t.status === 'ESCALATED') statusBadgeClass = 'badge-danger';
      else if (t.status === 'RESOLVED' || t.status === 'CLOSED') statusBadgeClass = 'badge-success';

      // Priority badge class
      let prioColor = '#94a3b8';
      if (t.priority === 'CRITICAL') prioColor = '#fb7185';
      else if (t.priority === 'HIGH') prioColor = '#f59e0b';
      else if (t.priority === 'NORMAL') prioColor = 'var(--adm-teal)';

      // SLA countdown indicator
      let slaBadge = '';
      if (t.sla_due_at) {
        const dueTime = new Date(t.sla_due_at).getTime();
        const now = Date.now();
        const diffHours = (dueTime - now) / 3600000;
        if (t.status === 'RESOLVED' || t.status === 'CLOSED') {
          slaBadge = `<span style="font-size: 0.72rem; color: #34d399;">✓ Met</span>`;
        } else if (diffHours < 0) {
          slaBadge = `<span style="font-size: 0.72rem; color: #fb7185; font-weight: 700;">⚠️ SLA Breached</span>`;
        } else if (diffHours < 2) {
          slaBadge = `<span style="font-size: 0.72rem; color: #f59e0b; font-weight: 700;">⏱️ ${Math.round(diffHours * 60)}m SLA</span>`;
        } else {
          slaBadge = `<span style="font-size: 0.72rem; color: var(--adm-text-subtle);">⏱️ ${Math.round(diffHours)}h SLA</span>`;
        }
      }

      const partnerDisplay = t.partner_name 
        ? `<span style="color: #67e8f9; font-weight: 600;">🤝 ${escapeHtml(t.partner_name)}</span>`
        : `<span style="color: var(--adm-text-subtle);">Direct Platform</span>`;

      const assignedDisplay = t.assigned_agent_name
        ? `<span style="font-size: 0.82rem; color: #fff;">👤 ${escapeHtml(t.assigned_agent_name)}</span>`
        : `<span style="font-size: 0.75rem; color: #fb7185; font-weight: 600;">⚠️ Unassigned</span>`;

      return `
        <tr style="${t.is_escalated ? 'background: rgba(244, 63, 94, 0.04);' : ''}">
          <td class="mono" style="color: #fff; font-weight: 700;">
            ${t.ticket_number}
            ${t.is_escalated ? '<div style="font-size: 0.68rem; color: #fb7185; font-weight: 700;">🚨 ESCALATED</div>' : ''}
          </td>
          <td>
            <div class="table-entity-title">
              <span style="font-weight: 600; color: #fff;">${escapeHtml(t.subject)}</span>
              <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
                <span class="table-entity-sub" style="margin: 0;">${(t.created_at || '').slice(0, 16)}</span>
                ${slaBadge}
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight: 500; color: #fff;">${escapeHtml(t.buyer_name || t.requester_name || 'Anonymous')}</div>
            <div style="font-size: 0.74rem; color: var(--adm-text-muted);">${escapeHtml(t.buyer_email || t.requester_email || '')}</div>
          </td>
          <td>${partnerDisplay}</td>
          <td><span class="badge" style="background: rgba(255,255,255,0.06); color: #cbd5e1; font-size: 0.72rem;">${escapeHtml(t.category || t.department || 'GENERAL')}</span></td>
          <td>
            <span class="badge" style="color: ${prioColor}; border: 1px solid ${prioColor}40; background: ${prioColor}15; font-size: 0.72rem;">
              ${t.priority}
            </span>
          </td>
          <td>
            <span class="badge ${statusBadgeClass}" style="font-size: 0.72rem;">
              ${t.status}
            </span>
          </td>
          <td>${assignedDisplay}</td>
          <td style="font-size: 0.78rem; color: var(--adm-text-muted);">${(t.updated_at || t.created_at || '').slice(0, 16)}</td>
          <td>
            <button class="btn-action-sm" data-onclick="inspectTicket('${handlerArg(t.id)}')">Inspect &amp; Dispatch</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #fb7185; padding: 3rem;">Error retrieving queue: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function inspectTicket(ticketId) {
  currentInspectedTicketId = ticketId;
  openModal('ticketDetailModal');

  const messagesList = document.getElementById('ticketModalMessagesList');
  const entityGrid = document.getElementById('ticketModalEntityGrid');
  const auditList = document.getElementById('ticketModalAuditList');
  
  messagesList.innerHTML = '<div style="padding: 2.5rem; text-align: center; color: var(--adm-text-muted);">Fetching complete conversation history and telemetry...</div>';
  entityGrid.innerHTML = '';
  auditList.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--adm-text-muted);">Loading audit log...</div>';

  document.getElementById('replyTicketId').value = ticketId;
  document.getElementById('ticketReplyMessage').value = '';
  document.getElementById('replyIsInternal').checked = false;
  switchAdminTicketTab('thread');

  try {
    const [ticketRes, staffList] = await Promise.all([
      fetch(`/api/admin/support/tickets/${ticketId}`),
      loadAdminStaffList()
    ]);

    if (!ticketRes.ok) throw new Error('Failed to load ticket details');
    const data = await ticketRes.json();
    const t = data.ticket;

    // Set Header details
    document.getElementById('ticketModalTitle').textContent = `[${t.ticket_number}] ${t.subject}`;
    document.getElementById('ticketModalSubtitle').textContent = `Ref: ${t.ticket_number} | Category: ${t.category} | Created: ${t.created_at}`;

    // Status badge
    const sBadge = document.getElementById('ticketModalStatusBadge');
    sBadge.textContent = t.status;
    sBadge.className = 'badge ' + (t.status === 'OPEN' ? 'badge-danger' : (t.status === 'IN_PROGRESS' ? 'badge-warning' : (t.status === 'RESOLVED' ? 'badge-success' : 'badge-info')));

    // Priority badge
    const pBadge = document.getElementById('ticketModalPriorityBadge');
    pBadge.textContent = t.priority;
    pBadge.className = 'badge ' + (t.priority === 'CRITICAL' ? 'badge-danger' : (t.priority === 'HIGH' ? 'badge-warning' : 'badge-info'));

    // Escalated badge & button toggle
    const escBadge = document.getElementById('ticketModalEscalatedBadge');
    const escBtn = document.getElementById('modalEscalateToggleBtn');
    if (t.is_escalated) {
      escBadge.style.display = 'inline-block';
      escBtn.textContent = '🛡️ De-escalate from NOC';
      escBtn.style.color = '#38bdf8';
      escBtn.style.background = 'rgba(56, 189, 248, 0.12)';
      escBtn.style.borderColor = 'rgba(56, 189, 248, 0.4)';
    } else {
      escBadge.style.display = 'none';
      escBtn.textContent = '🚨 Escalate to NOC';
      escBtn.style.color = '#f87171';
      escBtn.style.background = 'rgba(239,68,68,0.15)';
      escBtn.style.borderColor = 'rgba(239,68,68,0.4)';
    }

    // Populate Staff Select
    const staffSelect = document.getElementById('modalAssignAgentSelect');
    staffSelect.innerHTML = `<option value="">-- Unassigned --</option>` + staffList.map(s => `
      <option value="${s.id}" ${t.assigned_to === s.id ? 'selected' : ''}>${escapeHtml(s.full_name)} (${s.role})</option>
    `).join('');

    // Populate Status & Priority Selects
    document.getElementById('modalStatusSelect').value = t.status;
    document.getElementById('modalPrioritySelect').value = t.priority;

    // Populate Context Entity Grid
    let slaRemainingText = 'Not specified';
    if (t.sla_due_at) {
      const hoursLeft = Math.round((new Date(t.sla_due_at).getTime() - Date.now()) / 3600000);
      slaRemainingText = hoursLeft < 0 ? `⚠️ Breached by ${Math.abs(hoursLeft)}h` : `${hoursLeft} hours remaining`;
    }

    entityGrid.innerHTML = `
      <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--adm-border); border-radius: 6px; padding: 0.75rem;">
        <div style="font-size: 0.7rem; color: var(--adm-text-muted); text-transform: uppercase;">Customer / Buyer</div>
        <div style="font-weight: 600; color: #fff; font-size: 0.88rem; margin-top: 2px;">${escapeHtml(t.buyer_name || t.requester_name || 'Anonymous')}</div>
        <div style="font-size: 0.78rem; color: var(--adm-teal);">${escapeHtml(t.buyer_email || t.requester_email || 'N/A')}</div>
        ${t.buyer_phone ? `<div style="font-size: 0.75rem; color: var(--adm-text-subtle);">${escapeHtml(t.buyer_phone)}</div>` : ''}
      </div>

      <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--adm-border); border-radius: 6px; padding: 0.75rem;">
        <div style="font-size: 0.7rem; color: var(--adm-text-muted); text-transform: uppercase;">Reseller Relationship</div>
        <div style="font-weight: 600; color: #67e8f9; font-size: 0.88rem; margin-top: 2px;">${t.partner_name ? escapeHtml(t.partner_name) : 'Direct Platform Buyer'}</div>
        <div style="font-size: 0.78rem; color: var(--adm-text-muted);">${t.partner_email ? escapeHtml(t.partner_email) : 'No reseller intermediary'}</div>
      </div>

      <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--adm-border); border-radius: 6px; padding: 0.75rem;">
        <div style="font-size: 0.7rem; color: var(--adm-text-muted); text-transform: uppercase;">Related Resource</div>
        <div style="font-weight: 600; color: #fff; font-size: 0.88rem; margin-top: 2px;">${escapeHtml(t.related_product_code || t.related_service_id || 'General Support')}</div>
        ${t.related_order_id ? `<div style="font-size: 0.78rem; color: var(--adm-text-subtle);">Order: ${escapeHtml(t.related_order_id)}</div>` : ''}
      </div>

      <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--adm-border); border-radius: 6px; padding: 0.75rem;">
        <div style="font-size: 0.7rem; color: var(--adm-text-muted); text-transform: uppercase;">SLA Target Countdown</div>
        <div style="font-weight: 600; color: ${slaRemainingText.includes('Breached') ? '#fb7185' : '#34d399'}; font-size: 0.88rem; margin-top: 2px;">${slaRemainingText}</div>
        <div style="font-size: 0.75rem; color: var(--adm-text-subtle);">Due: ${(t.sla_due_at || '').slice(0, 16)}</div>
      </div>
    `;

    // Render Conversation Messages
    const messages = data.messages || [];
    document.getElementById('ticketReplyCount').textContent = messages.length;

    if (messages.length === 0) {
      messagesList.innerHTML = `
        <div style="background: rgba(0,0,0,0.25); padding: 1rem; border-radius: 8px;">
          <p style="color: #fff; margin: 0; font-size: 0.88rem;">${escapeHtml(t.message || t.description || 'No description provided.')}</p>
        </div>
      `;
    } else {
      messagesList.innerHTML = messages.map(m => {
        const isInternal = !!m.is_internal;
        const bubbleBg = isInternal 
          ? 'rgba(245, 158, 11, 0.08)' 
          : (m.author_role === 'ADMIN' || m.author_role === 'STAFF' ? 'rgba(93, 224, 196, 0.06)' : 'rgba(255, 255, 255, 0.03)');
        const borderCol = isInternal 
          ? 'rgba(245, 158, 11, 0.4)' 
          : (m.author_role === 'ADMIN' || m.author_role === 'STAFF' ? 'rgba(93, 224, 196, 0.25)' : 'var(--adm-border)');
        const authorRoleTag = isInternal 
          ? `<span style="background: #f59e0b; color: #000; font-weight: 800; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px;">🔒 INTERNAL NOTE</span>` 
          : `<span class="badge" style="font-size: 0.68rem;">${m.author_role}</span>`;

        return `
          <div style="padding: 1rem; border-radius: 8px; background: ${bubbleBg}; border: 1px solid ${borderCol};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="color: ${isInternal ? '#f59e0b' : 'var(--adm-teal)'}; font-size: 0.88rem;">${escapeHtml(m.author_name || 'Support Staff')}</strong>
                ${authorRoleTag}
              </div>
              <span style="color: var(--adm-text-muted); font-size: 0.75rem;">${(m.created_at || '').slice(0, 16)}</span>
            </div>
            <div style="font-size: 0.86rem; color: #fff; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(m.message)}</div>
          </div>
        `;
      }).join('');
    }

    // Render Attachments
    const attachments = data.attachments || [];
    const attContainer = document.getElementById('ticketModalAttachmentsContainer');
    const attListWrap = document.getElementById('ticketModalAttachmentsList');
    if (attachments.length > 0) {
      attListWrap.style.display = 'block';
      attContainer.innerHTML = attachments.map(a => `
        <a href="/api/support/attachments/${a.id}" target="_blank" class="btn-action-sm" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; padding: 4px 10px;">
          <span>📎 ${escapeHtml(a.original_filename)}</span>
          <span style="font-size: 0.7rem; color: var(--adm-text-subtle);">(${Math.round(a.file_size / 1024)} KB)</span>
        </a>
      `).join('');
    } else {
      attListWrap.style.display = 'none';
    }

    // Render Audit Events
    const auditEvents = data.auditEvents || [];
    document.getElementById('ticketAuditCount').textContent = auditEvents.length;
    if (auditEvents.length === 0) {
      auditList.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--adm-text-muted);">No audit entries recorded yet.</div>';
    } else {
      auditList.innerHTML = auditEvents.map(a => `
        <div style="padding: 0.75rem 1rem; border-radius: 6px; background: rgba(0,0,0,0.2); border: 1px solid var(--adm-border); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="badge" style="font-size: 0.7rem; margin-right: 6px;">${escapeHtml(a.event_type)}</span>
            <span style="font-size: 0.82rem; color: #fff;">${escapeHtml(a.actor_name || 'System')} (${a.actor_role}): </span>
            <span style="font-size: 0.82rem; color: var(--adm-text-muted);">${escapeHtml(a.reason || a.new_value || 'State transitioned')}</span>
          </div>
          <span style="font-size: 0.72rem; color: var(--adm-text-subtle);">${(a.created_at || '').slice(0, 16)}</span>
        </div>
      `).join('');
    }

  } catch (err) {
    messagesList.innerHTML = `<div style="padding: 2rem; color: #fb7185; text-align: center;">Error loading ticket: ${escapeHtml(err.message)}</div>`;
  }
}

async function handleAdminTicketReplySubmit(e) {
  e.preventDefault();
  const ticketId = document.getElementById('replyTicketId').value;
  const message = document.getElementById('ticketReplyMessage').value.trim();
  const isInternal = document.getElementById('replyIsInternal').checked;
  const sendBtn = document.getElementById('btnAdminSendReply');

  if (!message) return;
  sendBtn.disabled = true;
  sendBtn.textContent = 'Posting...';

  try {
    const res = await fetch(`/api/admin/support/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, is_internal: isInternal })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to post reply');

    showToast(isInternal ? 'Internal staff note recorded.' : 'Official reply sent to requester.', 'success');
    document.getElementById('ticketReplyMessage').value = '';
    inspectTicket(ticketId);
    loadSupportTickets(adminTicketsCurrentPage);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Post Response';
  }
}

async function handleAdminAssignTicket() {
  if (!currentInspectedTicketId) return;
  const assigned_to = document.getElementById('modalAssignAgentSelect').value || null;

  try {
    const res = await fetch(`/api/admin/support/tickets/${currentInspectedTicketId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Assignment failed');

    showToast('Support staff assignment updated.', 'success');
    inspectTicket(currentInspectedTicketId);
    loadSupportTickets(adminTicketsCurrentPage);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleAdminStatusChange() {
  if (!currentInspectedTicketId) return;
  const status = document.getElementById('modalStatusSelect').value;

  try {
    const res = await fetch(`/api/admin/support/tickets/${currentInspectedTicketId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason: 'Updated via Administrator Workspace' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Status transition failed');

    showToast(`Ticket status updated to ${status}.`, 'success');
    inspectTicket(currentInspectedTicketId);
    loadSupportTickets(adminTicketsCurrentPage);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleAdminPriorityChange() {
  if (!currentInspectedTicketId) return;
  const priority = document.getElementById('modalPrioritySelect').value;

  try {
    const res = await fetch(`/api/admin/support/tickets/${currentInspectedTicketId}/priority`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority, reason: 'Updated via Administrator Workspace' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Priority update failed');

    showToast(`Ticket priority changed to ${priority}.`, 'success');
    inspectTicket(currentInspectedTicketId);
    loadSupportTickets(adminTicketsCurrentPage);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleAdminEscalateToggle() {
  if (!currentInspectedTicketId) return;
  const escBtn = document.getElementById('modalEscalateToggleBtn');
  const isCurrentlyEscalated = escBtn.textContent.includes('De-escalate');

  const action = isCurrentlyEscalated ? 'deescalate' : 'escalate';
  let reason = 'Toggled via Administrator Workspace';
  if (!isCurrentlyEscalated) {
    reason = prompt('Enter justification for escalating to Platform NOC / Tier 3:', 'Immediate Tier-3 network engineering review required');
    if (!reason) return;
  }

  try {
    const res = await fetch(`/api/admin/support/tickets/${currentInspectedTicketId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Escalation operation failed');

    showToast(isCurrentlyEscalated ? 'Ticket de-escalated from NOC.' : 'Ticket escalated to NOC.', 'success');
    inspectTicket(currentInspectedTicketId);
    loadSupportTickets(adminTicketsCurrentPage);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 7. Public Website CMS
async function loadCMSData() {
  const annTbody = document.getElementById('cmsAnnouncementsTableBody');
  const plansTbody = document.getElementById('cmsPlansTableBody');

  try {
    const [annRes, plansRes] = await Promise.all([
      fetch('/api/admin/cms/announcements'),
      fetch('/api/admin/cms/plans')
    ]);

    if (annRes.ok) {
      const annData = await annRes.json();
      annTbody.innerHTML = annData.announcements.map(a => `
        <tr>
          <td>
            <div class="table-entity-title">
              ${a.title}
              <span class="table-entity-sub">${a.message.slice(0, 70)}...</span>
            </div>
          </td>
          <td><span class="badge badge-info">${a.type}</span></td>
          <td><span class="badge ${a.is_active ? 'badge-success' : 'badge-danger'}">${a.is_active ? 'Active' : 'Draft'}</span></td>
          <td>${a.starts_at || 'Immediate'} to ${a.ends_at || 'Indefinite'}</td>
          <td>
            <button class="btn-action-sm danger" data-onclick="deleteAnnouncement('${handlerArg(a.id)}')">Delete</button>
          </td>
        </tr>
      `).join('');
    }

    if (plansRes.ok) {
      const plansData = await plansRes.json();
      plansTbody.innerHTML = plansData.plans.map(p => `
        <tr>
          <td>
            <div class="table-entity-title">
              ${p.name}
              <span class="table-entity-sub mono">${p.code}</span>
            </div>
          </td>
          <td><span class="badge badge-purple">${p.category}</span></td>
          <td class="mono" style="color: var(--adm-teal); font-weight: 700;">৳${p.price_bdt.toLocaleString('en-US')}</td>
          <td class="mono">$${p.price_usd}</td>
          <td>${p.vcpu ? `${p.vcpu} vCPU / ${p.ram_gb}GB / ${p.storage_gb}GB` : '-'}</td>
          <td><span class="badge ${p.is_available ? 'badge-success' : 'badge-danger'}">${p.is_available ? 'Published' : 'Unavailable'}</span></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('CMS load error:', err);
  }
}

function openCreateAnnouncementModal() {
  openModal('createAnnouncementModal');
}

async function handleCreateAnnouncementSubmit(e) {
  e.preventDefault();
  const body = {
    title: document.getElementById('newAnnTitle').value,
    type: document.getElementById('newAnnType').value,
    message: document.getElementById('newAnnMessage').value
  };
  try {
    const res = await fetch('/api/admin/cms/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Announcement creation failed');
    closeModal('createAnnouncementModal');
    showToast('Announcement published to public website.', 'success');
    loadCMSData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteAnnouncement(annId) {
  if (!confirm('Are you sure you want to remove this announcement from the public website?')) return;
  try {
    const res = await fetch(`/api/admin/cms/announcements/${annId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Deletion failed');
    showToast('Announcement removed.', 'info');
    loadCMSData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 8. Security & Access Governance
async function loadSecurityEvents() {
  // already partially integrated
}

async function loadActiveSessions() {
  const tbody = document.getElementById('activeSessionsTableBody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading active sessions...</td></tr>`;

  try {
    const res = await fetch('/api/admin/security/sessions');
    if (!res.ok) throw new Error('Failed to load active sessions');
    const data = await res.json();

    tbody.innerHTML = data.sessions.map(s => `
      <tr>
        <td class="mono" style="color: #fff;">${s.sessionId}</td>
        <td>
          <div class="table-entity-title">
            ${s.name || s.email}
            <span class="table-entity-sub">${s.email}</span>
          </div>
        </td>
        <td><span class="badge badge-purple">${s.role}</span></td>
        <td class="mono">${s.ipAddress}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${s.userAgent}</td>
        <td class="mono">${s.expiresAt.replace('T', ' ').slice(0, 19)}</td>
        <td>
          <button class="btn-action-sm danger" data-onclick="revokeSession('${handlerArg(s.token)}')">Revoke</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #fb7185; padding: 2rem;">Error: ${err.message}</td></tr>`;
  }
}

async function revokeSession(token) {
  if (!confirm('Immediately invalidate and terminate this session? The administrator will be logged out instantly.')) return;
  try {
    const res = await fetch('/api/admin/security/sessions/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Revocation failed');
    showToast('Session invalidated.', 'success');
    loadActiveSessions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAdminUsers() {
  const tbody = document.getElementById('adminUsersTableBody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">Loading admin users...</td></tr>`;

  try {
    const res = await fetch('/api/admin/security/admins');
    if (!res.ok) throw new Error('Failed to load administrators');
    const data = await res.json();

    tbody.innerHTML = data.admins.map(u => `
      <tr>
        <td style="color: #fff; font-weight: 600;">${u.name || u.email.split('@')[0]}</td>
        <td class="mono">${u.email}</td>
        <td><span class="badge badge-purple">${u.role}</span></td>
        <td><span class="badge ${u.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${u.status}</span></td>
        <td>${u.last_login_at ? u.last_login_at.slice(0, 16) : 'Never'}</td>
        <td>
          <button class="btn-action-sm" data-onclick="promptChangeAdminRole('${handlerArg(u.id)}', '${handlerArg(u.role)}', '${handlerArg(u.email)}')">Change Role</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #fb7185; padding: 2rem;">Error: ${err.message}</td></tr>`;
  }
}

function openCreateAdminUserModal() {
  openModal('createAdminUserModal');
}

async function handleCreateAdminUserSubmit(e) {
  e.preventDefault();
  const body = {
    name: document.getElementById('newAdminName').value,
    email: document.getElementById('newAdminEmail').value,
    role: document.getElementById('newAdminRole').value,
    password: document.getElementById('newAdminPassword').value
  };
  try {
    const res = await fetch('/api/admin/security/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Creation failed');
    closeModal('createAdminUserModal');
    showToast('Administrative user created successfully.', 'success');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function promptChangeAdminRole(userId, currentRole, email) {
  const newRole = prompt(`Assign new role to ${email}:\nOptions: SUPER_ADMIN, SECURITY_ADMIN, INFRASTRUCTURE_ADMIN, FINANCE_ADMIN, PARTNER_MANAGER, SUPPORT_ADMIN, CONTENT_ADMIN, AUDITOR`, currentRole);
  if (!newRole || newRole === currentRole) return;

  try {
    const res = await fetch(`/api/admin/security/admins/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to update role');
    showToast(data.message, 'success');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 9. Centralized Audit Trail View
async function loadFullAuditTrail() {
  const tbody = document.getElementById('fullAuditTableBody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading full audit trail...</td></tr>`;

  try {
    const res = await fetch('/api/admin/audit-logs');
    if (!res.ok) throw new Error('Failed to load audit logs');
    const data = await res.json();

    tbody.innerHTML = data.logs.map(l => `
      <tr>
        <td class="mono">${l.created_at.slice(0, 19)}</td>
        <td class="mono" style="color: #fff;">${l.actor_email || 'anonymous'}</td>
        <td><strong style="color: var(--adm-teal);">${l.action}</strong></td>
        <td><span class="badge badge-info">${l.entity_type}</span></td>
        <td><span class="badge badge-success">SUCCESS</span></td>
        <td class="mono">${l.ip_address || '127.0.0.1'}</td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem;" title="${encodeURIComponent(l.details_json || '')}">
          ${l.details_json || '-'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #fb7185; padding: 2rem;">Error: ${err.message}</td></tr>`;
  }
}
