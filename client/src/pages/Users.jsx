import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, Search, Edit, Trash2, Key } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { usersAPI } from '../api/client';
import { handleApiError } from '../api/client';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';

const Users = () => {
  const { hasRole } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  const roles = ['admin', 'manager', 'cashier'];

  useEffect(() => {
    fetchUsers();
  }, [searchQuery]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const response = await usersAPI.getAll(params);
      setUsers(response.data.users || []);
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'cashier',
      pin: '',
      password: '',
      is_active: true,
    });
    setShowModal(true);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      pin: '',
      password: '',
      is_active: Boolean(user.is_active),
    });
    setShowModal(true);
  };

  const handleDeleteUser = async (user) => {
    if (window.confirm(`Are you sure you want to delete "${user.name}"?`)) {
      try {
        await usersAPI.delete(user.id);
        toast.success('User removed');
        fetchUsers();
      } catch (error) {
        const { message } = handleApiError(error);
        toast.error(message);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingUser?.id) {
        const payload = {
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          role: formData.role,
          is_active: formData.is_active,
        };
        if (formData.pin && /^\d{4}$/.test(formData.pin)) payload.pin = formData.pin;
        if (formData.password && formData.password.length >= 8) payload.password = formData.password;

        await usersAPI.update(editingUser.id, payload);
        toast.success('User updated');
      } else {
        if (!formData.pin && !formData.password) {
          toast.error('Enter a 4-digit PIN and/or a web password (8+ characters)');
          return;
        }
        if (formData.pin && !/^\d{4}$/.test(formData.pin)) {
          toast.error('PIN must be exactly 4 digits');
          return;
        }
        if (formData.password && formData.password.length < 8) {
          toast.error('Web password must be at least 8 characters');
          return;
        }

        await usersAPI.create({
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          role: formData.role,
          pin: formData.pin || undefined,
          password: formData.password || undefined,
        });
        toast.success('User created');
      }

      setShowModal(false);
      setEditingUser(null);
      setFormData({});
      fetchUsers();
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

  const handleResetPin = async (userId) => {
    const raw = window.prompt('Enter new 4-digit PIN for this user:');
    if (raw == null) return;
    const newPin = String(raw).trim();
    if (!/^\d{4}$/.test(newPin)) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    try {
      await usersAPI.resetPin(userId, newPin);
      toast.success('PIN updated');
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    }
  };

  const renderActions = (row) => {
    return (
      <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => handleEditUser(row)}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
          title="Edit user"
        >
          <Edit className="w-4 h-4 text-blue-600" />
        </button>

        <button
          type="button"
          onClick={() => handleResetPin(row.id)}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
          title="Reset PIN"
        >
          <Key className="w-4 h-4 text-yellow-600" />
        </button>

        <button
          type="button"
          onClick={() => handleDeleteUser(row)}
          className="p-1 rounded hover:bg-red-50 transition-colors"
          title="Delete user"
        >
          <Trash2 className="w-4 h-4 text-red-600" />
        </button>
      </div>
    );
  };

  const columns = [
    { header: 'Name', accessor: 'name' },
    { header: 'Email', accessor: 'email' },
    {
      header: 'Role',
      accessor: 'role',
      render: (row) => <span className="badge badge-info capitalize">{row.role}</span>,
    },
    {
      header: 'Status',
      accessor: 'is_active',
      render: (row) => (
        <span className={`badge badge-${row.is_active ? 'success' : 'danger'}`}>
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      header: 'Last Login',
      accessor: 'last_login',
      render: (row) => (row.last_login ? new Date(row.last_login).toLocaleString() : 'Never'),
    },
    { header: 'Actions', accessor: 'actions', cellClassName: 'text-right', render: renderActions },
  ];

  if (!hasRole('admin')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
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
        <h1 className="text-2xl font-bold text-gray-900">Users Management</h1>
        <Button onClick={handleCreateUser} variant="primary">
          Add User
        </Button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm">
        <Table
          columns={columns}
          data={users}
          loading={loading}
          emptyMessage="No users found"
          onRowClick={(row) => handleEditUser(row)}
        />
      </div>

      {/* User Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingUser(null);
          setFormData({});
        }}
        title={editingUser?.id ? 'Edit user' : 'Add user'}
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
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              required
            />

            <Input
              label="Phone (optional)"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="+256..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="mb-4">
              <label className="form-label">
                Role<span className="ml-1 text-red-500">*</span>
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
                className="form-input"
                required
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            {!editingUser?.id ? (
              <>
                <Input
                  label="4-digit PIN (for till login)"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={formData.pin}
                  onChange={handleInputChange}
                  placeholder="e.g. 1234"
                  maxLength={4}
                />
                <Input
                  label="Web password (optional, 8+ chars)"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="For email login"
                />
              </>
            ) : (
              <>
                <Input
                  label="New PIN (optional)"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  value={formData.pin}
                  onChange={handleInputChange}
                  placeholder="Leave blank to keep current"
                  maxLength={4}
                />
                <Input
                  label="New web password (optional)"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="8+ characters"
                />
              </>
            )}
          </div>

          <div className="flex items-center">
            <Input
              label="Active Status"
              name="is_active"
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                is_active: e.target.checked
              }))}
              className="w-auto"
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-4 pt-6">
            <Button
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                setEditingUser(null);
                setFormData({});
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
            >
              {editingUser?.id ? 'Update User' : 'Add User'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Users;
