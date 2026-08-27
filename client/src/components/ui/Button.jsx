import React from 'react';
import { Loader2 } from 'lucide-react';

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  onClick,
  type = 'button',
  ...props
}) => {
  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    disabled || loading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md',
    className
].filter(Boolean).join(' ').trim();

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <div className="flex items-center justify-center">
          <div className="spinner w-4 h-4"></div>
          <span className="ml-2">Loading...</span>
        </div>
      ) : (
        children
      )}
    </button>
  );
};

export default Button;
