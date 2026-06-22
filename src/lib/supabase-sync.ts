import { InventorySession, MasterProductConfig } from "@/lib/persistence";

export type RemoteInventorySession = Omit<InventorySession, "sync_pending"> & { sync_pending?: boolean };
export type RemoteProductRule = Omit<MasterProductConfig, "sync_pending" | "supplier"> & {
  supplierName?: string | null;
  supplier?: string | null;
  sync_pending?: boolean;
};

export const mapRemoteSessionToLocal = (session: RemoteInventorySession): InventorySession => ({
  ...session,
  sync_pending: false,
});

export const mapRemoteRuleToLocal = (rule: RemoteProductRule): MasterProductConfig => ({
  productId: rule.productId,
  productName: rule.productName,
  rules: rule.rules,
  supplier: rule.supplierName || rule.supplier || "Desconocido",
  isHidden: rule.isHidden,
  inventory_type: rule.inventory_type,
  updated_at: rule.updated_at,
  sync_pending: false,
});

export const toRemoteSessionPayload = (session: InventorySession) => ({
  dateKey: session.dateKey,
  inventoryType: session.inventoryType,
  inventoryData: session.inventoryData,
  timestamp: session.timestamp,
  effectiveness: session.effectiveness,
  ordersBySupplier: session.ordersBySupplier,
});

export const toRemoteRulePayload = (rule: MasterProductConfig) => ({
  productId: rule.productId,
  productName: rule.productName,
  supplierName: rule.supplier,
  rules: rule.rules,
  isHidden: rule.isHidden,
  inventory_type: rule.inventory_type,
});

export const isRemoteNewer = (remoteUpdatedAt: string | undefined, localUpdatedAt: string) => {
  if (!remoteUpdatedAt) return false;
  return new Date(remoteUpdatedAt).getTime() > new Date(localUpdatedAt).getTime();
};
