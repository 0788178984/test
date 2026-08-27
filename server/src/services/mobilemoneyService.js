const db = require('../db/connection');
const { dispatch } = require('../routes/notifications');
const {
  resolveMtnRuntime,
  resolveAirtelRuntime,
} = require('./paymentConfigService');

class MobileMoneyService {
  constructor() {
    this.mtnConfig = null;
    this.airtelConfig = null;
    this.initialize();
  }

  async initialize() {
    try {
      this.mtnConfig = await this.getMTNConfig();
      this.airtelConfig = await this.getAirtelConfig();
      console.log('Mobile Money service initialized');
    } catch (error) {
      console.error('Failed to initialize Mobile Money service:', error);
    }
  }

  async getMTNConfig() {
    const url = await db.prepare(`
      SELECT value FROM settings WHERE key = 'mtn_momo_url'
    `).get()?.value || 'https://sandbox.momodeveloper.mtn.com';

    const primaryKey = process.env.MTN_PRIMARY_KEY || '';
    const secondaryKey = process.env.MTN_SECONDARY_KEY || '';
    const userId = process.env.MTN_USER_ID || '';
    const apiSecret = process.env.MTN_API_SECRET || '';

    return {
      url,
      primaryKey,
      secondaryKey,
      userId,
      apiSecret,
      targetEnvironment: process.env.MTN_ENVIRONMENT || 'sandbox',
    };
  }

  async getAirtelConfig() {
    const url = await db.prepare(`
      SELECT value FROM settings WHERE key = 'airtel_momo_url'
    `).get()?.value || 'https://openapi.airtel.africa';

    const clientId = process.env.AIRTEL_CLIENT_ID || '';
    const clientSecret = process.env.AIRTEL_CLIENT_SECRET || '';

    return { url, clientId, clientSecret };
  }

  // MTN Mobile Money implementation (optional mtnCfg + businessId for per-store credentials)
  async requestMTNPayment(phoneNumber, amount, reference, externalId, mtnCfg = null, businessId = null) {
    try {
      const cfg = mtnCfg || this.mtnConfig;
      if (!cfg?.apiSecret) {
        throw new Error('MTN MoMo not configured');
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber, 'mtn');
      
      // First, get access token
      const token = await this.getMTNAccessToken(cfg);
      
      // Create the payment request
      const response = await fetch(`${cfg.url}/collection/v1_0/requesttopay`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Reference-Id': externalId,
          'X-Target-Environment': cfg.targetEnvironment || process.env.MTN_ENVIRONMENT || 'sandbox',
          'Ocp-Apim-Subscription-Key': cfg.primaryKey
        },
        body: JSON.stringify({
          amount: amount.toString(),
          currency: 'UGX',
          externalId,
          payer: {
            partyIdType: 'MSISDN',
            partyId: formattedPhone
          },
          payerMessage: `Payment of UGX ${amount.toLocaleString()}`,
          payeeNote: `Sale: ${reference}`
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'MTN MoMo request failed');
      }

      const result = await response.json();
      
      // Store the transaction
      await this.storeTransaction({
        external_id: externalId,
        business_id: businessId,
        reference,
        method: 'mtn_momo',
        phone: formattedPhone,
        amount,
        status: 'pending',
        provider_response: result
      });

      return {
        success: true,
        transactionId: externalId,
        status: 'pending'
      };
    } catch (error) {
      console.error('MTN MoMo payment request error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getMTNAccessToken(mtnCfg = null) {
    const cfg = mtnCfg || this.mtnConfig;
    try {
      const response = await fetch(`${cfg.url}/collection/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': cfg.primaryKey
        },
        body: JSON.stringify({
          grant_type: 'client_credentials'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get MTN access token');
      }

      const result = await response.json();
      return result.access_token;
    } catch (error) {
      console.error('Get MTN access token error:', error);
      throw error;
    }
  }

  async checkMTNStatus(externalId, mtnCfg = null) {
    const cfg = mtnCfg || this.mtnConfig;
    try {
      const token = await this.getMTNAccessToken(cfg);
      
      const response = await fetch(`${cfg.url}/collection/v1_0/requesttopay/${externalId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Target-Environment': cfg.targetEnvironment || process.env.MTN_ENVIRONMENT || 'sandbox',
          'Ocp-Apim-Subscription-Key': cfg.primaryKey
        }
      });

      if (!response.ok) {
        throw new Error('Failed to check MTN status');
      }

      const result = await response.json();
      
      // Update transaction status
      await this.updateTransactionStatus(externalId, result.status, result);
      
      return {
        success: true,
        status: result.status,
        financialTransactionId: result.financialTransactionId
      };
    } catch (error) {
      console.error('Check MTN status error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Airtel Money implementation
  async requestAirtelPayment(phoneNumber, amount, reference, externalId, airtelCfg = null, businessId = null) {
    try {
      const cfg = airtelCfg || this.airtelConfig;
      if (!cfg?.clientSecret) {
        throw new Error('Airtel Money not configured');
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber, 'airtel');
      
      // First, get access token
      const token = await this.getAirtelAccessToken(cfg);
      
      // Create the payment request
      const response = await fetch(`${cfg.url}/merchant/v1/payments/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          payee: {
            country: 'UG',
            currency: 'UGX'
          },
          payer: {
            country: 'UG',
            msisdn: formattedPhone
          },
          transaction: {
            amount: amount.toString(),
            country: 'UG',
            currency: 'UGX',
            id: externalId,
            reference: reference
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.status?.message || 'Airtel Money request failed');
      }

      const result = await response.json();
      
      // Store the transaction
      await this.storeTransaction({
        external_id: externalId,
        business_id: businessId,
        reference,
        method: 'airtel_money',
        phone: formattedPhone,
        amount,
        status: 'pending',
        provider_response: result
      });

      return {
        success: true,
        transactionId: externalId,
        status: result.status?.code || 'pending'
      };
    } catch (error) {
      console.error('Airtel Money payment request error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getAirtelAccessToken(airtelCfg = null) {
    const cfg = airtelCfg || this.airtelConfig;
    try {
      const response = await fetch(`${cfg.url}/auth/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: 'client_credentials'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get Airtel access token');
      }

      const result = await response.json();
      return result.access_token;
    } catch (error) {
      console.error('Get Airtel access token error:', error);
      throw error;
    }
  }

  async checkAirtelStatus(externalId, airtelCfg = null) {
    const cfg = airtelCfg || this.airtelConfig;
    try {
      const token = await this.getAirtelAccessToken(cfg);
      
      const response = await fetch(`${cfg.url}/standard/v1/payments/${externalId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to check Airtel status');
      }

      const result = await response.json();
      
      // Update transaction status
      await this.updateTransactionStatus(externalId, result.status?.code, result);
      
      return {
        success: true,
        status: result.status?.code,
        transactionId: result.transaction?.id
      };
    } catch (error) {
      console.error('Check Airtel status error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /** Per-store MoMo (credentials from businesses.payment_config, set in Developer Console). */
  async requestPaymentForBusiness(businessId, method, phoneNumber, amount, reference) {
    if (!businessId) {
      return { success: false, error: 'Business context is required.' };
    }
    const row = await db.prepare(`SELECT payment_config FROM businesses WHERE id = ?`).get(businessId);
    const externalId = this.generateTransactionId();

    if (method === 'mtn_momo') {
      const mtn = await resolveMtnRuntime(row?.payment_config);
      if (!mtn) {
        return {
          success: false,
          error: 'MTN MoMo is not enabled or credentials are incomplete for this store. Ask your system developer to configure payments.',
        };
      }
      return this.requestMTNPayment(phoneNumber, amount, reference, externalId, mtn, businessId);
    }
    if (method === 'airtel_money') {
      const airtel = await resolveAirtelRuntime(row?.payment_config);
      if (!airtel) {
        return {
          success: false,
          error: 'Airtel Money is not enabled or credentials are incomplete for this store. Ask your system developer to configure payments.',
        };
      }
      return this.requestAirtelPayment(phoneNumber, amount, reference, externalId, airtel, businessId);
    }
    return { success: false, error: 'Unsupported payment method.' };
  }

  // Generic payment methods
  async requestPayment(method, phoneNumber, amount, reference) {
    const externalId = this.generateTransactionId();
    
    try {
      let result;
      
      switch (method) {
        case 'mtn_momo':
          result = await this.requestMTNPayment(phoneNumber, amount, reference, externalId, null, null);
          break;
        case 'airtel_money':
          result = await this.requestAirtelPayment(phoneNumber, amount, reference, externalId, null, null);
          break;
        default:
          throw new Error(`Unsupported payment method: ${method}`);
      }
      
      return result;
    } catch (error) {
      console.error(`Payment request error (${method}):`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkPaymentStatus(method, transactionId) {
    try {
      const txn = await this.getTransaction(transactionId);
      let mtnCfg = null;
      let airtelCfg = null;
      if (txn?.business_id) {
        const bizRow = await db.prepare(`SELECT payment_config FROM businesses WHERE id = ?`).get(txn.business_id);
        mtnCfg = await resolveMtnRuntime(bizRow?.payment_config);
        airtelCfg = await resolveAirtelRuntime(bizRow?.payment_config);
      }

      let result;
      
      switch (method) {
        case 'mtn_momo':
          result = await this.checkMTNStatus(transactionId, mtnCfg);
          break;
        case 'airtel_money':
          result = await this.checkAirtelStatus(transactionId, airtelCfg);
          break;
        default:
          throw new Error(`Unsupported payment method: ${method}`);
      }
      
      // If payment is successful, send confirmation
      if (result.success && (result.status === 'SUCCESSFUL' || result.status === 'completed')) {
        const transaction = await this.getTransaction(transactionId);
        if (transaction) {
          await this.sendPaymentConfirmation(transaction);
        }
      }
      
      return result;
    } catch (error) {
      console.error(`Check payment status error (${method}):`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Utility methods
  formatPhoneNumber(phoneNumber, provider) {
    const clean = phoneNumber.replace(/\D/g, '');
    
    // Uganda format: 256XXXXXXXXX
    if (clean.startsWith('256')) {
      return clean;
    } else if (clean.startsWith('0')) {
      return `256${clean.substring(1)}`;
    } else if (clean.length === 9) {
      return `256${clean}`;
    }
    
    return clean;
  }

  generateTransactionId() {
    return `TXN${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }

  async storeTransaction(transactionData) {
    await db.prepare(`
      INSERT INTO mobile_money_transactions (
        external_id, business_id, reference, method, phone, amount, status,
        provider_response, created_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
    `).run(
      transactionData.external_id,
      transactionData.business_id || null,
      transactionData.reference,
      transactionData.method,
      transactionData.phone,
      transactionData.amount,
      transactionData.status,
      JSON.stringify(transactionData.provider_response)
    );
  }

  async updateTransactionStatus(externalId, status, providerResponse) {
    await db.prepare(`
      UPDATE mobile_money_transactions SET
        status = ?,
        provider_response = ?,
        updated_at = datetime('now'),
        sync_status = 'pending'
      WHERE external_id = ?
    `).run(status, JSON.stringify(providerResponse), externalId);
  }

  async getTransaction(externalId) {
    return await db.prepare(`
      SELECT * FROM mobile_money_transactions WHERE external_id = ?
    `).get(externalId);
  }

  async sendPaymentConfirmation(transaction) {
    try {
      // Get customer info if available
      const customer = await db.prepare(`
        SELECT name, phone FROM customers WHERE phone = ?
      `).get(transaction.phone);

      // Send notification
      await dispatch('MOMO_PAYMENT_CONFIRMED', {
        amount: transaction.amount,
        method: transaction.method,
        reference: transaction.reference,
        customer_phone: transaction.phone
      });

      // Update sale record if this is for a sale
      if (transaction.reference.startsWith('INV-')) {
        await db.prepare(`
          UPDATE sales SET
            payment_reference = ?,
            updated_at = datetime('now'),
            sync_status = 'pending'
          WHERE sale_number = ?
        `).run(transaction.external_id, transaction.reference);
      }

      console.log(`Payment confirmation sent for ${transaction.method} transaction ${transaction.external_id}`);
    } catch (error) {
      console.error('Send payment confirmation error:', error);
    }
  }

  // Poll for payment status (for POS waiting for payment)
  async pollPaymentStatus(method, transactionId, maxAttempts = 30, interval = 2000) {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const result = await this.checkPaymentStatus(method, transactionId);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }
      
      if (result.status === 'SUCCESSFUL' || result.status === 'completed') {
        return { success: true, status: 'completed', result };
      }
      
      if (result.status === 'FAILED' || result.status === 'failed') {
        return { success: false, status: 'failed', result };
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    }
    
    return { 
      success: false, 
      status: 'timeout', 
      error: 'Payment confirmation timeout' 
    };
  }

  // Get transaction history
  async getTransactionHistory(filters = {}) {
    try {
      const { saleLocalDate } = require('../utils/storeTime');
      const localDate = saleLocalDate('created_at');

      let query = `
        SELECT * FROM mobile_money_transactions 
        WHERE 1=1
      `;
      const params = [];

      if (filters.business_id) {
        query += ` AND business_id = ?`;
        params.push(filters.business_id);
      }

      if (filters.method) {
        query += ` AND method = ?`;
        params.push(filters.method);
      }

      if (filters.status) {
        query += ` AND status = ?`;
        params.push(filters.status);
      }

      if (filters.from) {
        query += ` AND ${localDate} >= ?`;
        params.push(filters.from);
      }

      if (filters.to) {
        query += ` AND ${localDate} <= ?`;
        params.push(filters.to);
      }

      query += ` ORDER BY created_at DESC`;

      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
      }

      return await db.prepare(query).all(...params);
    } catch (error) {
      console.error('Get transaction history error:', error);
      return [];
    }
  }
}

module.exports = new MobileMoneyService();
