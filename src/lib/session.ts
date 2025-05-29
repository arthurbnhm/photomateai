import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const secretKey = process.env.SESSION_SECRET || 'your-secret-key-change-this'
const encodedKey = new TextEncoder().encode(secretKey)

export interface SessionData {
  userId: string
  email: string
  subscriptionActive: boolean
  expiresAt: number
}

export async function createSession(data: SessionData) {
  const session = await new SignJWT({
    userId: data.userId,
    email: data.email,
    subscriptionActive: data.subscriptionActive,
    expiresAt: data.expiresAt
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)

  const cookieStore = await cookies()
  cookieStore.set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
    sameSite: 'lax'
  })
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')

  if (!cookie?.value) {
    return null
  }

  try {
    const { payload } = await jwtVerify(cookie.value, encodedKey, {
      algorithms: ['HS256'],
    })

    // Safely extract and validate the payload
    if (
      typeof payload.userId === 'string' &&
      typeof payload.email === 'string' &&
      typeof payload.subscriptionActive === 'boolean' &&
      typeof payload.expiresAt === 'number'
    ) {
      return {
        userId: payload.userId,
        email: payload.email,
        subscriptionActive: payload.subscriptionActive,
        expiresAt: payload.expiresAt
      }
    }

    return null
  } catch (error) {
    console.log('Invalid session:', error)
    return null
  }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}

export async function updateSessionSubscription(subscriptionActive: boolean) {
  const session = await getSession()
  if (!session) return

  await createSession({
    userId: session.userId,
    email: session.email,
    subscriptionActive,
    expiresAt: session.expiresAt
  })
} 