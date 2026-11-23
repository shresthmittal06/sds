import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { CATEGORIES, type Product } from '../types/catalog';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';
import { EditableText } from '../components/EditableText';
import { EditableImage } from '../components/EditableImage';
import { resolveVideoBlobUrl } from '../lib/videoStorage';

interface HomePageProps {
  onNavigate: (path: string) => void;
}

const WHY_CHOOSE_ITEMS = [
  {
    index: '01.',
    title: 'Quality-Focused Products',
    description:
      'Consistent stainless steel finishing, structural integrity, and functional design tailored for everyday residential and demanding commercial use.',
  },
  {
    index: '02.',
    title: 'Wide Product Range',
    description:
      'Structured product lines spanning kitchenware, home utility essentials, standardised GN pans, and heavy-duty commercial kitchen equipment.',
  },
  {
    index: '03.',
    title: 'Reliable Supply',
    description:
      'Dependable B2B order coordination supporting wholesalers, distributors, hospitality groups, and institutional procurement teams.',
  },
  {
    index: '04.',
    title: 'Customer-Focused Solutions',
    description:
      'Clear product specifications, responsive bulk quotation workflows, and direct communication for project and recurring trade requirements.',
  },
  {
    index: '05.',
    title: 'Manufacturing Expertise',
    description:
      'Dedicated stainless steel fabrication capabilities built around precision forming, clean edges, and practical commercial usability.',
  },
];

export function HomePage({ onNavigate }: HomePageProps) {
  const {
    products,
    settings,
    categoriesWithOverrides,
    activeContent,
    addToQuote,
    getWhatsAppUrl,
    getImageSlot,
    resolveMediaSrc,
    editMode,
  } = useStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  );
  const [heroVideoSrc, setHeroVideoSrc] = useState<string | null>(null);
  const [heroVideoFailed, setHeroVideoFailed] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    const handleChange = (e: MediaQueryListEvent) => setIsMobileViewport(e.matches);
    setIsMobileViewport(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  const heroMediaMode: 'image' | 'video' =
    activeContent.heroMediaType ||
    (activeContent.heroVideoId ? 'video' : 'image');

  const targetVideoId =
    heroMediaMode === 'video'
      ? isMobileViewport
        ? activeContent.heroMobileVideoId || activeContent.heroVideoId
        : activeContent.heroVideoId
      : '';

  useEffect(() => {
    let cancelled = false;
    setHeroVideoFailed(false);

    if (heroMediaMode !== 'video' || !targetVideoId) {
      setHeroVideoSrc(null);
      return;
    }

    resolveVideoBlobUrl(targetVideoId).then((url) => {
      if (!cancelled) {
        setHeroVideoSrc(url);
        if (!url) setHeroVideoFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [heroMediaMode, targetVideoId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !heroVideoSrc || heroVideoFailed) return;
    el.muted = true;
    el.defaultMuted = true;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Retry once muted state is guaranteed
        el.muted = true;
        el.play().catch(() => {
          setHeroVideoFailed(true);
        });
      });
    }
  }, [heroVideoSrc, heroVideoFailed]);

  const heroFallbackSlot = getImageSlot(
    'home.hero.image',
    '/images/hero_stainless_manufacturing_1794728248058.jpg',
    'SHREE DURGA STEELS stainless steel GN pans and kitchenware collection',
    'cover'
  );
  const heroFallbackSrc =
    resolveMediaSrc(heroFallbackSlot.src) ||
    '/images/hero_stainless_manufacturing_1794728248058.jpg';

  const heroOverlayOpacity =
    typeof activeContent.heroOverlayOpacity === 'number'
      ? Math.min(0.85, Math.max(0.2, activeContent.heroOverlayOpacity))
      : 0.5;

  // Select up to 6 featured products balanced across categories
  const featuredProducts: Product[] = (() => {
    const featured = products.filter((p) => p.featured);
    const source = featured.length > 0 ? featured : products;
    const picked: Product[] = [];
    for (const cat of CATEGORIES) {
      const catItems = source.filter((p) => p.category === cat.id).slice(0, 2);
      picked.push(...catItems);
    }
    if (picked.length < 6) {
      for (const item of source) {
        if (!picked.some((p) => p.id === item.id)) {
          picked.push(item);
        }
        if (picked.length >= 6) break;
      }
    }
    return picked.slice(0, 6);
  })();

  const whyItems =
    activeContent.whyChooseItems && activeContent.whyChooseItems.length > 0
      ? activeContent.whyChooseItems
      : WHY_CHOOSE_ITEMS;

  const handleQuickAdd = (product: Product) => {
    addToQuote({
      productId: product.id,
      category: product.category,
      productName: product.name,
      modelOrSize: product.availableSizes?.[0] || product.modelNumber || 'Standard',
      quantity: 1,
    });
    onNavigate('/quote');
  };

  return (
    <div>
      {/* SECTION 1: HERO SECTION (FULL-WIDTH BACKGROUND VIDEO) */}
      <section className="relative w-full min-h-[75vh] md:min-h-[82vh] flex items-center justify-center bg-black overflow-hidden border-b border-[#B8B8B3]/60">
        {!heroFallbackSlot.deleted && (
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover"
            src="/videos/background.mp4"
          />
        )}

        {heroMediaMode === 'video' && heroVideoSrc && !heroVideoFailed && (
          <video
            ref={videoRef}
            key={heroVideoSrc}
            src={heroVideoSrc}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onCanPlay={(e) => {
              const vid = e.currentTarget;
              vid.muted = true;
              if (vid.paused) {
                vid.play().catch(() => {
                  setHeroVideoFailed(true);
                });
              }
            }}
            onError={() => setHeroVideoFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Subtle Dark Transparent Overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: `rgba(0, 0, 0, ${heroOverlayOpacity})` }}
        />

        {/* Centered Foreground Content & 2 Rectangular Buttons */}
        <div className="relative z-10 w-full max-w-[1040px] mx-auto px-4 sm:px-6 lg:px-10 py-20 md:py-28 text-center">
          <EditableText
            id="home.hero.videoHeading"
            defaultText="ENGINEERED FOR QUALITY. BUILT FOR EVERY KITCHEN."
            label="Hero Main Heading"
            as="h1"
            allowDelete={false}
            className="font-display font-semibold text-white tracking-tight leading-[1.08] uppercase"
            style={{
              fontSize: 'clamp(2rem, 4.4vw, 3.65rem)',
              textWrap: 'balance',
            }}
          />

          <EditableText
            id="home.hero.videoDescription"
            defaultText="Explore our range of stainless steel kitchenware, GN pans and commercial kitchen equipment, crafted for professional and everyday requirements."
            label="Hero Supporting Text"
            as="p"
            multiline
            className="mt-5 text-base sm:text-lg text-white/90 leading-relaxed max-w-2xl mx-auto"
          />

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/products"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/products');
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-white text-black text-xs font-semibold tracking-[0.08em] uppercase hover:bg-[#F5F5F5] transition-colors whitespace-nowrap"
            >
              <EditableText
                id="home.hero.videoCtaPrimary"
                defaultText="EXPLORE PRODUCTS"
                label="Hero Button 1"
                allowDelete={false}
              />
            </a>

            <a
              href={getWhatsAppUrl(
                'Hello SHREE DURGA STEELS, I would like to enquire about your products and request a quotation.'
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#5B1018] text-white text-xs font-semibold tracking-[0.08em] uppercase hover:bg-[#430b11] transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <EditableText
                id="home.hero.videoCtaSecondary"
                defaultText="GET A QUOTE ON WHATSAPP"
                label="Hero Button 2"
                allowDelete={false}
              />
            </a>
          </div>
        </div>
      </section>

      {/* SECTION 2: EXPLORE OUR PRODUCT CATEGORIES */}
      <section className="bg-[#F5F5F5] border-b border-[#B8B8B3]/60 py-16 md:py-24">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
            <div>
              <EditableText
                id="home.categories.eyebrow"
                defaultText="Product Divisions"
                label="Categories Section Eyebrow"
                as="p"
                className="text-xs font-semibold tracking-[0.12em] uppercase text-[#5B1018] mb-2"
              />
              <EditableText
                id="home.categories.heading"
                defaultText="Explore Our Product Categories"
                label="Categories Section Heading"
                as="h2"
                className="font-display text-2xl md:text-3xl font-semibold text-black tracking-tight"
              />
            </div>
            <a
              href="/products"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/products');
              }}
              className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.08em] uppercase text-black hover:text-[#5B1018] transition-colors whitespace-nowrap"
            >
              <EditableText
                id="home.categories.viewAll"
                defaultText="View Full Catalogue"
                label="View Full Catalogue Link"
                allowDelete={false}
              />
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {categoriesWithOverrides.map((category, idx) => {
              const catUsage =
                category.id === 'gn-pans'
                  ? 'gn-pans'
                  : category.id === 'commercial-kitchen-equipment'
                  ? 'commercial-kitchen'
                  : 'kitchenware';
              return (
                <article
                  key={category.id}
                  className="bg-white border border-[#B8B8B3]/70 flex flex-col justify-between transition-colors duration-200 hover:border-black"
                >
                  <div>
                    {editMode ? (
                      <div className="block aspect-[4/3] bg-[#F5F5F5] border-b border-[#B8B8B3]/50 overflow-hidden relative">
                        <EditableImage
                          slotId={`home.category.${category.id}`}
                          defaultSrc={category.image}
                          defaultAlt={category.title}
                          usage={catUsage}
                          label={`Category Image 0${idx + 1}: ${category.title}`}
                          previewAspectClass="aspect-[4/3]"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <a
                        href={`/products/${category.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          onNavigate(`/products/${category.id}`);
                        }}
                        className="block aspect-[4/3] bg-[#F5F5F5] border-b border-[#B8B8B3]/50 overflow-hidden group"
                      >
                        <EditableImage
                          slotId={`home.category.${category.id}`}
                          defaultSrc={category.image}
                          defaultAlt={category.title}
                          usage={catUsage}
                          label={`Category Image 0${idx + 1}: ${category.title}`}
                          previewAspectClass="aspect-[4/3]"
                          className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300"
                        />
                      </a>
                    )}

                    <div className="p-7">
                      <p className="font-mono text-xs text-[#292321]/55 mb-2">
                        0{idx + 1}
                      </p>
                      <EditableText
                        id={`home.category.${category.id}.title`}
                        defaultText={category.title}
                        label={`Category Title: ${category.title}`}
                        as="h3"
                        className="font-display text-xl font-semibold text-black mb-3"
                      />
                      <EditableText
                        id={`home.category.${category.id}.description`}
                        defaultText={category.shortDescription}
                        label={`Category Description: ${category.title}`}
                        as="p"
                        multiline
                        allowExtraParagraphs
                        className="text-sm text-[#292321]/80 leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="px-7 pb-7 pt-2">
                    <a
                      href={`/products/${category.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(`/products/${category.id}`);
                      }}
                      className="inline-flex items-center justify-between w-full px-5 py-3 border border-black text-xs font-semibold tracking-[0.08em] uppercase text-black hover:bg-black hover:text-white transition-colors"
                    >
                      <EditableText
                        id={`home.category.${category.id}.cta`}
                        defaultText="Explore Collection"
                        label="Category Card Button"
                        allowDelete={false}
                      />
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 3: ABOUT SHREE DURGA STEELS */}
      <section className="bg-white border-b border-[#B8B8B3]/60 py-16 md:py-24">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-stretch">
            <div className="lg:col-span-5">
              <div className="border border-[#B8B8B3]/70 bg-[#F5F5F5] h-full min-h-[300px] overflow-hidden">
                <EditableImage
                  slotId="home.about.image"
                  defaultSrc="/images/about_manufacturing_craft_1794728250935.jpg"
                  defaultAlt="SHREE DURGA STEELS authentic manufacturing workshop and stainless steel production warehouse"
                  usage="about"
                  label="Homepage About Section Photograph"
                  previewAspectClass="aspect-[4/3]"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                <EditableText
                  id="home.about.eyebrow"
                  defaultText="Manufacturing & Supply"
                  label="Homepage About Eyebrow"
                  as="p"
                  className="text-xs font-semibold tracking-[0.12em] uppercase text-[#5B1018]"
                />
                <EditableText
                  id="home.about.heading"
                  defaultText="About SHREE DURGA STEELS"
                  label="Homepage About Heading"
                  as="h2"
                  className="font-display text-2xl md:text-3xl font-semibold text-black tracking-tight"
                />
                <EditableText
                  id="home.about.overview"
                  defaultText={settings.aboutOverview}
                  label="Homepage About Overview"
                  as="p"
                  multiline
                  allowExtraParagraphs
                  className="text-base text-[#292321]/85 leading-relaxed"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-[#B8B8B3]/50">
                  <div>
                    <EditableText
                      id="home.about.capTitle"
                      defaultText="Manufacturing Capabilities"
                      label="About Pillar 1 Heading"
                      as="h3"
                      className="text-sm font-semibold text-black mb-1.5"
                    />
                    <EditableText
                      id="home.about.capDesc"
                      defaultText={settings.manufacturingCapabilities}
                      label="About Pillar 1 Text"
                      as="p"
                      multiline
                      className="text-sm text-[#292321]/75 leading-relaxed"
                    />
                  </div>
                  <div>
                    <EditableText
                      id="home.about.qualTitle"
                      defaultText="Product Quality & Consistency"
                      label="About Pillar 2 Heading"
                      as="h3"
                      className="text-sm font-semibold text-black mb-1.5"
                    />
                    <EditableText
                      id="home.about.qualDesc"
                      defaultText={settings.qualityCommitment}
                      label="About Pillar 2 Text"
                      as="p"
                      multiline
                      className="text-sm text-[#292321]/75 leading-relaxed"
                    />
                  </div>
                  <div>
                    <EditableText
                      id="home.about.expTitle"
                      defaultText="Industry Experience"
                      label="About Pillar 3 Heading"
                      as="h3"
                      className="text-sm font-semibold text-black mb-1.5"
                    />
                    <EditableText
                      id="home.about.expDesc"
                      defaultText={settings.industryExperience}
                      label="About Pillar 3 Text"
                      as="p"
                      multiline
                      className="text-sm text-[#292321]/75 leading-relaxed"
                    />
                  </div>
                  <div>
                    <EditableText
                      id="home.about.custTitle"
                      defaultText="Commitment to Customers"
                      label="About Pillar 4 Heading"
                      as="h3"
                      className="text-sm font-semibold text-black mb-1.5"
                    />
                    <EditableText
                      id="home.about.custDesc"
                      defaultText={settings.customerCommitment}
                      label="About Pillar 4 Text"
                      as="p"
                      multiline
                      className="text-sm text-[#292321]/75 leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <a
                  href="/about"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/about');
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-black text-xs font-semibold tracking-[0.08em] uppercase text-black hover:bg-black hover:text-white transition-colors"
                >
                  <EditableText
                    id="home.about.cta"
                    defaultText="Learn More"
                    label="Homepage About Button"
                    allowDelete={false}
                  />
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: FEATURED PRODUCTS */}
      <section className="bg-white border-b border-[#B8B8B3]/60 py-16 md:py-24">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
            <div>
              <EditableText
                id="home.featured.eyebrow"
                defaultText="Selected Catalogue"
                label="Featured Section Eyebrow"
                as="p"
                className="text-xs font-semibold tracking-[0.12em] uppercase text-[#5B1018] mb-2"
              />
              <EditableText
                id="home.featured.heading"
                defaultText="Featured Products"
                label="Featured Section Heading"
                as="h2"
                className="font-display text-2xl md:text-3xl font-semibold text-black tracking-tight"
              />
              <EditableText
                id="home.featured.description"
                defaultText="Representative items across Kitchenware & Home Utility, GN Pans, and Commercial Kitchen Equipment. Upload actual product photographs and specifications via the Product Management System."
                label="Featured Section Description"
                as="p"
                multiline
                allowExtraParagraphs
                className="mt-2 text-sm text-[#292321]/75 max-w-2xl"
              />
            </div>
            <a
              href="/products"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/products');
              }}
              className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.08em] uppercase text-black hover:text-[#5B1018] transition-colors whitespace-nowrap"
            >
              <EditableText
                id="home.featured.browseCta"
                defaultText="Browse All Products"
                label="Browse All Products Button"
                allowDelete={false}
              />
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onNavigate={onNavigate}
                onQuickAddQuote={handleQuickAdd}
              />
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 5: WHY CHOOSE US? */}
      <section className="bg-[#F5F5F5] border-b border-[#B8B8B3]/60 py-16 md:py-24">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="max-w-2xl mb-12">
            <EditableText
              id="home.why.eyebrow"
              defaultText="Trade Partnership"
              label="Why Choose Section Eyebrow"
              as="p"
              className="text-xs font-semibold tracking-[0.12em] uppercase text-[#5B1018] mb-2"
            />
            <EditableText
              id="home.why.heading"
              defaultText="Why Choose SHREE DURGA STEELS?"
              label="Why Choose Section Heading"
              as="h2"
              className="font-display text-2xl md:text-3xl font-semibold text-black tracking-tight"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#B8B8B3]/60 border border-[#B8B8B3]/60">
            {whyItems.map((item, idx) => (
              <div key={`${item.index}-${idx}`} className="bg-white p-8 flex flex-col justify-between">
                <div>
                  <span className="font-mono text-xs text-[#5B1018] block mb-3">
                    {item.index}
                  </span>
                  <EditableText
                    id={`home.why.item.${idx}.title`}
                    defaultText={item.title}
                    label={`Why Choose Item ${item.index} Title`}
                    as="h3"
                    className="font-display text-lg font-semibold text-black mb-2.5"
                  />
                  <EditableText
                    id={`home.why.item.${idx}.description`}
                    defaultText={item.description}
                    label={`Why Choose Item ${item.index} Description`}
                    as="p"
                    multiline
                    className="text-sm text-[#292321]/80 leading-relaxed"
                  />
                </div>
              </div>
            ))}
            <div className="bg-[#F3E7DA] p-8 flex flex-col justify-between">
              <div>
                <EditableText
                  id="home.why.tradeEyebrow"
                  defaultText="B2B Trade"
                  label="Trade Box Eyebrow"
                  as="span"
                  className="font-mono text-xs text-[#5B1018] block mb-3"
                />
                <EditableText
                  id="home.why.tradeHeading"
                  defaultText="Direct Bulk Quotations"
                  label="Trade Box Heading"
                  as="h3"
                  className="font-display text-lg font-semibold text-black mb-2.5"
                />
                <EditableText
                  id="home.why.tradeDesc"
                  defaultText="Combine multiple SKUs, sizes, and commercial equipment lines into a single structured quotation enquiry."
                  label="Trade Box Description"
                  as="p"
                  multiline
                  className="text-sm text-[#292321]/85 leading-relaxed"
                />
              </div>
              <div className="pt-6">
                <a
                  href="/quote"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/quote');
                  }}
                  className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.08em] uppercase text-[#5B1018] hover:text-black transition-colors"
                >
                  <EditableText
                    id="home.why.tradeCta"
                    defaultText="Build a Quote"
                    label="Trade Box Button"
                    allowDelete={false}
                  />
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: BUSINESS ENQUIRY / CTA */}
      <section className="bg-white py-16 md:py-24">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="border border-black p-8 sm:p-12 md:p-16 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="max-w-2xl space-y-3">
              <EditableText
                id="home.cta.eyebrow"
                defaultText="Business & Wholesale Enquiries"
                label="Bottom CTA Eyebrow"
                as="p"
                className="text-xs font-semibold tracking-[0.12em] uppercase text-[#5B1018]"
              />
              <EditableText
                id="home.cta.heading"
                defaultText="Looking for the Right Products for Your Business?"
                label="Bottom CTA Heading"
                as="h2"
                className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold text-black tracking-tight"
                style={{ textWrap: 'balance' }}
              />
              <EditableText
                id="home.cta.description"
                defaultText="Connect with our team for product information, bulk requirements and customised quotations."
                label="Bottom CTA Description"
                as="p"
                multiline
                allowExtraParagraphs
                className="text-base text-[#292321]/80 leading-relaxed"
              />
            </div>

            <div className="shrink-0 flex flex-wrap items-center gap-4">
              <a
                href="/quote"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('/quote');
                }}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#5B1018] text-white text-xs font-semibold tracking-[0.08em] uppercase hover:bg-[#430b11] transition-colors whitespace-nowrap"
              >
                <EditableText
                  id="home.cta.button"
                  defaultText="GET A QUOTE"
                  label="Bottom CTA Button"
                  allowDelete={false}
                />
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
