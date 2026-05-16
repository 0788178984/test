const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { restrictToBusinessStaff } = require('../middleware/tenantContext');
const { checkPermission } = require('../middleware/roleCheck');
const db = require('../db/connection');
const router = express.Router();

const TABLES_WITH_BUSINESS_ID = new Set([
  'users',
  'products',
  'suppliers',
  'customers',
  'sales',
  'stock_adjustments',
  'notifications',
  'loyalty_transactions',
]);

/** business_id set by migration, but no deleted_at / updated_at in base schema — generic sync SQL must not reference those columns */
const TABLES_BUSINESS_NO_SOFT_DELETE = new Set(['stock_adjustments', 'loyalty_transactions']);

router.use(authenticate, restrictToBusinessStaff);

// Tables that need to be synced
const SYNC_TABLES = [
  'users', 'products', 'suppliers', 'customers', 'sales', 'sale_items',
  'stock_adjustments', 'notifications', 'loyalty_transactions'
];

// Push local changes to cloud
router.post('/push', authorize('admin'), async (req, res) => {
  try {
    const { table, records } = req.body;

    if (!table || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Table and records array are required.' });
    }

    if (!SYNC_TABLES.includes(table)) {
      return res.status(400).json({ error: 'Invalid table for sync.' });
    }

    const accepted = [];
    const conflicts = [];

    for (const record of records) {
      try {
        // Check if record exists locally
        let existing;
        if (table === 'sale_items') {
          existing = db
            .prepare(
              `
            SELECT si.id, si.created_at AS updated_at, si.sync_status
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE si.id = ? AND s.business_id = ?
          `
            )
            .get(record.id, req.user.business_id);
        } else if (TABLES_BUSINESS_NO_SOFT_DELETE.has(table)) {
          existing = db
            .prepare(
              `SELECT id, created_at AS updated_at, sync_status FROM ${table} WHERE id = ? AND business_id = ?`
            )
            .get(record.id, req.user.business_id);
        } else if (TABLES_WITH_BUSINESS_ID.has(table)) {
          existing = db
            .prepare(`SELECT id, updated_at, sync_status FROM ${table} WHERE id = ? AND business_id = ?`)
            .get(record.id, req.user.business_id);
        } else {
          existing = db
            .prepare(`SELECT id, updated_at, sync_status FROM ${table} WHERE id = ?`)
            .get(record.id);
        }

        if (!existing) {
          // New record, insert it
          const columns = Object.keys(record).join(',');
          const placeholders = Object.keys(record).map(() => '?').join(',');
          
          await db.prepare(`
            INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})
          `).run(...Object.values(record));
          
          accepted.push(record.id);
        } else {
          // Record exists, check for conflicts
          const localTime = new Date(existing.updated_at);
          const remoteTime = new Date(record.updated_at);
          
          if (remoteTime > localTime) {
            // Remote is newer, update local
            const columns = Object.keys(record).join(',');
            const placeholders = Object.keys(record).map(() => '?').join(',');
            
            await db.prepare(`
              INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})
            `).run(...Object.values(record));
            
            accepted.push(record.id);
          } else if (localTime > remoteTime) {
            // Local is newer, this is a conflict
            conflicts.push({
              id: record.id,
              type: 'version_conflict',
              local_time: existing.updated_at,
              remote_time: record.updated_at
            });
          } else {
            // Same timestamp, no conflict
            accepted.push(record.id);
          }
        }
      } catch (error) {
        console.error(`Error syncing record ${record.id}:`, error);
        conflicts.push({
          id: record.id,
          type: 'sync_error',
          error: error.message
        });
      }
    }

    res.json({
      accepted,
      conflicts,
      message: `Processed ${records.length} records. Accepted: ${accepted.length}, Conflicts: ${conflicts.length}`
    });
  } catch (error) {
    console.error('Sync push error:', error);
    res.status(500).json({ error: 'Failed to push changes to cloud.' });
  }
});

// Pull changes from cloud
router.post('/pull', authorize('admin'), async (req, res) => {
  try {
    const { table, last_sync_at } = req.body;

    if (!table) {
      return res.status(400).json({ error: 'Table is required.' });
    }

    if (!SYNC_TABLES.includes(table)) {
      return res.status(400).json({ error: 'Invalid table for sync.' });
    }

    let query;
    const params = [];

    if (table === 'sale_items') {
      query = `
        SELECT si.* FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.business_id = ?
      `;
      params.push(req.user.business_id);
      if (last_sync_at) {
        query += ` AND si.created_at > ?`;
        params.push(last_sync_at);
      }
      query += ` AND si.sync_status IN ('pending', 'synced')`;
    } else if (TABLES_BUSINESS_NO_SOFT_DELETE.has(table)) {
      query = `SELECT * FROM ${table} WHERE business_id = ?`;
      params.push(req.user.business_id);
      if (last_sync_at) {
        query += ` AND created_at > ?`;
        params.push(last_sync_at);
      }
      query += ` AND sync_status IN ('pending', 'synced')`;
    } else {
      query = `SELECT * FROM ${table} WHERE deleted_at IS NULL`;
      if (TABLES_WITH_BUSINESS_ID.has(table)) {
        query += ` AND business_id = ?`;
        params.push(req.user.business_id);
      }
      if (last_sync_at) {
        query += ` AND updated_at > ?`;
        params.push(last_sync_at);
      }
      query += ` AND sync_status IN ('pending', 'synced')`;
    }

    const records = await db.prepare(query).all(...params);

    res.json({
      records,
      count: records.length,
      last_sync_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync pull error:', error);
    res.status(500).json({ error: 'Failed to pull changes from cloud.' });
  }
});

// Get sync status
router.get('/status', authorize('admin', 'manager'), async (req, res) => {
  try {
    const status = {};
    
    for (const table of SYNC_TABLES) {
      let pending;
      let synced;
      let lastSync;
      const b = req.user.business_id;

      if (table === 'sale_items') {
        pending = db
          .prepare(
            `
          SELECT COUNT(*) as count FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE si.sync_status = 'pending' AND s.business_id = ?
        `
          )
          .get(b).count;
        synced = db
          .prepare(
            `
          SELECT COUNT(*) as count FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE si.sync_status = 'synced' AND s.business_id = ?
        `
          )
          .get(b).count;
        lastSync = db
          .prepare(
            `
          SELECT MAX(si.created_at) as last_sync FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE si.sync_status = 'synced' AND s.business_id = ?
        `
          )
          .get(b).last_sync;
      } else if (TABLES_BUSINESS_NO_SOFT_DELETE.has(table)) {
        pending = db
          .prepare(
            `
          SELECT COUNT(*) as count FROM ${table}
          WHERE sync_status = 'pending' AND business_id = ?
        `
          )
          .get(b).count;
        synced = db
          .prepare(
            `
          SELECT COUNT(*) as count FROM ${table}
          WHERE sync_status = 'synced' AND business_id = ?
        `
          )
          .get(b).count;
        lastSync = db
          .prepare(
            `
          SELECT MAX(created_at) as last_sync FROM ${table}
          WHERE sync_status = 'synced' AND business_id = ?
        `
          )
          .get(b).last_sync;
      } else if (TABLES_WITH_BUSINESS_ID.has(table)) {
        pending = db
          .prepare(
            `
          SELECT COUNT(*) as count FROM ${table}
          WHERE sync_status = 'pending' AND deleted_at IS NULL AND business_id = ?
        `
          )
          .get(b).count;
        synced = db
          .prepare(
            `
          SELECT COUNT(*) as count FROM ${table}
          WHERE sync_status = 'synced' AND deleted_at IS NULL AND business_id = ?
        `
          )
          .get(b).count;
        lastSync = db
          .prepare(
            `
          SELECT MAX(updated_at) as last_sync FROM ${table}
          WHERE sync_status = 'synced' AND deleted_at IS NULL AND business_id = ?
        `
          )
          .get(b).last_sync;
      } else {
        pending = db
          .prepare(
            `
          SELECT COUNT(*) as count FROM ${table}
          WHERE sync_status = 'pending' AND deleted_at IS NULL
        `
          )
          .get().count;
        synced = db
          .prepare(
            `
          SELECT COUNT(*) as count FROM ${table}
          WHERE sync_status = 'synced' AND deleted_at IS NULL
        `
          )
          .get().count;
        lastSync = db
          .prepare(
            `
          SELECT MAX(updated_at) as last_sync FROM ${table}
          WHERE sync_status = 'synced' AND deleted_at IS NULL
        `
          )
          .get().last_sync;
      }

      status[table] = {
        pending,
        synced,
        last_sync: lastSync || null,
      };
    }

    // Get overall sync status
    const totalPending = Object.values(status).reduce((sum, table) => sum + table.pending, 0);
    const totalSynced = Object.values(status).reduce((sum, table) => sum + table.synced, 0);

    res.json({
      status,
      summary: {
        total_pending: totalPending,
        total_synced: totalSynced,
        sync_percentage: totalSynced > 0 ? Math.round((totalSynced / (totalPending + totalSynced)) * 100) : 0
      }
    });
  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json({ error: 'Failed to get sync status.' });
  }
});

// Force full sync
router.post('/force', authorize('admin'), async (req, res) => {
  try {
    const { direction } = req.body; // 'push' or 'pull'

    if (!direction || !['push', 'pull'].includes(direction)) {
      return res.status(400).json({ error: 'Direction must be "push" or "pull".' });
    }

    let updatedCount = 0;

    const b = req.user.business_id;

    if (direction === 'push') {
      for (const table of SYNC_TABLES) {
        let result;
        if (table === 'sale_items') {
          result = db
            .prepare(
              `
            UPDATE sale_items SET sync_status = 'pending'
            WHERE sale_id IN (SELECT id FROM sales WHERE business_id = ?)
          `
            )
            .run(b);
        } else if (TABLES_BUSINESS_NO_SOFT_DELETE.has(table)) {
          result = db
            .prepare(
              `
            UPDATE ${table} SET sync_status = 'pending'
            WHERE business_id = ?
          `
            )
            .run(b);
        } else {
          result = db
            .prepare(
              `
            UPDATE ${table} SET sync_status = 'pending', updated_at = datetime('now')
            WHERE deleted_at IS NULL AND business_id = ?
          `
            )
            .run(b);
        }
        updatedCount += result.changes;
      }
    } else {
      for (const table of SYNC_TABLES) {
        let result;
        if (table === 'sale_items') {
          result = db
            .prepare(
              `
            UPDATE sale_items SET sync_status = 'pending'
            WHERE sale_id IN (SELECT id FROM sales WHERE business_id = ?)
          `
            )
            .run(b);
        } else if (TABLES_BUSINESS_NO_SOFT_DELETE.has(table)) {
          result = db
            .prepare(
              `
            UPDATE ${table} SET sync_status = 'pending'
            WHERE business_id = ?
          `
            )
            .run(b);
        } else {
          result = db
            .prepare(
              `
            UPDATE ${table} SET sync_status = 'pending', updated_at = datetime('now')
            WHERE deleted_at IS NULL AND business_id = ?
          `
            )
            .run(b);
        }
        updatedCount += result.changes;
      }
    }

    res.json({
      message: `Force sync initiated. ${updatedCount} records marked for ${direction}.`,
      updated_count: updatedCount,
      direction
    });
  } catch (error) {
    console.error('Force sync error:', error);
    res.status(500).json({ error: 'Failed to force sync.' });
  }
});

// Resolve sync conflicts
router.post('/resolve-conflict', authorize('admin'), async (req, res) => {
  try {
    const { table, record_id, resolution, data } = req.body;

    if (!table || !record_id || !resolution || !data) {
      return res.status(400).json({ error: 'Table, record_id, resolution, and data are required.' });
    }

    if (!SYNC_TABLES.includes(table)) {
      return res.status(400).json({ error: 'Invalid table for sync.' });
    }

    if (!['use_local', 'use_remote', 'merge'].includes(resolution)) {
      return res.status(400).json({ error: 'Resolution must be use_local, use_remote, or merge.' });
    }

    // Get current record
    const current = await db.prepare(`
      SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL
    `).get(record_id);

    if (!current) {
      return res.status(404).json({ error: 'Record not found.' });
    }

    let updateData;

    switch (resolution) {
      case 'use_local':
        // Keep local, mark as synced
        updateData = { ...current, sync_status: 'synced', updated_at: new Date().toISOString() };
        break;
      
      case 'use_remote':
        // Use remote data
        updateData = { ...data, sync_status: 'synced', updated_at: new Date().toISOString() };
        break;
      
      case 'merge':
        // Merge data (remote takes precedence for provided fields)
        updateData = { ...current, ...data, sync_status: 'synced', updated_at: new Date().toISOString() };
        break;
    }

    // Update record
    const columns = Object.keys(updateData).join(',');
    const placeholders = Object.keys(updateData).map(() => '?').join(',');
    
    await db.prepare(`
      INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})
    `).run(...Object.values(updateData));

    res.json({
      message: 'Conflict resolved successfully.',
      resolution,
      record_id
    });
  } catch (error) {
    console.error('Resolve conflict error:', error);
    res.status(500).json({ error: 'Failed to resolve conflict.' });
  }
});

// Get sync conflicts
router.get('/conflicts', authorize('admin'), async (req, res) => {
  try {
    const conflicts = [];
    const b = req.user.business_id;

    for (const table of SYNC_TABLES) {
      let pendingRecords;
      if (table === 'sale_items') {
        pendingRecords = db
          .prepare(
            `
          SELECT si.id, si.created_at AS updated_at, si.sync_status
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE si.sync_status = 'pending' AND s.business_id = ?
          LIMIT 10
        `
          )
          .all(b);
      } else if (TABLES_BUSINESS_NO_SOFT_DELETE.has(table)) {
        pendingRecords = db
          .prepare(
            `
          SELECT id, created_at AS updated_at, sync_status FROM ${table}
          WHERE sync_status = 'pending' AND business_id = ?
          LIMIT 10
        `
          )
          .all(b);
      } else if (TABLES_WITH_BUSINESS_ID.has(table)) {
        pendingRecords = db
          .prepare(
            `
          SELECT id, updated_at, sync_status FROM ${table}
          WHERE sync_status = 'pending' AND deleted_at IS NULL AND business_id = ?
          LIMIT 10
        `
          )
          .all(b);
      } else {
        pendingRecords = db
          .prepare(
            `
          SELECT id, updated_at, sync_status FROM ${table}
          WHERE sync_status = 'pending' AND deleted_at IS NULL
          LIMIT 10
        `
          )
          .all();
      }

      pendingRecords.forEach((record) => {
        conflicts.push({
          table,
          record_id: record.id,
          type: 'pending_sync',
          last_updated: record.updated_at,
        });
      });
    }

    res.json({
      conflicts,
      count: conflicts.length,
    });
  } catch (error) {
    console.error('Get conflicts error:', error);
    res.status(500).json({ error: 'Failed to get sync conflicts.' });
  }
});

module.exports = router;
