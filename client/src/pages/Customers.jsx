import React, { useState, useEffect } from 'react';
import { Users, Search, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { customersAPI } from '../api/client';
import { formatCurrency, formatDate, formatPhoneNumber, handleApiError } from '../api/client';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';

const Customers = () => {
  const { hasRole } = useAuthStore();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchCustomers();
  }, [searchQuery]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await customersAPI.getAll({ search: searchQuery });
      setCustomers(response.data.customers || []);
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = () => {
    setEditingCustomer({});
    setFormData({
      name: '',
      phone: '',
      email: '',
      notes: '',
      credit_enabled: false,
      credit_limit: '',
    });
    setShowModal(true);
  };

  const handleEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      notes: customer.notes || '',
      credit_enabled: Boolean(customer.credit_enabled),
      credit_limit: customer.credit_limit ? String(customer.credit_limit) : '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const payload = {
        ...formData,
        credit_enabled: Boolean(formData.credit_enabled),
        credit_limit: formData.credit_limit ? Number(formData.credit_limit) : 0,
      };
      if (editingCustomer?.id) {
        await customersAPI.update(editingCustomer.id, payload);
        toast.success('Customer updated');
      } else {
        await customersAPI.create(payload);
        toast.success('Customer added');
      }

      setShowModal(false);
      setEditingCustomer(null);
      setFormData({});
      fetchCustomers();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleDeleteCustomer = async (customer) => {
    if (window.confirm(`Are you sure you want to delete "${customer.name}"?`)) {
      try {
        await customersAPI.delete(customer.id);
        toast.success('Customer removed');
        fetchCustomers();
      } catch (error) {
        const { message } = handleApiError(error);
        toast.error(message);
      }
    }
  };

  const renderActions = (row) => {
    return (
      <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
        {hasRole('admin', 'manager', 'cashier') && (
          <button
            type="button"
            onClick={() => handleEditCustomer(row)}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title="Edit customer"
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
        )}

        {hasRole('admin') && (
          <button
            type="button"
            onClick={() => handleDeleteCustomer(row)}
            className="p-1 rounded hover:bg-red-50 transition-colors"
            title="Delete customer"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        )}
      </div>
    );
  };

  const columns = [
    { header: 'Name', accessor: 'name' },
    { header: 'Phone', accessor: 'phone', render: (row) => formatPhoneNumber(row.phone || '') },
    { header: 'Email', accessor: 'email' },
    { header: 'Total Spent', accessor: 'total_spent', render: (row) => formatCurrency(row.total_spent) },
    { header: 'Loyalty Points', accessor: 'loyalty_points' },
    {
      header: 'Credit',
      accessor: 'credit_balance',
      render: (row) =>
        row.credit_enabled ? (
          <span title={`Limit: ${formatCurrency(row.credit_limit || 0)}`}>
            {formatCurrency(row.credit_balance || 0)}
          </span>
        ) : (
          '—'
        ),
    },
    { header: 'Visits', accessor: 'visit_count' },
    {
      header: 'Last Visit',
      accessor: 'last_visit',
      render: (row) => (row.last_visit ? formatDate(row.last_visit) : '—'),
    },
    { header: 'Actions', accessor: 'actions', cellClassName: 'text-right', render: renderActions },
  ];

  if (!hasRole('admin', 'manager', 'cashier')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h2 className="text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        {hasRole('admin', 'manager', 'cashier') && (
          <Button onClick={handleCreateCustomer} variant="primary">
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name, phone, or email..."
            className="pl-10"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl shadow-sm">
        <Table
          columns={columns}
          data={customers}
          loading={loading}
          emptyMessage="No customers found"
          onRowClick={(row) => hasRole('admin', 'manager', 'cashier') && handleEditCustomer(row)}
        />
      </div>

      {/* Customer Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingCustomer(null);
          setFormData({});
        }}
        title={editingCustomer?.id ? 'Edit Customer' : 'Add New Customer'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
            
            <Input
              label="Phone Number"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="0756XXXXXX"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email Address"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
            />
            
            <Input
              label="Notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              multiline
              rows={4}
            />
          </div>

          {hasRole('admin', 'manager') && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-violet-900">Credit account (pay later)</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="credit_enabled"
                  checked={Boolean(formData.credit_enabled)}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, credit_enabled: e.target.checked }))
                  }
                  className="rounded border-gray-300"
                />
                Enable credit sales for this customer
              </label>
              {formData.credit_enabled && (
                <Input
                  label="Credit limit (UGX, 0 = no limit)"
                  name="credit_limit"
                  type="number"
                  min={0}
                  value={formData.credit_limit}
                  onChange={handleInputChange}
                />
              )}
            </div>
          )}

          <div className="flex justify-end space-x-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                setEditingCustomer(null);
                setFormData({});
              }}
            >
              Cancel
            </Button>
            
            <Button
              variant="primary"
              type="submit"
            >
              {editingCustomer?.id ? 'Update Customer' : 'Add Customer'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Customers;
