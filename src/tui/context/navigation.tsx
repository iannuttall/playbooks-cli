import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cleanupTempDir } from '../../git.js';
import type { AddSkillState, CliInvocation, FindSkillState, Screen } from '../types.js';

type Flash = { id: number; text: string };
type NavAction = 'push' | 'pop' | 'reset';

type NavState = {
  screen: Screen;
  setScreen: (s: Screen) => void;
  navigateTo: (s: Screen) => void;
  resetTo: (s: Screen) => void;
  goBack: () => void;
  stack: Screen[];
  flashes: ReadonlyArray<Flash>;
  setFlash: (msg: string | null) => void;
  navAction: NavAction;
  lastSource: string | null;
  setLastSource: (value: string | null) => void;
  getBackHandler: () => (() => boolean) | null;
  setBackHandler: (fn: (() => boolean) | null) => void;
  invocation: CliInvocation;
  setInvocation: (next: CliInvocation) => void;
  addSkill: AddSkillState;
  setAddSkill: (next: AddSkillState) => void;
  updateAddSkill: (patch: Partial<AddSkillState>) => void;
  resetAddSkill: () => void;
  findSkill: FindSkillState;
  setFindSkill: (next: FindSkillState) => void;
  updateFindSkill: (patch: Partial<FindSkillState>) => void;
  resetFindSkill: () => void;
  isTextInputActive: boolean;
  setTextInputActive: (active: boolean) => void;
  textInputEscMode: 'quit' | 'back';
  setTextInputEscMode: (mode: 'quit' | 'back') => void;
};

const NavigationContext = createContext<NavState | null>(null);

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('NavigationContext not found');
  return ctx;
}

export function NavigationProvider({
  children,
  initialInvocation,
  initialScreen,
}: {
  children: React.ReactNode;
  initialInvocation: CliInvocation;
  initialScreen: Screen;
}) {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [stack, setStack] = useState<Screen[]>([initialScreen]);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [invocation, setInvocation] = useState<CliInvocation>(initialInvocation);
  const [addSkill, setAddSkill] = useState<AddSkillState>({});
  const [findSkill, setFindSkill] = useState<FindSkillState>({ status: 'idle' });
  const [isTextInputActive, setTextInputActive] = useState(false);
  const [textInputEscMode, setTextInputEscMode] = useState<'quit' | 'back'>('back');
  const [navAction, setNavAction] = useState<NavAction>('reset');
  const [lastSource, setLastSource] = useState<string | null>(initialInvocation.source ?? null);
  const backHandlerRef = React.useRef<(() => boolean) | null>(null);
  const flashTimersRef = React.useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const navigateTo = useCallback((s: Screen) => {
    setNavAction('push');
    setStack((prev) => [...prev, s]);
    setScreen(s);
  }, []);

  const resetTo = useCallback((s: Screen) => {
    setNavAction('reset');
    setStack([s]);
    setScreen(s);
  }, []);

  const goBack = useCallback(() => {
    setNavAction('pop');
    let target: Screen;
    if (stack.length <= 1) {
      target = stack[0] ?? 'main';
      setStack([target]);
    } else {
      const next = stack.slice(0, -1);
      target = next[next.length - 1] ?? 'main';
      setStack(next);
    }
    setScreen(target);
  }, [stack]);

  const setFlash = useCallback((msg: string | null) => {
    if (msg === null) {
      for (const timer of flashTimersRef.current.values()) {
        clearTimeout(timer);
      }
      flashTimersRef.current.clear();
      setFlashes([]);
      return;
    }
    const id = Date.now() + Math.random();
    setFlashes((prev) => [...prev, { id, text: msg }]);
    const timer = setTimeout(() => {
      setFlashes((prev) => prev.filter((f) => f.id !== id));
      flashTimersRef.current.delete(id);
    }, 5000);
    flashTimersRef.current.set(id, timer);
  }, []);

  React.useEffect(() => {
    return () => {
      for (const timer of flashTimersRef.current.values()) {
        clearTimeout(timer);
      }
      flashTimersRef.current.clear();
    };
  }, []);

  React.useEffect(() => {
    if (!addSkill.tempDir) return;
    if (screen.startsWith('add-') || screen.startsWith('find-')) return;
    cleanupTempDir(addSkill.tempDir).catch(() => {});
  }, [addSkill.tempDir, screen]);

  const updateAddSkill = useCallback((patch: Partial<AddSkillState>) => {
    setAddSkill((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetAddSkill = useCallback(() => {
    setAddSkill({});
  }, []);

  const updateFindSkill = useCallback((patch: Partial<FindSkillState>) => {
    setFindSkill((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFindSkill = useCallback(() => {
    setFindSkill({ status: 'idle' });
  }, []);

  const value = useMemo<NavState>(
    () => ({
      screen,
      setScreen,
      navigateTo,
      resetTo,
      goBack,
      stack,
      flashes,
      setFlash,
      navAction,
      lastSource,
      setLastSource,
      getBackHandler: () => backHandlerRef.current,
      setBackHandler: (fn) => {
        backHandlerRef.current = fn;
      },
      invocation,
      setInvocation,
      addSkill,
      setAddSkill,
      updateAddSkill,
      resetAddSkill,
      findSkill,
      setFindSkill,
      updateFindSkill,
      resetFindSkill,
      isTextInputActive,
      setTextInputActive,
      textInputEscMode,
      setTextInputEscMode,
    }),
    [
      screen,
      stack,
      flashes,
      navAction,
      navigateTo,
      resetTo,
      goBack,
      setFlash,
      lastSource,
      invocation,
      addSkill,
      updateAddSkill,
      resetAddSkill,
      findSkill,
      updateFindSkill,
      resetFindSkill,
      isTextInputActive,
      textInputEscMode,
    ]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
