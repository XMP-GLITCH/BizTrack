import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const INIT_BUSINESSES = [];

export const useStore = create(
  persist(
    (set) => ({
      businesses: INIT_BUSINESSES,
      currency: 'XAF',
      lowStockThreshold: 3,
      userName: 'Business Owner',
      onboardingComplete: false,
      hasSeenGuide: false,
      hashedPin: null,
      hashedRecoveryKey: null,
      isPinEnabled: false,
      loginAttempts: 0,
      lockoutUntil: null,
      joinDate: new Date().toISOString(),
      userEmail: '',
      userAvatar: '/avatars/avatar1.png',
      
      setBusinesses: (businesses) => set({ businesses }),
      setCurrency: (currency) => set({ currency }),
      setLowStockThreshold: (lowStockThreshold) => set({ lowStockThreshold }),
      setUserName: (userName) => set({ userName }),
      setUserEmail: (userEmail) => set({ userEmail }),
      setUserAvatar: (userAvatar) => set({ userAvatar }),
      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
      setHasSeenGuide: (hasSeenGuide) => set({ hasSeenGuide }),
      setHashedPin: (hashedPin) => set({ hashedPin }),
      setHashedRecoveryKey: (hashedRecoveryKey) => set({ hashedRecoveryKey }),
      setIsPinEnabled: (isPinEnabled) => set({ isPinEnabled }),
      setLoginAttempts: (loginAttempts) => set({ loginAttempts }),
      setLockoutUntil: (lockoutUntil) => set({ lockoutUntil }),
      setIsDarkMode: (isDarkMode) => set({ isDarkMode })
    }),
    {
      // NOTE: CURRENT_STORAGE_KEY in App.jsx and the splash script in
      // index.html both hardcode this value. Change all three together.
      name: 'biztrack-storage-v3',
    }
  )
)
