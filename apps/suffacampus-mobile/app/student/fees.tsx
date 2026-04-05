import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import Section from "../../components/Section";
import { getStudentFees, recordPayment } from "../../services/feesService";

interface PaymentHistoryItem {
  date: string;
  amount: number;
  receiptId: string;
  status: "Paid" | "Pending" | "Failed";
  method?: string;
}

interface FeeStructure {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: "Paid" | "Pending" | "Overdue";
}

interface FeesData {
  total: number;
  paid: number;
  pending: number;
  dueDate: string;
  history: PaymentHistoryItem[];
  feeStructure: FeeStructure[];
}

export default function FeesScreen() {
  const [feesData, setFeesData] = useState<FeesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedFee, setSelectedFee] = useState<FeeStructure | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [cardNumber, setCardNumber] = useState("");
  const [upiId, setUpiId] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchFeesData();
  }, []);

  const fetchFeesData = async () => {
    try {
      setLoading(true);

      const currentStudentId = await AsyncStorage.getItem("studentId");
      if (!currentStudentId) { router.replace("/login" as any); return; }

      const feesResult = await getStudentFees(currentStudentId);
      setFeesData(feesResult);
    } catch (err) {
      console.warn("Error fetching fees data:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString()}`;
  };

  const handlePayNow = (fee: FeeStructure) => {
    setSelectedFee(fee);
    setPaymentModalVisible(true);
    setPaymentMethod("");
    setCardNumber("");
    setUpiId("");
  };

  const processPayment = async () => {
    if (!paymentMethod) {
      Alert.alert("Error", "Please select a payment method");
      return;
    }

    if (paymentMethod === "card" && !cardNumber) {
      Alert.alert("Error", "Please enter card number");
      return;
    }

    if (paymentMethod === "upi" && !upiId) {
      Alert.alert("Error", "Please enter UPI ID");
      return;
    }

    try {
      setProcessing(true);

      // TODO: Integrate with real payment gateway (Razorpay/Stripe)
      // For now, show a notice that payment simulation is active
      if (__DEV__) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        Alert.alert("Payment Unavailable", "Online payment is not yet configured. Please pay at the school office.");
        setProcessing(false);
        return;
      }

      const receiptId = `RCPT${Math.floor(Math.random() * 10000)}`;

      const currentStudentId = await AsyncStorage.getItem("studentId") ?? "";
      await recordPayment({
        studentId: currentStudentId,
        feeId: selectedFee?.id ?? "",
        amount: selectedFee?.amount ?? 0,
        method: paymentMethod,
        receiptId: receiptId,
        status: "Paid",
      });

      Alert.alert(
        "Payment Successful!",
        `Payment of ${formatCurrency(selectedFee?.amount || 0)} completed successfully.\n\nReceipt ID: ${receiptId}`,
        [
          {
            text: "OK",
            onPress: () => {
              setPaymentModalVisible(false);
              fetchFeesData(); // Refresh data
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert("Payment Failed", "Unable to process payment. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const renderPaymentCard = (item: PaymentHistoryItem, index: number) => {
    const isPaid = item.status === "Paid";
    const isFailed = item.status === "Failed";

    return (
      <Card key={index} style={styles.paymentCard}>
        <View style={styles.paymentRow}>
          {/* Icon */}
          <View
            style={[
              styles.paymentIconCircle,
              { 
                backgroundColor: isPaid 
                  ? "rgba(16, 185, 129, 0.10)" 
                  : isFailed 
                  ? "rgba(239, 68, 68, 0.10)" 
                  : "rgba(251, 191, 36, 0.10)" 
              },
            ]}
          >
            <MaterialIcons
              name={isPaid ? "check-circle" : isFailed ? "error" : "schedule"}
              size={24}
              color={isPaid ? "#10B981" : isFailed ? "#EF4444" : "#FBBF24"}
            />
          </View>

          {/* Content */}
          <View style={styles.paymentContent}>
            <Text style={styles.paymentDate}>{formatDate(item.date)}</Text>
            <Text style={styles.receiptId}>Receipt: {item.receiptId}</Text>
            {item.method && <Text style={styles.paymentMethodText}>via {item.method}</Text>}
          </View>

          {/* Amount & Status */}
          <View style={styles.paymentRight}>
            <Text style={styles.paymentAmount}>{formatCurrency(item.amount)}</Text>
            <View
              style={[
                styles.statusBadge,
                { 
                  backgroundColor: isPaid 
                    ? "rgba(16, 185, 129, 0.12)" 
                    : isFailed 
                    ? "rgba(239, 68, 68, 0.12)" 
                    : "rgba(251, 191, 36, 0.12)" 
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText, 
                  { color: isPaid ? "#10B981" : isFailed ? "#EF4444" : "#FBBF24" }
                ]}
              >
                {item.status}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fees & Payments</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading fees data...</Text>
        </View>
      ) : !feesData ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="receipt-long" size={64} color="#D1D5DB" />
          <Text style={styles.emptyText}>No fees data available</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Summary Card */}
          <View style={{ marginBottom: 16 }}>
            <Card style={styles.summaryCard}>
              {/* Total Fees Row */}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Fees</Text>
                <Text style={styles.summaryValue}>{formatCurrency(feesData.total)}</Text>
              </View>

              <View style={styles.summaryDivider} />

              {/* Paid & Pending Grid */}
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <MaterialIcons name="check-circle" size={24} color="#10B981" />
                  <Text style={styles.summaryItemLabel}>Paid</Text>
                  <Text style={[styles.summaryItemValue, { color: "#10B981" }]}>
                    {formatCurrency(feesData.paid)}
                  </Text>
                </View>

                <View style={styles.summaryVerticalDivider} />

                <View style={styles.summaryItem}>
                  <MaterialIcons name="schedule" size={24} color="#EF4444" />
                  <Text style={styles.summaryItemLabel}>Pending</Text>
                  <Text style={[styles.summaryItemValue, { color: "#EF4444" }]}>
                    {formatCurrency(feesData.pending)}
                  </Text>
                </View>
              </View>

              <View style={styles.summaryDivider} />

              {/* Due Date */}
              <View style={styles.dueDateRow}>
                <MaterialIcons name="event" size={18} color="#6B7280" />
                <Text style={styles.dueDateLabel}>Next Due Date:</Text>
                <Text style={styles.dueDateValue}>{formatDate(feesData.dueDate)}</Text>
              </View>
            </Card>
          </View>

          {/* Fee Structure */}
          <Section title="Fee Structure">
            {feesData.feeStructure.map((fee) => (
              <Card key={fee.id} style={styles.feeCard}>
                <View style={styles.feeRow}>
                  <View style={styles.feeLeft}>
                    <View
                      style={[
                        styles.feeIconCircle,
                        {
                          backgroundColor:
                            fee.status === "Paid"
                              ? "rgba(16, 185, 129, 0.10)"
                              : fee.status === "Overdue"
                              ? "rgba(239, 68, 68, 0.10)"
                              : "rgba(251, 191, 36, 0.10)",
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          fee.status === "Paid"
                            ? "checkbox-marked-circle"
                            : fee.status === "Overdue"
                            ? "alert-circle"
                            : "clock-outline"
                        }
                        size={24}
                        color={
                          fee.status === "Paid"
                            ? "#10B981"
                            : fee.status === "Overdue"
                            ? "#EF4444"
                            : "#FBBF24"
                        }
                      />
                    </View>
                    <View style={styles.feeInfo}>
                      <Text style={styles.feeName}>{fee.name}</Text>
                      <Text style={styles.feeDueDate}>Due: {formatDate(fee.dueDate)}</Text>
                    </View>
                  </View>
                  <View style={styles.feeRight}>
                    <Text style={styles.feeAmount}>{formatCurrency(fee.amount)}</Text>
                    {fee.status === "Pending" && (
                      <TouchableOpacity
                        style={styles.payButton}
                        onPress={() => handlePayNow(fee)}
                      >
                        <Text style={styles.payButtonText}>Pay Now</Text>
                      </TouchableOpacity>
                    )}
                    {fee.status === "Paid" && (
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeText}>Paid</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Card>
            ))}
          </Section>

          {/* Payment History */}
          <Section title="Payment History">
            {feesData.history.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={styles.emptyHistoryText}>No payment history</Text>
              </View>
            ) : (
              feesData.history.map(renderPaymentCard)
            )}
          </Section>
        </ScrollView>
      )}

      {/* Payment Modal */}
      <Modal
        visible={paymentModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Make Payment</Text>
              <TouchableOpacity onPress={() => setPaymentModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#1A1A1A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Payment Details */}
              <Card style={styles.paymentDetailsCard}>
                <Text style={styles.paymentDetailLabel}>Fee Name</Text>
                <Text style={styles.paymentDetailValue}>{selectedFee?.name}</Text>
                <View style={styles.paymentDetailDivider} />
                <Text style={styles.paymentDetailLabel}>Amount</Text>
                <Text style={[styles.paymentDetailValue, styles.amountHighlight]}>
                  {formatCurrency(selectedFee?.amount || 0)}
                </Text>
              </Card>

              {/* Payment Methods */}
              <Text style={styles.sectionLabel}>Select Payment Method</Text>

              <TouchableOpacity
                style={[
                  styles.paymentMethodCard,
                  paymentMethod === "upi" && styles.paymentMethodCardActive,
                ]}
                onPress={() => setPaymentMethod("upi")}
              >
                <View style={styles.paymentMethodLeft}>
                  <View style={styles.paymentMethodIcon}>
                    <MaterialCommunityIcons name="bank-transfer" size={24} color="#4C6EF5" />
                  </View>
                  <View>
                    <Text style={styles.paymentMethodTitle}>UPI</Text>
                    <Text style={styles.paymentMethodSubtitle}>Google Pay, PhonePe, Paytm</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.radioButton,
                    paymentMethod === "upi" && styles.radioButtonActive,
                  ]}
                >
                  {paymentMethod === "upi" && <View style={styles.radioButtonInner} />}
                </View>
              </TouchableOpacity>

              {paymentMethod === "upi" && (
                <TextInput
                  style={styles.input}
                  placeholder="Enter UPI ID (e.g., yourname@paytm)"
                  value={upiId}
                  onChangeText={setUpiId}
                  autoCapitalize="none"
                />
              )}

              <TouchableOpacity
                style={[
                  styles.paymentMethodCard,
                  paymentMethod === "card" && styles.paymentMethodCardActive,
                ]}
                onPress={() => setPaymentMethod("card")}
              >
                <View style={styles.paymentMethodLeft}>
                  <View style={styles.paymentMethodIcon}>
                    <MaterialCommunityIcons name="credit-card" size={24} color="#10B981" />
                  </View>
                  <View>
                    <Text style={styles.paymentMethodTitle}>Debit/Credit Card</Text>
                    <Text style={styles.paymentMethodSubtitle}>Visa, Mastercard, Rupay</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.radioButton,
                    paymentMethod === "card" && styles.radioButtonActive,
                  ]}
                >
                  {paymentMethod === "card" && <View style={styles.radioButtonInner} />}
                </View>
              </TouchableOpacity>

              {paymentMethod === "card" && (
                <TextInput
                  style={styles.input}
                  placeholder="Enter Card Number"
                  value={cardNumber}
                  onChangeText={setCardNumber}
                  keyboardType="numeric"
                  maxLength={16}
                />
              )}

              <TouchableOpacity
                style={[
                  styles.paymentMethodCard,
                  paymentMethod === "netbanking" && styles.paymentMethodCardActive,
                ]}
                onPress={() => setPaymentMethod("netbanking")}
              >
                <View style={styles.paymentMethodLeft}>
                  <View style={styles.paymentMethodIcon}>
                    <MaterialCommunityIcons name="bank" size={24} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={styles.paymentMethodTitle}>Net Banking</Text>
                    <Text style={styles.paymentMethodSubtitle}>All major banks</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.radioButton,
                    paymentMethod === "netbanking" && styles.radioButtonActive,
                  ]}
                >
                  {paymentMethod === "netbanking" && <View style={styles.radioButtonInner} />}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentMethodCard,
                  paymentMethod === "wallet" && styles.paymentMethodCardActive,
                ]}
                onPress={() => setPaymentMethod("wallet")}
              >
                <View style={styles.paymentMethodLeft}>
                  <View style={styles.paymentMethodIcon}>
                    <MaterialCommunityIcons name="wallet" size={24} color="#EC4899" />
                  </View>
                  <View>
                    <Text style={styles.paymentMethodTitle}>Wallet</Text>
                    <Text style={styles.paymentMethodSubtitle}>Paytm, Amazon Pay, etc.</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.radioButton,
                    paymentMethod === "wallet" && styles.radioButtonActive,
                  ]}
                >
                  {paymentMethod === "wallet" && <View style={styles.radioButtonInner} />}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.proceedButton, processing && styles.proceedButtonDisabled]}
                onPress={processPayment}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="lock" size={20} color="#FFFFFF" />
                    <Text style={styles.proceedButtonText}>
                      Pay {formatCurrency(selectedFee?.amount || 0)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.securePaymentNote}>
                <MaterialIcons name="verified-user" size={16} color="#10B981" />
                <Text style={styles.securePaymentText}>Secure payment powered by Razorpay</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  summaryCard: {
    elevation: 5,
    padding: 20,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
  },
  summaryGrid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  summaryItemLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  summaryItemValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  summaryVerticalDivider: {
    width: 1,
    height: 60,
    backgroundColor: "#E5E7EB",
  },
  dueDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dueDateLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  dueDateValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  feeCard: {
    marginBottom: 12,
    elevation: 3,
  },
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  feeLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  feeIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  feeInfo: {
    flex: 1,
    gap: 4,
  },
  feeName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  feeDueDate: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  feeRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  feeAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  payButton: {
    backgroundColor: "#4C6EF5",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  payButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  paidBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  paidBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10B981",
  },
  paymentCard: {
    marginBottom: 12,
    elevation: 4,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  paymentIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentContent: {
    flex: 1,
    gap: 4,
  },
  paymentDate: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  receiptId: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  paymentMethodText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4C6EF5",
  },
  paymentRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  paymentAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6B7280",
    marginTop: 16,
  },
  emptyHistory: {
    padding: 40,
    alignItems: "center",
  },
  emptyHistoryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    zIndex: 9999,
    elevation: 50,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  paymentDetailsCard: {
    backgroundColor: "#F9FAFB",
    padding: 16,
    marginBottom: 20,
  },
  paymentDetailLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  paymentDetailValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  amountHighlight: {
    fontSize: 24,
    color: "#4C6EF5",
  },
  paymentDetailDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 12,
  },
  paymentMethodCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  paymentMethodCardActive: {
    borderColor: "#4C6EF5",
    backgroundColor: "#EEF2FF",
  },
  paymentMethodLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  paymentMethodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
  },
  paymentMethodTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  paymentMethodSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioButtonActive: {
    borderColor: "#4C6EF5",
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#4C6EF5",
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
    marginBottom: 12,
  },
  proceedButton: {
    backgroundColor: "#4C6EF5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  proceedButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  proceedButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  securePaymentNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  securePaymentText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
});

