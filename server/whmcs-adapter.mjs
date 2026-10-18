import crypto from 'node:crypto';

/**
 * WHMCS Billing & Client Management Integration Adapter
 *
 * Provides a resilient integration boundary with WHMCS:
 * - Idempotency key tracking prevents duplicate orders/invoices
 * - Authenticated server-to-server API calls using API Identifier + Secret
 * - Safe fallback to sandboxed simulation when live WHMCS credentials are not provided
 * - Connects server-side partner pricing to order creation
 */
export class WHMCSAdapter {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || process.env.WHMCS_API_URL || '';
    this.apiIdentifier = config.apiIdentifier || process.env.WHMCS_API_IDENTIFIER || '';
    this.apiSecret = config.apiSecret || process.env.WHMCS_API_SECRET || '';
    this.timeoutMs = config.timeoutMs || 8000;

    // Idempotency cache to prevent duplicate transactions (in-memory with 1h TTL)
    this.idempotencyMap = new Map();

    // Check if live credentials exist
    this.isConfigured = Boolean(this.apiUrl && this.apiIdentifier && this.apiSecret);
  }

  /**
   * Returns operational status of the WHMCS integration
   */
  getStatus() {
    return {
      service: 'WHMCS Billing Engine',
      configured: this.isConfigured,
      mode: this.isConfigured ? 'LIVE_API' : 'SANDBOX_ADAPTER',
      apiUrl: this.apiUrl ? this.apiUrl.replace(/\/+$/, '') : 'https://billing.unifiedit.xyz/includes/api.php (Not Connected)',
      features: [
        'Client Account Synchronization',
        'Partner Tier Discount Orders',
        'Invoice & Payment Telemetry',
        'Credit Balance & Payout Settlement',
        'Idempotency Duplicate Protection'
      ],
      notice: this.isConfigured
        ? 'Connected to live WHMCS instance.'
        : 'Running in safe sandbox mode. Provide WHMCS_API_URL, WHMCS_API_IDENTIFIER, and WHMCS_API_SECRET in environment to enable live sync.'
    };
  }

  /**
   * Executes a WHMCS API action with authentication and timeout
   */
  async _callApi(action, params = {}, idempotencyKey = null) {
    if (idempotencyKey) {
      if (this.idempotencyMap.has(idempotencyKey)) {
        const cached = this.idempotencyMap.get(idempotencyKey);
        if (Date.now() - cached.timestamp < 3600000) {
          return { ...cached.data, _idempotentReplay: true };
        }
      }
    }

    if (!this.isConfigured) {
      return this._simulateCall(action, params, idempotencyKey);
    }

    const postData = new URLSearchParams({
      action,
      identifier: this.apiIdentifier,
      secret: this.apiSecret,
      responsetype: 'json',
      ...params
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'UnifiedCloud-PartnerEngine/1.0'
        },
        body: postData.toString(),
        signal: controller.signal
      });

      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`WHMCS HTTP Error: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      if (json.result !== 'success') {
        throw new Error(json.message || `WHMCS API call '${action}' failed`);
      }

      if (idempotencyKey) {
        this.idempotencyMap.set(idempotencyKey, { data: json, timestamp: Date.now() });
      }

      return json;
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(`WHMCS Adapter Exception: ${err.message}`);
    }
  }

  /**
   * Syncs a customer or partner account into WHMCS
   */
  async syncClient({ email, firstName, lastName, companyName, address1 = 'Dhaka', city = 'Dhaka', country = 'BD', phoneNumber, partnerId }) {
    const idempotencyKey = `sync-client-${email.toLowerCase().trim()}`;
    return this._callApi('AddClient', {
      firstname: firstName,
      lastname: lastName,
      companyname: companyName,
      email,
      address1,
      city,
      country,
      phonenumber: phoneNumber,
      customfields: JSON.stringify({ PartnerID: partnerId })
    }, idempotencyKey);
  }

  /**
   * Places an order with verified server-side partner discount
   */
  async createPartnerOrder({ clientId, productCode, billingCycle = 'monthly', partnerDiscountAmount, netTotal, idempotencyKey }) {
    if (!idempotencyKey) {
      idempotencyKey = 'ord-' + crypto.randomBytes(8).toString('hex');
    }

    return this._callApi('AddOrder', {
      clientid: clientId,
      pid: [productCode],
      billingcycle: [billingCycle],
      paymentmethod: 'banktransfer',
      priceoverride: [netTotal],
      notes: `Order created by Partner Program. Verified partner discount: $${partnerDiscountAmount}`
    }, idempotencyKey);
  }

  /**
   * Fetches invoices for a client
   */
  async getClientInvoices(clientId) {
    return this._callApi('GetInvoices', {
      userid: clientId,
      limitnum: 20
    });
  }

  /**
   * Safe sandbox simulation when live credentials are not present
   */
  _simulateCall(action, params, idempotencyKey) {
    let result = { result: 'success', mode: 'SANDBOX_SIMULATION', timestamp: new Date().toISOString() };

    switch (action) {
      case 'AddClient':
        result.clientid = Math.floor(9000 + Math.random() * 1000);
        result.message = `Sandbox client #${result.clientid} registered for ${params.email}`;
        break;

      case 'AddOrder':
        result.orderid = Math.floor(14000 + Math.random() * 2000);
        result.invoiceid = Math.floor(28000 + Math.random() * 2000);
        result.message = `Sandbox order #${result.orderid} placed with invoice #${result.invoiceid}`;
        break;

      case 'GetInvoices':
        result.totalresults = 3;
        result.invoices = {
          invoice: [
            { id: 28101, date: '2026-10-01', duedate: '2026-10-15', total: '81.60', status: 'Paid', items: 'ERP Production Cluster (15% Partner Margin applied)' },
            { id: 28102, date: '2026-10-05', duedate: '2026-10-20', total: '40.80', status: 'Paid', items: 'Fintech API Gateway (15% Partner Margin applied)' },
            { id: 28103, date: '2026-10-10', duedate: '2026-10-25', total: '178.50', status: 'Paid', items: 'Bare Metal DB Host (15% Partner Margin applied)' }
          ]
        };
        break;

      default:
        result.data = params;
    }

    if (idempotencyKey) {
      this.idempotencyMap.set(idempotencyKey, { data: result, timestamp: Date.now() });
    }
    return result;
  }
}
