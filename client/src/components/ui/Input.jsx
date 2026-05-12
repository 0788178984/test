import React from 'react';

const Input = ({
  type = 'text',
  label,
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  className = '',
  multiline = false,
  rows = 3,
  ...props
}) => {
  const fieldClass = `form-input ${className}`.trim();

  return (
    <div className="mb-4">
      {label && (
        <label className="form-label">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}

      {multiline ? (
        <textarea
          value={value ?? ''}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          rows={rows}
          className={fieldClass}
          {...props}
        />
      ) : (
        <input
          type={type}
          value={value ?? ''}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={fieldClass}
          {...props}
        />
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  );
};

export default Input;
