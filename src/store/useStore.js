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
      
      setBusinesses: (businesses) => set({ businesses }),
      setCurrency: (currency) => set({ currency }),
      setLowStockThreshold: (lowStockThreshold) => set({ lowStockThreshold }),
      setUserName: (userName) => set({ userName })
    }),
    {
      name: 'biztrack-storage-v3', // bumping version to replace old structure
    }
  )
)
