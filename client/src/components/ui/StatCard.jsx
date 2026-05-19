import React from 'react';
import Card from './Card';

/**
 * Metric card with overflow-safe layout for large numbers and currency strings.
 */
export const StatCard = ({
  icon: Icon,
  iconWrapClassName = 'rounded-full bg-gray-100 p-3',
  iconClassName = 'h-8 w-8 text-gray-600',
  value,
  label,
  hint,
  valueClassName = '',
  currency = false,
  featured = false,
  className = '',
}) => {
  const valueCls = currency
    ? `stat-value-currency ${valueClassName}`
    : `stat-value ${valueClassName}`;

  return (
    <Card
      className={`stat-card min-w-0 ${featured ? 'border-primary-100 bg-gradient-to-br from-primary-50/80 to-white lg:col-span-2' : ''} ${className}`}
    >
      <div className="stat-card__inner">
        {Icon && (
          <div className={`stat-card__icon ${iconWrapClassName}`}>
            <Icon className={iconClassName} aria-hidden />
          </div>
        )}
        <div className="stat-card__content">
          <p className={valueCls}>{value}</p>
          {label && <p className="stat-label">{label}</p>}
          {hint && <p className="stat-hint">{hint}</p>}
        </div>
      </div>
    </Card>
  );
};

export const StatValue = ({ children, currency = false, className = '' }) => (
  <p className={currency ? `stat-value-currency ${className}` : `stat-value ${className}`}>
    {children}
  </p>
);

export default StatCard;
