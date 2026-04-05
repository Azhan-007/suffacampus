import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface BottomSheetProps {
    title: string;
    children: ReactNode;
    onClose: () => void;
    footer?: ReactNode;
    maxHeight?: number;
    scrollable?: boolean;
}

export function BottomSheet({
    title,
    children,
    onClose,
    footer,
    maxHeight = 700,
    scrollable = true
}: BottomSheetProps) {
    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoid}
        >
            <View style={[styles.sheet, { maxHeight }]}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>{title}</Text>
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <MaterialCommunityIcons name="close" size={24} color="#6B7280" />
                    </TouchableOpacity>
                </View>

                {/* Content */}
                {scrollable ? (
                    <ScrollView
                        style={styles.content}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {children}
                        <View style={{ height: 20 }} />
                    </ScrollView>
                ) : (
                    <View style={styles.content}>
                        {children}
                    </View>
                )}

                {/* Footer */}
                {footer && <View style={styles.footer}>{footer}</View>}
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    keyboardAvoid: {
        width: '100%',
    },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 32,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 16,
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        maxHeight: 400,
    },
    footer: {
        marginTop: 20,
    },
});
