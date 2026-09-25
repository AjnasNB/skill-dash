import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, SpinnerGap, WarningCircle } from '@phosphor-icons/react';

export function CopyButton({ text, label = 'Copy command', iconOnly = false, children, className = '', disabled = false }) {
  const [state, setState] = useState('idle');
  const timer = useRef(null);
  const operation = useRef(0);
  useEffect(() => {
    operation.current++;
    setState('idle');
    clearTimeout(timer.current);
    return () => { operation.current++; clearTimeout(timer.current); };
  }, [text]);

  const copy = async () => {
    const current = ++operation.current;
    clearTimeout(timer.current);
    setState('copying');
    try {
      await navigator.clipboard.writeText(text);
      if (operation.current !== current) return;
      setState('copied');
      timer.current = setTimeout(() => setState('idle'), 2400);
    } catch {
      if (operation.current === current) setState('error');
    }
  };
  const Icon = state === 'copied' ? Check : state === 'copying' ? SpinnerGap : state === 'error' ? WarningCircle : Copy;
  const message = state === 'copied' ? 'Copied!' : state === 'copying' ? 'Copying…' : '';
  const accessibleLabel = children ? `${label}: $ ${text}` : !iconOnly && message ? `${label}: ${message}` : label;
  return <span className={`copy-control ${children ? 'copy-control-command' : ''}`} data-copy-state={state}>
    <button type="button" className={`copy-button ${iconOnly ? 'icon-button' : ''} ${className}`} aria-label={accessibleLabel} data-copy-label={label}
      disabled={disabled || state === 'copying'} aria-busy={state === 'copying'} onClick={copy}>
      {children}
      <Icon size={17} aria-hidden="true" className={state === 'copied' ? 'copy-check' : state === 'copying' ? 'spin' : ''} />
      {!iconOnly && !children && <span>{message || label}</span>}
    </button>
    <span className={`copy-status ${state === 'error' ? 'copy-error' : iconOnly || children ? 'copy-popover' : 'sr-only'}`} role="status" aria-live="polite" aria-atomic="true">
      {state === 'error' ? 'Copy blocked. Select the text and copy it manually, or try again.' : message}
    </span>
  </span>;
}
