import React from 'react';
import { formatCurrencyParts } from '../../api/client';

/**
 * UGX display with a lighter currency symbol so large amounts stay readable in cards.
 */
const Currency = ({ amount, className = '', symbolClassName = '', amountClassName = '' }) => {
  const { symbol, number, literal } = formatCurrencyParts(amount);

  return (
    <span className={`currency-display ${className}`} title={`${symbol}${literal}${number}`}>
      <span className={`currency-symbol ${symbolClassName}`}>{symbol}</span>
      <span className={`currency-amount ${amountClassName}`}>
        {literal}
        {number}
      </span>
    </span>
  );
};

export default Currency;
