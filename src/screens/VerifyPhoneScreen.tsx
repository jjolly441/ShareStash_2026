// src/screens/VerifyPhoneScreen.tsx
// Phone Number Verification Screen with OTP
import React, { useState, useRef, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation';
import { AuthContext } from '../contexts/AuthContext';
import { VerificationService } from '../services/VerificationService';
import app from '../config/firebase';

// ============================================================================
// TYPES
// ============================================================================

type VerifyPhoneScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'VerifyPhone'
>;

interface Props {
  navigation: VerifyPhoneScreenNavigationProp;
}

type VerificationStep = 'phone_input' | 'otp_input' | 'success';

// ============================================================================
// COMPONENT
// ============================================================================

const VerifyPhoneScreen: React.FC<Props> = ({ navigation }) => {
  const { user, refreshUser } = useContext(AuthContext);

  const [step, setStep] = useState<VerificationStep>('phone_input');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal>(null);
  const otpInputRefs = useRef<(TextInput | null)[]>([]);

  // Timer for resend button
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleSendCode = async () => {
    setError(null);

    if (!phoneNumber || phoneNumber.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    const fullPhoneNumber = `${countryCode}${phoneNumber.replace(/\D/g, '')}`;

    setLoading(true);

    try {
      const result = await VerificationService.sendPhoneVerificationCode(
        fullPhoneNumber,
        recaptchaVerifier.current
      );

      if (result.success && result.verificationId) {
        setVerificationId(result.verificationId);
        setStep('otp_input');
        setResendTimer(60);
        
        setTimeout(() => {
          otpInputRefs.current[0]?.focus();
        }, 100);
      } else {
        setError(result.error || 'Failed to send verification code');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (value: string, index: number) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    
    const newOtp = [...otpCode];
    newOtp[index] = digit;
    setOtpCode(newOtp);

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    if (digit && index === 5 && newOtp.every((d) => d !== '')) {
      handleVerifyCode(newOtp.join(''));
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyCode = async (code?: string) => {
    setError(null);

    const codeToVerify = code || otpCode.join('');

    if (codeToVerify.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    if (!user) {
      setError('User not authenticated');
      return;
    }

    setLoading(true);

    try {
      const result = await VerificationService.verifyPhoneCode(
        user.id,
        codeToVerify,
        verificationId || undefined
      );

      if (result.success) {
        setStep('success');
        
        if (refreshUser) {
          await refreshUser();
        }

        setTimeout(() => {
          Alert.alert(
            'Phone Verified!',
            'Your phone number has been verified successfully.',
            [
              {
                text: 'Continue',
                onPress: () => navigation.goBack(),
              },
            ]
          );
        }, 500);
      } else {
        setError(result.error || 'Verification failed');
        setOtpCode(['', '', '', '', '', '']);
        otpInputRefs.current[0]?.focus();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0) return;

    const fullPhoneNumber = `${countryCode}${phoneNumber.replace(/\D/g, '')}`;
    
    setLoading(true);
    setError(null);

    try {
      const result = await VerificationService.resendVerificationCode(
        fullPhoneNumber,
        recaptchaVerifier.current
      );

      if (result.success && result.verificationId) {
        setVerificationId(result.verificationId);
        setResendTimer(60);
        Alert.alert('Code Sent', 'A new verification code has been sent to your phone.');
      } else {
        setError(result.error || 'Failed to resend code');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeNumber = () => {
    setStep('phone_input');
    setOtpCode(['', '', '', '', '', '']);
    setVerificationId(null);
    setError(null);
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={app.options}
        attemptInvisibleVerification={true}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Verify Phone Number</Text>
        </View>

        {/* Phone Input Step */}
        {step === 'phone_input' && (
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name="phone-portrait-outline" size={64} color="#F5C542" />
            </View>

            <Text style={styles.subtitle}>
              Enter your phone number to receive a verification code
            </Text>

            <View style={styles.phoneInputContainer}>
              <View style={styles.countryCodeContainer}>
                <TextInput
                  style={styles.countryCodeInput}
                  value={countryCode}
                  onChangeText={setCountryCode}
                  keyboardType="phone-pad"
                  maxLength={4}
                />
              </View>

              <View style={styles.phoneNumberContainer}>
                <TextInput
                  style={styles.phoneNumberInput}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  maxLength={15}
                  autoFocus
                />
              </View>
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.buttonText}>Send Verification Code</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.infoText}>
              Standard SMS rates may apply. By verifying, you agree to receive
              text messages for account verification.
            </Text>
          </View>
        )}

        {/* OTP Input Step */}
        {step === 'otp_input' && (
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name="keypad-outline" size={64} color="#F5C542" />
            </View>

            <Text style={styles.subtitle}>Enter verification code</Text>
            <Text style={styles.phoneDisplayText}>
              Sent to {countryCode} {phoneNumber}
            </Text>

            <View style={styles.otpContainer}>
              {otpCode.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {otpInputRefs.current[index] = ref}}
                  style={[
                    styles.otpInput,
                    digit && styles.otpInputFilled,
                    error && styles.otpInputError,
                  ]}
                  value={digit}
                  onChangeText={(value) => handleOtpChange(value, index)}
                  onKeyPress={({ nativeEvent }) =>
                    handleOtpKeyPress(nativeEvent.key, index)
                  }
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              ))}
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={() => handleVerifyCode()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.buttonText}>Verify Code</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>Didn't receive the code? </Text>
              {resendTimer > 0 ? (
                <Text style={styles.resendTimerText}>
                  Resend in {resendTimer}s
                </Text>
              ) : (
                <TouchableOpacity onPress={handleResendCode} disabled={loading}>
                  <Text style={styles.resendLinkText}>Resend Code</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.changeNumberButton}
              onPress={handleChangeNumber}
            >
              <Text style={styles.changeNumberText}>Change phone number</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <View style={styles.content}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
            </View>

            <Text style={styles.successTitle}>Phone Verified!</Text>
            <Text style={styles.successSubtitle}>
              Your phone number has been successfully verified. You can now rent
              items on the platform.
            </Text>

            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#F5C542',
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 16,
  },
  countryCodeContainer: {
    width: 70,
    marginRight: 12,
  },
  countryCodeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: '#f9f9f9',
  },
  phoneNumberContainer: {
    flex: 1,
  },
  phoneNumberInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#F5C542',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: '#f0d78a',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  phoneDisplayText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  otpInput: {
    width: 45,
    height: 55,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginHorizontal: 4,
    fontSize: 24,
    textAlign: 'center',
    backgroundColor: '#f9f9f9',
  },
  otpInputFilled: {
    borderColor: '#F5C542',
    backgroundColor: '#fff',
  },
  otpInputError: {
    borderColor: '#F44336',
  },
  resendContainer: {
    flexDirection: 'row',
    marginTop: 24,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14,
    color: '#666',
  },
  resendTimerText: {
    fontSize: 14,
    color: '#999',
  },
  resendLinkText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
  },
  changeNumberButton: {
    marginTop: 16,
    padding: 8,
  },
  changeNumberText: {
    fontSize: 14,
    color: '#666',
    textDecorationLine: 'underline',
  },
  successIconContainer: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
});

export default VerifyPhoneScreen;
