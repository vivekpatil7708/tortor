import { describe, expect, it } from 'vitest'
import { imageFileProblem, imageValueProblem, productsImageProblem, MAX_IMAGE_BYTES } from './image-input'

const smallPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
// Base64 stores 3 bytes in every 4 characters, so this is just over 1 MB.
const hugePng = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8)}`

describe('imageFileProblem', () => {
  it('accepts the allowed image types within the size limit', () => {
    expect(imageFileProblem({ type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull()
    expect(imageFileProblem({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })

  it('refuses other types and images over 1 MB', () => {
    expect(imageFileProblem({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG, JPEG/)
    expect(imageFileProblem({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toMatch(/larger than 1 MB/)
  })
})

describe('imageValueProblem', () => {
  it('accepts empty, a short https link and a small data URL', () => {
    expect(imageValueProblem(null)).toBeNull()
    expect(imageValueProblem('https://cdn.example/logo.png')).toBeNull()
    expect(imageValueProblem(smallPng)).toBeNull()
  })

  it('refuses a value that is not an allowed image, and one over 1 MB', () => {
    expect(imageValueProblem('data:text/html;base64,AAAA')).toMatch(/PNG, JPEG/)
    expect(imageValueProblem(hugePng)).toMatch(/larger than 1 MB/)
  })
})

describe('productsImageProblem', () => {
  it('passes when there are no product images', () => {
    expect(productsImageProblem([{ _type: 'text', name: 'note' }])).toBeNull()
    expect(productsImageProblem([{ _type: 'products', items: [{ name: 'A' }] }])).toBeNull()
  })

  it('names a product image over 1 MB', () => {
    const fields = [{ _type: 'products', items: [{ name: 'A', image: smallPng }, { name: 'B', image: hugePng }] }]
    expect(productsImageProblem(fields)).toBe('A product image is larger than 1 MB')
  })
})
