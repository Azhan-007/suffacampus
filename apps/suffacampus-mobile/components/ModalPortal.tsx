import React, { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ModalConfig {
  id: string;
  content: ReactNode;
  onClose?: () => void;
  closeOnBackdropPress?: boolean;
}

interface ModalPortalContextType {
  showModal: (content: ReactNode, options?: { onClose?: () => void; closeOnBackdropPress?: boolean }) => string;
  hideModal: (id: string) => void;
  hideAllModals: () => void;
}

const ModalPortalContext = createContext<ModalPortalContextType | null>(null);

export function useModalPortal() {
  const context = useContext(ModalPortalContext);
  if (!context) {
    throw new Error('useModalPortal must be used within ModalPortalProvider');
  }
  return context;
}

interface ModalPortalProviderProps {
  children: ReactNode;
}

export function ModalPortalProvider({ children }: ModalPortalProviderProps) {
  const [modals, setModals] = useState<ModalConfig[]>([]);

  const showModal = useCallback((
    content: ReactNode,
    options?: { onClose?: () => void; closeOnBackdropPress?: boolean }
  ): string => {
    const id = `modal-${Date.now()}-${Math.random()}`;
    const newModal: ModalConfig = {
      id,
      content,
      onClose: options?.onClose,
      closeOnBackdropPress: options?.closeOnBackdropPress ?? true,
    };
    setModals(prev => [...prev, newModal]);
    return id;
  }, []);

  const hideModal = useCallback((id: string) => {
    setModals(prev => {
      const modal = prev.find(m => m.id === id);
      // Only call onClose if the modal exists and is being removed
      if (modal && modal.onClose) {
        modal.onClose();
      }
      return prev.filter(m => m.id !== id);
    });
  }, []);

  const hideAllModals = useCallback(() => {
    modals.forEach(modal => {
      if (modal.onClose) {
        modal.onClose();
      }
    });
    setModals([]);
  }, [modals]);

  return (
    <ModalPortalContext.Provider value={{ showModal, hideModal, hideAllModals }}>
      {children}
      {/* Render all modals at the root level */}
      {modals.map((modal, index) => (
        <Modal
          key={modal.id}
          visible={true}
          animationType="fade"
          transparent={true}
          statusBarTranslucent={true}
          onRequestClose={() => {
            if (modal.closeOnBackdropPress) {
              hideModal(modal.id);
            }
          }}
        >
          <View style={styles.modalRoot}>
            {/* Full-screen backdrop */}
            <TouchableOpacity
              style={styles.backdrop}
              activeOpacity={1}
              onPress={() => {
                if (modal.closeOnBackdropPress) {
                  hideModal(modal.id);
                }
              }}
            />
            {/* Modal content */}
            <SafeAreaView style={styles.safeArea} edges={['bottom']}>
              {modal.content}
            </SafeAreaView>
          </View>
        </Modal>
      ))}
    </ModalPortalContext.Provider>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 9999,
  },
  safeArea: {
    width: '100%',
    zIndex: 10000,
    elevation: 50,
  },
});
