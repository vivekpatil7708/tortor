export interface Merchant {
  id: string
  email: string
  phone: string
  business_name: string
  business_logo_url: string | null
  brand_color_primary: string
  brand_color_secondary: string
  brand_font: string
  button_style: string
  page_theme: string
  custom_domain: string | null
  status: 'active' | 'suspended' | 'kyc_pending'
  created_at: string
}

export interface UpiId {
  id: string
  merchant_id: string
  vpa: string
  is_primary: boolean
  verified_at: string | null
  status: 'active' | 'inactive'
}

export interface PaymentLink {
  id: string
  merchant_id: string
  upi_id: string
  title: string
  description: string | null
  amount: number | null
  amount_flexible: boolean
  min_amount: number | null
  max_amount: number | null
  custom_fields: CustomField[]
  expiry_at: string | null
  max_uses: number | null
  use_count: number
  redirect_url: string | null
  webhook_url: string | null
  slug: string
  status: 'active' | 'inactive' | 'expired'
  created_at: string
  updated_at: string
}

export interface CustomField {
  name: string
  label: string
  type: 'text' | 'tel' | 'email' | 'number'
  required: boolean
}

export interface Transaction {
  id: string
  merchant_id: string
  payment_link_id: string | null
  txn_id: string
  upi_txn_id: string | null
  amount: number
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  customer_note: string | null
  custom_field_values: Record<string, string>
  status: 'initiated' | 'pending' | 'success' | 'failed' | 'refunded'
  settlement_status: 'pending' | 'processing' | 'settled'
  payment_app: string | null
  payer_vpa: string | null
  created_at: string
}

export interface BrandingConfig {
  logo_url: string | null
  primary_color: string
  secondary_color: string
  font: string
  button_style: 'rounded' | 'pill' | 'square'
  page_theme: 'light' | 'dark' | 'cream'
}
