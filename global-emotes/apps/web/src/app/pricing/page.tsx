import { BRAND } from '@/lib/api';

export const metadata = { title: 'Pricing' };

const TIERS = [
  {
    name: 'Creator Free',
    price: '$0',
    features: [
      '1 connected platform',
      '3 packs · 30 emotes',
      'Static emotes',
      'Basic analytics',
      'Access codes',
    ],
  },
  {
    name: 'Creator Pro',
    price: '$12/mo',
    features: [
      '10 connected platforms',
      '50 packs · 1,000 emotes',
      'Animated emotes',
      'Tier-based access rules',
      'Team members · advanced analytics',
      '14-day free trial',
    ],
    highlight: true,
  },
  {
    name: 'Creator Business',
    price: '$49/mo',
    features: [
      'Multiple brands',
      'Highest limits',
      'Priority support',
      'Audit exports',
      'Contract billing',
    ],
  },
];

export default function PricingPage() {
  return (
    <main>
      <section className="hero" style={{ paddingBottom: 24 }}>
        <h1>Pricing</h1>
        <p>
          Fans use {BRAND} free. Creators pay for power. Prices are placeholders until launch
          pricing is finalized.
        </p>
      </section>
      <div className="grid cols-3">
        {TIERS.map((tier) => (
          <div
            className="card"
            key={tier.name}
            style={tier.highlight ? { borderColor: 'var(--brand)' } : undefined}
          >
            <h3>{tier.name}</h3>
            <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>{tier.price}</p>
            <ul style={{ paddingLeft: 18 }}>
              {tier.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        Fan Plus (cross-device sync, folders, premium themes) ships behind a feature flag while we
        validate pricing.
      </p>
    </main>
  );
}
