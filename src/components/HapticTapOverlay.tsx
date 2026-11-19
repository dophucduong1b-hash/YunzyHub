import React, { useSyncExternalStore } from 'react';
import {
  getHapticsEnabled,
  IOS_HAPTIC_SWITCH_ID,
  isIOSHapticsSupported,
  subscribeHapticsEnabled,
} from '../utils/haptics';

interface HapticTapOverlayProps {
  disabled?: boolean;
  zClass?: string;
  className?: string;
  forceEnable?: boolean;
}

export const HapticTapOverlay: React.FC<HapticTapOverlayProps> = ({
  disabled = false,
  zClass = 'z-20',
  className = '',
  forceEnable = false,
}) => {
  const enabled = useSyncExternalStore(
    subscribeHapticsEnabled,
    getHapticsEnabled,
    () => false
  );

  if (disabled || (!enabled && !forceEnable) || !isIOSHapticsSupported()) {
    return null;
  }

  return (
    <label
      htmlFor={IOS_HAPTIC_SWITCH_ID}
      aria-hidden="true"
      className={`absolute inset-0 ${zClass} cursor-pointer select-none ${className}`}
      style={{
        opacity: 0,
        WebkitTapHighlightColor: 'transparent',
      }}
    />
  );
};
