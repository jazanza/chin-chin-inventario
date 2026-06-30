import { describe, expect, it } from 'vitest';
import { buildOrdersBySupplier, mergeSavedOrdersWithSuggestions } from '../OrderGenerationModule';
import { buildSessionDateKey, InventoryItem } from '../../context/InventoryContext';

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

  it('distingue productos con el mismo nombre usando productId', () => {
    const suggested = buildOrdersBySupplier([
      {
        ...baseItem,
        productId: 1,
        productName: 'Producto repetido',
        physicalQuantity: 10,
        rules: [{ minStock: 3, orderAmount: 0 }],
      },
      {
        ...baseItem,
        productId: 2,
        productName: 'Producto repetido',
        physicalQuantity: 10,
        rules: [{ minStock: 3, orderAmount: 0 }],
      },
    ]);

    const merged = mergeSavedOrdersWithSuggestions(suggested, {
      'Proveedor A': [
        {
          productId: 2,
          product: 'Producto repetido',
          quantityToOrder: 0,
          finalOrderQuantity: 3,
        },
      ],
    });

    expect(merged['Proveedor A'][0]).toMatchObject({
      productId: 1,
      finalOrderQuantity: 0,
    });
    expect(merged['Proveedor A'][1]).toMatchObject({
      productId: 2,
      finalOrderQuantity: 3,
    });
  });

  it('genera claves de sesión separadas para semanal y mensual en la misma fecha', () => {
    const timestamp = new Date('2026-06-29T12:00:00.000Z');

    expect(buildSessionDateKey('weekly', timestamp)).toBe('2026-06-29-weekly');
    expect(buildSessionDateKey('monthly', timestamp)).toBe('2026-06-29-monthly');
  });
});
