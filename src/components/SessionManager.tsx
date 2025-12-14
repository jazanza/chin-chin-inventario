import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInventoryContext } from "@/context/InventoryContext";
import { InventorySession } from "@/lib/persistence";
import { format } from "date-fns";
import { PlusCircle } from "lucide-react";

interface SessionManagerProps {
  onStartNewSession: () => void;
}

export const SessionManager = ({ onStartNewSession }: SessionManagerProps) => {
  const { getSessionHistory, loadSession, loading } = useInventoryContext();
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      setIsLoadingHistory(true);
      const history = await getSessionHistory();
      setSessions(history);
      setIsLoadingHistory(false);
    };
    fetchSessions();
  }, [getSessionHistory]);

  const handleLoadSession = async (dateKey: string) => {
    await loadSession(dateKey);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-3xl bg-white text-gray-900 border-gray-200 shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl sm:text-2xl text-gray-900">Historial de Sesiones de Inventario</CardTitle>
          <Button onClick={onStartNewSession} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-base">
            <PlusCircle className="mr-2 h-4 w-4" />
            Nueva Sesión
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoadingHistory ? (
            <p className="text-center text-gray-700">Cargando historial...</p>
          ) : sessions.length === 0 ? (
            <p className="text-center text-gray-500">No hay sesiones guardadas. Inicia una nueva sesión.</p>
          ) : (
            <div className="overflow-x-auto custom-scrollbar max-h-[60vh]">
              <Table className="min-w-full bg-gray-50 text-gray-900 border-collapse">
                <TableHeader className="sticky top-0 bg-gray-50 z-10">
                  <TableRow className="border-b border-gray-200">
                    <TableHead className="text-xs sm:text-sm text-gray-700 font-bold">Fecha</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 font-bold">Tipo</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 font-bold text-center">Efectividad</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 font-bold text-center">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.dateKey} className="border-b border-gray-100 hover:bg-gray-100">
                      <TableCell className="py-2 px-2 text-xs sm:text-sm">{format(session.timestamp, 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="py-2 px-2 text-xs sm:text-sm capitalize">{session.inventoryType}</TableCell>
                      <TableCell className="py-2 px-2 text-xs sm:text-sm text-center">{session.effectiveness.toFixed(2)}%</TableCell>
                      <TableCell className="py-2 px-2 text-center">
                        <Button
                          onClick={() => handleLoadSession(session.dateKey)}
                          disabled={loading}
                          variant="outline"
                          size="sm"
                          className="text-blue-600 border-blue-600 hover:bg-blue-600 hover:text-white text-xs sm:text-sm"
                        >
                          Cargar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};