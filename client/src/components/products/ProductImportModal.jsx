import React, { useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { productsAPI, downloadBlobResponse, handleApiError } from '../../api/client';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

const ProductImportModal = ({ isOpen, onClose, onImported }) => {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);

  const reset = () => {
    setFile(null);
    setResults(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      const response = await productsAPI.downloadImportTemplate();
      downloadBlobResponse(response, 'product_import_template.xlsx');
      toast.success('Template downloaded');
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Choose an Excel file first');
      return;
    }
    setUploading(true);
    setResults(null);
    try {
      const response = await productsAPI.importFromExcel(file);
      setResults(response.data);
      toast.success(response.data.message || 'Import complete');
      onImported?.();
    } catch (error) {
      const { message } = handleApiError(error);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import products from Excel" size="lg">
      <div className="space-y-5">
        <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-4 text-sm text-gray-700">
          <p className="font-medium text-gray-900">How it works</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Download the template and fill the <strong>Products</strong> sheet.</li>
            <li>Keep column headers unchanged. Required: name, buying_price, selling_price.</li>
            <li>Upload the completed file — up to 2,000 rows per import.</li>
          </ol>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="secondary" onClick={handleDownloadTemplate} disabled={downloading}>
            <Download className="mr-2 h-4 w-4" />
            {downloading ? 'Downloading…' : 'Download template'}
          </Button>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Upload className="mr-2 h-4 w-4" />
            {file ? file.name : 'Choose .xlsx file'}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setResults(null);
              }}
            />
          </label>
        </div>

        {file && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-green-700" />
            <span className="min-w-0 truncate">{file.name}</span>
            <span className="text-gray-500">({Math.round(file.size / 1024)} KB)</span>
          </div>
        )}

        {results && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <p className="font-medium text-gray-900">
              {results.created} created · {results.skipped} skipped
            </p>
            {results.errors?.length > 0 && (
              <div className="mt-3 max-h-48 overflow-y-auto rounded border border-amber-100 bg-amber-50/50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Row issues
                </p>
                <ul className="space-y-1 text-amber-950">
                  {results.errors.slice(0, 20).map((err) => (
                    <li key={`${err.row}-${err.name}`}>
                      Row {err.row} ({err.name}): {err.error}
                    </li>
                  ))}
                  {results.errors.length > 20 && (
                    <li className="text-amber-800">…and {results.errors.length - 20} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Close
          </Button>
          <Button type="button" variant="primary" onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? 'Importing…' : 'Upload & import'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ProductImportModal;
