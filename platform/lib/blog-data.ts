export interface BlogAuthor {
  slug: string
  name: string
  avatar: string
  bio: string
  role: string
}

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  description: string
  author: BlogAuthor
  publishedAt: string
  updatedAt: string
  category: string
  tags: string[]
  readTime: string
  featured?: boolean
  imageUrl: string
  content: string
}

export const AUTHORS: Record<string, BlogAuthor> = {
  'toropay-team': {
    slug: 'toropay-team',
    name: 'ToroPay Team',
    avatar: '/blog/authors/team.svg',
    bio: 'Building free payment infrastructure for Indian businesses. Writing about UPI, fintech, and digital payments.',
    role: 'Engineering & Product',
  },
  'vivek-patil': {
    slug: 'vivek-patil',
    name: 'Vivek Patil',
    avatar: '/blog/authors/vivek.svg',
    bio: 'Founder of ToroPay. Previously built payment tools for Indian SMBs. Interested in fintech, UPI, and simple products.',
    role: 'Founder',
  },
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'how-to-use-toropay-complete-guide',
    title: 'How to Use ToroPay: A Complete Step-by-Step Guide',
    excerpt: 'Set up your account, create payment links, build your storefront, and start accepting UPI payments in under 5 minutes.',
    description: 'Learn how to set up your ToroPay account, create payment links, build your storefront, generate QR codes, and start accepting UPI payments — all in under 5 minutes.',
    author: AUTHORS['toropay-team'],
    publishedAt: '2026-07-24',
    updatedAt: '2026-07-24',
    category: 'Tutorials',
    tags: ['ToroPay guide', 'how to use ToroPay', 'payment link setup', 'UPI payment tutorial', 'step by step', 'Indian business payments'],
    readTime: '7 min read',
    featured: true,
    imageUrl: 'https://images.pexels.com/photos/6994291/pexels-photo-6994291.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    content: `
<h2>What is ToroPay?</h2>
<p>ToroPay is a free UPI payment platform built for Indian businesses, freelancers, and creators. It lets you accept payments through custom payment links, a professional storefront page, and QR codes — all with zero transaction fees.</p>
<p>No merchant account. No gateway charges. No hidden costs. Just sign up and start accepting payments.</p>

<h2>Step 1: Create Your Free Account</h2>
<ol>
  <li>Go to <a href="https://toropay.co.in/signup">toropay.co.in/signup</a></li>
  <li>Enter your email address and create a password</li>
  <li>Verify your email (check your inbox for the verification link)</li>
  <li>Log in to your dashboard</li>
</ol>
<p>The entire process takes less than 2 minutes. No phone number or KYC required to get started.</p>

<h2>Step 2: Add Your UPI ID</h2>
<p>Before you can accept payments, you need to connect your UPI ID so ToroPay knows where to route funds.</p>
<ol>
  <li>Go to <strong>Dashboard → UPI</strong></li>
  <li>Click <strong>"Add UPI ID"</strong></li>
  <li>Enter your VPA (e.g. <code>yourname@upi</code>, <code>yourname@oksbi</code>)</li>
  <li>Click <strong>"Verify"</strong> — ToroPay will send a ₹1 verification to confirm the ID is valid</li>
  <li>Once verified, your UPI ID is ready to use</li>
</ol>
<p>You can add multiple UPI IDs (from different banks) and set one as your primary receiving account.</p>

<h2>Step 3: Create a Payment Link</h2>
<p>Payment links are the fastest way to start collecting money. Share them via WhatsApp, email, SMS, or Instagram DMs.</p>
<ol>
  <li>Go to <strong>Dashboard → Links → Create New</strong></li>
  <li>Enter a title (e.g. "Order #123 — T-shirt")</li>
  <li>Set the amount (or leave it open for the customer to enter)</li>
  <li>Add optional products with descriptions and prices</li>
  <li>Add a customer note (optional) — e.g. "Thank you for your order!"</li>
  <li>Click <strong>"Create Link"</strong></li>
</ol>
<p>Copy the generated URL and share it with your customer. When they pay, you'll see the transaction in your dashboard instantly.</p>

<h2>Step 4: Build Your Storefront</h2>
<p>Your storefront is a public page that shows all your payment links in one place — like a mini website for your business.</p>
<ol>
  <li>Go to <strong>Dashboard → Branding</strong></li>
  <li>Upload your business logo</li>
  <li>Add a tagline (e.g. "Handmade jewellery from Mumbai")</li>
  <li>Choose your theme colours</li>
  <li>Add your business description and social links</li>
</ol>
<p>Your storefront URL is <code>toropay.co.in/pay/your-store</code> — share it anywhere and let customers browse and pay at their own pace.</p>

<h2>Step 5: Generate QR Codes</h2>
<p>QR codes are perfect for in-person payments — display them at your shop, on packaging, or on invoices.</p>
<ol>
  <li>Go to <strong>Dashboard → Links → [your link] → QR Code</strong></li>
  <li>Download the QR code as PNG</li>
  <li>Print it, display it, or attach it to invoices</li>
</ol>
<p>When a customer scans the code, they're taken directly to your payment page.</p>

<h2>Step 6: Track Your Payments</h2>
<p>The ToroPay dashboard shows everything in real time:</p>
<ul>
  <li><strong>Transactions</strong> — View all incoming payments with status (completed, pending, failed)</li>
  <li><strong>Analytics</strong> — See total revenue, orders over time, payment method breakdown, and top-performing links</li>
  <li><strong>Order Details</strong> — Click any transaction to see full details including what the customer ordered</li>
</ul>
<p>No more chasing payments or losing track of who paid. Everything is in one place.</p>

<h2>Step 7: Share Your Links</h2>
<p>ToroPay makes sharing easy with built-in buttons:</p>
<ul>
  <li><strong>WhatsApp</strong> — One-click share to any WhatsApp contact or group</li>
  <li><strong>X (Twitter)</strong> — Tweet your payment link</li>
  <li><strong>LinkedIn</strong> — Share professionally</li>
  <li><strong>Copy Link</strong> — Paste anywhere — email, SMS, Instagram, Telegram</li>
</ul>
<p>You can also share your storefront link on your social media bios, business cards, or email signatures.</p>

<h2>Frequently Asked Questions</h2>

<h3>Is ToroPay really free?</h3>
<p>Yes. There are zero transaction fees, zero setup fees, and zero monthly charges. ToroPay is free forever.</p>

<h3>How do I receive the money?</h3>
<p>Payments go directly from your customer's UPI app to your UPI ID. ToroPay never holds your money — it goes straight to your bank account via UPI.</p>

<h3>Can I use ToroPay for my online store?</h3>
<p>Absolutely. Create payment links for each product or service, add them to your storefront page, and share the link on social media or your website.</p>

<h3>Do I need a business registration?</h3>
<p>No. ToroPay works for anyone — freelancers, solopreneurs, students, content creators, and registered businesses alike.</p>

<h2>Get Started Now</h2>
<p>Setting up ToroPay takes less than 5 minutes. No contracts, no fees, no hassle.</p>
<p><a href="/signup">Create your free ToroPay account →</a></p>
`,
  },
  {
    slug: 'best-razorpay-alternatives-for-indian-businesses',
    title: '7 Best Razorpay Alternatives for Indian Businesses in 2026',
    excerpt: 'Looking for Razorpay alternatives? Here are the top free payment gateways and UPI solutions worth switching to.',
    description: 'Looking for Razorpay alternatives? Compare the top free payment gateways and UPI payment solutions for Indian businesses. No transaction fees, no hidden charges.',
    author: AUTHORS['toropay-team'],
    publishedAt: '2026-01-15',
    updatedAt: '2026-07-21',
    category: 'Comparisons',
    tags: ['Razorpay alternative', 'payment gateway', 'UPI', 'free payment solution'],
    readTime: '8 min read',
    imageUrl: 'https://images.pexels.com/photos/5849576/pexels-photo-5849576.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    content: `
<h2>Why Look for Razorpay Alternatives?</h2>
<p>Razorpay has been one of the most popular payment gateways in India. But it's not the only option — and for many businesses, it might not be the best one.</p>

<p>Common reasons businesses look for alternatives:</p>
<ul>
<li><strong>Transaction fees</strong> — Razorpay charges 2% per transaction. For high-volume businesses, this adds up fast.</li>
<li><strong>Settlement delays</strong> — T+2 settlement can hurt cash flow for small businesses.</li>
<li><strong>Complex integration</strong> — The API can be overwhelming for simple use cases.</li>
<li><strong>KYC requirements</strong> — Extensive documentation needed for onboarding.</li>
</ul>

<h2>1. ToroPay — Best Free UPI Payment Page Platform</h2>
<p><strong>Pricing: 100% Free</strong></p>
<p>ToroPay is a free platform that lets you create branded UPI payment pages and shareable payment links using your own UPI ID. There are no transaction fees, no monthly charges, and no hidden costs.</p>

<h3>Key Features:</h3>
<ul>
<li>Branded checkout pages with your logo and colors</li>
<li>Shareable payment links and QR codes</li>
<li>Custom fields for collecting customer information</li>
<li>Transaction tracking and analytics dashboard</li>
<li>Webhook callbacks for automation</li>
<li>Payment templates for repeat orders</li>
</ul>

<h3>How ToroPay Compares to Razorpay:</h3>
<table>
<tr><th>Feature</th><th>ToroPay</th><th>Razorpay</th></tr>
<tr><td>Transaction Fee</td><td>0%</td><td>2%</td></tr>
<tr><td>Setup Fee</td><td>Free</td><td>Free</td></tr>
<tr><td>Settlement</td><td>Direct to your UPI</td><td>T+2 to bank</td></tr>
<tr><td>Payment Methods</td><td>UPI (all apps)</td><td>UPI, Cards, Netbanking, Wallets</td></tr>
<tr><td>Branded Pages</td><td>Yes</td><td>No</td></tr>
<tr><td>Payment Links</td><td>Yes (free)</td><td>Yes (paid)</td></tr>
</table>

<h2>2. Cashfree Payments</h2>
<p><strong>Pricing: 2% per transaction</strong></p>
<p>Cashfree is a strong alternative to Razorpay with competitive pricing and better settlement times. They support UPI, cards, netbanking, and wallets.</p>

<h3>Pros:</h3>
<ul>
<li>Same-day settlement available</li>
<li>Better API documentation than Razorpay</li>
<li>Supports bulk payouts</li>
</ul>

<h3>Cons:</h3>
<ul>
<li>2% transaction fee still applies</li>
<li>No free payment links</li>
<li>Minimum KYC requirements</li>
</ul>

<h2>3. InstaPay (by PhonePe)</h2>
<p>InstaPay by PhonePe is designed for businesses that want a simple UPI collection solution.</p>

<h2>4. PayU</h2>
<p><strong>Pricing: 2% per transaction</strong></p>
<p>PayU is one of the oldest payment gateways in India with wide payment method support.</p>

<h2>5. CCAvenue</h2>
<p><strong>Pricing: 2% per transaction</strong></p>
<p>CCAvenue is popular among e-commerce businesses with strong international presence.</p>

<h2>6. Paytm for Business</h2>
<p><strong>Pricing: Up to 2% per transaction</strong></p>

<h2>7. Google Pay for Business</h2>
<p><strong>Pricing: Free for UPI</strong></p>
<p>Google Pay for Business allows direct UPI collections but has limited features.</p>

<h2>How to Choose</h2>
<p>For most Indian businesses that primarily use UPI, ToroPay offers the best value — zero fees, branded pages, and instant settlement.</p>

<p><a href="/signup">Create your free ToroPay account →</a></p>`,
  },
  {
    slug: 'free-payment-links-india',
    title: 'How to Create Free Payment Links in India',
    excerpt: 'Accept payments instantly with zero transaction fees. A practical guide to creating and sharing UPI payment links.',
    description: 'Learn how to create free UPI payment links in India without any transaction fees. Accept payments instantly with ToroPay payment links and QR codes.',
    author: AUTHORS['vivek-patil'],
    publishedAt: '2026-02-10',
    updatedAt: '2026-07-21',
    category: 'Tutorials',
    tags: ['free payment links', 'UPI payment', 'no transaction fees', 'payment solution India'],
    readTime: '5 min read',
    imageUrl: 'https://images.pexels.com/photos/15510851/pexels-photo-15510851.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    content: `
<h2>What Are Payment Links?</h2>
<p>Payment links are shareable URLs that let your customers pay you directly. When a customer clicks the link, they see a branded payment page where they can complete the transaction using any UPI app.</p>

<p>Unlike traditional payment gateways, payment links don't require a website or app. You just share the link via WhatsApp, email, SMS, or any messaging app.</p>

<h2>Why Most Payment Link Services Charge Fees</h2>
<p>Most payment link providers like Razorpay, PayU, and Cashfree charge 2% per transaction. On a ₹10,000 payment, you lose ₹200.</p>

<h2>How to Create Free Payment Links with ToroPay</h2>

<h3>Step 1: Sign Up (Free)</h3>
<p>Create your ToroPay account at <a href="/signup">toropay.co.in/signup</a>. No credit card required.</p>

<h3>Step 2: Add Your UPI ID</h3>
<p>Enter your VPA (like yourname@bank). ToroPay validates it instantly.</p>

<h3>Step 3: Create a Payment Link</h3>
<p>Set your amount (fixed or custom), add a title, choose your brand colors, and add a logo.</p>

<h3>Step 4: Share the Link</h3>
<p>Share the link via WhatsApp, Instagram, email, or any channel.</p>

<h2>What You Get with ToroPay Payment Links</h2>
<ul>
<li><strong>Branded checkout page</strong> — Your logo, your colors, your brand identity</li>
<li><strong>Custom amount option</strong> — Let customers enter the amount they want to pay</li>
<li><strong>QR codes</strong> — Auto-generated QR code for every payment link</li>
<li><strong>Transaction tracking</strong> — See who paid, when, and how much</li>
<li><strong>Custom fields</strong> — Collect names, phone numbers, notes, or any custom data</li>
</ul>

<h2>How ToroPay Compares</h2>
<table>
<tr><th>Feature</th><th>ToroPay</th><th>Razorpay Links</th><th>PayU Links</th></tr>
<tr><td>Transaction Fee</td><td>0%</td><td>2%</td><td>2%</td></tr>
<tr><td>Custom Branding</td><td>Yes (free)</td><td>No</td><td>No</td></tr>
<tr><td>QR Code</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Custom Fields</td><td>Yes</td><td>No</td><td>No</td></tr>
<tr><td>Instant Settlement</td><td>Yes (to UPI)</td><td>No (T+2)</td><td>No</td></tr>
</table>

<p><a href="/signup">Create free payment links with ToroPay →</a></p>`,
  },
  {
    slug: 'cashless-payment-solutions-for-small-business',
    title: 'Cashless Payment Solutions for Small Businesses in India',
    excerpt: 'A complete 2026 guide to going cashless — UPI, payment links, QR codes, and hosted checkout pages compared.',
    description: 'Complete guide to cashless payment solutions for Indian small businesses. Compare UPI, payment links, QR codes, and hosted checkout pages.',
    author: AUTHORS['toropay-team'],
    publishedAt: '2026-03-05',
    updatedAt: '2026-07-21',
    category: 'Guides',
    tags: ['cashless payment', 'small business', 'UPI', 'digital payments', 'India'],
    readTime: '10 min read',
    imageUrl: 'https://images.pexels.com/photos/6214448/pexels-photo-6214448.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    content: `
<h2>India's Cashless Payment Revolution</h2>
<p>India processes over 12 billion UPI transactions every month. For small businesses, going cashless isn't just a convenience — it's a necessity.</p>

<h2>Understanding Your Options</h2>

<h3>1. UPI Payment Links</h3>
<p>Payment links are the easiest way to start accepting digital payments. Create a link, share it, and the customer pays via any UPI app.</p>

<h3>2. QR Code Payments</h3>
<p>Static QR codes display your UPI ID. Dynamic QR codes include the amount and generate a unique reference.</p>

<h3>3. Hosted Checkout Pages</h3>
<p>A branded payment page you link to from social media, WhatsApp, or your website.</p>

<h3>4. Payment Gateway Integration</h3>
<p>Full integration for websites and apps. Supports cards, netbanking, and wallets in addition to UPI.</p>

<h2>Why UPI-First Is the Right Strategy</h2>
<ul>
<li>Zero transaction fees on UPI</li>
<li>Instant settlement to your bank/UPI</li>
<li>99% of Indian smartphone users have a UPI app</li>
<li>No hardware or POS machine needed</li>
</ul>

<h2>Real-World Examples</h2>

<h3>Salon Business</h3>
<p>Riya runs a salon in Mumbai. She shares a ToroPay payment link after every appointment. Her customers pay via UPI, and the money goes directly to her bank.</p>

<h3>Freelance Designer</h3>
<p>Arjun sends branded ToroPay payment links with his invoices. His clients pay instantly, and he doesn't lose 2% to gateway fees.</p>

<h3>Local Restaurant</h3>
<p>A restaurant in Bangalore uses ToroPay QR codes at every table. Diners scan, pay, and leave — no waiting for the bill.</p>

<p><a href="/signup">Start accepting cashless payments with ToroPay →</a></p>`,
  },
  {
    slug: 'toropay-vs-instapay-comparison',
    title: 'ToroPay vs InstaPay: Which UPI Solution Is Better?',
    excerpt: 'A detailed comparison of ToroPay and InstaPay by PhonePe. Features, pricing, branding, and which one fits your business.',
    description: 'Detailed comparison of ToroPay vs InstaPay by PhonePe for UPI payments. See features, pricing, branding, and which is better for your business.',
    author: AUTHORS['vivek-patil'],
    publishedAt: '2026-04-12',
    updatedAt: '2026-07-21',
    category: 'Comparisons',
    tags: ['ToroPay vs InstaPay', 'InstaPay alternative', 'UPI business', 'PhonePe business'],
    readTime: '6 min read',
    imageUrl: 'https://images.pexels.com/photos/3305/numbers-money-calculating-calculation.jpg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    content: `
<h2>ToroPay vs InstaPay: Overview</h2>
<p>Both ToroPay and InstaPay help businesses accept UPI payments, but they serve different needs.</p>

<table>
<tr><th>Feature</th><th>ToroPay</th><th>InstaPay</th></tr>
<tr><td>Pricing</td><td>100% Free</td><td>Free for basic UPI</td></tr>
<tr><td>Transaction Fee</td><td>0%</td><td>0% for UPI</td></tr>
<tr><td>Branded Payment Pages</td><td>Yes (full customization)</td><td>No</td></tr>
<tr><td>Payment Links</td><td>Yes (branded)</td><td>Basic links</td></tr>
<tr><td>QR Codes</td><td>Dynamic + Static</td><td>Static only</td></tr>
<tr><td>Custom Fields</td><td>Yes</td><td>No</td></tr>
<tr><td>Logo & Branding</td><td>Full control</td><td>PhonePe branding</td></tr>
<tr><td>Webhooks</td><td>Yes</td><td>No</td></tr>
</table>

<h2>When to Choose ToroPay</h2>
<ul>
<li><strong>Brand matters</strong> — You want your customers to see YOUR brand, not PhonePe's</li>
<li><strong>Collect customer data</strong> — You need custom fields for orders, bookings, or registration</li>
<li><strong>Professional experience</strong> — You want a polished, branded checkout page</li>
<li><strong>Automation</strong> — You need webhooks to integrate with existing systems</li>
</ul>

<h2>When to Choose InstaPay</h2>
<ul>
<li><strong>PhonePe ecosystem</strong> — You're already deeply integrated with PhonePe</li>
<li><strong>Physical stores</strong> — You need simple QR codes for counter payments</li>
<li><strong>No branding needed</strong> — You don't care about white-label checkout</li>
</ul>

<h2>The Verdict</h2>
<p>For freelancers, creators, and small businesses that want a professional, branded payment experience at zero cost, ToroPay is the better choice.</p>

<p><a href="/signup">Try ToroPay free →</a></p>`,
  },
  {
    slug: 'how-to-accept-payments-without-website',
    title: 'How to Accept Online Payments Without a Website in India',
    excerpt: 'No website? No problem. Payment links, QR codes, and hosted checkout pages let you accept UPI payments today.',
    description: 'No website? No problem. Learn how to accept UPI payments using payment links, QR codes, and hosted checkout pages. No coding, no gateway fees.',
    author: AUTHORS['toropay-team'],
    publishedAt: '2026-05-20',
    updatedAt: '2026-07-21',
    category: 'Guides',
    tags: ['accept payments without website', 'UPI payments', 'no-code payments', 'payment links India'],
    readTime: '5 min read',
    imageUrl: 'https://images.pexels.com/photos/6994295/pexels-photo-6994295.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    content: `
<h2>You Don't Need a Website to Accept Payments</h2>
<p>Many freelancers, tutors, and small business owners think they need a website to accept digital payments. That's not true.</p>

<h2>Method 1: Payment Links</h2>
<p>A payment link is a URL you share with your customer. When they open it, they see a payment page where they can pay using UPI.</p>

<h3>How to Create Payment Links with ToroPay:</h3>
<ol>
<li>Sign up at toropay.co.in (free)</li>
<li>Add your UPI ID</li>
<li>Click "Create Payment Link"</li>
<li>Set the amount, title, and optional custom fields</li>
<li>Share the link via WhatsApp, Instagram, email, or SMS</li>
</ol>

<h2>Method 2: QR Codes</h2>
<p>QR codes are great for in-person payments. Print your QR code and place it at your counter, table, or shop entrance.</p>

<h2>Method 3: Hosted Checkout Pages</h2>
<p>A hosted checkout page is a permanent page for your business. Link to it from your Instagram bio, WhatsApp status, or anywhere.</p>

<h2>Use Cases</h2>

<h3>Freelancers</h3>
<p>Send a payment link with your project invoice. The client pays instantly — no bank transfers, no delays.</p>

<h3>Online Tutors</h3>
<p>Create a payment link for each batch. Share it in your class group. Parents pay directly.</p>

<h3>Event Organizers</h3>
<p>Collect registration fees with custom fields (name, phone, ticket type). No form builder needed.</p>

<h3>Instagram Sellers</h3>
<p>Add your ToroPay checkout link to your bio. Customers browse and pay through your branded page.</p>

<p><a href="/signup">Create your free ToroPay account →</a></p>`,
  },
  {
    slug: 'upi-payment-page-best-practices',
    title: 'UPI Payment Page Best Practices: Boost Conversions',
    excerpt: 'Proven tips to optimize your UPI payment page for higher conversions. Design, trust signals, and checkout flow advice.',
    description: 'Proven tips to optimize your UPI payment page for higher conversion rates. Design, trust signals, amount selection, and checkout flow best practices.',
    author: AUTHORS['vivek-patil'],
    publishedAt: '2026-06-10',
    updatedAt: '2026-07-21',
    category: 'Tips',
    tags: ['UPI payment page', 'conversion optimization', 'checkout design', 'payment best practices'],
    readTime: '7 min read',
    imageUrl: 'https://images.pexels.com/photos/11952301/pexels-photo-11952301.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    content: `
<h2>Your Payment Page Is Your Last Impression</h2>
<p>A customer has decided to pay you. They click the payment link. What happens next determines whether you get paid — or lose the sale.</p>

<h2>1. Add Your Brand Logo and Colors</h2>
<p>A branded payment page builds trust. When customers see your logo and brand colors, they know they're paying the right person.</p>

<h2>2. Use Clear, Descriptive Titles</h2>
<p>Don't just say "Payment." Say "Monthly Coaching Session — June 2026" or "Custom Website Design — 50% Advance."</p>

<h2>3. Show the Amount Clearly</h2>
<p>Display the amount prominently. Use large, readable text. For custom amounts, set clear minimum and maximum limits.</p>

<h2>4. Keep the Checkout Flow Simple</h2>
<p>Every extra step reduces conversion. The ideal flow is: Open link → See product/amount → Enter details → Pay → Confirmation.</p>

<h2>5. Add Trust Signals</h2>
<ul>
<li>Your business name and contact information</li>
<li>A brief description of what they're paying for</li>
<li>"Secure UPI Payment" badge</li>
<li>Your support email or phone</li>
</ul>

<h2>6. Offer Custom Amount Option</h2>
<p>For donations, tips, or flexible pricing, offer a custom amount option.</p>

<h2>7. Test Your Payment Flow</h2>
<p>Before sharing your link, test it yourself. Open it on your phone, go through the entire flow, and pay a small amount.</p>

<h2>8. Track and Optimize</h2>
<p>Monitor your analytics. Look at payment page views vs completed payments, average order value, and most popular payment apps.</p>

<p><a href="/signup">Create your optimized payment page →</a></p>`,
  },
  {
    slug: 'best-upi-payment-apps-for-business',
    title: 'Best UPI Payment Apps for Business in India (2026)',
    excerpt: 'Google Pay, PhonePe, Paytm, BHIM — which UPI app should your business use? The answer might surprise you.',
    description: 'Compare the best UPI apps for business payments in India. Google Pay, PhonePe, Paytm, BHIM, and more — which UPI app is best for accepting business payments?',
    author: AUTHORS['toropay-team'],
    publishedAt: '2026-07-01',
    updatedAt: '2026-07-21',
    category: 'Comparisons',
    tags: ['best UPI app business', 'Google Pay business', 'PhonePe business', 'UPI payments India'],
    readTime: '6 min read',
    imageUrl: 'https://images.pexels.com/photos/163069/mobile-phone-money-banknotes-us-dollars-163069.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    content: `
<h2>Which UPI App Should Your Business Use?</h2>
<p>India's UPI ecosystem has multiple apps — Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, CRED, and more. For businesses, the question is: which one should you use to accept payments?</p>

<p>The good news: with ToroPay, it doesn't matter which UPI app your customer uses. They all work.</p>

<h2>How UPI Works for Businesses</h2>
<p>UPI is a payment system, not an app. Google Pay, PhonePe, and Paytm are just interfaces to the same UPI infrastructure.</p>

<h2>The Best UPI Apps for Receiving Business Payments</h2>

<h3>1. Google Pay</h3>
<p>Most popular UPI app in India. Excellent reliability and fast processing.</p>

<h3>2. PhonePe</h3>
<p>Second most popular with a strong merchant ecosystem.</p>

<h3>3. Paytm</h3>
<p>Widely used, especially in smaller cities.</p>

<h3>4. BHIM (by NPCI)</h3>
<p>The original UPI app by the government. Simple, direct, and reliable.</p>

<h3>5. Amazon Pay</h3>
<p>Growing in popularity among Amazon shoppers.</p>

<h3>6. CRED</h3>
<p>Popular among premium users and urban professionals.</p>

<h2>What Matters for Business Payments</h2>
<p>Instead of choosing a "best UPI app," focus on payment link quality, branding, settlement speed, transaction fees, and analytics.</p>

<h2>The Right Solution: ToroPay</h2>
<p>ToroPay works with all UPI apps. Your customers pay with their preferred app, and the money goes directly to your UPI ID.</p>

<p><a href="/signup">Create your free ToroPay account →</a></p>`,
  },
  {
    slug: 'payment-gateway-pricing-institutions-india',
    title: 'Payment Gateway Pricing for Schools, EdTech, NGOs, and Government Bodies in India',
    excerpt: 'Advertised TDR is the smallest part of a payment gateway\u2019s real cost. Here\u2019s what schools, EdTech firms, NGOs, and civic bodies should actually compare \u2014 in plain numbers.',
    description: 'A practical guide to payment gateway pricing for institutions in India: MDR, TDR, AMC, platform fees, GST, success rates, and total cost of ownership for schools, EdTech, NGOs, and government bodies.',
    author: AUTHORS['toropay-team'],
    publishedAt: '2026-07-09',
    updatedAt: '2026-07-09',
    category: 'Guides',
    tags: ['payment gateway pricing India', 'TDR explained', 'AMC payment gateway', 'institutional payments India', 'UPI fees for schools', 'total cost of ownership payments'],
    readTime: '11 min read',
    imageUrl: 'https://images.pexels.com/photos/35558791/pexels-photo-35558791.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    content: `
<h2>Why the advertised rate is the wrong starting point</h2>
<p>Most institutions that evaluate a payment gateway begin by comparing transaction percentages. That is a natural instinct, but it is usually an incomplete picture. The lowest headline rate on a pricing page often arrives with annual maintenance charges, one-time setup fees, or a platform fee that quietly erases the advantage. More importantly, two gateways charging the same rate can deliver very different amounts of money to your account once failed payments and reconciliation effort are counted.</p>
<p>The figure that matters is total cost of ownership \u2014 how much actually lands in your bank account after fees, GST, refunds, and declines. This guide walks through the fees, the maths, and the segment-specific needs of schools, EdTech companies, NGOs, and government bodies in India, and shows where a free UPI-first option like ToroPay fits.</p>

<h2>The fee types hiding in pricing pages</h2>
<p>Pricing pages usually advertise one number and leave the rest buried in terms and conditions. These are the charges worth checking before you sign:</p>
<ul>
  <li><strong>MDR (Merchant Discount Rate)</strong> \u2014 the percentage a bank charges the merchant on a successful card payment.</li>
  <li><strong>TDR (Transaction Discount Rate)</strong> \u2014 the percentage the gateway keeps per successful transaction; for most pages this is the headline number.</li>
  <li><strong>Platform fee</strong> \u2014 a recurring infrastructure charge that some gateways apply even on zero-MDR methods like standard UPI, to cover dashboards, reconciliation, and reporting.</li>
  <li><strong>AMC (Annual Maintenance Charge)</strong> \u2014 a fixed yearly fee that is due whether you process one payment or a crore. A typical Rs. 4,999/year AMC works out to about Rs. 416 per month, regardless of volume.</li>
  <li><strong>Setup fee</strong> \u2014 a one-time onboarding charge, sometimes waived for volume.</li>
  <li><strong>Technology fee</strong> \u2014 access to the gateway API, dashboard, or hosted pages.</li>
  <li><strong>Convenience fee</strong> \u2014 a charge passed to the payer, often added on top of the bill at checkout.</li>
</ul>
<p>Several of these can stack on the same transaction. A 1.75% TDR with a Rs. 4,999 AMC is not cheaper than a 2% TDR with no AMC unless your monthly volume is high enough to amortise the fixed charge.</p>

<h2>How GST changes the effective rate</h2>
<p>GST at 18% is applied on top of the gateway fee. On a Rs. 100 payment at 2% TDR, the fee is Rs. 2 plus Rs. 0.36 GST, so the total charge is Rs. 2.36 \u2014 an effective rate of 2.36%, not 2%. Premium payment methods such as EMI, corporate cards, and Pay Later are typically priced higher, often around 3% plus GST. When you compare two gateways, compare the all-in rate after GST, not the base percentage.</p>

<h2>Is UPI really free for institutions?</h2>
<p>Standard UPI \u2014 where a payer enters their UPI PIN and money moves directly from their bank account \u2014 carries 0% MDR under NPCI rules. That makes UPI the cheapest collection rail in India by far. UPI accounted for roughly 85% of digital transaction volume in India in late 2025, according to RBI data, so this matters for nearly every collection.</p>
<p>Two caveats. First, a gateway may still add a platform fee on UPI even though MDR is zero, so "free UPI" on a pricing page is worth questioning. Second, RuPay credit cards on UPI attract a separate MDR in the region of 1.1% to 2% because a credit line is involved. If you only ever collect standard bank-account UPI, both caveats are avoidable.</p>
<p>This is where a UPI-only tool has an advantage. ToroPay charges no TDR, no platform fee, and no AMC on standard UPI \u2014 payments move directly from your customer's bank to your own UPI ID, with no merchant account or settlement cycle in between.</p>

<h2>A worked example: the maths of fixed fees</h2>
<p>Take a school collecting Rs. 2 lakh per month in fees. Compare two options:</p>
<ul>
  <li><strong>Gateway A:</strong> 1.75% TDR, Rs. 4,999/year AMC.</li>
  <li><strong>Gateway B:</strong> 2% TDR, no AMC.</li>
</ul>
<p>Gateway A costs Rs. 3,500 in TDR plus Rs. 416 in AMC \u2014 about Rs. 3,916 per month. Gateway B costs Rs. 4,000. The lower advertised rate is actually more expensive until monthly volume crosses roughly Rs. 2 lakh, where the fixed AMC finally gets amortised. Below that volume, a zero-fee option wins outright.</p>
<p>Success rate matters even more. If Gateway A declines 8% of payments and Gateway B captures those, on Rs. 2 lakh of monthly collections that is a Rs. 16,000 swing in money that actually arrives \u2014 far larger than any TDR difference. Low advertised rates cannot compensate for payments that fail or never reach you.</p>

<h2>Schools and colleges</h2>
<p>Schools deal with defined fee cycles \u2014 tuition, transport, hostel, and exam fees \u2014 and a huge number of small payments each term. The hidden cost is reconciliation: matching hundreds of parent payments to student accounts eats finance-team hours every single term.</p>
<p>Practical levers: create a separate payment link or QR per purpose (tuition, hostel, bus), so money arrives pre-labelled and matching is trivial. ToroPay lets you generate a unique link for each category with no charge, and every payment shows instantly in the dashboard with the customer's name and note. Schools collecting over UPI avoid both MDR and the reconciliation overhead of traditional virtual-account tools.</p>

<h2>EdTech companies</h2>
<p>EdTech economics are driven by course fees, subscriptions, and high-ticket conversion. Two costs dominate: failed payments on expensive courses, and refund handling.</p>
<p>A failed payment on a Rs. 50,000 course is lost revenue if the student does not retry, so success rate and follow-up matter more than a fraction of a percentage point in TDR. Subscription businesses also need to chase renewals; a simple recurring link or reminder flow can recover a meaningful share of involuntary churn. If you serve overseas students, note that international cards require a full international-accepting gateway \u2014 a domestic UPI link like ToroPay covers Indian students only.</p>

<h2>NGOs</h2>
<p>NGOs collect one-time and recurring donations, and their real costs are compliance and receipts, not rates. Automatic 80G receipts are a feature of some gateways; on a UPI link platform you would generate receipts separately. For foreign donations, Indian NGOs must hold FCRA registration and route all foreign money through a single designated FCRA account \u2014 so foreign contribution rails need specialist handling no generic pricing page covers. For domestic donations, a hosted donation page or payment link with zero fees keeps nearly every rupee.</p>

<h2>Government bodies</h2>
<p>Public-sector collections \u2014 taxes, utilities, and civic dues \u2014 often run through regulated rails like BBPS or Bharat Connect, where pricing follows regulated bill-payment structures rather than open-market TDR. Transparency and audit trails are the real requirements. Small civic collections such as event fees or local department collections can run fine on a free UPI link; anything that must feed a regulated ecosystem should use the appropriate rail.</p>

<h2>Hidden costs beyond the advertised rate</h2>
<p>Four costs are easy to miss:</p>
<ul>
  <li><strong>GST on fees</strong> \u2014 18% on top of every fee line.</li>
  <li><strong>Refunds</strong> \u2014 gateway fees on refunded transactions are often not recovered.</li>
  <li><strong>Reconciliation labour</strong> \u2014 unmatched payments consume staff time every cycle.</li>
  <li><strong>Failed payments</strong> \u2014 declined payments are lost revenue unless the payer retries.</li>
</ul>
<p>All four are fixed capabilities in a UPI-link tool with a live dashboard, rather than recurring manual cost.</p>

<h2>How ToroPay compares for institutions</h2>
<ul>
  <li><strong>TDR:</strong> Rs. 0 on standard UPI.</li>
  <li><strong>AMC:</strong> Rs. 0 \u2014 no annual maintenance charge.</li>
  <li><strong>Setup fee:</strong> Rs. 0 \u2014 no onboarding charge, no KYC.</li>
  <li><strong>Platform fee:</strong> Rs. 0 \u2014 dashboards, links, QR codes, and reporting are included.</li>
  <li><strong>Settlement:</strong> instant \u2014 money goes directly to your own UPI ID; ToroPay never holds funds.</li>
  <li><strong>No website needed:</strong> hosted payment pages work out of the box.</li>
</ul>
<p>The trade-off is scope: ToroPay is a domestic UPI tool. It does not process cards, international payments, EMI mandates, 80G receipts, FIRC, or regulated BBPS rails. For an institution collecting UPI domestically, that trade-off removes almost the entire fee stack.</p>

<h2>Checklist before you sign a gateway contract</h2>
<ul>
  <li>Is there an AMC or setup fee \u2014 and is it waived above a volume threshold?</li>
  <li>Does the platform fee apply on zero-MDR UPI?</li>
  <li>What is the documented success rate, and how is it measured?</li>
  <li>How is GST applied, and what is the all-in rate after tax?</li>
  <li>Which compliance features (receipts, FIRC, reconciliation) are included versus paid add-ons?</li>
  <li>Model the net revenue you would keep at your actual monthly volume \u2014 not the headline percentage.</li>
</ul>
<p>For most schools, small NGOs, and early-stage EdTech firms collecting UPI domestically, the answer will point to zero-fee UPI \u2014 which is exactly what ToroPay is built for.</p>

<h2>Frequently asked questions</h2>
<h3>Is UPI free for schools and NGOs in India?</h3>
<p>Standard bank-account UPI carries 0% MDR, so it is free at the network level. Some gateways add a platform fee on top. A UPI-first tool like ToroPay charges no TDR, no platform fee, and no AMC on standard UPI.</p>
<h3>How is GST charged on gateway fees?</h3>
<p>GST at 18% is added to the fee amount. On a Rs. 100 payment at 2% TDR, the charge is Rs. 2 plus Rs. 0.36 GST \u2014 an effective rate of 2.36%.</p>
<h3>What is the difference between MDR, TDR, and a platform fee?</h3>
<p>MDR and TDR are both the percentage charged per successful transaction (MDR is the bank-level term; TDR is the gateway's rate). A platform fee is a separate recurring infrastructure charge that can apply even when MDR is zero.</p>
<h3>Can an institution collect payments without a website?</h3>
<p>Yes. Hosted payment pages, payment links, and QR codes let schools, NGOs, and civic bodies collect UPI payments without any website or coding.</p>
<h3>Does ToroPay automate 80G receipts or handle foreign donations?</h3>
<p>No. Those are compliance features of specialised gateways. ToroPay is a free domestic UPI tool \u2014 receipts and FCRA-compliant foreign-donation routing need separate handling.</p>
<p><a href="/signup">Create your free ToroPay account \u2192</a></p>`,
  },
  {
    slug: 'cheapest-payment-gateway-shopify-india',
    title: 'Cheapest Payment Gateway for Shopify in India: Choosing a High-ROI Setup',
    excerpt: 'Headline MDR is the least useful number on a pricing page. Here is how to pick a payment gateway for an Indian Shopify store by what actually lands in your bank account.',
    description: 'How to choose a high-ROI payment gateway for Shopify in India: the real cost stack of MDR, Shopify third-party fees, 18% GST and AMC, plus success rates and where free UPI links fit.',
    author: AUTHORS['toropay-team'],
    publishedAt: '2026-07-08',
    updatedAt: '2026-07-08',
    category: 'Comparisons',
    tags: ['Shopify payment gateway India', 'Shopify third party transaction fee', 'payment gateway TCO India', 'UPI for Shopify', 'MDR vs AMC', 'high ROI payment gateway'],
    readTime: '14 min read',
    imageUrl: 'https://images.pexels.com/photos/7620619/pexels-photo-7620619.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    content: `
<h2>Rate shopping tells you the price, not the cost</h2>
<p>Ask any Shopify merchant in India what they look for in a payment gateway and the first word is \u201ccheapest.\u201d The instinct makes sense \u2014 payment costs are a direct hit on margins. But the headline transaction rate on a pricing page is only one line in a longer equation. Add annual maintenance charges, setup fees, and the revenue quietly lost to failed payments, and the gateway with the lowest advertised rate frequently costs more in absolute rupees than one with a higher published MDR.</p>
<p>There is also a structural fact that changes everything for Indian stores: Shopify Payments does not operate in India. Every Indian merchant therefore has to use a third-party gateway, and Shopify charges its own transaction fee on top whenever you do. This guide walks through the full cost stack, works through the maths at realistic volumes, and shows where a free UPI link platform like ToroPay fits in.</p>

<h2>The four layers of the real cost</h2>
<p>Ignore anyone who quotes a single percentage. An Indian Shopify store actually pays four layers:</p>
<ul>
  <li><strong>Gateway MDR/TDR</strong> \u2014 the percentage the gateway keeps per successful transaction.</li>
  <li><strong>Shopify third-party transaction fee</strong> \u2014 a surcharge Shopify levies because you are not using Shopify Payments.</li>
  <li><strong>18% GST</strong> \u2014 applied on top of the gateway fee, turning a 2% quote into an effective 2.36%.</li>
  <li><strong>Fixed charges</strong> \u2014 AMC and setup fees that are due whether you process one order or ten thousand.</li>
</ul>
<p>The working formula is simple: effective cost = (gateway MDR + Shopify fee) x 1.18 + any fixed fees. Stack all four layers and combined payment costs on Indian Shopify stores routinely reach 4% to 5% of every transaction \u2014 roughly double what a casual reading of a 2% MDR suggests.</p>

<h2>Shopify\u2019s third-party transaction fee, by plan</h2>
<p>Whenever a store processes through an external gateway, Shopify adds its own fee. The rates are set by plan tier and are public:</p>
<ul>
  <li><strong>Basic</strong> \u2014 2.0% third-party fee, plan at roughly Rs. 1,499/month with annual billing (before GST).</li>
  <li><strong>Grow</strong> \u2014 1.0% third-party fee, plan at roughly Rs. 5,599/month.</li>
  <li><strong>Advanced</strong> \u2014 0.6% third-party fee, plan at roughly Rs. 22,680/month.</li>
</ul>
<p>These surcharges are separate from and additional to your gateway MDR. On the Basic plan, a transaction pays 2% to the gateway and 2% to Shopify \u2014 before GST. Moving up a plan cuts the surcharge but raises the fixed subscription, so the trade-off is a pure volume calculation, not a preference.</p>

<h2>What a single order actually costs</h2>
<p>Take a Rs. 1,000 order on the Basic plan through a gateway at a flat 2% MDR:</p>
<ul>
  <li>Gateway MDR: Rs. 20.00</li>
  <li>Shopify third-party fee (2%): Rs. 20.00</li>
  <li>18% GST on the gateway fee: Rs. 3.60</li>
  <li><strong>Total deducted: Rs. 43.60 \u2014 an effective rate of 4.36%</strong></li>
</ul>
<p>Scale that up. At Rs. 10 lakh of monthly GMV on Basic, the stack runs to roughly Rs. 43,600 a month, or about Rs. 5.2 lakh a year in payment costs. At Rs. 50 lakh, it is roughly Rs. 2.18 lakh every month. At that scale, two levers dominate: moving to a higher Shopify plan to cut the surcharge, and negotiating a custom MDR. A merchant who stays on Basic and never negotiates leaves real money on the table monthly.</p>

<h2>Annual maintenance charges are the hidden tax</h2>
<p>AMC is where total cost most visibly diverges from the headline rate. Some gateways charge around Rs. 3,600 a year \u2014 Rs. 300 a month. Others charge Rs. 4,999 a year, or Rs. 416 a month. Either way, the charge is fixed: it is paid whether you process Rs. 1 or Rs. 1 crore in a month.</p>
<p>Here is the trap. A gateway advertising 1.75% MDR \u2014 about 0.25 percentage points below the standard 2% \u2014 often makes up the margin with a Rs. 4,999/year AMC. At Rs. 2 lakh monthly GMV, that 0.25 point saving is worth about Rs. 500 a month. The Rs. 416 AMC swallows almost all of it, and the lower rate stops being an advantage. The break-even sits near Rs. 2.08 lakh of monthly GMV: below it, a zero-AMC option wins on total cost; above it, negotiated rates matter more than list prices.</p>

<h2>Success rate is a revenue number, not a footnote</h2>
<p>A lower MDR reduces what you pay on transactions that succeed. It does nothing about the ones that fail \u2014 and failed payments are where merchant revenue quietly leaks. When a payment declines, the customer may abandon the cart for good. The sale is gone, but the marketing spend that produced the click was already spent.</p>
<p>Run the numbers. At Rs. 2 lakh monthly GMV, a gateway reporting an 85% success rate versus one reporting 93% is an 8 percentage point gap \u2014 about Rs. 16,000 a month in recovered revenue. Compare that with the Rs. 500 a month an MDR negotiation at the same volume is worth, and the success rate gap is worth over thirty times more. Treat success rate as a core revenue metric when comparing gateways, not a technical footnote in the documentation.</p>

<h2>UPI on Shopify: free at the bank, not always free for you</h2>
<p>The government\u2019s Zero MDR policy covers standard bank-to-bank UPI and RuPay debit transactions: at the network level, no interchange is charged. But \u201cZero MDR\u201d does not mean \u201czero cost to the merchant\u201d on every gateway. Many gateways still layer on a platform or technology fee to fund dashboards, reconciliation, and secure infrastructure \u2014 which is why the 2% standard rate often appears on UPI transactions even though the bank-level MDR is zero.</p>
<p>There is also a real exception: when a customer pays using a RuPay credit card linked to a UPI app, the Zero MDR policy does not apply. That transaction carries a separate fee, typically in the 1% to 2% range plus GST. If you market UPI to customers as your low-cost method, factor the RuPay-credit-on-UPI case in separately.</p>

<h2>How the right choice changes with store size</h2>
<p><strong>Small stores under Rs. 5 lakh GMV.</strong> Below the break-even, fixed costs dominate the decision. A gateway with zero AMC and zero setup fee is almost always cheaper in absolute rupees than a lower-MDR gateway carrying a fixed annual charge. Prioritise zero fixed costs and a strong success rate over the headline rate.</p>
<p><strong>Scaling D2C brands between Rs. 5 lakh and Rs. 50 lakh.</strong> Two factors take over: success rate and checkout conversion. An 8 percentage point success-rate difference is worth more each month than any realistic MDR negotiation. This is also the tier where moving from Basic to Grow or Advanced begins to pay for itself, and where custom MDR becomes negotiable.</p>
<p><strong>Domestic plus international.</strong> Many Indian stores run two rails at once: one domestic gateway for UPI, RuPay, net banking, and cards, and a separate provider for international cards and cross-border payments. Shopify supports multiple gateways, so reliability across both matters more than squeezing a fraction of a point from either.</p>

<h2>The ToroPay angle: take UPI outside the checkout</h2>
<p>Every cost layer above \u2014 MDR, Shopify surcharge, GST \u2014 attaches to money that flows through Shopify\u2019s payment stack. ToroPay is built to sit beside that stack rather than inside it.</p>
<p>ToroPay generates free UPI payment links and QR codes with hosted payment pages. Money moves directly from the customer\u2019s bank to your own UPI ID, with no merchant account, no settlement cycle, and no platform holding funds. There is no TDR, no AMC, no setup fee, and no platform fee. And because the payment never touches Shopify\u2019s checkout, no Shopify third-party surcharge applies to it either.</p>
<p>Concretely, Indian Shopify merchants use ToroPay for the transactions that naturally happen off the cart:</p>
<ul>
  <li><strong>COD-to-UPI conversion</strong> \u2014 a doorstep QR that turns a cash-on-delivery order into an instant UPI collection and kills the RTO risk.</li>
  <li><strong>WhatsApp and DM orders</strong> \u2014 send a payment link instead of a payment link request dance.</li>
  <li><strong>Follow-up on abandoned carts</strong> \u2014 a personalised link in a reminder message often recovers orders that would otherwise never retry.</li>
  <li><strong>Bulk, offline, and wholesale sales</strong> \u2014 invoices, events, and B2B collections that never go near the storefront.</li>
</ul>
<p>Be clear about the limits. ToroPay is not a native Shopify checkout integration and does not process cards, net banking, or international payments. For orders paid through the Shopify cart itself, you still need a gateway and the Shopify fee applies. But for the slice of your revenue that can shift to UPI links \u2014 often the largest single payment method among Indian shoppers \u2014 you remove nearly the entire cost stack.</p>

<h2>Checklist before you sign a gateway contract</h2>
<ul>
  <li>Is the AMC or setup fee actually zero \u2014 and is it waived only above a volume threshold?</li>
  <li>Does a platform fee apply on zero-MDR UPI transactions?</li>
  <li>What is the documented success rate, and how is it measured?</li>
  <li>What is the all-in rate after 18% GST \u2014 not the pre-GST headline?</li>
  <li>Model net revenue at your real monthly GMV, including the Shopify plan surcharge.</li>
  <li>Separate the payments that must flow through checkout from the ones that can move over UPI links.</li>
</ul>
<p>For stores that can route a meaningful share of Indian orders over UPI links, the cheapest setup is often a standard gateway for cards plus ToroPay for UPI \u2014 not the lowest-MDR gateway on a pricing page.</p>

<h2>Frequently asked questions</h2>
<h3>Which is the cheapest payment gateway for Shopify in India?</h3>
<p>It depends on monthly GMV. Below roughly Rs. 2.08 lakh a month, a gateway with zero annual maintenance charges beats a lower-MDR gateway carrying a fixed AMC in absolute rupees. Above that, negotiated custom MDR and success rate matter more than list price.</p>
<h3>Why does Shopify charge an extra transaction fee in India?</h3>
<p>Because Shopify Payments is not available in India, every Indian merchant must use a third-party gateway, which triggers Shopify\u2019s third-party transaction fee of 2% on Basic, 1% on Grow, and 0.6% on Advanced \u2014 on top of the gateway MDR.</p>
<h3>Is Shopify Payments available in India?</h3>
<p>No. India is not a supported market for Shopify Payments, so all Indian merchants must integrate a third-party gateway. That is the structural reason payment costs are higher for Indian stores than in Shopify Payments markets.</p>
<h3>Is UPI free on Shopify payment gateways?</h3>
<p>Standard bank-to-bank UPI carries zero MDR at the network level, but gateways often add a platform fee, which is why the standard rate frequently still applies. RuPay credit cards on UPI are an exception and carry a separate fee, so UPI is not universally free.</p>
<h3>Does GST apply to payment gateway fees?</h3>
<p>Yes \u2014 18% GST applies to every gateway fee in India. A 2% MDR becomes an effective 2.36% after tax, which is why comparing pre-GST headline rates understates the true cost.</p>
<h3>Can ToroPay be used with a Shopify store?</h3>
<p>Yes, alongside your store. Use ToroPay\u2019s free UPI links and QR codes for COD conversions, WhatsApp orders, abandoned-cart follow-ups, and offline collections. Payments go directly to your UPI ID with no gateway fee and no Shopify surcharge. It does not replace a card gateway inside Shopify checkout.</p>
<p><a href="/signup">Create your free ToroPay account \u2192</a></p>`,
  },
]

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find(p => p.slug === slug)
}

export function getBlogSlugs(): string[] {
  return BLOG_POSTS.map(p => p.slug)
}

export function getBlogCategories(): string[] {
  return Array.from(new Set(BLOG_POSTS.map(p => p.category)))
}

export function getBlogAuthors(): BlogAuthor[] {
  return Object.values(AUTHORS)
}

export function getAuthor(slug: string): BlogAuthor | undefined {
  return AUTHORS[slug]
}

export function getPostsByAuthor(authorSlug: string): BlogPost[] {
  return BLOG_POSTS.filter(p => p.author.slug === authorSlug)
}

export function getPostsByCategory(category: string): BlogPost[] {
  return BLOG_POSTS.filter(p => p.category.toLowerCase() === category.toLowerCase())
}

export function getRelatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  return BLOG_POSTS
    .filter(p => p.slug !== post.slug)
    .filter(p => p.category === post.category || p.tags.some(t => post.tags.includes(t)))
    .slice(0, limit)
}

export function searchPosts(query: string): BlogPost[] {
  const q = query.toLowerCase()
  return BLOG_POSTS.filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.excerpt.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q) ||
    p.tags.some(t => t.toLowerCase().includes(q)) ||
    p.category.toLowerCase().includes(q)
  )
}

export function getCategoryDescription(category: string): string {
  const descriptions: Record<string, string> = {
    'Tutorials': 'Step-by-step guides to help you get started with ToroPay and UPI payments.',
    'Comparisons': 'Honest comparisons of payment solutions, gateways, and UPI platforms for Indian businesses.',
    'Guides': 'In-depth guides on digital payments, going cashless, and building your payment infrastructure.',
    'Tips': 'Practical tips to optimize your payment flow, boost conversions, and get paid faster.',
  }
  return descriptions[category] || 'Articles about UPI payments and digital business tools.'
}

export function addHeadingIds(html: string): string {
  return html.replace(/<(h[23])(\b[^>]*?)>(.*?)<\/\1>/g, (_, tag, attrs, text) => {
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    return `<${tag}${attrs} id="${id}">${text}</${tag}>`
  })
}
