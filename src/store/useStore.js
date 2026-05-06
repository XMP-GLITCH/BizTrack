import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const INIT_BUSINESSES = [
  {
    id: 1, name: "Crochet by Sabi", category: "Crochet", color: "#C17F5A", emoji: "🧶",
    inventory: [
      { id: 1, name: "Bucket Hat", qty: 8, cost: 1500, price: 4500, sold: 14 },
      { id: 2, name: "Crop Top", qty: 3, cost: 2500, price: 7000, sold: 9 },
      { id: 3, name: "Tote Bag", qty: 11, cost: 1200, price: 3500, sold: 6 },
    ],
    sales: [
      { id: 1, itemName: "Bucket Hat", qty: 2, revenue: 9000, cost: 3000, date: "2024-05-06" },
      { id: 2, itemName: "Crop Top", qty: 1, revenue: 7000, cost: 2500, date: "2024-05-05" },
      { id: 3, itemName: "Tote Bag", qty: 3, revenue: 10500, cost: 3600, date: "2024-05-03" },
    ],
  },
  {
    id: 2, name: "Adé Jewelry", category: "Jewelry", color: "#8B6914", emoji: "📿",
    inventory: [
      { id: 1, name: "Cowrie Necklace", qty: 15, cost: 800, price: 3500, sold: 22 },
      { id: 2, name: "Gold Waist Chain", qty: 6, cost: 2000, price: 6500, sold: 11 },
      { id: 3, name: "Ear Cuffs Set", qty: 2, cost: 500, price: 2000, sold: 18 },
    ],
    sales: [
      { id: 1, itemName: "Cowrie Necklace", qty: 3, revenue: 10500, cost: 2400, date: "2024-05-06" },
      { id: 2, itemName: "Gold Waist Chain", qty: 1, revenue: 6500, cost: 2000, date: "2024-05-04" },
    ],
  },
  {
    id: 3, name: "Bloom Skincare", category: "Beauty", color: "#7A9B76", emoji: "🌿",
    inventory: [
      { id: 1, name: "Shea Body Butter", qty: 20, cost: 800, price: 2500, sold: 14 },
      { id: 2, name: "Rosehip Oil", qty: 7, cost: 1500, price: 4000, sold: 8 },
    ],
    sales: [
      { id: 1, itemName: "Shea Body Butter", qty: 5, revenue: 12500, cost: 4000, date: "2024-05-06" },
    ],
  },
];

export const useStore = create(
  persist(
    (set) => ({
      businesses: INIT_BUSINESSES,
      currency: 'XAF',
      lowStockThreshold: 3,
      
      setBusinesses: (businesses) => set({ businesses }),
      setCurrency: (currency) => set({ currency }),
      setLowStockThreshold: (lowStockThreshold) => set({ lowStockThreshold })
    }),
    {
      name: 'biztrack-storage-v3', // bumping version to replace old structure
    }
  )
)
