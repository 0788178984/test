import React from 'react';
import { formatCurrencyParts } from '../../api/client';

/**
 * UGX display with a lighter currency symbol so large amounts stay readable in cards.
 */
const Currency = ({ amount, className = '', symbolClassName = '', amountClassName = '' }) => {
  const { minus, symbol, number, literal } = formatCurrencyParts(amount);

  return (
    <span className={`currency-display ${className}`} title={`${minus}${symbol}${literal}${number}`}>
      {minus ? <span className={`currency-minus ${amountClassName}`}>{minus}</span> : null}
      <span className={`currency-symbol ${symbolClassName}`}>{symbol}</span>
      <span className={`currency-amount ${amountClassName}`}>
        {literal}
        {number}
      </span>
    </span>
  );
};

export default Currency;
