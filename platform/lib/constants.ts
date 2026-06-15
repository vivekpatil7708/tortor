export const RATE_LIMITS = {
  TRANSACTIONS_PER_PAGE: 20,
} as const

export const UPI_APPS = [
  { name: 'Google Pay', package: 'com.google.android.apps.nbu.paisa.user', scheme: 'tez' },
  { name: 'PhonePe', package: 'com.phonepe.app', scheme: 'phonepe' },
  { name: 'Paytm', package: 'net.one97.paytm', scheme: 'paytmmp' },
  { name: 'BHIM', package: 'in.org.npci.upiapp', scheme: 'bhim' },
  { name: 'Amazon Pay', package: 'in.amazon.mShop.android.shopping', scheme: 'amazonpay' },
  { name: 'CRED', package: 'com.dreamplug.androidapp', scheme: 'cred' },
] as const


