import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { haptic } from '../utils/haptics';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={() => {
          haptic.light();
          install();
        }}
        className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 px-3 py-1.5 text-xs font-semibold text-white dark:text-neutral-950 transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Cài ứng dụng</span>
      </motion.button>
    );
  }

  if (isIOS) {
    return (
      <>
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            haptic.light();
            setShowIOSGuide(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.07] dark:border-white/[0.09] bg-white dark:bg-[#161618] px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-[#1E1E21] transition-colors whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Cài trên iOS</span>
        </motion.button>

        <AnimatePresence>
          {showIOSGuide && (
            <motion.div
              key="ios-install-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setShowIOSGuide(false)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4"
            >
              <motion.div
                key="ios-install-card"
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#161618] p-6 shadow-2xl"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold tracking-tight text-neutral-950 dark:text-white">
                    Cài trên iPhone
                  </h3>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.88 }}
                    onClick={() => {
                      haptic.light();
                      setShowIOSGuide(false);
                    }}
                    aria-label="Đóng hướng dẫn"
                    className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
                <ol className="mt-3 space-y-2 text-xs text-neutral-600 dark:text-neutral-300 list-decimal pl-4">
                  <li>
                    Nhấn <strong>Chia sẻ (Share)</strong> trên thanh công cụ Safari.
                  </li>
                  <li>
                    Chọn <strong>Thêm vào Màn hình chính</strong>.
                  </li>
                  <li>
                    Nhấn <strong>Thêm</strong> để dùng toàn màn hình như ứng dụng gốc.
                  </li>
                </ol>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    haptic.light();
                    setShowIOSGuide(false);
                  }}
                  className="mt-5 w-full rounded-xl bg-neutral-900 dark:bg-white py-2.5 text-xs font-semibold text-white dark:text-neutral-950 hover:opacity-90 transition-opacity"
                >
                  Đã hiểu
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return null;
};
