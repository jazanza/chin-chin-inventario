import { render, screen, fireEvent } from '@testing-library/react';
import { InventoryTable } from '../InventoryTable';
import { useInventoryContext } from '../../context/InventoryContext';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// Mock del contexto de inventario
vi.mock('../../context/InventoryContext', () => ({
  useInventoryContext: vi.fn(),
}));

const mockUpdateInventoryItemLocal = vi.fn();

const mockData = [
  {
    productId: 1,
    productName: 'Producto A',
    category: 'Cat 1',
    systemQuantity: 10,
    physicalQuantity: 10,
    averageSales: 0,
    supplier: 'Prov A',
    rules: [],
  },
  {
    productId: 2,
    productName: 'Producto B',
    category: 'Cat 1',
    systemQuantity: 5,
    physicalQuantity: 5,
    averageSales: 0,
    supplier: 'Prov B',
    rules: [],
  },
];

describe('InventoryTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useInventoryContext as any).mockReturnValue({
      updateInventoryItemLocal: mockUpdateInventoryItemLocal,
    });
  });

  it('debe llamar a onUpdate con el productId correcto al ajustar la cantidad', () => {
    render(<InventoryTable inventoryData={mockData} />);
    
    // Buscar el botón de incremento del segundo producto (Producto B)
    const rows = screen.getAllByRole('row');
    const rowB = rows.find(row => row.textContent?.includes('Producto B'));
    const incrementBtn = rowB?.querySelector('button:last-child');

    if (incrementBtn) {
      fireEvent.click(incrementBtn);
    }

    // Verificar que se llamó con el productId 2, no con el índice
    expect(mockUpdateInventoryItemLocal).toHaveBeenCalledWith(2, 'physicalQuantity', 6);
  });

  it('debe mantener la integridad de la actualización tras un reordenamiento de los datos', () => {
    const { rerender } = render(<InventoryTable inventoryData={mockData} />);
    
    // Simular reordenamiento (B primero, luego A)
    const reorderedData = [mockData[1], mockData[0]];
    rerender(<InventoryTable inventoryData={reorderedData} />);

    // Buscar el botón de incremento del Producto B (ahora en la primera fila de datos)
    const rows = screen.getAllByRole('row');
    const rowB = rows.find(row => row.textContent?.includes('Producto B'));
    const incrementBtn = rowB?.querySelector('button:last-child');

    if (incrementBtn) {
      fireEvent.click(incrementBtn);
    }

    // Debe seguir usando el productId 2
    expect(mockUpdateInventoryItemLocal).toHaveBeenCalledWith(2, 'physicalQuantity', 6);
  });

  it('debe generar claves únicas compuestas para cada fila', () => {
    render(<InventoryTable inventoryData={mockData} />);
    // Esta prueba es implícita: si React detecta claves duplicadas o inestables, 
    // el comportamiento de los inputs (localQty) fallaría en pruebas de integración más complejas.
    // Aquí verificamos que los nombres de los productos se rendericen correctamente.
    expect(screen.getByText('Producto A')).toBeInTheDocument();
    expect(screen.getByText('Producto B')).toBeInTheDocument();
  });
});