import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, Filter, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { isClinicStore } from '../constants/businessTypes';
import { productsAPI, suppliersAPI } from '../api/client';
import { formatCurrency, handleApiError } from '../api/client';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';

const Products = () => {
  const { hasRole, user } = useAuthStore();
  const clinicStore = isClinicStore(user);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await productsAPI.getCategories();
        if (!cancelled) {
          setCategories(res.data.categories || res.data.predefined || []);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.business_id, user?.business_type]);

  useEffect(() => {
    fetchProducts();
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await suppliersAPI.getAll({ limit: 500 });
        if (!cancelled) setSuppliers(res.data.suppliers || []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      if (selectedCategory) params.category = selectedCategory;
      
      const response = await productsAPI.getAll(params);
      setProducts(response.data.products || []);
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      category: '',
      sku: '',
      barcode: '',
      unit: 'piece',
      supplier_id: '',
      buying_price: '',
      selling_price: '',
      current_stock: 0,
      minimum_stock: 5,
      expiry_date: '',
      is_active: true,
    });
    setShowModal(true);
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    const exp = product.expiry_date
      ? String(product.expiry_date).slice(0, 10)
      : '';
    setFormData({
      name: product.name || '',
      category: product.category || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      unit: product.unit || 'piece',
      supplier_id: product.supplier_id || '',
      buying_price: product.buying_price ?? '',
      selling_price: product.selling_price ?? '',
      current_stock: product.current_stock ?? 0,
      minimum_stock: product.minimum_stock ?? 5,
      expiry_date: exp,
      is_active: Boolean(product.is_active),
    });
    setShowModal(true);
  };

  const handleDeleteProduct = async (product) => {
    if (window.confirm(`Are you sure you want to delete "${product.name}"?`)) {
      try {
        await productsAPI.delete(product.id);
        toast.success('Product removed');
        fetchProducts();
      } catch (error) {
        const { message } = handleApiError(error);
        toast.error(message);
      }
    }
  };

  const buildPayload = () => {
    const supplierId = formData.supplier_id ? String(formData.supplier_id).trim() : '';
    return {
      name: String(formData.name || '').trim(),
      sku: formData.sku ? String(formData.sku).trim() : null,
      barcode: formData.barcode ? String(formData.barcode).trim() : null,
      category: formData.category ? String(formData.category).trim() : null,
      unit: formData.unit || 'piece',
      supplier_id: supplierId || null,
      buying_price: parseFloat(formData.buying_price),
      selling_price: parseFloat(formData.selling_price),
      tax_rate: 0,
      current_stock: parseFloat(formData.current_stock) || 0,
      minimum_stock: parseFloat(formData.minimum_stock) || 0,
      expiry_date: formData.expiry_date ? String(formData.expiry_date).trim() : null,
      is_active: Boolean(formData.is_active),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = buildPayload();
    if (!payload.name) {
      toast.error('Product name is required');
      return;
    }
    if (Number.isNaN(payload.buying_price) || Number.isNaN(payload.selling_price)) {
      toast.error('Enter valid buying and selling prices');
      return;
    }
    if (payload.selling_price < payload.buying_price) {
      toast.error('Selling price cannot be lower than buying price');
      return;
    }

    try {
      if (editingProduct?.id) {
        await productsAPI.update(editingProduct.id, payload);
        toast.success('Product updated');
      } else {
        await productsAPI.create(payload);
        toast.success('Product added');
      }

      setShowModal(false);
      setEditingProduct(null);
      setFormData({});
      fetchProducts();
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

  const renderActions = (row) => {
    return (
      <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
        {hasRole('admin', 'manager') && (
          <button
            type="button"
            onClick={() => handleEditProduct(row)}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title="Edit product"
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
        )}

        {hasRole('admin') && (
          <button
            type="button"
            onClick={() => handleDeleteProduct(row)}
            className="p-1 rounded hover:bg-red-50 transition-colors"
            title="Delete product"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        )}
      </div>
    );
  };

  const renderStockStatus = (stock, minStock) => {
    if (stock <= minStock) {
      return <span className="badge badge-danger">Low Stock</span>;
    } else if (stock <= minStock * 1.5) {
      return <span className="badge badge-warning">Warning</span>;
    }
    return <span className="badge badge-success">In Stock</span>;
  };

  const columns = [
    { header: 'Name', accessor: 'name' },
    { header: 'Category', accessor: 'category' },
    { header: 'SKU', accessor: 'sku' },
    {
      header: 'Stock',
      accessor: 'current_stock',
      render: (row) => renderStockStatus(Number(row.current_stock), Number(row.minimum_stock)),
    },
    { header: 'Buying Price', accessor: 'buying_price', render: (row) => formatCurrency(row.buying_price) },
    {
      header: 'Selling Price',
      accessor: 'selling_price',
      render: (row) => {
        const below = Number(row.selling_price) < Number(row.buying_price);
        return (
          <span className={below ? 'font-medium text-red-700' : ''}>
            {formatCurrency(row.selling_price)}
            {below ? ' ⚠' : ''}
          </span>
        );
      },
    },
    { header: 'Actions', accessor: 'actions', cellClassName: 'text-right', render: renderActions },
  ];

  if (!hasRole('admin', 'manager')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
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
        <h1 className="text-2xl font-bold text-gray-900">
          {clinicStore ? 'Medicines & supplies' : 'Products Management'}
        </h1>
        {hasRole('admin', 'manager') && (
          <Button
            onClick={handleCreateProduct}
            variant="primary"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search products by name, SKU, or barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="form-input"
            >
              <option value="">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <Table
            columns={columns}
            data={products}
            emptyMessage="No products found"
            onRowClick={(row) => hasRole('admin', 'manager') && handleEditProduct(row)}
          />
        )}
      </div>

      {/* Product Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingProduct(null);
          setFormData({});
        }}
        title={editingProduct?.id ? 'Edit product' : 'Add product'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Product Name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
            
            <Input
              label="SKU"
              name="sku"
              value={formData.sku}
              onChange={handleInputChange}
            />
            
            <div>
              <label className="form-label">
                Category<span className="ml-1 text-red-500">*</span>
              </label>
              <select
                name="category"
                value={formData.category || ''}
                onChange={handleInputChange}
                className="form-input"
                required
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Unit</label>
              <select
                name="unit"
                value={formData.unit || 'piece'}
                onChange={handleInputChange}
                className="form-input"
              >
                <option value="piece">Piece</option>
                <option value="pack">Pack</option>
                <option value="strip">Strip</option>
                <option value="bottle">Bottle</option>
                <option value="tube">Tube</option>
                <option value="vial">Vial</option>
                <option value="litre">Litre</option>
                <option value="kg">Kg</option>
              </select>
            </div>

            <Input
              label="Barcode"
              name="barcode"
              value={formData.barcode}
              onChange={handleInputChange}
            />

            <div>
              <label className="form-label">Supplier (optional)</label>
              <select
                name="supplier_id"
                value={formData.supplier_id || ''}
                onChange={handleInputChange}
                className="form-input"
              >
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Buying Price (UGX)"
              name="buying_price"
              type="number"
              step="0.01"
              min="0"
              value={formData.buying_price}
              onChange={handleInputChange}
              required
            />
            
            <Input
              label="Selling Price (UGX)"
              name="selling_price"
              type="number"
              step="0.01"
              min="0"
              value={formData.selling_price}
              onChange={handleInputChange}
              required
            />
            
            <Input
              label="Current Stock"
              name="current_stock"
              type="number"
              min="0"
              value={formData.current_stock}
              onChange={handleInputChange}
              required
            />
            
            <Input
              label="Minimum Stock"
              name="minimum_stock"
              type="number"
              min="0"
              value={formData.minimum_stock}
              onChange={handleInputChange}
              required
            />

            <Input
              label="Expiry date"
              name="expiry_date"
              type="date"
              value={formData.expiry_date}
              onChange={handleInputChange}
            />
          </div>

          <div className="flex items-center">
            <Input
              label="Active"
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
              type="button"
              onClick={() => {
                setShowModal(false);
                setEditingProduct(null);
                setFormData({});
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
            >
              {editingProduct?.id ? 'Update Product' : 'Add Product'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Products;
