export interface User {
  id: string;
  email: string;
  passwordHash: string;
  tier: 'free' | 'pro';
}
