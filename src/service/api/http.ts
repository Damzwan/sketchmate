import { FirebaseAuthentication } from '@capacitor-firebase/authentication'

const BASE_URL = import.meta.env.VITE_BACKEND as string

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const result = await FirebaseAuthentication.getIdToken()
  const token = result.token

  // 2. Setup Headers
  const headers = new Headers(options.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  // Only set JSON if we aren't sending FormData (for images/files)
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) return {} as T

  return response.json()
}