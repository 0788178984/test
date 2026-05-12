const db = require('../db/connection');
const { dispatch } = require('../routes/notifications');

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
    const url = db.prepare(`
      SELECT value FROM settings WHERE key = 'mtn_momo_url'
    `).get()?.value || 'https://sandbox.momodeveloper.mtn.com';

    const primaryKey = process.env.MTN_PRIMARY_KEY || '';
    const secondaryKey = process.env.MTN_SECONDARY_KEY || '';
    const userId = process.env.MTN_USER_ID || '';
    const apiSecret = process.env.MTN_API_SECRET || '';

    return { url, primaryKey, secondaryKey, userId, apiSecret };
  }

  async getAirtelConfig() {
    const url = db.prepare(`
      SELECT value FROM settings WHERE key = 'airtel_momo_url'
    `).get()?.value || 'https://openapi.airtel.africa';

    const clientId = process.env.AIRTEL_CLIENT_ID || '';
    const clientSecret = process.env.AIRTEL_CLIENT_SECRET || '';

    return { url, clientId, clientSecret };
  }

  // MTN Mobile Money implementation
  async requestMTNPayment(phoneNumber, amount, reference, externalId) {
    try {
      if (!this.mtnConfig.apiSecret) {
        throw new Error('MTN MoMo not configured');
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber, 'mtn');
      
      // First, get access token
      const token = await this.getMTNAccessToken();
      
      // Create the payment request
      const response = await fetch(`${this.mtnConfig.url}/collection/v1_0/requesttopay`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Reference-Id': externalId,
          'X-Target-Environment': process.env.MTN_ENVIRONMENT || 'sandbox',
          'Ocp-Apim-Subscription-Key': this.mtnConfig.primaryKey
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

  async getMTNAccessToken() {
    try {
      const response = await fetch(`${this.mtnConfig.url}/collection/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': this.mtnConfig.primaryKey
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

  async checkMTNStatus(externalId) {
    try {
      const token = await this.getMTNAccessToken();
      
      const response = await fetch(`${this.mtnConfig.url}/collection/v1_0/requesttopay/${externalId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Target-Environment': process.env.MTN_ENVIRONMENT || 'sandbox',
          'Ocp-Apim-Subscription-Key': this.mtnConfig.primaryKey
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
  async requestAirtelPayment(phoneNumber, amount, reference, externalId) {
    try {
      if (!this.airtelConfig.clientSecret) {
        throw new Error('Airtel Money not configured');
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber, 'airtel');
      
      // First, get access token
      const token = await this.getAirtelAccessToken();
      
      // Create the payment request
      const response = await fetch(`${this.airtelConfig.url}/merchant/v1/payments/`, {
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

  async getAirtelAccessToken() {
    try {
      const response = await fetch(`${this.airtelConfig.url}/auth/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: this.airtelConfig.clientId,
          client_secret: this.airtelConfig.clientSecret,
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

  async checkAirtelStatus(externalId) {
    try {
      const token = await this.getAirtelAccessToken();
      
      const response = await fetch(`${this.airtelConfig.url}/standard/v1/payments/${externalId}`, {
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

  // Generic payment methods
  async requestPayment(method, phoneNumber, amount, reference) {
    const externalId = this.generateTransactionId();
    
    try {
      let result;
      
      switch (method) {
        case 'mtn_momo':
          result = await this.requestMTNPayment(phoneNumber, amount, reference, externalId);
          break;
        case 'airtel_money':
          result = await this.requestAirtelPayment(phoneNumber, amount, reference, externalId);
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
      let result;
      
      switch (method) {
        case 'mtn_momo':
          result = await this.checkMTNStatus(transactionId);
          break;
        case 'airtel_money':
          result = await this.checkAirtelStatus(transactionId);
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
    db.prepare(`
      INSERT INTO mobile_money_transactions (
        external_id, reference, method, phone, amount, status,
        provider_response, created_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')
    `).run(
      transactionData.external_id,
      transactionData.reference,
      transactionData.method,
      transactionData.phone,
      transactionData.amount,
      transactionData.status,
      JSON.stringify(transactionData.provider_response)
    );
  }

  async updateTransactionStatus(externalId, status, providerResponse) {
    db.prepare(`
      UPDATE mobile_money_transactions SET
        status = ?,
        provider_response = ?,
        updated_at = datetime('now'),
        sync_status = 'pending'
      WHERE external_id = ?
    `).run(status, JSON.stringify(providerResponse), externalId);
  }

  async getTransaction(externalId) {
    return db.prepare(`
      SELECT * FROM mobile_money_transactions WHERE external_id = ?
    `).get(externalId);
  }

  async sendPaymentConfirmation(transaction) {
    try {
      // Get customer info if available
      const customer = db.prepare(`
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
        db.prepare(`
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
      let query = `
        SELECT * FROM mobile_money_transactions 
        WHERE 1=1
      `;
      const params = [];

      if (filters.method) {
        query += ` AND method = ?`;
        params.push(filters.method);
      }

      if (filters.status) {
        query += ` AND status = ?`;
        params.push(filters.status);
      }

      if (filters.from) {
        query += ` AND date(created_at) >= date(?)`;
        params.push(filters.from);
      }

      if (filters.to) {
        query += ` AND date(created_at) <= date(?)`;
        params.push(filters.to);
      }

      query += ` ORDER BY created_at DESC`;

      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(filters.limit);
      }

      return db.prepare(query).all(...params);
    } catch (error) {
      console.error('Get transaction history error:', error);
      return [];
    }
  }
}

module.exports = new MobileMoneyService();
