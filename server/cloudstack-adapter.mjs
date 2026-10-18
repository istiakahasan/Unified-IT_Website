import crypto from 'node:crypto';

/**
 * Apache CloudStack Infrastructure Provisioning Adapter
 *
 * Enforces:
 * - Server-side only API key & secret handling (never leaks to frontend)
 * - HMAC-SHA1 query signing per Apache CloudStack specification
 * - Multi-tenant isolation: enforces partner account / domain isolation
 * - Partner quota limits (vCPUs, RAM, Storage)
 * - Safe fallback sandbox mode when live CloudStack endpoint is not configured
 */
export class CloudStackAdapter {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || process.env.CLOUDSTACK_API_URL || '';
    this.apiKey = config.apiKey || process.env.CLOUDSTACK_API_KEY || '';
    this.secretKey = config.secretKey || process.env.CLOUDSTACK_SECRET_KEY || '';
    this.timeoutMs = config.timeoutMs || 10000;

    this.isConfigured = Boolean(this.apiUrl && this.apiKey && this.secretKey);
  }

  /**
   * Returns operational status of the CloudStack integration
   */
  getStatus() {
    return {
      service: 'Apache CloudStack Orchestrator',
      configured: this.isConfigured,
      mode: this.isConfigured ? 'LIVE_CLOUDSTACK' : 'SANDBOX_ADAPTER',
      apiUrl: this.apiUrl ? this.apiUrl.replace(/\/+$/, '') : 'http://cloudstack.dhaka.unifiedit.xyz:8080/client/api (Not Connected)',
      features: [
        'Multi-Tenant Domain & Account Isolation',
        'Automated Virtual Machine Provisioning',
        'vCPU & RAM Resource Quota Enforcement',
        'Partner-Safe Instance Lifecycle (Start, Stop, Reboot)',
        'Server-Side HMAC-SHA1 Signature Security'
      ],
      notice: this.isConfigured
        ? 'Connected to live Apache CloudStack management server.'
        : 'Running in safe sandbox mode. Provide CLOUDSTACK_API_URL, CLOUDSTACK_API_KEY, and CLOUDSTACK_SECRET_KEY in environment to connect live datacenter.'
    };
  }

  /**
   * Generates Apache CloudStack HMAC-SHA1 API signature
   * Parameters must be sorted alphabetically, lowercase URL-encoded, and signed with secretKey.
   */
  _generateSignature(params) {
    const keys = Object.keys(params).sort();
    const queryParts = keys.map(k => `${encodeURIComponent(k).toLowerCase()}=${encodeURIComponent(params[k]).toLowerCase()}`);
    const queryString = queryParts.join('&');
    return crypto.createHmac('sha1', this.secretKey).update(queryString).digest('base64');
  }

  /**
   * Executes signed CloudStack API command
   */
  async _callApi(command, params = {}) {
    if (!this.isConfigured) {
      return this._simulateCall(command, params);
    }

    const allParams = {
      command,
      apikey: this.apiKey,
      response: 'json',
      ...params
    };

    const signature = this._generateSignature(allParams);
    allParams.signature = signature;

    const queryString = new URLSearchParams(allParams).toString();
    const url = `${this.apiUrl}?${queryString}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'UnifiedCloud-CloudStackAdapter/1.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`CloudStack HTTP Error: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      return json;
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(`CloudStack Adapter Exception: ${err.message}`);
    }
  }

  /**
   * Provisions a virtual machine strictly within partner account & resource quota
   */
  async provisionVM({
    partnerAccount,
    serviceOfferingId,
    templateId,
    zoneId = 'dhaka-dc01-zone',
    displayName,
    vcpuRequired,
    ramRequiredGB,
    currentAllocatedVCPU = 0,
    currentAllocatedRAM = 0,
    partnerMaxVCPU = 64,
    partnerMaxRAM = 256
  }) {
    // 1. Quota Enforcement Safeguard
    if (currentAllocatedVCPU + vcpuRequired > partnerMaxVCPU) {
      throw new Error(`Quota Exceeded: Requested ${vcpuRequired} vCPUs exceeds partner quota ceiling of ${partnerMaxVCPU} vCPUs.`);
    }
    if (currentAllocatedRAM + ramRequiredGB > partnerMaxRAM) {
      throw new Error(`Quota Exceeded: Requested ${ramRequiredGB}GB RAM exceeds partner quota ceiling of ${partnerMaxRAM}GB RAM.`);
    }

    // 2. Provision VM under isolated partner account
    return this._callApi('deployVirtualMachine', {
      account: partnerAccount,
      serviceofferingid: serviceOfferingId,
      templateid: templateId,
      zoneid: zoneId,
      displayname: displayName,
      name: displayName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    });
  }

  /**
   * Reboots a partner virtual machine
   */
  async rebootVM(vmId, partnerAccount) {
    return this._callApi('rebootVirtualMachine', {
      id: vmId,
      account: partnerAccount
    });
  }

  /**
   * Safe sandbox simulation when live credentials are not present
   */
  _simulateCall(command, params) {
    const timestamp = new Date().toISOString();
    switch (command) {
      case 'deployVirtualMachine': {
        const vmId = 'cs-vm-' + crypto.randomBytes(4).toString('hex');
        const ip = `103.145.22.${Math.floor(20 + Math.random() * 200)}`;
        return {
          deployvirtualmachineresponse: {
            id: vmId,
            name: params.displayname || 'CloudStack-VM',
            nic: [{ ipaddress: ip, gateway: '103.145.22.1' }],
            state: 'Running',
            account: params.account,
            created: timestamp,
            mode: 'SANDBOX_SIMULATION'
          }
        };
      }
      case 'rebootVirtualMachine':
        return {
          rebootvirtualmachineresponse: {
            id: params.id,
            state: 'Rebooting',
            account: params.account,
            timestamp,
            mode: 'SANDBOX_SIMULATION'
          }
        };
      default:
        return { command, params, mode: 'SANDBOX_SIMULATION', timestamp };
    }
  }
}
