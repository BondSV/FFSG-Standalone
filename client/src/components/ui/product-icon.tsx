import React from "react";

interface ProductIconProps {
  productId: 'jacket' | 'dress' | 'pants' | string;
  size?: number;
}

export function ProductIcon({ productId, size = 20 }: ProductIconProps) {
  const emoji = productId === 'jacket' ? '🧥' : productId === 'dress' ? '👗' : productId === 'pants' ? '👖' : '👕';
  const dimension = `${size}px`;
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-md bg-gray-100 text-base"
      style={{ width: dimension, height: dimension, fontSize: Math.max(14, Math.floor(size * 0.8)) }}
      title={productId === 'jacket' ? 'Jacket' : productId === 'dress' ? 'Dress' : productId === 'pants' ? 'Pants' : 'Product'}
    >
      {emoji}
    </span>
  );
}
