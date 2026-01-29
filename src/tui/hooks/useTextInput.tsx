import { useInput } from 'ink';
import React from 'react';
import { useNavigation } from '../context/navigation.js';

type UseTextInputOptions = {
  onClear: () => void;
  disabled?: boolean;
};

export function useTextInput({ onClear, disabled = false }: UseTextInputOptions) {
  const { setTextInputActive, setTextInputEscMode } = useNavigation();
  const skipNextChangeRef = React.useRef(false);

  React.useEffect(() => {
    setTextInputActive(true);
    setTextInputEscMode('back');
    return () => {
      setTextInputActive(false);
      setTextInputEscMode('back');
    };
  }, [setTextInputActive, setTextInputEscMode]);

  const clearValue = React.useCallback(() => {
    skipNextChangeRef.current = true;
    onClear();
  }, [onClear]);

  useInput((input, key) => {
    if (disabled) return;
    if ((key.ctrl && input === 'd') || input === '\u0004') {
      clearValue();
    }
  });

  const wrapOnChange = React.useCallback(
    (handler: (next: string) => void) => (next: string) => {
      if (skipNextChangeRef.current) {
        skipNextChangeRef.current = false;
        handler('');
        return;
      }
      handler(next);
    },
    []
  );

  return { wrapOnChange };
}
