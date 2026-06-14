export const RATE_LIMITS = {
  LINK_CREATE: 10,
  TRANSACTIONS_PER_PAGE: 20,
  MAX_LINKS_FREE: 10,
  MAX_TXNS_FREE: 50,
  MAX_LINKS_PRO: 'unlimited',
  MAX_TXNS_PRO: 500,
} as const

export const UPI_APPS = [
  { name: 'Google Pay', package: 'com.google.android.apps.nbu.paisa.user', scheme: 'tez' },
  { name: 'PhonePe', package: 'com.phonepe.app', scheme: 'phonepe' },
  { name: 'Paytm', package: 'net.one97.paytm', scheme: 'paytmmp' },
  { name: 'BHIM', package: 'in.org.npci.upiapp', scheme: 'bhim' },
  { name: 'Amazon Pay', package: 'in.amazon.mShop.android.shopping', scheme: 'amazonpay' },
  { name: 'CRED', package: 'com.dreamplug.androidapp', scheme: 'cred' },
] as const

export const PRICING = {
  free: { links: 10, txns: 50, price: 0, custom_domain: false, webhooks: false, team: false },
  pro: { links: 'unlimited', txns: 500, price: 299, custom_domain: true, webhooks: true, team: false },
  growth: { links: 'unlimited', txns: 5000, price: 999, custom_domain: true, webhooks: true, team: true },
} as const
