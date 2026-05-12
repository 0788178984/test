import React, { useState, useEffect } from 'react';
import { Edit, Trash2, Phone, Mail, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { suppliersAPI } from '../api/client';
import { formatPhoneNumber, handleApiError } from '../api/client';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';

const Suppliers = () => {
  const { hasRole } = useAuthStore();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const response = await suppliersAPI.getAll();
      setSuppliers(response.data.suppliers || []);
    } catch (error) {
      console.error('Fetch suppliers error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSupplier = () => {
    setEditingSupplier({});
    setFormData({
      name: '',
      contact_name: '',
      phone: '',
      email: '',
      address: '',
      tin_number: '',
      payment_terms: '',
      notes: ''
    });
    setShowModal(true);
  };

  const handleEditSupplier = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact_name: supplier.contact_name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      tin_number: supplier.tin_number,
      payment_terms: supplier.payment_terms,
      notes: supplier.notes
    });
    setShowModal(true);
  };

  const handleDeleteSupplier = async (supplier) => {
    if (window.confirm(`Are you sure you want to delete "${supplier.name}"?`)) {
      try {
        await suppliersAPI.delete(supplier.id);
        toast.success('Supplier removed');
        fetchSuppliers();
      } catch (error) {
        const { message } = handleApiError(error);
        toast.error(message);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingSupplier?.id) {
        await suppliersAPI.update(editingSupplier.id, formData);
      } else {
        await suppliersAPI.create(formData);
      }
      
      setShowModal(false);
      setEditingSupplier(null);
      setFormData({});
      fetchSuppliers();
      toast.success(editingSupplier?.id ? 'Supplier updated' : 'Supplier added');
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

  const renderActions = (row) => (
    <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
      {hasRole('admin', 'manager') && (
        <button
          type="button"
          onClick={() => handleEditSupplier(row)}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
          title="Edit supplier"
        >
          <Edit className="w-4 h-4 text-blue-600" />
        </button>
      )}
      {hasRole('admin') && (
        <button
          type="button"
          onClick={() => handleDeleteSupplier(row)}
          className="p-1 rounded hover:bg-red-50 transition-colors"
          title="Delete supplier"
        >
          <Trash2 className="w-4 h-4 text-red-600" />
        </button>
      )}
    </div>
  );

  const columns = [
    { header: 'Name', accessor: 'name' },
    { header: 'Contact Person', accessor: 'contact_name' },
    { header: 'Phone', accessor: 'phone', render: (row) => formatPhoneNumber(row.phone || '') },
    { header: 'Email', accessor: 'email' },
    { header: 'Payment Terms', accessor: 'payment_terms' },
    { header: 'Actions', accessor: 'actions', cellClassName: 'text-right', render: renderActions },
  ];

  if (!hasRole('admin', 'manager')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Phone className="w-12 h-12 mx-auto mb-4 text-gray-300" />
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
        <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
        <Button onClick={handleCreateSupplier} variant="primary">
          Add Supplier
        </Button>
      </div>

      {/* Suppliers Table */}
      <Table
        columns={columns}
        data={suppliers}
        loading={loading}
        emptyMessage="No suppliers found"
        onRowClick={(row) => hasRole('admin', 'manager') && handleEditSupplier(row)}
      />

      {/* Supplier Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingSupplier(null);
          setFormData({});
        }}
        title={editingSupplier?.id ? 'Edit Supplier' : 'Add New Supplier'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Supplier Name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
            
            <Input
              label="Contact Person"
              name="contact_name"
              value={formData.contact_name}
              onChange={handleInputChange}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Phone Number"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="0756XXXXXX"
            />
            
            <Input
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="email@example.com"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Physical Address"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              placeholder="123 Kampala Road"
            />
            
            <Input
              label="TIN Number"
              name="tin_number"
              value={formData.tin_number}
              onChange={handleInputChange}
              placeholder="1001234567"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Payment Terms"
              name="payment_terms"
              value={formData.payment_terms}
              onChange={handleInputChange}
              placeholder="30 days"
            />
            
            <Input
              label="Notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              multiline
              rows={3}
              placeholder="Additional notes about this supplier"
            />
          </div>

          <div className="flex justify-end space-x-4 pt-6">
            <Button
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                setEditingSupplier(null);
                setFormData({});
              }}
            >
              Cancel
            </Button>
            
            <Button
              variant="primary"
              type="submit"
            >
              {editingSupplier?.id ? 'Update Supplier' : 'Add Supplier'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Suppliers;
