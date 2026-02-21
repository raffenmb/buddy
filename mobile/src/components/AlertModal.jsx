import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const AlertContext = createContext(null);

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}

export function AlertProvider({ children }) {
  const [alert, setAlert] = useState(null);
  const resolveRef = useRef(null);

  const showAlert = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setAlert({ message, isConfirm: false });
    });
  }, []);

  const showConfirm = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setAlert({ message, isConfirm: true });
    });
  }, []);

  const handleOk = () => {
    resolveRef.current?.(true);
    setAlert(null);
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    setAlert(null);
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {alert && (
        <AlertOverlay
          alert={alert}
          onOk={handleOk}
          onCancel={handleCancel}
        />
      )}
    </AlertContext.Provider>
  );
}

function AlertOverlay({ alert, onOk, onCancel }) {
  const { colors } = useTheme();
  return (
    <Modal transparent animationType="fade">
      <View
        className="flex-1 items-center justify-center p-6"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      >
        <View
          className="w-full rounded-2xl p-6"
          style={{
            backgroundColor: colors.bgSurface,
            borderWidth: 1,
            borderColor: colors.border,
            maxWidth: 320,
          }}
        >
          <Text
            className="text-sm leading-relaxed mb-6"
            style={{ color: colors.textPrimary }}
          >
            {alert.message}
          </Text>
          <View className="flex-row gap-3">
            {alert.isConfirm && (
              <Pressable
                className="flex-1 rounded-xl px-4 py-2.5 items-center"
                style={{
                  backgroundColor: colors.bgRaised,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                onPress={onCancel}
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: colors.textSecondary }}
                >
                  Cancel
                </Text>
              </Pressable>
            )}
            <Pressable
              className="flex-1 rounded-xl px-4 py-2.5 items-center"
              style={{ backgroundColor: colors.accent }}
              onPress={onOk}
            >
              <Text className="text-sm font-semibold text-white">OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
