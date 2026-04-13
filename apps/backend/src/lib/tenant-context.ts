import { AsyncLocalStorage } from "node:async_hooks";

type TenantContextState = {
  enforceTenant: boolean;
  schoolId?: string;
};

const tenantContextStorage = new AsyncLocalStorage<TenantContextState>();

export function runWithTenantContext<T>(callback: () => T): T {
  return tenantContextStorage.run({ enforceTenant: false }, callback);
}

export function getTenantContext(): TenantContextState | undefined {
  return tenantContextStorage.getStore();
}

export function setTenantContext(
  patch: Partial<TenantContextState>
): TenantContextState | undefined {
  const current = tenantContextStorage.getStore();
  if (!current) return undefined;

  if (patch.enforceTenant !== undefined) {
    current.enforceTenant = patch.enforceTenant;
  }

  if (patch.schoolId !== undefined) {
    current.schoolId = patch.schoolId;
  }

  return current;
}
