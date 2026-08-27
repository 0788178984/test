import React from 'react';
import Card from './Card';
import Currency from './Currency';

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

  const valueNode =
    currency && typeof value === 'number' ? (
      <Currency amount={value} className={valueCls} amountClassName={valueClassName} />
    ) : (
      <p className={valueCls}>{value}</p>
    );

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
          {valueNode}
          {label && <p className="stat-label">{label}</p>}
          {hint && <p className="stat-hint">{hint}</p>}
        </div>
      </div>
    </Card>
  );
};

export const StatValue = ({ children, amount, currency = false, className = '' }) => (
  <p className={currency ? `stat-value-currency ${className}` : `stat-value ${className}`}>
    {currency && typeof amount === 'number' ? <Currency amount={amount} /> : children}
  </p>
);

export default StatCard;
