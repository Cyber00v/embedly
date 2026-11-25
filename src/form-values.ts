type RadioControl = { checked: boolean };

export function getRadioGroupValue<T extends RadioControl, Value>(
  controls: readonly T[],
  readValue: (control: T) => Value,
): Value | "" {
  const selected = controls.find((control) => control.checked);
  return selected ? readValue(selected) : "";
}
