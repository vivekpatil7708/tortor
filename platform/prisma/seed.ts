import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { generateSlug } from '../lib/utils'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('demo123', 12)

  const merchant = await prisma.merchant.upsert({
    where: { email: 'demo@toropay.in' },
    update: {},
    create: {
      email: 'demo@toropay.in',
      phone: '9876543210',
      passwordHash,
      businessName: 'Demo Store',
      brandColorPrimary: '#7bb86c',
      brandColorSecondary: '#2c2c2c',
      onboardingComplete: true,
      settings: {
        create: {
          notificationEmail: 'demo@toropay.in',
          autoSettlement: true,
        },
      },
    },
  })

  await prisma.upiId.upsert({
    where: { merchantId_vpa: { merchantId: merchant.id, vpa: 'demo@paytm' } },
    update: { verifiedAt: new Date(), isPrimary: true },
    create: {
      merchantId: merchant.id,
      vpa: 'demo@paytm',
      isPrimary: true,
      verifiedAt: new Date(),
    },
  })

  const slug = 'demo-booking'
  await prisma.paymentLink.upsert({
    where: { slug },
    update: {},
    create: {
      merchantId: merchant.id,
      upiId: 'demo@paytm',
      title: 'Badminton Court Booking',
      description: 'Pay for your court slot via UPI',
      amount: 500,
      slug,
      customFields: JSON.stringify([
        { name: 'court', label: 'Court Number', type: 'text', required: false },
      ]),
    },
  })

  console.log('Seed complete!')
  console.log('Login: demo@toropay.in / demo123')
  console.log('Payment link: /pay/demo-booking')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
