import React from 'react';

const Table = ({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data available',
  className = '',
  onRowClick,
  ...props
}) => {
  const handleRowClick = (row, index) => {
    if (onRowClick) {
      onRowClick(row, index);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <table className={`table w-full ${className}`} {...props}>
      {/* Table Header */}
      <thead>
        <tr>
          {columns.map((column, index) => (
            <th
              key={index}
              className={column.headerClassName || ''}
              style={column.headerStyle || {}}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>

      {/* Table Body */}
      <tbody>
        {data.map((row, rowIndex) => (
          <tr
            key={row?.id != null ? String(row.id) : rowIndex}
            onClick={() => handleRowClick(row, rowIndex)}
            className={onRowClick ? 'hover:bg-gray-50 cursor-pointer' : ''}
          >
            {columns.map((column, colIndex) => (
              <td
                key={colIndex}
                className={column.cellClassName || ''}
                style={column.cellStyle || {}}
              >
                {column.render ? column.render(row) : row[column.accessor]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default Table;
