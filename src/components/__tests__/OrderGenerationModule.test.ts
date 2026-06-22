import { describe, expect, it } from 'vitest';
import { buildOrdersBySupplier, mergeSavedOrdersWithSuggestions } from '../OrderGenerationModule';
import { InventoryItem } from '../../context/InventoryContext';

const baseItem: InventoryItem = {
  productId: 1,
  productName: 'Producto A',
  category: 'Cat 1',
  systemQuantity: 2,
  physicalQuantity: 2,
  averageSales: 0,
  supplier: 'Proveedor A',
  rules: [{ minStock: 3, orderAmount: 6 }],
};

describe('OrderGenerationModule helpers', () => {
  it('recalcula pedidos guardados cuando cambian las condiciones del producto', () => {
    const suggested = buildOrdersBySupplier([
      {
        ...baseItem,
        rules: [{ minStock: 3, orderAmount: 12 }],
      },
    ]);

    const merged = mergeSavedOrdersWithSuggestions(suggested, {
      'Proveedor A': [
        {
          product: 'Producto A',
          quantityToOrder: 6,
          finalOrderQuantity: 6,
        },
      ],
    });

    expect(merged['Proveedor A'][0]).toMatchObject({
      quantityToOrder: 12,
      finalOrderQuantity: 12,
    });
  });

  it('conserva cantidades finales ajustadas manualmente', () => {
    const suggested = buildOrdersBySupplier([
      {
        ...baseItem,
        rules: [{ minStock: 3, orderAmount: 12 }],
      },
    ]);

    const merged = mergeSavedOrdersWithSuggestions(suggested, {
      'Proveedor A': [
        {
          product: 'Producto A',
          quantityToOrder: 6,
          finalOrderQuantity: 9,
        },
      ],
    });

    expect(merged['Proveedor A'][0]).toMatchObject({
      quantityToOrder: 12,
      finalOrderQuantity: 9,
    });
  });
});

