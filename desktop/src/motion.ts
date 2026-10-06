import type { Variants, Transition } from 'framer-motion'

// ============================================================
// 统一动效语言：苹果质感的弹簧与缓动曲线
// 所有页面/组件从这里取值，保证整体节奏一致、可统一调参
// ============================================================

// 丝滑减速（页面转场、面板展开）
export const easeOutSoft = [0.16, 1, 0.3, 1] as const
// 回弹（按钮、卡片、徽标入场）
export const springy = [0.34, 1.56, 0.64, 1] as const
// 温和进出
export const easeInOutSoft = [0.65, 0, 0.35, 1] as const

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 30,
  mass: 0.9,
}

export const softTransition: Transition = {
  duration: 0.42,
  ease: easeOutSoft,
}

// 页面转场：淡入 + 轻微上浮 + 极小缩放，切换有「推入」的层次感
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: easeOutSoft } },
  exit: { opacity: 0, y: -10, scale: 0.99, transition: { duration: 0.22, ease: easeInOutSoft } },
}

// 容器：子元素交错入场
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.06 },
  },
}

// 交错子项：上浮 + 淡入 + 微缩放回弹
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: easeOutSoft },
  },
}

// 模态/浮层：从中心弹性放大
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92, y: 12 },
  show: { opacity: 1, scale: 1, y: 0, transition: { ...springTransition } },
  exit: { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.18, ease: easeInOutSoft } },
}

// 遮罩淡入
export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.28 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
}

// 侧边栏/面板滑入
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: easeOutSoft } },
  exit: { opacity: 0, x: 16, transition: { duration: 0.2 } },
}

// Toast：从底部弹入
export const toastVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.9 },
  show: { opacity: 1, y: 0, scale: 1, transition: { ...springTransition } },
  exit: { opacity: 0, y: 12, scale: 0.94, transition: { duration: 0.2, ease: easeInOutSoft } },
}

// 卡片按压反馈
export const tapScale = {
  whileTap: { scale: 0.975 },
  whileHover: { y: -3 },
}
