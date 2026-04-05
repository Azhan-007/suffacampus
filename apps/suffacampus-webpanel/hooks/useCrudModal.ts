'use client';

import { useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────

export interface DeleteDialogState {
  isOpen: boolean;
  id: string | null;
  name: string;
}

export interface UseCrudModalOptions<TEntity, TForm> {
  /** Initial/default form data values */
  defaultFormData: TForm;
  /** Convert an entity into form data (for editing) */
  entityToForm: (entity: TEntity) => TForm;
}

export interface UseCrudModalReturn<TEntity, TForm> {
  // ── Add/Edit modal ──
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  editingEntity: TEntity | null;

  // ── View modal ──
  isViewModalOpen: boolean;
  setIsViewModalOpen: (open: boolean) => void;
  viewingEntity: TEntity | null;
  setViewingEntity: (entity: TEntity | null) => void;

  // ── Form state ──
  formData: TForm;
  setFormData: React.Dispatch<React.SetStateAction<TForm>>;
  formErrors: Record<string, string>;
  setFormErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  // ── Delete dialog ──
  deleteDialog: DeleteDialogState;
  setDeleteDialog: React.Dispatch<React.SetStateAction<DeleteDialogState>>;

  // ── Loading states ──
  isSaving: boolean;
  setIsSaving: (saving: boolean) => void;
  isDeleting: boolean;
  setIsDeleting: (deleting: boolean) => void;

  // ── Actions ──
  /** Open the modal for creating (empty form) or editing (pre-filled) */
  openModal: (entity?: TEntity) => void;
  /** Close the modal and reset form */
  closeModal: () => void;
  /** Reset form data to defaults */
  resetForm: () => void;
  /** Open delete confirmation */
  openDelete: (id: string, name: string) => void;
  /** Close delete confirmation */
  closeDelete: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────

/**
 * Encapsulates modal open/close, form state, delete dialog, and loading
 * states that are identical across every CRUD page.
 *
 * Each page provides:
 * 1. `defaultFormData` — the empty form shape
 * 2. `entityToForm` — converts a domain entity to the form shape for editing
 */
export function useCrudModal<TEntity, TForm>(
  options: UseCrudModalOptions<TEntity, TForm>,
): UseCrudModalReturn<TEntity, TForm> {
  const { defaultFormData, entityToForm } = options;

  // ── Add/Edit modal ──
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<TEntity | null>(null);

  // ── View modal ──
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingEntity, setViewingEntity] = useState<TEntity | null>(null);

  // ── Form state ──
  const [formData, setFormData] = useState<TForm>(defaultFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ── Delete dialog ──
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    isOpen: false,
    id: null,
    name: '',
  });

  // ── Loading states ──
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Actions ──

  const resetForm = useCallback(() => {
    setFormData(defaultFormData);
    setFormErrors({});
    setEditingEntity(null);
  }, [defaultFormData]);

  const openModal = useCallback(
    (entity?: TEntity) => {
      if (entity) {
        setEditingEntity(entity);
        setFormData(entityToForm(entity));
      } else {
        resetForm();
      }
      setIsModalOpen(true);
    },
    [entityToForm, resetForm],
  );

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    resetForm();
  }, [resetForm]);

  const openDelete = useCallback((id: string, name: string) => {
    setDeleteDialog({ isOpen: true, id, name });
  }, []);

  const closeDelete = useCallback(() => {
    setDeleteDialog({ isOpen: false, id: null, name: '' });
  }, []);

  return {
    isModalOpen,
    setIsModalOpen,
    editingEntity,
    isViewModalOpen,
    setIsViewModalOpen,
    viewingEntity,
    setViewingEntity,
    formData,
    setFormData,
    formErrors,
    setFormErrors,
    deleteDialog,
    setDeleteDialog,
    isSaving,
    setIsSaving,
    isDeleting,
    setIsDeleting,
    openModal,
    closeModal,
    resetForm,
    openDelete,
    closeDelete,
  };
}
