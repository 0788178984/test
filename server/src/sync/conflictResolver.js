const db = require('../db/connection');

class ConflictResolver {
  constructor() {
    this.conflictStrategies = {
      'latest_wins': this.resolveLatestWins.bind(this),
      'local_wins': this.resolveLocalWins.bind(this),
      'remote_wins': this.resolveRemoteWins.bind(this),
      'merge': this.resolveMerge.bind(this),
      'manual': this.resolveManual.bind(this)
    };
  }

  async resolveConflict(conflict) {
    const { table, localRecord, remoteRecord, strategy = 'latest_wins' } = conflict;

    if (!this.conflictStrategies[strategy]) {
      throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
    }

    return await this.conflictStrategies[strategy](conflict);
  }

  async resolveLatestWins(conflict) {
    const { table, localRecord, remoteRecord } = conflict;
    
    // Compare timestamps
    const localTime = new Date(localRecord.updated_at);
    const remoteTime = new Date(remoteRecord.updated_at);
    
    if (remoteTime > localTime) {
      return {
        resolution: 'remote',
        record: remoteRecord,
        reason: 'Remote record is newer'
      };
    } else if (localTime > remoteTime) {
      return {
        resolution: 'local',
        record: localRecord,
        reason: 'Local record is newer'
      };
    } else {
      // Same timestamp, prefer local
      return {
        resolution: 'local',
        record: localRecord,
        reason: 'Same timestamp, keeping local'
      };
    }
  }

  async resolveLocalWins(conflict) {
    const { localRecord } = conflict;
    
    return {
      resolution: 'local',
      record: localRecord,
      reason: 'Local record takes precedence'
    };
  }

  async resolveRemoteWins(conflict) {
    const { remoteRecord } = conflict;
    
    return {
      resolution: 'remote',
      record: remoteRecord,
      reason: 'Remote record takes precedence'
    };
  }

  async resolveMerge(conflict) {
    const { table, localRecord, remoteRecord } = conflict;
    
    try {
      // Table-specific merge logic
      switch (table) {
        case 'products':
          return await this.mergeProducts(localRecord, remoteRecord);
        
        case 'sales':
          return await this.mergeSales(localRecord, remoteRecord);
        
        case 'customers':
          return await this.mergeCustomers(localRecord, remoteRecord);
        
        case 'users':
          return await this.mergeUsers(localRecord, remoteRecord);
        
        default:
          return await this.mergeGeneric(localRecord, remoteRecord);
      }
    } catch (error) {
      console.error(`Merge error for table ${table}:`, error);
      // Fallback to latest wins
      return await this.resolveLatestWins(conflict);
    }
  }

  async mergeProducts(local, remote) {
    const merged = { ...local };
    
    // Merge logic for products
    // Keep the higher selling price
    if (remote.selling_price > local.selling_price) {
      merged.selling_price = remote.selling_price;
    }
    
    // Keep the lower buying price (better for profit)
    if (remote.buying_price < local.buying_price) {
      merged.buying_price = remote.buying_price;
    }
    
    // Sum the stock if both have been updated
    if (remote.current_stock !== local.current_stock) {
      // Use the more recent stock value based on timestamps
      const localTime = new Date(local.updated_at);
      const remoteTime = new Date(remote.updated_at);
      merged.current_stock = remoteTime > localTime ? remote.current_stock : local.current_stock;
    }
    
    // Keep the lower minimum stock
    if (remote.minimum_stock < local.minimum_stock) {
      merged.minimum_stock = remote.minimum_stock;
    }
    
    // Merge non-critical fields (prefer remote if local is null/empty)
    if (!local.category && remote.category) merged.category = remote.category;
    if (!local.barcode && remote.barcode) merged.barcode = remote.barcode;
    if (!local.sku && remote.sku) merged.sku = remote.sku;
    if (!local.supplier_id && remote.supplier_id) merged.supplier_id = remote.supplier_id;
    
    // Update metadata
    merged.updated_at = new Date().toISOString();
    merged.sync_status = 'synced';
    merged.merge_conflict = true;
    
    return {
      resolution: 'merge',
      record: merged,
      reason: 'Merged product records'
    };
  }

  async mergeSales(local, remote) {
    // Sales should generally not be merged as they represent transactions
    // Use latest wins strategy for sales
    return await this.resolveLatestWins({ table: 'sales', localRecord: local, remoteRecord: remote });
  }

  async mergeCustomers(local, remote) {
    const merged = { ...local };
    
    // Merge customer data
    // Sum loyalty points and total spent
    if (remote.loyalty_points !== local.loyalty_points) {
      merged.loyalty_points = Math.max(local.loyalty_points, remote.loyalty_points);
    }
    
    if (remote.total_spent !== local.total_spent) {
      merged.total_spent = Math.max(local.total_spent, remote.total_spent);
    }
    
    // Use the higher visit count
    if (remote.visit_count > local.visit_count) {
      merged.visit_count = remote.visit_count;
    }
    
    // Use the more recent last visit
    const localLastVisit = local.last_visit ? new Date(local.last_visit) : new Date(0);
    const remoteLastVisit = remote.last_visit ? new Date(remote.last_visit) : new Date(0);
    if (remoteLastVisit > localLastVisit) {
      merged.last_visit = remote.last_visit;
    }
    
    // Merge contact info (prefer more complete data)
    if (!local.email && remote.email) merged.email = remote.email;
    if (!local.phone && remote.phone) merged.phone = remote.phone;
    if (!local.notes && remote.notes) merged.notes = remote.notes;
    
    merged.updated_at = new Date().toISOString();
    merged.sync_status = 'synced';
    merged.merge_conflict = true;
    
    return {
      resolution: 'merge',
      record: merged,
      reason: 'Merged customer records'
    };
  }

  async mergeUsers(local, remote) {
    const merged = { ...local };
    
    // For users, be careful with sensitive data
    // Keep local password/pin
    // Merge non-sensitive fields
    
    if (!local.email && remote.email) merged.email = remote.email;
    if (!local.phone && remote.phone) merged.phone = remote.phone;
    
    // Don't merge role, pin, or password_hash for security
    
    merged.updated_at = new Date().toISOString();
    merged.sync_status = 'synced';
    merged.merge_conflict = true;
    
    return {
      resolution: 'merge',
      record: merged,
      reason: 'Merged user records (sensitive fields preserved)'
    };
  }

  async mergeGeneric(local, remote) {
    const merged = { ...local };
    
    // Generic merge strategy
    // For each field, use the non-null value from the most recently updated record
    const localTime = new Date(local.updated_at);
    const remoteTime = new Date(remote.updated_at);
    const useRemote = remoteTime > localTime;
    
    Object.keys(remote).forEach(key => {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        if (useRemote && remote[key] !== null && remote[key] !== undefined) {
          merged[key] = remote[key];
        }
      }
    });
    
    merged.updated_at = new Date().toISOString();
    merged.sync_status = 'synced';
    merged.merge_conflict = true;
    
    return {
      resolution: 'merge',
      record: merged,
      reason: 'Generic merge applied'
    };
  }

  async resolveManual(conflict) {
    const { table, localRecord, remoteRecord, manualChoice } = conflict;
    
    if (!manualChoice) {
      throw new Error('Manual resolution requires a choice');
    }
    
    switch (manualChoice) {
      case 'local':
        return {
          resolution: 'local',
          record: localRecord,
          reason: 'Manual choice: use local'
        };
      
      case 'remote':
        return {
          resolution: 'remote',
          record: remoteRecord,
          reason: 'Manual choice: use remote'
        };
      
      default:
        throw new Error(`Invalid manual choice: ${manualChoice}`);
    }
  }

  // Batch conflict resolution
  async resolveConflicts(conflicts, strategy = 'latest_wins') {
    const results = [];
    
    for (const conflict of conflicts) {
      try {
        const result = await this.resolveConflict({ ...conflict, strategy });
        results.push({
          ...conflict,
          ...result,
          success: true
        });
      } catch (error) {
        console.error(`Failed to resolve conflict for ${conflict.table}:${conflict.id}:`, error);
        results.push({
          ...conflict,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Apply resolved conflicts to database
  async applyResolutions(resolutions) {
    const results = [];
    
    for (const resolution of resolutions) {
      try {
        if (!resolution.success) {
          results.push({
            ...resolution,
            applied: false,
            error: resolution.error
          });
          continue;
        }

        const { table, record, resolution: resType } = resolution;
        
        // Apply the resolved record
        const columns = Object.keys(record);
        const placeholders = columns.map(() => '?').join(',');
        
        await db.prepare(`
          INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})
        `).run(...Object.values(record));
        
        results.push({
          ...resolution,
          applied: true
        });
        
        console.log(`Applied ${resType} resolution for ${table}:${record.id}`);
      } catch (error) {
        console.error(`Failed to apply resolution for ${resolution.table}:${resolution.record?.id}:`, error);
        results.push({
          ...resolution,
          applied: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Get conflict statistics
  async getConflictStats(from, to) {
    try {
      const stats = {};
      
      // This would require a sync_conflicts table
      // For now, return mock stats
      stats.total_conflicts = 0;
      stats.resolved_conflicts = 0;
      stats.pending_conflicts = 0;
      stats.conflicts_by_table = {};
      stats.conflicts_by_type = {};
      
      return stats;
    } catch (error) {
      console.error('Get conflict stats error:', error);
      return {};
    }
  }

  // Auto-resolution rules
  getAutoResolutionStrategy(table, conflictType) {
    const rules = {
      'products': {
        'stock_conflict': 'merge',
        'price_conflict': 'latest_wins',
        'info_conflict': 'merge'
      },
      'sales': {
        'duplicate_conflict': 'latest_wins',
        'status_conflict': 'local_wins'
      },
      'customers': {
        'points_conflict': 'merge',
        'info_conflict': 'merge'
      },
      'users': {
        'role_conflict': 'local_wins',
        'info_conflict': 'merge'
      }
    };
    
    return rules[table]?.[conflictType] || 'latest_wins';
  }

  // Detect conflict type
  detectConflictType(local, remote) {
    if (local.current_stock !== remote.current_stock) {
      return 'stock_conflict';
    }
    
    if (local.selling_price !== remote.selling_price || local.buying_price !== remote.buying_price) {
      return 'price_conflict';
    }
    
    if (local.loyalty_points !== remote.loyalty_points) {
      return 'points_conflict';
    }
    
    if (local.role !== remote.role) {
      return 'role_conflict';
    }
    
    if (local.status !== remote.status) {
      return 'status_conflict';
    }
    
    return 'info_conflict';
  }

  // Create conflict record for manual review
  async createConflictRecord(conflict) {
    try {
      const conflictId = `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // This would require a sync_conflicts table
      // For now, just log the conflict
      console.log(`Conflict created: ${conflictId}`, conflict);
      
      return conflictId;
    } catch (error) {
      console.error('Create conflict record error:', error);
      return null;
    }
  }
}

module.exports = new ConflictResolver();
