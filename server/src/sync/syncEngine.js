const cron = require('node-cron');
const db = require('../db/connection');
const { dispatch } = require('../routes/notifications');

class SyncEngine {
  constructor() {
    this.db = db;
    this.cloudUrl = null;
    this.isRunning = false;
    this.lastSyncAt = null;
    this.syncInterval = null;
    this.SYNC_TABLES = [
      'users', 'products', 'suppliers', 'customers', 'sales', 'sale_items',
      'stock_adjustments', 'notifications', 'loyalty_transactions'
    ];
    this.initialize();
  }

  async initialize() {
    try {
      // Get sync settings
      const intervalSetting = db.prepare(`
        SELECT value FROM settings WHERE key = 'sync_interval_seconds'
      `).get();
      
      const cloudUrlSetting = db.prepare(`
        SELECT value FROM settings WHERE key = 'cloud_api_url'
      `).get();

      this.syncInterval = parseInt(intervalSetting?.value) || 60;
      this.cloudUrl = cloudUrlSetting?.value;

      if (this.cloudUrl) {
        console.log(`Sync engine initialized with ${this.syncInterval}s interval`);
        this.start(this.syncInterval);
      } else {
        console.log('Cloud API URL not configured, sync engine disabled');
      }
    } catch (error) {
      console.error('Failed to initialize sync engine:', error);
    }
  }

  start(intervalSeconds = this.syncInterval) {
    if (this.syncJob) {
      this.syncJob.stop();
    }

    this.syncJob = cron.schedule(`*/${intervalSeconds} * * * * *`, () => {
      this.sync();
    });

    console.log(`Sync job started with ${intervalSeconds}s interval`);
  }

  stop() {
    if (this.syncJob) {
      this.syncJob.stop();
      console.log('Sync job stopped');
    }
  }

  async sync() {
    if (this.isRunning || !this.cloudUrl) {
      return;
    }

    const hasInternet = await this.checkConnectivity();
    if (!hasInternet) {
      console.log('No internet connection, skipping sync');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    let totalPushed = 0;
    let totalPulled = 0;
    let errors = [];

    try {
      console.log('Starting sync cycle...');
      
      for (const table of this.SYNC_TABLES) {
        try {
          const pushResult = await this.pushTable(table);
          const pullResult = await this.pullTable(table);
          
          totalPushed += pushResult.count || 0;
          totalPulled += pullResult.count || 0;
          
          if (pushResult.error) errors.push({ table, operation: 'push', error: pushResult.error });
          if (pullResult.error) errors.push({ table, operation: 'pull', error: pullResult.error });
          
        } catch (error) {
          console.error(`Error syncing table ${table}:`, error);
          errors.push({ table, operation: 'sync', error: error.message });
        }
      }

      this.lastSyncAt = new Date();
      const duration = Date.now() - startTime;

      console.log(`Sync completed in ${duration}ms. Pushed: ${totalPushed}, Pulled: ${totalPulled}, Errors: ${errors.length}`);

      if (errors.length === 0) {
        await dispatch('SYNC_COMPLETED', { count: totalPushed + totalPulled });
      } else {
        await dispatch('SYNC_FAILED', { 
          error_message: `${errors.length} errors occurred during sync`,
          errors: errors.slice(0, 5) // Limit error details
        });
      }

    } catch (error) {
      console.error('Sync cycle error:', error);
      await dispatch('SYNC_FAILED', { error_message: error.message });
    } finally {
      this.isRunning = false;
    }
  }

  async pushTable(table) {
    try {
      // Get all records with sync_status = 'pending'
      const pending = this.db.prepare(`
        SELECT * FROM ${table} WHERE sync_status = 'pending' AND deleted_at IS NULL
      `).all();

      if (!pending.length) {
        return { count: 0 };
      }

      const token = await this.getCloudToken();
      if (!token) {
        throw new Error('No cloud authentication token available');
      }

      const response = await fetch(`${this.cloudUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          table,
          records: pending
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cloud push failed: ${error}`);
      }

      const result = await response.json();
      
      if (result.accepted && result.accepted.length > 0) {
        // Mark records as synced
        const ids = result.accepted;
        const placeholders = ids.map(() => '?').join(',');
        
        this.db.prepare(`
          UPDATE ${table} SET sync_status = 'synced', updated_at = datetime('now')
          WHERE id IN (${placeholders})
        `).run(...ids);

        console.log(`Pushed ${ids.length} records for table ${table}`);
      }

      return { 
        count: pending.length, 
        accepted: result.accepted?.length || 0,
        conflicts: result.conflicts || []
      };
    } catch (error) {
      console.error(`Push table ${table} error:`, error);
      return { count: 0, error: error.message };
    }
  }

  async pullTable(table) {
    try {
      const token = await this.getCloudToken();
      if (!token) {
        throw new Error('No cloud authentication token available');
      }

      const lastSyncTime = this.lastSyncAt ? this.lastSyncAt.toISOString() : '';
      
      const response = await fetch(
        `${this.cloudUrl}/api/sync/pull?table=${table}&last_sync_at=${encodeURIComponent(lastSyncTime)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cloud pull failed: ${error}`);
      }

      const result = await response.json();
      const records = result.records || [];

      if (records.length > 0) {
        // Upsert records
        for (const record of records) {
          await this.upsertRecord(table, record);
        }
        
        console.log(`Pulled ${records.length} records for table ${table}`);
      }

      return { count: records.length };
    } catch (error) {
      console.error(`Pull table ${table} error:`, error);
      return { count: 0, error: error.message };
    }
  }

  async upsertRecord(table, record) {
    try {
      // Check if record exists locally
      const existing = this.db.prepare(`
        SELECT id, updated_at FROM ${table} WHERE id = ? AND deleted_at IS NULL
      `).get(record.id);

      if (!existing) {
        // Insert new record
        const columns = Object.keys(record).join(',');
        const placeholders = Object.keys(record).map(() => '?').join(',');
        
        this.db.prepare(`
          INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})
        `).run(...Object.values(record));
      } else {
        // Compare timestamps
        const localTime = new Date(existing.updated_at);
        const remoteTime = new Date(record.updated_at);
        
        if (remoteTime > localTime) {
          // Remote is newer, update local
          const columns = Object.keys(record).join(',');
          const placeholders = Object.keys(record).map(() => '?').join(',');
          
          this.db.prepare(`
            INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})
          `).run(...Object.values(record));
        }
        // If local is newer, keep local (no action needed)
      }
    } catch (error) {
      console.error(`Upsert record error for table ${table}:`, error);
      throw error;
    }
  }

  async checkConnectivity() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getCloudToken() {
    try {
      // Try to get token from settings first
      const tokenSetting = this.db.prepare(`
        SELECT value FROM settings WHERE key = 'cloud_token'
      `).get();

      if (tokenSetting?.value) {
        // Check if token is still valid (simple check)
        const token = tokenSetting.value;
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const now = Math.floor(Date.now() / 1000);
          
          if (payload.exp > now) {
            return token;
          }
        } catch (e) {
          // Token is malformed, continue to refresh
        }
      }

      // Token is invalid or missing, try to get new one
      return await this.refreshCloudToken();
    } catch (error) {
      console.error('Get cloud token error:', error);
      return null;
    }
  }

  async refreshCloudToken() {
    try {
      const machineId = await this.getMachineId();
      const machineSecret = await this.getMachineSecret();

      if (!machineId || !machineSecret) {
        throw new Error('Machine credentials not configured');
      }

      const response = await fetch(`${this.cloudUrl}/api/auth/machine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          machine_id: machineId,
          machine_secret: machineSecret
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token refresh failed: ${error}`);
      }

      const result = await response.json();
      const token = result.token;

      // Store new token
      this.db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at) 
        VALUES ('cloud_token', ?, datetime('now'))
      `).run(token);

      return token;
    } catch (error) {
      console.error('Refresh cloud token error:', error);
      return null;
    }
  }

  async getMachineId() {
    const setting = this.db.prepare(`
      SELECT value FROM settings WHERE key = 'machine_id'
    `).get();
    return setting?.value || process.env.MACHINE_ID;
  }

  async getMachineSecret() {
    const setting = this.db.prepare(`
      SELECT value FROM settings WHERE key = 'machine_secret'
    `).get();
    return setting?.value || process.env.MACHINE_SECRET;
  }

  // Manual sync methods
  async forceSync(direction = 'both') {
    if (this.isRunning) {
      return { success: false, error: 'Sync already in progress' };
    }

    try {
      const hasInternet = await this.checkConnectivity();
      if (!hasInternet) {
        return { success: false, error: 'No internet connection available' };
      }

      let totalPushed = 0;
      let totalPulled = 0;

      if (direction === 'push' || direction === 'both') {
        for (const table of this.SYNC_TABLES) {
          const result = await this.pushTable(table);
          totalPushed += result.count || 0;
        }
      }

      if (direction === 'pull' || direction === 'both') {
        for (const table of this.SYNC_TABLES) {
          const result = await this.pullTable(table);
          totalPulled += result.count || 0;
        }
      }

      this.lastSyncAt = new Date();

      return {
        success: true,
        pushed: totalPushed,
        pulled: totalPulled,
        direction
      };
    } catch (error) {
      console.error('Force sync error:', error);
      return { success: false, error: error.message };
    }
  }

  async getSyncStatus() {
    try {
      const status = {};
      
      for (const table of this.SYNC_TABLES) {
        const pending = this.db.prepare(`
          SELECT COUNT(*) as count FROM ${table} 
          WHERE sync_status = 'pending' AND deleted_at IS NULL
        `).get().count;

        const synced = this.db.prepare(`
          SELECT COUNT(*) as count FROM ${table} 
          WHERE sync_status = 'synced' AND deleted_at IS NULL
        `).get().count;

        const lastSync = this.db.prepare(`
          SELECT MAX(updated_at) as last_sync FROM ${table} 
          WHERE sync_status = 'synced' AND deleted_at IS NULL
        `).get().last_sync;

        status[table] = {
          pending,
          synced,
          last_sync: lastSync
        };
      }

      const totalPending = Object.values(status).reduce((sum, table) => sum + table.pending, 0);
      const totalSynced = Object.values(status).reduce((sum, table) => sum + table.synced, 0);

      return {
        status,
        summary: {
          total_pending: totalPending,
          total_synced: totalSynced,
          sync_percentage: totalSynced > 0 ? Math.round((totalSynced / (totalPending + totalSynced)) * 100) : 0,
          last_sync_at: this.lastSyncAt,
          is_running: this.isRunning,
          has_internet: await this.checkConnectivity(),
          cloud_url: this.cloudUrl,
          sync_interval: this.syncInterval
        }
      };
    } catch (error) {
      console.error('Get sync status error:', error);
      return { success: false, error: error.message };
    }
  }

  async resolveConflicts(conflicts) {
    try {
      const results = [];

      for (const conflict of conflicts) {
        const { table, record_id, resolution, data } = conflict;
        
        let updateData;
        switch (resolution) {
          case 'use_local':
            // Keep local, mark as synced
            updateData = { 
              sync_status: 'synced', 
              updated_at: new Date().toISOString() 
            };
            break;
          
          case 'use_remote':
            // Use remote data
            updateData = { 
              ...data, 
              sync_status: 'synced', 
              updated_at: new Date().toISOString() 
            };
            break;
          
          case 'merge':
            // Merge data (remote takes precedence for provided fields)
            const current = this.db.prepare(`
              SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL
            `).get(record_id);

            updateData = { 
              ...current, 
              ...data, 
              sync_status: 'synced', 
              updated_at: new Date().toISOString() 
            };
            break;
          
          default:
            throw new Error(`Invalid resolution: ${resolution}`);
        }

        // Update record
        const columns = Object.keys(updateData);
        const placeholders = columns.map(() => '?').join(',');
        
        this.db.prepare(`
          UPDATE ${table} SET ${columns.map(col => `${col} = ?`).join(', ')}
          WHERE id = ?
        `).run(...Object.values(updateData), record_id);

        results.push({
          table,
          record_id,
          resolution,
          success: true
        });
      }

      return { success: true, results };
    } catch (error) {
      console.error('Resolve conflicts error:', error);
      return { success: false, error: error.message };
    }
  }

  // Update sync settings
  async updateSettings(settings) {
    try {
      if (settings.cloudUrl !== undefined) {
        this.cloudUrl = settings.cloudUrl;
        this.db.prepare(`
          UPDATE settings SET value = ?, updated_at = datetime('now')
          WHERE key = 'cloud_api_url'
        `).run(settings.cloudUrl);

        // Restart sync with new settings
        if (settings.cloudUrl) {
          this.start(this.syncInterval);
        } else {
          this.stop();
        }
      }

      if (settings.interval !== undefined) {
        this.syncInterval = settings.interval;
        this.db.prepare(`
          UPDATE settings SET value = ?, updated_at = datetime('now')
          WHERE key = 'sync_interval_seconds'
        `).run(settings.interval.toString());

        if (this.cloudUrl) {
          this.start(settings.interval);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Update sync settings error:', error);
      return { success: false, error: error.message };
    }
  }

  // Cleanup old sync logs if needed
  async cleanup() {
    try {
      // This would be implemented if we had a sync_logs table
      console.log('Sync cleanup completed');
    } catch (error) {
      console.error('Sync cleanup error:', error);
    }
  }
}

module.exports = new SyncEngine();
