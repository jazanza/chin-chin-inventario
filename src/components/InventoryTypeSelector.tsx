import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InventoryTypeSelectorProps {
  onSelect: (type: "weekly" | "monthly") => void;
  loading: boolean;
}

export const InventoryTypeSelector = ({ onSelect, loading }: InventoryTypeSelectorProps) => {
  return (
    <Card className="w-[350px] bg-black text-white border-primary-glitch-pink shadow-glitch">
      <CardHeader>
        <CardTitle className="text-center text-2xl text-[var(--primary-glitch-pink)]">Seleccionar Tipo de Inventario</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          onClick={() => onSelect("weekly")}
          disabled={loading}
          className="bg-[var(--secondary-glitch-cyan)] hover:bg-cyan-700 text-black font-bold"
        >
          Inventario Semanal
        </Button>
        <Button
          onClick={() => onSelect("monthly")}
          disabled={loading}
          className="bg-[var(--primary-glitch-pink)] hover:bg-pink-700 text-black font-bold"
        >
          Inventario Mensual
        </Button>
      </CardContent>
    </Card>
  );
};