import React, { useState, useEffect, useRef } from 'react';
import { Search, Package, Filter } from 'lucide-react';
import { productsAPI, formatCurrency } from '../../api/client';
import AddQuantityModal from './AddQuantityModal';

const ProductSearch = ({ onProductSelect, searchQuery, setSearchQuery }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [pickerProduct, setPickerProduct] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await productsAPI.getCategories();
      setCategories(response.data.categories || []);
    } catch (error) {
      console.error('Fetch categories error:', error);
    }
  };

  const fetchBrowse = async () => {
    setLoading(true);
    try {
      const response = await productsAPI.getAll({
        category: selectedCategory || undefined,
        limit: 36,
      });
      setProducts(response.data.products || []);
    } catch (error) {
      console.error('Browse products error:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const searchProducts = async (q) => {
    if (!q.trim()) {
      await fetchBrowse();
      return;
    }
    setLoading(true);
    try {
      const response = await productsAPI.getAll({
        search: q,
        category: selectedCategory || undefined,
        limit: 36,
      });
      setProducts(response.data.products || []);
    } catch (error) {
      console.error('Product search error:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchProducts(searchQuery);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, selectedCategory]);

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
  };

  const openQuantityPicker = (product) => {
    setPickerProduct(product);
  };

  const confirmQuantity = (qty) => {
    if (!pickerProduct) return;
    onProductSelect(pickerProduct, qty);
    setPickerProduct(null);
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, SKU, barcode — or leave empty to browse"
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <button
          type="button"
          title="All categories"
          onClick={() => handleCategoryChange('')}
          className={`rounded-lg p-2 transition-colors ${
            selectedCategory === '' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <Filter className="h-5 w-5" />
        </button>
      </div>

      {categories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleCategoryChange('')}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              selectedCategory === '' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => handleCategoryChange(category)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                selectedCategory === category ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        </div>
      )}

      {!loading && (
        <div className="product-grid-pos max-h-[28rem] overflow-y-auto pr-1">
          {products.length === 0 ? (
            <div className="col-span-full py-8 text-center">
              <Package className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="text-gray-500">No products</p>
              <p className="text-sm text-gray-400">Try another search or category</p>
            </div>
          ) : (
            products.map((product) => (
              <div
                key={product.id}
                role="button"
                tabIndex={0}
                className="product-card-pos cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                onClick={() => openQuantityPicker(product)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openQuantityPicker(product);
                  }
                }}
              >
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt=""
                    className="mb-2 h-20 w-full rounded-lg object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="mb-2 flex h-20 w-full items-center justify-center rounded-lg bg-gray-100">
                    <Package className="h-8 w-8 text-gray-400" />
                  </div>
                )}

                <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-gray-900">{product.name}</h3>
                {product.sku && <p className="text-xs text-gray-500">SKU {product.sku}</p>}
                <p className="mt-1 text-xs text-gray-600">
                  Stock:{' '}
                  <span className={product.current_stock <= product.minimum_stock ? 'font-semibold text-red-600' : 'text-green-700'}>
                    {product.current_stock} {product.unit || 'pcs'}
                  </span>
                </p>
                <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
                  <p className="min-w-0 shrink text-base font-bold leading-tight text-primary-600 tabular-nums sm:text-lg">
                    {formatCurrency(product.selling_price)}
                  </p>
                  {product.barcode && (
                    <span className="max-w-[5rem] shrink-0 truncate font-mono text-[10px] text-gray-400">{product.barcode}</span>
                  )}
                </div>

                <span className="mt-2 block w-full rounded-lg bg-primary-600 py-2.5 text-center text-sm font-medium text-white hover:bg-primary-700">
                  Add to cart
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {pickerProduct && (
        <AddQuantityModal product={pickerProduct} onConfirm={confirmQuantity} onCancel={() => setPickerProduct(null)} />
      )}
    </div>
  );
};

export default ProductSearch;
