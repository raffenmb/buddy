import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useBuddy } from '../context/BuddyProvider';

function TextField({ field, value, onChange, colors }) {
  return (
    <TextInput
      value={String(value)}
      onChangeText={onChange}
      placeholder={field.placeholder || ''}
      placeholderTextColor={colors.textMuted}
      keyboardType={field.type === 'number' ? 'numeric' : 'default'}
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        backgroundColor: colors.bgBase,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    />
  );
}

function TextAreaField({ field, value, onChange, colors }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={field.placeholder || ''}
      placeholderTextColor={colors.textMuted}
      multiline
      numberOfLines={4}
      textAlignVertical="top"
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        backgroundColor: colors.bgBase,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.border,
        minHeight: 100,
      }}
    />
  );
}

function SelectField({ field, value, onChange, colors }) {
  const options = field.options || [];
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = value === option;
        return (
          <Pressable
            key={option}
            className="rounded-xl px-4 py-2"
            style={{
              backgroundColor: isSelected ? colors.accent : colors.bgBase,
              borderWidth: 1,
              borderColor: isSelected ? colors.accent : colors.border,
            }}
            onPress={() => onChange(option)}
          >
            <Text
              className="text-sm font-medium"
              style={{
                color: isSelected ? '#fff' : colors.textSecondary,
              }}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ToggleField({ value, onChange, colors }) {
  return (
    <Pressable
      className="rounded-full"
      style={{
        width: 40,
        height: 24,
        backgroundColor: value ? '#10B981' : colors.border,
        justifyContent: 'center',
      }}
      onPress={() => onChange(!value)}
    >
      <View
        className="rounded-full"
        style={{
          width: 20,
          height: 20,
          backgroundColor: '#fff',
          position: 'absolute',
          top: 2,
          left: value ? 18 : 2,
        }}
      />
    </Pressable>
  );
}

function FormField({ field, value, onChange, colors }) {
  switch (field.type) {
    case 'textarea':
      return (
        <TextAreaField
          field={field}
          value={value || ''}
          onChange={onChange}
          colors={colors}
        />
      );
    case 'select':
      return (
        <SelectField
          field={field}
          value={value || ''}
          onChange={onChange}
          colors={colors}
        />
      );
    case 'toggle':
      return (
        <ToggleField value={!!value} onChange={onChange} colors={colors} />
      );
    case 'text':
    case 'number':
    default:
      return (
        <TextField
          field={field}
          value={value || ''}
          onChange={onChange}
          colors={colors}
        />
      );
  }
}

export default function FormInput({
  id,
  title,
  description,
  fields = [],
  submit_label,
}) {
  const { colors } = useTheme();
  const { wsRef } = useBuddy();
  const [values, setValues] = useState(() => {
    const initial = {};
    for (const field of fields) {
      initial[field.name] = field.type === 'toggle' ? false : '';
    }
    return initial;
  });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = () => {
    const newErrors = {};
    for (const field of fields) {
      if (field.required) {
        const val = values[field.name];
        if (val === '' || val === undefined || val === null) {
          newErrors[field.name] = true;
        }
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const data = { ...values };
    for (const field of fields) {
      if (field.type === 'number' && data[field.name] !== '') {
        data[field.name] = Number(data[field.name]);
      }
    }

    const ws = wsRef.current?.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'form_response', id, data }));
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <View
        className="rounded-2xl p-6 items-center"
        style={{
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text className="text-lg font-semibold" style={{ color: '#10B981' }}>
          Submitted
        </Text>
        <Text className="text-sm mt-1" style={{ color: colors.textMuted }}>
          Your response has been sent.
        </Text>
      </View>
    );
  }

  return (
    <View
      className="rounded-2xl p-6"
      style={{
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {title ? (
        <Text
          className="text-lg font-semibold mb-1"
          style={{ color: colors.textPrimary }}
        >
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text className="text-sm mb-4" style={{ color: colors.textMuted }}>
          {description}
        </Text>
      ) : null}

      <View style={{ gap: 16 }}>
        {fields.map((field) => (
          <View key={field.name} style={{ gap: 4 }}>
            <View className="flex-row items-center gap-1">
              <Text
                className="text-sm font-medium"
                style={{ color: colors.textSecondary }}
              >
                {field.label}
              </Text>
              {field.required ? (
                <View
                  className="rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    backgroundColor: errors[field.name]
                      ? '#EF4444'
                      : colors.accent,
                  }}
                />
              ) : null}
            </View>
            <FormField
              field={field}
              value={values[field.name]}
              onChange={(val) => handleChange(field.name, val)}
              colors={colors}
            />
          </View>
        ))}
      </View>

      <Pressable
        className="rounded-xl px-6 py-3 items-center mt-5"
        style={{ backgroundColor: colors.accent }}
        onPress={handleSubmit}
      >
        <Text className="text-sm font-semibold text-white">
          {submit_label || 'Submit'}
        </Text>
      </Pressable>
    </View>
  );
}
