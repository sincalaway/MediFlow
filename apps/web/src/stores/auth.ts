// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { can, type ModuleKey, type Role } from '@mediflow/shared'
import { defineStore } from 'pinia'
import { api, tokenStore } from '../api'

export interface Me {
  id: number
  username: string
  displayName: string
  role: Role
  mustChangePassword: boolean
  staffId?: number | null
}

export const useAuth = defineStore('auth', {
  state: () => ({ me: null as Me | null, loaded: false }),
  getters: {
    role: (s) => s.me?.role,
    loggedIn: (s) => !!s.me,
  },
  actions: {
    can(...mods: ModuleKey[]) {
      return mods.some((m) => can(this.me?.role, m))
    },
    async load() {
      if (!tokenStore.get()) {
        this.me = null
        this.loaded = true
        return
      }
      try {
        this.me = await api.get<Me>('/auth/me')
      } catch {
        this.me = null
      }
      this.loaded = true
    },
    async login(username: string, password: string) {
      const r = await api.post<{ token: string; user: Me }>('/auth/login', { username, password })
      tokenStore.set(r.token)
      this.me = r.user
      this.loaded = true
      return r.user
    },
    logout() {
      tokenStore.clear()
      this.me = null
    },
  },
})
