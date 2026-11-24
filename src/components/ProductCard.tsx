import { ArrowRight, MessageCircle } from 'lucide-react';
import { formatInrPrice, type Product } from '../types/catalog';
import { useStore } from '../context/StoreContext';
import { ProductVisual } from './ProductVisual';

interface ProductCardProps {
  product: Product;
  onNavigate: (path: string) => void;
  onQuickAddQuote?: (product: Product) => void;
}

export function ProductCard({ product, onNavigate, onQuickAddQuote }: ProductCardProps) {
  const { settings, getCategoryDisplay, getWhatsAppUrl } = useStore();
  const category = getCategoryDisplay(product.category);
  const detailPath = `/product/${product.id}`;
  const variants = product.variants || [];
  const pricedVariants = variants.filter(
    (v): v is typeof v & { netPrice: number } => typeof v.netPrice === 'number'
  );
  const minPrice =
    pricedVariants.length > 0
      ? Math.min(...pricedVariants.map((v) => v.netPrice))
      : null;

  return (
    <article className="bg-white border border-[#B8B8B3]/70 flex flex-col justify-between transition-colors duration-200 hover:border-black">
      <div>
        <a
          href={detailPath}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(detailPath);
          }}
          className="block aspect-[4/3] border-b border-[#B8B8B3]/40 overflow-hidden focus-visible:outline-none"
        >
          <ProductVisual
            src={product.mainImage}
            alt={product.name}
            modelNumber={product.modelNumber}
            isPlaceholder={product.isPlaceholder}
            position={product.mainImagePosition}
            fit={product.mainImageFit}
            adminProduct={product}
          />
        </a>

        <div className="p-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#292321]/65 mb-2">
            <span>{product.subCategory || category.title}</span>
            {product.modelNumber && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-[#5B1018] font-medium">
                  {product.modelNumber}
                </span>
              </>
            )}
          </div>

          <h3 className="font-display text-lg font-semibold text-black leading-snug">
            <a
              href={detailPath}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(detailPath);
              }}
              className="hover:text-[#5B1018] transition-colors"
            >
              {product.name}
            </a>
          </h3>

          {product.isAvailable === false && (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5B1018]">
              Currently Unavailable
            </p>
          )}

          {product.availableSizes && product.availableSizes.length > 0 ? (
            <p className="mt-2.5 text-xs text-[#292321]/75 tabular-nums">
              <span className="text-[#292321]/50">Available sizes: </span>
              {product.availableSizes.join(' · ')}
            </p>
          ) : product.dimensions ? (
            <p className="mt-2.5 text-xs text-[#292321]/75 tabular-nums">
              <span className="text-[#292321]/50">Dimensions: </span>
              {product.dimensions}
            </p>
          ) : null}

          {/* Main Detail: Net Price / Pc */}
          <div className="mt-3 pt-3 border-t border-[#F5F5F5] flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5B1018] shrink-0">
              NET PRICE / PC
            </span>
            <span className="text-black font-semibold text-right tabular-nums">
              {settings.showPrices !== false
                ? minPrice !== null
                  ? variants.length > 1
                    ? `From ${formatInrPrice(minPrice)}`
                    : formatInrPrice(minPrice)
                  : 'On Enquiry'
                : 'On Enquiry'}
            </span>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 pt-3 border-t border-[#F5F5F5] grid grid-cols-1 sm:grid-cols-2 gap-2">
        <a
          href={detailPath}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(detailPath);
          }}
          className="py-2 px-3 border border-black bg-white text-black text-[11px] font-semibold tracking-[0.06em] uppercase text-center hover:bg-[#F5F5F5] transition-colors whitespace-nowrap"
        >
          View Details
        </a>

        <a
          href={getWhatsAppUrl(
            `Hello SHREE DURGA STEELS, I would like to get a quote for: ${product.name}${product.modelNumber ? ` (${product.modelNumber})` : ''}`
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="py-2.5 px-2 bg-[#5B1018] text-white text-[10px] xl:text-[11px] font-semibold tracking-[0.04em] uppercase text-center hover:bg-[#430b11] transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Quote on WhatsApp</span>
        </a>
      </div>
    </article>
  );
}
