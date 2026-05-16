// Role-based permission checker
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Admin has all permissions
    if (user.role === 'admin') {
      return next();
    }

    // Manager permissions
    if (user.role === 'manager') {
      const managerPermissions = [
        'view_sales', 'make_sale', 'apply_discount', 'void_sale',
        'view_reports', 'export_reports', 'view_products', 'add_edit_products',
        'adjust_stock', 'view_customers', 'manage_customers', 'view_suppliers',
        'manage_suppliers', 'view_notifications', 'view_inventory',
        'view_expenses', 'manage_expenses'
      ];
      
      if (managerPermissions.includes(requiredPermission)) {
        return next();
      }
    }

    // Cashier permissions
    if (user.role === 'cashier') {
      const cashierPermissions = [
        'make_sale', 'apply_small_discount', 'view_own_sales',
        'view_products', 'view_notifications', 'view_inventory',
        'manage_customers'
      ];
      
      // Special case: cashiers can apply small discounts only
      if (requiredPermission === 'apply_discount') {
        return res.status(403).json({ error: 'Cashiers can only apply discounts up to 5%.' });
      }
      
      if (cashierPermissions.includes(requiredPermission)) {
        return next();
      }
    }

    res.status(403).json({ error: 'Insufficient permissions.' });
  };
};

module.exports = { checkPermission };
