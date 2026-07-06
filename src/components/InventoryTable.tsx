import { useEffect, useRef } from "react";
import { Minus, Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInventoryContext, InventoryItem } from "@/context/InventoryContext";
import { cn } from "@/lib/utils";

interface InventoryTableProps {
  inventoryData: InventoryItem[];
}

export const InventoryTable = ({ inventoryData }: InventoryTableProps) => {
  const { updateInventoryItemLocal } = useInventoryContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevVisibleCountRef = useRef(0);
  const visibleCount = Math.min(inventoryData.length, 50); // Show first 50 items by default

  // Preserve scroll position when re-rendering due to edits
  useEffect(() => {
    if (scrollContainerRef.current) {
      const scrollTop = scrollContainerRef.current.scrollTop;
      // Store current visible count for comparison
      prevVisibleCountRef.current = visibleCount;
      // Restore scroll position after render
      requestAnimationFrame(() => {
        scrollContainerRef.current.scrollTop = scrollTop;
      });
    }
  }, [visibleCount]);

  // Adjust scroll when visibleCount changes (e.g., "Show More" button)
  useEffect(() => {
    if (scrollContainerRef.current && prevVisibleCountRef.current !== visibleCount) {
      const itemHeight = 40; // Approximate row height
      const targetIndex = Math.min(visibleCount, inventoryData.length) - 1;
      const newScrollTop = targetIndex * itemHeight;
      scrollContainerRef.current.scrollTop = newScrollTop;
    }
  }, [visibleCount, inventoryData]);

  return (
    <div className="overflow-x-auto custom-scrollbar" ref={scrollContainerRef}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Producto
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Categoría
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Stock Sistema
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Stock Físico
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Proveedor
            </th>
            <th scope="col" className="relative px-6 py-3">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {inventoryData.slice(0, visibleCount).map((item) => {
            const isEdited = item.hasBeenEdited;
            return (
              <tr
                key={item.productId}
                className={cn(
                  "hover:bg-gray-50",
                  isEdited && "bg-blue-50",
                  "border-b border-gray-100"
                )}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {item.productName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.category}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {item.systemQuantity}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => updateInventoryItemLocal(item.productId, "physicalQuantity", item.physicalQuantity - 1)}
                      disabled={item.physicalQuantity <= 0}
                      className="h-8 w-8 p-0 text-gray-700 border-gray-300 hover:bg-gray-100"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      type="number"
                      value={item.physicalQuantity}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10) || 0;
                        updateInventoryItemLocal(item.productId, "physicalQuantity", value);
                      }}
                      className={cn(
                        "w-20 text-center border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500",
                        isEdited && "border-blue-500 focus:ring-blue-400"
                      )}
                    />
                    <button
                      onClick={() => updateInventoryItemLocal(item.productId, "physicalQuantity", item.physicalQuantity + 1)}
                      className="h-8 w-8 p-0 text-gray-700 border-gray-300 hover:bg-gray-100"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.supplier}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {isEdited ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      Editado
                    </span>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-500">
                      Original
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {visibleCount < inventoryData.length && (
            <tr>
              <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                <button
                  onClick={() => {
                    console.log("Show more items requested");
                  }}
                  className="underline hover:text-gray-900"
                >
                  Mostrar más ({inventoryData.length - visibleCount} más)
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};