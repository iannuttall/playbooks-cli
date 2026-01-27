import { useApp, useInput } from 'ink';
import { useNavigation } from '../context/navigation.js';

export function useKeyboardShortcuts() {
  const { exit } = useApp();
  const {
    screen,
    goBack,
    resetTo,
    getBackHandler,
    stack,
    setInvocation,
    resetAddSkill,
    setLastSource,
    invocation,
  } = useNavigation();

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      exit();
      return;
    }

    if ((input === 'm' || input === 'M') && screen !== 'main') {
      if (invocation.source) {
        setLastSource(invocation.source);
      }
      resetAddSkill();
      setInvocation({ intent: 'none', options: {} });
      resetTo('main');
      return;
    }

    if (key.leftArrow && screen !== 'main') {
      const handler = getBackHandler();
      if (handler?.()) {
        return;
      }
      if (stack.length > 1) {
        goBack();
      }
    }

    if (key.ctrl && input === 'c') {
      if (screen !== 'main') {
        resetTo('main');
      } else {
        exit();
      }
    }
  });
}
