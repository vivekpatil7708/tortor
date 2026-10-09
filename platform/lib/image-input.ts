// Logo and background images: an https link, or an uploaded PNG, JPEG, WebP or
// GIF up to 1 MB (saved as a data URL). Shared by the branding page and the
// server, so used in the browser too: no Node imports.

export const MAX_IMAGE_BYTES = 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** For a file the merchant picked: why it can't be used, or null. */
export function imageFileProblem(file: { type: string; size: number }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Please choose a PNG, JPEG, WebP or GIF image.'
  if (file.size > MAX_IMAGE_BYTES) return 'That image is larger than 1 MB. Please choose a smaller one.'
  return null
}

/** For a value about to be saved (data URL or link): why it can't be, or null. */
export function imageValueProblem(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return 'Invalid image'
  if (/^https:\/\/\S+$/.test(value)) return value.length <= 2048 ? null : 'Image link is too long'
  const match = /^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) return 'Use a PNG, JPEG, WebP or GIF image, or an https link'
  // Base64 stores 3 bytes in every 4 characters.
  return Math.floor((match[1].length * 3) / 4) <= MAX_IMAGE_BYTES ? null : 'Image is larger than 1 MB'
}

/** The images inside a link's custom_fields products: why one can't be used, or null. */
export function productsImageProblem(customFields: unknown): string | null {
  if (!Array.isArray(customFields)) return null
  const entry = customFields.find(f => (f as { _type?: string } | null)?._type === 'products') as { items?: unknown } | undefined
  const items = Array.isArray(entry?.items) ? (entry.items as Array<{ image?: unknown }>) : []
  for (const item of items) {
    const problem = imageValueProblem(item?.image)
    if (problem) return problem === 'Image is larger than 1 MB' ? 'A product image is larger than 1 MB' : problem
  }
  return null
}
