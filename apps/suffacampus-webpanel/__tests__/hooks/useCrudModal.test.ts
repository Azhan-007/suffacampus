import { renderHook, act } from '@testing-library/react';
import { useCrudModal } from '@/hooks/useCrudModal';

// ── Test types ───────────────────────────────────────────────────────

interface Entity {
  id: string;
  name: string;
  email: string;
  age: number;
}

interface FormData {
  name: string;
  email: string;
  age: number;
}

const DEFAULT_FORM: FormData = { name: '', email: '', age: 0 };

const entityToForm = (e: Entity): FormData => ({
  name: e.name,
  email: e.email,
  age: e.age,
});

const sampleEntity: Entity = {
  id: 'e1',
  name: 'Alice',
  email: 'alice@test.com',
  age: 25,
};

const hookOpts = { defaultFormData: DEFAULT_FORM, entityToForm };

// ── Tests ────────────────────────────────────────────────────────────

describe('useCrudModal', () => {
  describe('initial state', () => {
    it('starts with modals closed', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      expect(result.current.isModalOpen).toBe(false);
      expect(result.current.editingEntity).toBeNull();
      expect(result.current.isViewModalOpen).toBe(false);
      expect(result.current.viewingEntity).toBeNull();
    });

    it('starts with default form data', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      expect(result.current.formData).toEqual(DEFAULT_FORM);
      expect(result.current.formErrors).toEqual({});
    });

    it('starts with delete dialog closed', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      expect(result.current.deleteDialog).toEqual({ isOpen: false, id: null, name: '' });
    });

    it('starts with loading states false', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      expect(result.current.isSaving).toBe(false);
      expect(result.current.isDeleting).toBe(false);
    });
  });

  describe('openModal — create', () => {
    it('opens modal for create (no entity)', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.openModal());
      expect(result.current.isModalOpen).toBe(true);
      expect(result.current.editingEntity).toBeNull();
      expect(result.current.formData).toEqual(DEFAULT_FORM);
      expect(result.current.formErrors).toEqual({});
    });
  });

  describe('openModal — edit', () => {
    it('opens modal and populates form from entity', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.openModal(sampleEntity));
      expect(result.current.isModalOpen).toBe(true);
      expect(result.current.editingEntity).toBe(sampleEntity);
      expect(result.current.formData).toEqual({
        name: 'Alice',
        email: 'alice@test.com',
        age: 25,
      });
    });
  });

  describe('closeModal', () => {
    it('closes the modal and resets form', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.openModal(sampleEntity));
      act(() => result.current.closeModal());
      expect(result.current.isModalOpen).toBe(false);
      expect(result.current.editingEntity).toBeNull();
      expect(result.current.formData).toEqual(DEFAULT_FORM);
      expect(result.current.formErrors).toEqual({});
    });
  });

  describe('form state', () => {
    it('setFormData updates form', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.setFormData({ name: 'Bob', email: 'bob@t.com', age: 30 }));
      expect(result.current.formData.name).toBe('Bob');
    });

    it('setFormData with updater function', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.setFormData(prev => ({ ...prev, name: 'Updated' })));
      expect(result.current.formData.name).toBe('Updated');
      expect(result.current.formData.email).toBe('');
    });

    it('setFormErrors sets validation errors', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.setFormErrors({ name: 'Required' }));
      expect(result.current.formErrors).toEqual({ name: 'Required' });
    });

    it('resetForm restores default values', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.setFormData({ name: 'Changed', email: 'x', age: 99 }));
      act(() => result.current.setFormErrors({ email: 'Invalid' }));
      act(() => result.current.resetForm());
      expect(result.current.formData).toEqual(DEFAULT_FORM);
      expect(result.current.formErrors).toEqual({});
    });
  });

  describe('delete dialog', () => {
    it('openDelete sets dialog state', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.openDelete('e1', 'Alice'));
      expect(result.current.deleteDialog).toEqual({
        isOpen: true,
        id: 'e1',
        name: 'Alice',
      });
    });

    it('closeDelete resets dialog state', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.openDelete('e1', 'Alice'));
      act(() => result.current.closeDelete());
      expect(result.current.deleteDialog).toEqual({ isOpen: false, id: null, name: '' });
    });
  });

  describe('loading states', () => {
    it('setIsSaving works', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.setIsSaving(true));
      expect(result.current.isSaving).toBe(true);
      act(() => result.current.setIsSaving(false));
      expect(result.current.isSaving).toBe(false);
    });

    it('setIsDeleting works', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => result.current.setIsDeleting(true));
      expect(result.current.isDeleting).toBe(true);
    });
  });

  describe('view modal', () => {
    it('setIsViewModalOpen and setViewingEntity work', () => {
      const { result } = renderHook(() => useCrudModal<Entity, FormData>(hookOpts));
      act(() => {
        result.current.setViewingEntity(sampleEntity);
        result.current.setIsViewModalOpen(true);
      });
      expect(result.current.isViewModalOpen).toBe(true);
      expect(result.current.viewingEntity).toBe(sampleEntity);
    });
  });
});
