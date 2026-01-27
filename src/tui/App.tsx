import { render } from 'ink';
import React from 'react';
import { ScreenRouter } from './ScreenRouter.js';
import { NavigationProvider } from './context/navigation.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import type { CliInvocation, Screen } from './types.js';

function AppRoot() {
  useKeyboardShortcuts();
  return <ScreenRouter />;
}

export function runApp(initialInvocation: CliInvocation, initialScreen: Screen) {
  const { waitUntilExit } = render(
    <NavigationProvider initialInvocation={initialInvocation} initialScreen={initialScreen}>
      <AppRoot />
    </NavigationProvider>
  );
  return waitUntilExit();
}
