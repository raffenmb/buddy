import { useState } from "react";
import { useBuddy } from "../../context/BuddyState";

function TextField({ field, value, onChange }) {
  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(field.type === "number" ? e.target.value : e.target.value)}
      placeholder={field.placeholder || ""}
      className="w-full rounded-xl px-4 py-3 text-sm outline-none"
      style={{
        backgroundColor: "var(--color-bg-base)",
        color: "var(--color-text-primary)",
        border: "1px solid var(--color-border)",
      }}
    />
  );
}

function TextAreaField({ field, value, onChange }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || ""}
      rows={4}
      className="w-full rounded-xl px-4 py-3 text-sm outline-none"
      style={{
        backgroundColor: "var(--color-bg-base)",
        color: "var(--color-text-primary)",
        border: "1px solid var(--color-border)",
        resize: "vertical",
      }}
    />
  );
}

function SelectField({ field, value, onChange }) {
  const options = field.options || [];
  return (
    <div className="flex flex-row flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="rounded-xl px-4 py-2 text-sm font-medium"
            style={{
              backgroundColor: isSelected ? "var(--color-accent)" : "var(--color-bg-base)",
              color: isSelected ? "#fff" : "var(--color-text-secondary)",
              border: `1px solid ${isSelected ? "var(--color-accent)" : "var(--color-border)"}`,
              transition: "all 0.15s ease",
            }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function ToggleField({ value, onChange }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onChange(!value)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onChange(!value); }}
      className="flex-shrink-0 rounded-full"
      style={{
        width: 40,
        height: 24,
        backgroundColor: value ? "#10B981" : "var(--color-border)",
        transition: "background-color 0.2s ease",
        position: "relative",
        cursor: "pointer",
      }}
    >
      <div
        className="rounded-full"
        style={{
          width: 20,
          height: 20,
          backgroundColor: "#fff",
          position: "absolute",
          top: 2,
          left: value ? 18 : 2,
          transition: "left 0.2s ease",
        }}
      />
    </div>
  );
}

function FormField({ field, value, onChange }) {
  switch (field.type) {
    case "textarea":
      return <TextAreaField field={field} value={value || ""} onChange={onChange} />;
    case "select":
      return <SelectField field={field} value={value || ""} onChange={onChange} />;
    case "toggle":
      return <ToggleField value={!!value} onChange={onChange} />;
    case "text":
    case "number":
    default:
      return <TextField field={field} value={value || ""} onChange={onChange} />;
  }
}

export default function FormInput({ id, title, description, fields = [], submit_label }) {
  const { wsRef } = useBuddy();
  const [values, setValues] = useState(() => {
    const initial = {};
    for (const field of fields) {
      initial[field.name] = field.type === "toggle" ? false : "";
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
    // Validate required fields
    const newErrors = {};
    for (const field of fields) {
      if (field.required) {
        const val = values[field.name];
        if (val === "" || val === undefined || val === null) {
          newErrors[field.name] = true;
        }
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Cast number fields
    const data = { ...values };
    for (const field of fields) {
      if (field.type === "number" && data[field.name] !== "") {
        data[field.name] = Number(data[field.name]);
      }
    }

    // Send response via WebSocket
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: "form_response",
        id,
        data,
      }));
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div
        data-id={id}
        className="rounded-2xl p-6 flex flex-col items-center"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          boxShadow: "var(--shadow-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="text-lg font-semibold" style={{ color: "#10B981" }}>
          Submitted
        </div>
        <div className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          Your response has been sent.
        </div>
      </div>
    );
  }

  return (
    <div
      data-id={id}
      className="rounded-2xl p-6"
      style={{
        backgroundColor: "var(--color-bg-surface)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      {title && (
        <div
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--color-text-primary)" }}
        >
          {title}
        </div>
      )}
      {description && (
        <div
          className="text-sm mb-4"
          style={{ color: "var(--color-text-muted)" }}
        >
          {description}
        </div>
      )}
      <div className="flex flex-col gap-4">
        {fields.map((field) => (
          <div key={field.name} className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-1">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {field.label}
              </span>
              {field.required && (
                <span
                  className="rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    backgroundColor: errors[field.name] ? "#EF4444" : "var(--color-accent)",
                  }}
                />
              )}
            </div>
            <FormField
              field={field}
              value={values[field.name]}
              onChange={(val) => handleChange(field.name, val)}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        className="mt-5 rounded-xl px-6 py-3 text-sm font-semibold w-full"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "#fff",
        }}
      >
        {submit_label || "Submit"}
      </button>
    </div>
  );
}
