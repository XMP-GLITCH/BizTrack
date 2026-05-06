export function formatCurrency(value, currency = 'XAF') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(value);
}
