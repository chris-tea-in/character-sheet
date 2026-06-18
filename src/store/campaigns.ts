import { create } from 'zustand'
import * as api from '../lib/syncApi'
import type { Campaign } from '../lib/syncApi'

// Campaigns the signed-in user belongs to. Online-only state — it mirrors the
// cloud and is never persisted locally (a player's *characters* are local-first,
// but campaign membership lives only in the cloud). All mutations go through the
// API; the server recomputes authority on every request.

interface CampaignsState {
  campaigns: Campaign[]
  loaded: boolean
  load: () => Promise<void>
  create: (name: string) => Promise<Campaign | null>
  join: (code: string) => Promise<{ id: string; name: string } | null>
  remove: (id: string) => Promise<boolean>
  rotateCode: (id: string) => Promise<string | null>
}

export const useCampaignStore = create<CampaignsState>()((set, get) => ({
  campaigns: [],
  loaded: false,

  load: async () => {
    const res = await api.listCampaigns()
    if (res.ok) set({ campaigns: res.data, loaded: true })
  },

  create: async (name) => {
    const res = await api.createCampaign(name)
    if (!res.ok) return null
    set(s => ({ campaigns: [res.data, ...s.campaigns] }))
    return res.data
  },

  join: async (code) => {
    const res = await api.joinCampaign(code)
    if (!res.ok) return null
    await get().load() // refresh so the newly-joined campaign appears
    return res.data
  },

  remove: async (id) => {
    const res = await api.deleteCampaign(id)
    if (!res.ok) return false
    set(s => ({ campaigns: s.campaigns.filter(c => c.id !== id) }))
    return true
  },

  rotateCode: async (id) => {
    const res = await api.rotateCode(id)
    if (!res.ok) return null
    set(s => ({
      campaigns: s.campaigns.map(c => c.id === id ? { ...c, inviteCode: res.data.inviteCode } : c),
    }))
    return res.data.inviteCode
  },
}))
