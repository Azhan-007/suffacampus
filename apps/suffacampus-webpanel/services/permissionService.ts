import { apiFetch } from '@/lib/api';
import { RolePermissionMatrix, UserRole } from '@/types';

export class PermissionService {
  static async getPermissions(): Promise<RolePermissionMatrix[]> {
    try {
      return await apiFetch<RolePermissionMatrix[]>('/settings/permissions');
    } catch {
      return [];
    }
  }

  static async updatePermissions(role: UserRole, permissions: RolePermissionMatrix['permissions']): Promise<void> {
    await apiFetch(`/settings/permissions/${role}`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    });
  }
}
