import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InventoryTypeSelectorProps {
  onSelect: (type: "weekly" | "monthly") => void;
  loading: boolean;
}

export const InventoryTypeSelector = ({ onSelect, loading }: InventoryTypeSelectorProps) => {
  return (
    <Card className="w-[350px] bg-white text-gray-900 border-gray-200 shadow-md">
      <CardHeader>
        <CardTitle className="text-xl sm:text-2xl text-center text-gray-900">Seleccionar Tipo de Inventario</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          onClick={() => onSelect("weekly")}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-base"
        >
          Inventario Semanal
        </Button>
        <Button
          onClick={() => onSelect("monthly")}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-base"
        >
          Inventario Mensual
        </Button>
      </CardContent>
    </Card>
  );
};